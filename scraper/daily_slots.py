"""Daily KST slot refresh from the completed Place audit and live RDS booking targets."""
import argparse
import json
import re
import sys
import time
import urllib.error
import zlib
from bisect import bisect_right
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from partner_refresh import KST, HourlyScheduleUnavailable, ScheduleAccessRestricted, slots_for, stamp
from slot_ingest import api_get, api_post, notify_new_slots

MANIFEST = Path(__file__).with_name('catalog-audit-complete.json')
COOLDOWN = Path('slot-source-pause.json')


def read_manifest(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    return validate_manifest(data)


def validate_manifest(data, priority_only=False):
    if (type(data.get('schemaVersion')) is not int or data['schemaVersion'] != 1
            or data.get('complete') is not True or type(data.get('auditedShopCount')) is not int
            or data['auditedShopCount'] <= 0):
        raise ValueError('Incomplete catalog audit')
    at = datetime.fromisoformat(data['checkedAt'].replace('Z', '+00:00'))
    if at.tzinfo is None or at > datetime.now(timezone.utc):
        raise ValueError('Invalid completion time')
    def ids(value):
        if not isinstance(value, list) or any(not isinstance(s, str) or not re.fullmatch(r'[0-9]+', s) for s in value):
            raise ValueError('Invalid audit IDs')
        if len(set(value)) != len(value):
            raise ValueError('Duplicate audit IDs')
        return set(value)
    verified = ids(data['verifiedShopIds'])
    cautions = ids(data.get('availabilityNoticeShopIds', []))
    if not verified or not cautions <= verified:
        raise ValueError('Invalid verified/notice membership')
    if priority_only:
        priority = ids(data['priorityShopIds'])
        if not priority or not priority <= verified:
            raise ValueError('Invalid priority catalog membership')
        return priority, cautions & priority
    return verified, cautions


def publication(batch, version=None):
    if not re.fullmatch('[a-z0-9-]{1,45}',batch) or (version is not None and not re.fullmatch('[0-9a-f]{64}',version)):
        raise ValueError('Invalid catalog publication reference')
    path = '/internal/shops/catalog-audit?batch=' + batch
    info = api_get(path if version is None else path + '&version=' + version)
    if info.get('state') == 'pending' and version is None:
        return None
    if info.get('state') != 'complete' or not re.fullmatch('[0-9a-f]{64}',str(info.get('version',''))):
        raise ValueError('Catalog publication unavailable')
    if version is not None and info['version'] != version:
        raise ValueError('Catalog publication changed')
    return info


def pause():
    time.sleep(1)


def recheck_notice(shop_id):
    """Check the same ID-matched Place record and visible notice as the catalog audit."""
    from catalog_audit import Pause, parse_place, request_html
    try:
        _, present, _ = parse_place(request_html(shop_id), shop_id)
        return 'notice_present' if present else 'notice_not_seen'
    except Pause as exc:
        raise ScheduleAccessRestricted('Place access restricted') from exc
    finally:
        pause()


def record_restriction(exc):
    retry = (getattr(exc, 'headers', None) or {}).get('Retry-After', '')
    now = time.time()
    until = now + max(86400, getattr(exc.__cause__, 'seconds', 0))
    if retry.isdecimal():
        until = max(until, now + int(retry))
    elif retry:
        try:
            until = max(until, parsedate_to_datetime(retry).timestamp())
        except (ValueError, TypeError, OverflowError):
            pass
    COOLDOWN.write_text(json.dumps({'retryAt': until}))


def notify(shop_id, new_slots):
    grouped = defaultdict(list)
    for row in new_slots:
        grouped[row['date']].append(row['startTime'])
    times = [(d, t) for d, values in grouped.items() if len(values) <= 8 for t in values]
    if times:
        notify_new_slots({shop_id: times})


def run(verified, cautions, part, parts, report_path, deadline=None, cursor_path=None, public_version=None, governor=None):
    from general_source_budget import SourcePaused
    targets = api_get('/internal/shops/targets')['targets']
    if not isinstance(targets, list) or not targets:
        raise ValueError('Missing nationwide booking target list')
    by_id = {str(s['id']): s for s in targets}
    owned = sorted(s for s in verified if zlib.crc32(s.encode()) % parts == part)
    positions = {sid:i + 1 for i,sid in enumerate(owned)} if public_version else {}
    if cursor_path and cursor_path.exists():
        saved_cursor = json.loads(cursor_path.read_text())
        if public_version:
            cut = saved_cursor.get('position',0) if saved_cursor.get('version') == public_version else 0
            if type(cut) is not int or not 0 <= cut <= len(owned):
                raise ValueError('Invalid partition cursor')
        else:
            cut = bisect_right(owned,saved_cursor['lastId'])
        owned = owned[cut:] + owned[:cut]
    counts = Counter(verified=len(owned))
    notices, unresolved = {}, {}
    next_id = None
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def collect(sid):
        shop = by_id.get(sid)
        if sid in cautions:
            if governor:
                governor.before("place")
            notices[sid] = recheck_notice(sid)
        if not shop:
            return 'no_nationwide_booking_target'
        observed = stamp()
        today = datetime.now(KST).date()
        data = slots_for(shop, today.isoformat(), (today + timedelta(days=2)).isoformat(),
                         deadline=deadline, after_request=pause,
                         **({"before_request":lambda:governor.before("booking")} if governor else {}))
        if data is None:
            return 'no_booking_item'
        if notices.get(sid) == 'notice_present' and not data['slots']:
            unresolved[sid] = 'notice_empty_unconfirmed'
            return 'notice_empty_unconfirmed'
        data['summary'] = [item for item in data['summary'] if item['times']]
        data['noticeChecked'] = sid in notices
        data['noticeStatus'] = notices.get(sid)
        # Storage errors must abort the job and retry this shop. Do not confuse
        # an unavailable internal API with an individual source/shop failure.
        try:
            saved = api_post('/internal/shops/daily-slots', {'id': sid, 'observedAt': observed, 'data': data})
        except Exception as exc:
            raise RuntimeError('Daily slot commit failed') from exc
        if not saved['applied']:
            return 'stale_or_ineligible'
        counts['slots'] += len(data['slots'])
        if not data['slots']:
            counts['confirmed_empty_shops'] += 1
        if sid not in cautions:
            notify(sid, saved['newSlots'])
        return 'updated'

    try:
        for index, sid in enumerate(owned):
            next_id = sid
            if deadline is not None and time.monotonic() >= deadline:
                counts['deferred_budget'] = len(owned) - index
                break
            try:
                counts[collect(sid)] += 1
            except SourcePaused:
                counts['deferred_budget'] = len(owned) - index
                break
            except HourlyScheduleUnavailable:
                counts['no_hourly_calendar'] += 1
            except ScheduleAccessRestricted as exc:
                (governor.blocked if governor else record_restriction)(exc)
                counts['access_restricted'] += 1
                raise
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403, 429, 503):
                    (governor.blocked if governor else record_restriction)(exc)
                    counts['access_restricted'] += 1
                    raise
                unresolved[sid] = f'HTTP {exc.code}'
            except (ValueError, urllib.error.URLError, TimeoutError, OSError) as exc:
                if deadline is not None and time.monotonic() >= deadline:
                    counts['deferred_budget'] = len(owned) - index
                    break
                unresolved[sid] = type(exc).__name__
            if cursor_path:
                # Commit the cursor after the observation or explicit review outcome.
                tmp = cursor_path.with_suffix('.tmp')
                cursor = {'position':positions[sid],'version':public_version} if public_version else {'lastId':sid}
                tmp.write_text(json.dumps(cursor))
                tmp.replace(cursor_path)
            next_id = None
    finally:
        report = {'part': part, 'counts': dict(counts), 'notices': notices,
                  'unresolved': unresolved, 'nextId': next_id}
        if public_version:
            report = {'part':part, 'counts':dict(counts), 'unresolvedCount':len(unresolved),
                      'noticeCount':len(notices),'remaining':next_id is not None}
        report_path.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
        print(f'Partition {part}: {dict(counts)}, notices={len(notices)}, unresolved={len(unresolved)}, remaining={next_id is not None}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['mode', 'run', 'report'])
    parser.add_argument('--published', help='Authenticated RDS audit batch ID')
    parser.add_argument('--version', help='Immutable publication selected by the catalog job')
    parser.add_argument('--keep-legacy', action='store_true', help='Keep the current schedule if the new manifest is invalid')
    parser.add_argument('--part', type=int, default=0)
    parser.add_argument('--parts', type=int, default=8)
    parser.add_argument('--budget-seconds', type=int, default=9750)
    parser.add_argument('--end-epoch', type=int)
    parser.add_argument('--cursor', type=Path)
    parser.add_argument('--reports', type=Path, default=Path('slot-reports'))
    args = parser.parse_args()
    if args.command == 'report':
        reports = [json.loads((args.reports / f'{i}.json').read_text()) for i in range(args.parts)]
        counts = Counter()
        for report in reports:
            counts.update(report['counts'])
        missed = sum(r['unresolvedCount'] if 'unresolvedCount' in r else len(r['unresolved']) for r in reports)
        processed = sum(counts[k] for k in ('updated', 'stale_or_ineligible', 'no_booking_item',
                                             'no_hourly_calendar', 'no_nationwide_booking_target'))
        print(f'Audited catalog {counts["verified"]}; shops with an observed calendar {counts["updated"]}; '
              f'review outcomes {processed}; deferred {counts["deferred_budget"]}; unresolved {missed}; {dict(counts)}')
        return int(processed != counts['verified'] or missed > 0)
    if args.published:
        if args.command == 'run' and not args.version:
            parser.error('An immutable publication version is required')
        info = publication(args.published,args.version)
        if info is None:
            print('mode=legacy')
            return 0
        if args.command == 'mode':
            print('version=' + info['version'])
        else:
            verified, cautions = validate_manifest(info['manifest'],priority_only=True)
    else:
        if not MANIFEST.exists() and args.command == 'mode':
            print('mode=legacy')
            return 0
        try:
            verified, cautions = read_manifest(MANIFEST)
        except (OSError, KeyError, TypeError, ValueError) as exc:
            if args.command == 'mode' and args.keep_legacy:
                print(f'::warning::Invalid audit manifest ({type(exc).__name__}); legacy schedule retained', file=sys.stderr)
                print('mode=legacy')
                return 0
            raise
    if args.command == 'mode':
        print('mode=daily')
        # Reserve the last minutes before the next scheduled run for job teardown.
        now = datetime.now(KST)
        cutoff = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        print(f'end_epoch={int(min(cutoff, now + timedelta(hours=23)).timestamp())}')
        # Give later partitions a turn first after a day interrupted by the source.
        first = datetime.now(KST).date().toordinal() % args.parts
        print('parts=' + json.dumps([(first + n) % args.parts for n in range(args.parts)]))
        return 0
    if not 0 <= args.part < args.parts:
        parser.error('Invalid partition')
    if not args.published and COOLDOWN.exists():
        until = json.loads(COOLDOWN.read_text())['retryAt']
        if until > time.time():
            print(f'Source cooldown until {datetime.fromtimestamp(until, timezone.utc).isoformat()}')
            return 1
        COOLDOWN.unlink()
    budget = args.budget_seconds
    if args.end_epoch is not None:
        budget = min(budget, args.end_epoch - time.time())
    deadline = time.monotonic() + max(budget, 0)
    from general_source_budget import SourceBudget
    governor = SourceBudget(deadline) if args.published else None
    run(verified, cautions, args.part, args.parts, args.reports / f'{args.part}.json',
        deadline=deadline, cursor_path=args.cursor, public_version=args.version if args.published else None, governor=governor)
    return 0


if __name__ == '__main__':
    sys.exit(main())
