"""Bounded ordinary-shop metadata and near-term availability with serial source access."""
import argparse
import json
import re
import time
from collections import Counter, deque
from datetime import datetime,timedelta
from urllib.error import HTTPError,URLError

from catalog_audit import LIMIT_MSG, Pause, VisibleText, parse_place, request_html
from catalog_place_observations import observations
from daily_slots import notify
from build_verified_catalog import VERIFIED_CATEGORIES
from general_source_budget import SourceBudget, SourcePaused
from partner_refresh import KST, slots_for, stamp, ScheduleAccessRestricted, HourlyScheduleUnavailable
from slot_ingest import api_get, api_post


def explicit_reviews(html, sid):
    dom=VisibleText()
    dom.feed(html)
    if any(msg in ' '.join(dom.parts) for msg in LIMIT_MSG):
        raise Pause('Place access notice',0)
    marker=re.search(r'window\.__APOLLO_STATE__\s*=\s*',html)
    if not marker:
        return {}
    state,_=json.JSONDecoder().raw_decode(html,marker.end())
    return observations(state,{}, {},sid) if isinstance(state,dict) else {}


def fill_reviews(sid, data, budget):
    if not data.get('reviews'):
        try:
            budget.before('place')
            review_data=explicit_reviews(request_html(sid,'review/visitor'),sid)
            if review_data.get('reviews'):
                data['reviews']=review_data['reviews']
        except HTTPError as exc:
            if exc.code in (401,403,429,503):
                budget.blocked(exc)
        except Pause as exc:
            budget.blocked(exc)
        except (SourcePaused,ValueError,URLError,TimeoutError):
            pass


def metadata(shop,budget):
    sid=str(shop['id'])
    budget.before('place')
    rec,notice,_=parse_place(request_html(sid),sid)
    category=VERIFIED_CATEGORIES.get(rec['category_detail'])
    listed = {shop.get('category'), *(shop.get('categories') or [])}
    if category not in {'네일','헤어','메이크업'} or category not in listed:
        return 'category-review',{}
    data={'placeId':sid,'sourceCategory':rec['category_detail'],'availabilityNotice':bool(notice),
          'photos':rec['images']['gallery'],'contacts':rec.get('contacts',[]),**rec['_observations']}
    for field in ('phone','virtualPhone'):
        if rec.get(field):
            data[field]=rec[field]
    fill_reviews(sid,data,budget)
    return 'observed',data


def fast_slots(shop,budget):
    sid=str(shop['id'])
    notice=shop.get('notice_status')=='notice_present' or shop.get('availability_notice') is True
    if notice:
        budget.before('place')
        _,notice_now,_=parse_place(request_html(sid),sid)
    else:
        notice_now=False
    start=datetime.now(KST).date()
    try:
        data=slots_for(shop,start.isoformat(),(start+timedelta(days=2)).isoformat(),deadline=budget.deadline,
                       before_request=lambda:budget.before('booking'),after_request=lambda:None)
    except HourlyScheduleUnavailable:
        return 'no-calendar',{}
    if data is None: return 'no-booking-item',{}
    if notice_now and not data['slots']: return 'notice-empty',{}
    data['noticeChecked']=notice
    data['noticeStatus']=('notice_present' if notice_now else 'notice_not_seen') if notice else None
    data['summary']=[s for s in data['summary'] if s['times']]
    try:
        result=api_post('/internal/shops/daily-slots',{'id':sid,'observedAt':shop['_at'],'data':data})
    except Exception:
        raise RuntimeError('Internal daily-slot write failed') from None
    if result['applied'] and not notice:
        notify(sid,result['newSlots'])
    return ('updated' if result['applied'] else 'not-eligible'),{}


def due_targets(kind, limit=64):
    # Scheduling delays can repeatedly land on the same wall-clock partition.
    # The private queries retrieve only due shops. Each source request remains serial.
    lanes = [[], []]
    for part in range(8):
        page = api_get(f'/internal/shops/public-metadata?kind={kind}&part={part}&limit={limit}')
        if not page['ready']:
            return None
        for row in page['targets']:
            lanes[int(row['lane'])].append(row)
    def age(row):
        return row['attempted'] or '', str(row['id'])
    preferred, fair = [deque(sorted(rows, key=age)) for rows in lanes]
    if preferred and fair and age(fair[0]) < age(preferred[0]):
        preferred, fair = fair, preferred
    ordered = []
    while (preferred or fair) and len(ordered) < limit:
        for lane in (preferred, fair):
            if lane and len(ordered) < limit:
                ordered.append(lane.popleft())
    return ordered


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind',choices=['slots','metadata'])
    args=parser.parse_args()
    kind=args.kind
    budget=SourceBudget(time.monotonic()+510)
    counts=Counter()
    try:
        budget.check()
        targets=due_targets(kind)
        if targets is None:
            print('Public candidate seed pending')
            return
        for shop in targets:
            budget.check()
            observed=stamp()
            shop['_at']=observed
            try:
                outcome,data=(metadata if kind=='metadata' else fast_slots)(shop,budget)
            except (Pause,ScheduleAccessRestricted) as exc:
                budget.blocked(exc)
                raise SourcePaused('Source restriction persisted') from None
            except HTTPError as exc:
                if exc.code in (401,403,429,503):
                    budget.blocked(exc)
                    raise SourcePaused('Source restriction persisted') from None
                if exc.code not in (404,410):
                    raise RuntimeError('Shop source or internal API error') from None
                outcome,data='unavailable',{}
            except (ValueError,URLError,TimeoutError) as exc:
                if time.monotonic()>=budget.deadline:
                    break
                outcome,data='unavailable',{}
            result=api_post('/internal/shops/public-metadata',
                     {'id':str(shop['id']),'kind':kind,'observedAt':observed,'outcome':outcome,'data':data})
            if type(result.get('applied')) is not bool:
                raise RuntimeError('Invalid internal refresh acknowledgement')
            counts[outcome if result['applied'] else 'skipped_changed'] += 1
    except SourcePaused as pause:
        print(str(pause))
    print(json.dumps({'kind':kind,'counts':counts}))


if __name__=='__main__':
    main()
