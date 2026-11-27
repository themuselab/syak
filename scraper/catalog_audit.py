"""Checkpointed nationwide Place category audit. See --help for each command."""
import argparse
import csv
import hashlib
from collections import Counter
import os
import json
import re
import sqlite3
import time
import tempfile
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, urljoin, urlparse
from urllib.request import Request, urlopen

from build_read_model import NON_SALON_SOURCE_CATEGORIES, SUPPRESSED_IDS
from build_verified_catalog import VERIFIED_CATEGORIES, build_verified_row
from place_photos import business_photos
from catalog_place_observations import observations

# Additional exact categories observed in the November 25 massage audit.
NON_SALONS = NON_SALON_SOURCE_CATEGORIES | {'종합가전', '생활용품', '치료,재활', '의료용품,기기제조', '제조업', '반려동물미용'}
PRIORITY = {'네일', '메이크업', '헤어'}
NOTICE = re.compile(r'(?:정보.{0,24}다를\s*수\s*있|실제\s*예약.{0,35}다를\s*수\s*있)')
LIMIT_MSG = ('비정상적인 접근', '과도한 접근', '접근이 제한', '서비스 이용이 제한', '자동입력 방지')
SCHEMA = """
CREATE TABLE IF NOT EXISTS inventory(id TEXT PRIMARY KEY, category TEXT, categories TEXT, partner INTEGER, name TEXT);
CREATE TABLE IF NOT EXISTS inventory_regions(id TEXT PRIMARY KEY, gu TEXT);
CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS candidate_feeds(name TEXT PRIMARY KEY, digest TEXT);
CREATE TABLE IF NOT EXISTS candidate_sources(id TEXT PRIMARY KEY, url TEXT, discovered TEXT);
CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, checked TEXT, payload TEXT);
CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, source TEXT, checked TEXT, origin TEXT,
    instagram TEXT, notice INTEGER, candidate_row TEXT, photo_count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY REFERENCES inventory(id), decision TEXT, category TEXT, note TEXT, checked TEXT);
CREATE TABLE IF NOT EXISTS access_limits(
    happened REAL NOT NULL,reason TEXT,raw_retry_after TEXT,header_known INTEGER,server_until REAL,local_until REAL);
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, reason TEXT, next_try REAL);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
"""


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def read_rows(path):
    with Path(path).open(encoding='utf-8') as inp:
        first = next((ch for ch in iter(lambda: inp.read(1), '') if not ch.isspace()), '')
        inp.seek(0)
        if first == '[':
            yield from json.load(inp)
        else:
            yield from (json.loads(line) for line in inp if line.strip())


def valid_id(value):
    return bool(re.fullmatch(r'[0-9]{1,24}', str(value)))


def category_decision(category, categories, partner, source):
    if not source:
        return 'pending'
    canonical = VERIFIED_CATEGORIES.get(source)
    if source in NON_SALONS:
        return 'review-partner' if partner else 'exclude'
    if not canonical:
        return 'review-source'
    if canonical in categories and category in categories:
        return 'keep'
    if source == '피부,체형관리':
        return 'review-category'
    if partner or len(categories) > 1:
        return 'review-category'
    return 'correct'


def seed(db, path, recent_days):
    if db.execute("SELECT 1 FROM meta WHERE key='inventory_at'").fetchone():
        raise ValueError('This batch already has an inventory. Resume it with scan.')
    now = datetime.now(timezone.utc)
    for row in read_rows(path):
        sid = str(row['id'])
        if not valid_id(sid):
            raise ValueError('Invalid catalog ID')
        cats = row.get('categories') or [row.get('category')]
        if not isinstance(cats, list):
            raise ValueError('Expected categories array')
        db.execute('INSERT INTO inventory VALUES(?,?,?,?,?)',
                   (sid, row.get('category'), json.dumps(cats, ensure_ascii=False),
                    int(bool(row.get('is_partner'))), row.get('name')))
        if row.get('gu'):
            db.execute('INSERT INTO inventory_regions VALUES(?,?)',(sid,row['gu']))
        source, checked = row.get('source_category'), row.get('source_checked_at')
        if source and checked:
            stamp = datetime.fromisoformat(checked.replace('Z', '+00:00'))
            if stamp.tzinfo and 0 <= (now - stamp).total_seconds() < recent_days * 86400:
                db.execute('INSERT INTO evidence(id,source,checked,origin) VALUES(?,?,?,?)',
                           (sid, source, checked, 'rds-place'))
    if not db.execute('SELECT 1 FROM inventory LIMIT 1').fetchone():
        raise ValueError('Empty inventory')
    db.execute("INSERT INTO meta VALUES('inventory_at',?)", (utcnow(),))


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ignored = False
        self.parts = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.ignored = True
        if tag == 'a' and not self.ignored:
            href = dict(attrs).get('href')
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.ignored = False

    def handle_data(self, text):
        if not self.ignored and text.strip():
            self.parts.append(text.strip())


def linked_place_id(href, base_url):
    u = urlparse(urljoin(base_url, href))
    if u.scheme not in ('http', 'https'):
        return None
    if u.hostname in ('m.place.naver.com', 'pcmap.place.naver.com', 'map.naver.com'):
        match = re.search(r'/(?:place|hairshop|nailshop)/([0-9]{4,20})(?:/|$)',u.path)
        return match.group(1) if match else None
    if u.hostname == 'store.naver.com' and u.path in ('/hairshops/detail','/nailshops/detail','/places/detail'):
        value = parse_qs(u.query).get('id', [None])[0]
        return value if value and valid_id(value) else None
    return None


def queue_candidate(db, sid, source_url):
    if not valid_id(sid) or sid in SUPPRESSED_IDS:
        return
    db.execute('INSERT OR IGNORE INTO candidates SELECT ? WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE id=?)', (sid,sid))
    if source_url:
        db.execute('INSERT OR IGNORE INTO candidate_sources SELECT id,?,? FROM candidates WHERE id=?',
                   (source_url,utcnow(),sid))


class Pause(Exception):
    def __init__(self, reason, seconds, raw=None):
        super().__init__(reason)
        self.seconds = seconds
        self.raw = raw


def parse_place(html, sid):
    dom = VisibleText()
    dom.feed(html)
    visible = ' '.join(dom.parts)
    if any(message in visible for message in LIMIT_MSG):
        raise Pause('Place access notice', 86400)
    match = re.search(r'window\.__APOLLO_STATE__\s*=\s*', html)
    if not match:
        raise ValueError('missing-state')
    state, _ = json.JSONDecoder().raw_decode(html, match.end())
    if not isinstance(state,dict):
        raise ValueError('missing-state-object')
    def deref(item):
        return state.get(item['__ref'], {}) if isinstance(item, dict) and isinstance(item.get('__ref'),str) else item
    if state.get('ROOT_QUERY') is not None and not isinstance(state['ROOT_QUERY'],dict):
        raise ValueError('malformed-place-root')
    detail = {}
    linked_bases = []
    for key, obj in (state.get('ROOT_QUERY') or {}).items():
        node = deref(obj)
        if not key.startswith('placeDetail') or not isinstance(node,dict):
            continue
        entity = deref(node.get('base'))
        if isinstance(entity,dict) and entity.get('id') is not None:
            linked_bases.append(entity)
            if str(entity['id']) == sid:
                detail = node
                break
    if linked_bases:
        base = next((b for b in linked_bases if str(b['id']) == sid),{})
    else:
        # Older home pages expose exactly one PlaceDetailBase outside the root object.
        bases = [v for v in state.values() if isinstance(v,dict) and v.get('__typename') == 'PlaceDetailBase']
        base = bases[0] if len(bases) == 1 and str(bases[0].get('id')) == sid else {}
    if not isinstance(base.get('category'),str) or not base['category'].strip():
        raise ValueError('missing-id-matched-category')
    if base.get('isClosed') is True or base.get('businessStatus') in ('CLOSED', '폐업') or '폐업한 장소' in visible:
        raise ValueError('possible-closure')
    links = deref(detail.get('homepages') or base.get('homepages')) or {}
    social = []
    public_links = []
    if isinstance(links, dict):
        for group in ('repr', 'etc', 'subLinks'):
            value = links.get(group) or []
            for item in (value if isinstance(value, list) else [value]):
                item = deref(item)
                if isinstance(item, dict):
                    url = item.get('url') or ''
                    if isinstance(url,str) and urlparse(url).scheme in ('https','http'):
                        public_links.append({'url':url,'label':item.get('name') or item.get('type') or '홈페이지'})
                    if isinstance(url,str) and urlparse(url).hostname in ('www.instagram.com', 'instagram.com'):
                        social.append(url)
    for field,label in [('talktalkUrl','네이버 톡톡'),('naverBlog','네이버 블로그'),('homepage','홈페이지'),('chatBotUrl','네이버 챗봇')]:
        value=base.get(field)
        if isinstance(value,str) and urlparse(value).scheme in ('https','http'):
            public_links.append({'url':value,'label':label})
    photos = business_photos(state, sid)
    observed = observations(state, detail, base, sid)
    coord = deref(base.get('coordinate'))
    coord = coord if isinstance(coord,dict) else {}
    record = {'id': sid, 'name': base.get('name'), 'category_detail': base['category'],
              'categoryCodeList': base.get('categoryCodeList'), 'checkedAt': utcnow(), 'accepted': True,
              'roadAddress_full': base.get('roadAddress') or base.get('address'), 'x': coord.get('x'),
              'y': coord.get('y'), 'instagram': next(iter(social), None), 'phone': base.get('phone'),
              'virtualPhone':base.get('virtualPhone'), 'contacts':public_links,
              'images': {'gallery': photos, 'representative': next(iter(photos), base.get('imageUrl'))},
              'visitorReviewsTotal': observed.get('visitorReviewCount'), 'visitorReviews': observed.get('reviews',[]),
              'bookingItems': observed.get('bookingItems',[]), '_observations':observed}
    page_url = f'https://m.place.naver.com/place/{sid}/home'
    # Use only targeted shop-type links in the already-fetched page, without crawling neighbours.
    record['_linkedShops'] = sorted({other for href in dom.links
                                     if re.search(r'/(hairshop|nailshop)/[0-9]+', href)
                                     and (other := linked_place_id(href, page_url)) and other != sid})
    return record, int(bool(NOTICE.search(visible))), len(photos)


def request_html(sid, section='home'):
    if section not in ('home','review/visitor') or not valid_id(sid):
        raise ValueError('Unknown Place URL')
    req = Request(f'https://m.place.naver.com/place/{sid}/{section}', headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko'})
    try:
        with urlopen(req, timeout=20) as response:
            return response.read(12_000_001).decode('utf-8')
    except HTTPError as exc:
        if exc.code in (401, 403, 429, 503):
            raw = exc.headers.get('Retry-After', '')
            delay = 0
            if raw.isdigit():
                delay = max(delay, int(raw))
            elif raw:
                try:
                    delay = max(delay, parsedate_to_datetime(raw).timestamp() - time.time())
                except (ValueError, TypeError, OverflowError):
                    pass
            raise Pause('HTTP ' + str(exc.code), delay, raw) from exc
        raise


def meta(db):
    return dict(db.execute('SELECT key,value FROM meta'))


def record_pause(db, reason, seconds, raw=None):
    current = meta(db)
    blocks = int(current.get('limit_count', '0')) + 1
    wait = seconds
    if reason in ('HTTP 429','HTTP 503'):
        wait = max(seconds, min(86400, 900 * 2 ** min(blocks - 1, 7)))
    values = {'resume_after': time.time() + wait, 'pause_reason': reason, 'limit_count': blocks,
              'retry_after_raw': raw or '', 'server_resume_after': time.time() + seconds if raw and seconds else '',
              'pause_at': time.time()}
    if reason in ('HTTP 401','HTTP 403','Place access notice') or (reason.startswith('Three consecutive') and blocks >= 2):
        values['manual_hold'] = 'Operator review required: ' + reason
    db.execute('INSERT INTO access_limits VALUES(?,?,?,?,?,?)',
               (values['pause_at'],reason,raw,int(raw is not None),values['server_resume_after'] or None,values['resume_after']))
    db.executemany('INSERT OR REPLACE INTO meta VALUES(?,?)', values.items())
    db.commit()


def scan(db, limit, gap, candidates_only):
    import fcntl
    state = db.execute('PRAGMA database_list').fetchone()[2]
    with open(state + '.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        hold = meta(db).get('manual_hold')
        if hold:
            print('Paused:', hold)
            return
        cooldown = db.execute("SELECT value FROM meta WHERE key='resume_after'").fetchone()
        if cooldown and float(cooldown[0]) > time.time():
            print('Paused until', datetime.fromtimestamp(float(cooldown[0]), timezone.utc).isoformat())
            return
        db.execute('DROP TABLE IF EXISTS temp.priority')
        db.execute('CREATE TEMP TABLE priority(id TEXT PRIMARY KEY)')
        if not candidates_only:
            db.executemany('INSERT INTO priority VALUES(?)',
                           [(r['id'],) for r in audit_rows(db) if r['origin'] == 'rds-place'
                            and r['decision'] in ('exclude', 'correct')])
        # Reserve scan capacity for the original catalog even if many candidates are discovered.
        candidate_limit = limit if candidates_only else max(1,limit // 4)
        queue = db.execute("""SELECT c.id,1 FROM candidates c LEFT JOIN evidence e USING(id)
            LEFT JOIN attempts a USING(id) WHERE e.id IS NULL AND COALESCE(a.next_try,0)<=?
            ORDER BY COALESCE(a.next_try,0), c.id LIMIT ?""",(time.time(),candidate_limit)).fetchall()
        if not candidates_only:
            queue.extend(db.execute("""SELECT i.id,0 FROM inventory i LEFT JOIN priority p USING(id)
                LEFT JOIN evidence e USING(id) LEFT JOIN attempts a USING(id)
                WHERE (e.id IS NULL OR e.origin='rds-place') AND COALESCE(a.next_try,0)<=?
                ORDER BY COALESCE(a.next_try,0),p.id IS NULL,
                    NOT EXISTS(SELECT 1 FROM json_each(i.categories) WHERE value IN ('네일','헤어','메이크업')),i.id LIMIT ?""", (time.time(),limit-len(queue))).fetchall())
        failures = 0
        for sid, candidate in queue:
            # Persist spacing across consecutive runs.
            last = db.execute("SELECT value FROM meta WHERE key='last_request'").fetchone()
            if last:
                time.sleep(max(0, float(last[0]) + gap - time.time()))
            gate_path = os.environ.get('CATALOG_SOURCE_GATE')
            if gate_path:
                gate = json.loads(Path(gate_path).read_text())
                if gate.get('hold') or (gate.get('until') or 0) > time.time() or time.time()-gate['seen'] > 20:
                    print('Waiting for the shared Naver source gate')
                    return
            db.execute("INSERT OR REPLACE INTO meta VALUES('last_request',?)", (time.time(),))
            db.commit()
            try:
                rec, notice, photos = parse_place(request_html(sid), sid)
                observed = rec.get('_observations')
                if observed:
                    db.execute('''INSERT INTO observations VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET
                        checked=excluded.checked,payload=json_patch(observations.payload,excluded.payload)''',
                        (sid,rec['checkedAt'],json.dumps(observed,ensure_ascii=False)))
                if not candidate:
                    for other in rec.get('_linkedShops', []):
                        queue_candidate(db, other, f'https://m.place.naver.com/place/{sid}/home')
                row = None
                if candidate and VERIFIED_CATEGORIES.get(rec['category_detail']) in PRIORITY:
                    try:
                        row = build_verified_row(rec)
                    except (ValueError, TypeError):
                        pass
                db.execute('INSERT OR REPLACE INTO evidence VALUES(?,?,?,?,?,?,?,?)',
                           (sid, rec['category_detail'], rec['checkedAt'], 'live-place', rec['instagram'],
                            notice, json.dumps(row, ensure_ascii=False) if row else None, photos))
                db.execute('DELETE FROM attempts WHERE id=?', (sid,))
                failures = 0
            except Pause as exc:
                record_pause(db, str(exc), exc.seconds, exc.raw)
                print('Paused:', str(exc))
                return
            except (ValueError, OSError) as exc:
                db.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',
                           (sid, str(exc)[:160], time.time() + 86400))
                failures += 1
            db.commit()
            if failures >= 3:
                record_pause(db, 'Three consecutive unreadable Place pages', 3600)
                print('Paused after three consecutive unreadable pages')
                return


def audit_rows(db):
    for sid, category, raw, partner, name, source, checked, origin, notice, manual, approved, gu in db.execute(
            """SELECT i.*,e.source,e.checked,e.origin,e.notice,r.decision,r.category,g.gu FROM inventory i
                LEFT JOIN evidence e USING(id) LEFT JOIN reviews r ON r.id=e.id AND r.checked=e.checked LEFT JOIN inventory_regions g ON i.id=g.id ORDER BY i.id"""):
        categories = json.loads(raw)
        yield {'id': sid, 'name': name, 'gu': gu, 'category': category, 'categories': categories, 'is_partner': bool(partner),
               'decision': manual or category_decision(category, categories, partner, source), 'sourceCategory': source,
               'nextCategory': approved or VERIFIED_CATEGORIES.get(source),
               'checkedAt': checked, 'origin': origin, 'availabilityNotice': None if notice is None else bool(notice)}


def publish(db, latest, output, suppressed):
    """Publish only after operations are reconciled with a second full RDS export."""
    original = {r['id']: r for r in audit_rows(db)}
    if not original or any(r['origin'] not in ('live-place', 'live-browser') for r in original.values()):
        raise ValueError('All inventory rows require direct observation in this audit')
    if any(r['decision'] not in ('keep', 'correct', 'exclude') for r in original.values()):
        raise ValueError('Unresolved audit rows')
    live = {}
    for r in read_rows(latest):
        sid = str(r['id'])
        if not valid_id(sid) or sid in live:
            raise ValueError('Invalid or duplicate shop in current RDS snapshot')
        live[sid] = r
    current_suppressions = list(read_rows(suppressed))
    if not all(valid_id(sid) for sid in current_suppressions):
        raise ValueError('Invalid RDS suppression export')
    current_suppressions = {str(sid) for sid in current_suppressions}
    blocked = SUPPRESSED_IDS | current_suppressions
    if live.keys() & blocked:
        raise ValueError('Suppressed shops are present in the current RDS snapshot')
    removed = {sid for sid, r in original.items() if r['decision'] == 'exclude'}
    if (set(original) - live.keys()) != removed or not removed <= current_suppressions:
        raise ValueError('Exclusions do not match the current catalog')
    refill = {sid: json.loads(row) for sid, row in db.execute(
        "SELECT id,candidate_row FROM evidence JOIN candidates USING(id) WHERE origin='live-place' AND candidate_row IS NOT NULL")}
    added = live.keys() - original.keys()
    if len(added) < len(removed) or not added <= refill.keys():
        raise ValueError('Replacement count or verified IDs do not match')
    if any(refill[sid].get('category') not in PRIORITY for sid in added):
        raise ValueError('Only verified nail, makeup and hair expansions are supported')
    for sid, record in live.items():
        cats = record.get('categories') or [record.get('category')]
        if sid in original and original[sid]['decision'] == 'keep':
            if record.get('category') == original[sid]['category'] and cats == original[sid]['categories']:
                continue
            raise ValueError('Previously approved categories changed: ' + sid)
        target = original[sid]['nextCategory'] if sid in original else refill[sid]['category']
        if record.get('category') != target or cats != [target]:
            raise ValueError('Unapplied category correction ' + sid)
    notices = {sid for sid, in db.execute('SELECT id FROM evidence WHERE notice=1')}
    manifest = {'schemaVersion': 1, 'complete': True, 'checkedAt': utcnow(), 'auditedShopCount': len(original),
                'verifiedShopIds': sorted(live),
                'priorityShopIds': sorted(sid for sid,r in live.items() if PRIORITY.intersection(r.get('categories') or [r.get('category')])),
                'availabilityNoticeShopIds': sorted(notices & live.keys())}
    target = Path(output)
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
    temp.replace(target)


def add_reviews(db, path):
    for record in read_rows(path):
        sid = str(record['id'])
        existing = db.execute('SELECT category,partner FROM inventory WHERE id=?', (sid,)).fetchone()
        if not existing or record.get('placeUrl') != f'https://m.place.naver.com/place/{sid}/home':
            raise ValueError('A matching Place URL and inventory ID are required')
        stamp = record.get('checkedAt', '')
        checked = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
        if not checked.tzinfo or checked > datetime.now(timezone.utc):
            raise ValueError('Invalid observation timestamp')
        source = record.get('sourceCategory')
        note = record.get('note')
        decision = record.get('decision')
        category = record.get('nextCategory') if decision == 'correct' else existing[0]
        if not source or not note or not note.strip() or decision not in ('keep', 'correct', 'exclude'):
            raise ValueError('A checked category, decision and supporting observation are required')
        if category not in VERIFIED_CATEGORIES.values() or (decision != 'keep' and existing[1]):
            raise ValueError('Unsupported correction or protected partner')
        old = db.execute('SELECT checked FROM evidence WHERE id=?', (sid,)).fetchone()
        if old and datetime.fromisoformat(old[0].replace('Z','+00:00')) > checked:
            raise ValueError('Review predates existing evidence')
        db.execute('''INSERT INTO evidence(id,source,checked,origin,notice) VALUES(?,?,?,'live-browser',?)
            ON CONFLICT(id) DO UPDATE SET source=excluded.source,checked=excluded.checked,
            origin=excluded.origin,notice=COALESCE(excluded.notice,evidence.notice)''',
            (sid, source, stamp, record.get('availabilityNotice')))
        db.execute('INSERT OR REPLACE INTO reviews VALUES(?,?,?,?,?)', (sid,decision,category,note,stamp))


def status(db):
    rows = list(audit_rows(db))
    counts = Counter(r['origin'] for r in rows if r['origin'])
    info = meta(db)
    direct = counts['live-place'] + counts['live-browser']
    retry_epoch = float(info.get('resume_after', 0))
    if info.get('manual_hold'):
        phase = 'manual-hold'
    elif time.time() < retry_epoch:
        phase = 'cooldown'
    elif direct < len(rows):
        phase = 'scanning'
    else:
        phase = 'awaiting-review-and-database-reconciliation'
    return {'inventory':len(rows), 'directlyVerified':direct, 'remainingLiveChecks':len(rows)-direct,
            'decisions':Counter(r['decision'] for r in rows), 'evidence':counts, 'phase':phase,
            'pauseReason':info.get('manual_hold') or info.get('pause_reason'),
            'limitEventAt':float(info.get('pause_at') or 0), 'limitEventReason':info.get('pause_reason'),
            'retryAfterHeader':info.get('retry_after_raw'),
            'serverResumeAfter':datetime.fromtimestamp(float(info['server_resume_after']),timezone.utc).isoformat()
                               if info.get('server_resume_after') else None,
            'resumeAfter':datetime.fromtimestamp(retry_epoch,timezone.utc).isoformat() if retry_epoch else None,
            'lastRequestAt':datetime.fromtimestamp(float(info['last_request']), timezone.utc).isoformat()
                            if info.get('last_request') else None,
            'verifiedCandidates':db.execute('SELECT count(*) FROM evidence WHERE candidate_row IS NOT NULL').fetchone()[0],
            'queuedCandidates':db.execute('SELECT COUNT(*) FROM candidates').fetchone()[0],
            'retry':db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0]}


def csv_cell(value):
    text = '' if value is None else str(value)
    if text.lstrip().startswith(('=', '+', '-', '@')) or text.startswith(('\t','\r','\n')):
        return "'" + text
    return text


def write_review_csv(rows, target, operating_reviews=None):
    operating_reviews = dict(operating_reviews or {})
    meanings = {'review-source': ('원본 업종 확인', '등록된 시술 업종과 원본 업종을 자동으로 대응하기 어려움'),
                'review-category': ('시술 범위 확인', '넓은 원본 분류 또는 복수 시술의 실제 제공 범위를 확인해야 함'),
                'review-partner': ('파트너 확인', '파트너 매장의 등록 내용과 원본 비미용 업종이 충돌함')}
    labels = {'rds-place':'기존 DB의 네이버 플레이스 원본', 'live-place':'이번 플레이스 직접 조회',
              'live-browser':'이번 브라우저 화면 확인'}
    temp = target.with_suffix('.tmp')
    with temp.open('w',encoding='utf-8-sig',newline='') as out:
        writer = csv.writer(out)
        writer.writerow(('플레이스 ID','샵 이름','현재 대표 업종','현재 전체 업종','네이버 원본 업종',
                         '검토 종류','보류 사유','근거 출처','확인 시각','네이버 플레이스 URL','카카오맵 검색 URL'))
        for r in rows:
            operational = operating_reviews.pop(r['id'], None)
            if r['decision'] not in meanings and not operational:
                continue
            kind, reason = meanings.get(r['decision'], ('',''))
            if operational:
                kind = ' / '.join(filter(None,(kind,'운영 반영 검토')))
                reason = ' / '.join(filter(None,(reason,operational)))
            search_text = ' '.join(x for x in (r.get('gu'),r.get('name')) if x)
            kakao = 'https://map.kakao.com/link/search/' + quote(search_text, safe='') if r.get('name') else ''
            cells = (r['id'],r['name'],r['category'],', '.join(r['categories']),r['sourceCategory'],kind,
                     reason,labels.get(r['origin'],r['origin']),r['checkedAt'],
                     f"https://m.place.naver.com/place/{r['id']}/home",kakao)
            writer.writerow([csv_cell(cell) for cell in cells])
        for sid, reason in sorted(operating_reviews.items()):
            if valid_id(sid) and reason:
                writer.writerow([csv_cell(cell) for cell in (sid,'','','','','운영 반영 검토',reason,'운영 DB','',
                                f'https://m.place.naver.com/place/{sid}/home','')])
    os.replace(temp,target)



def write_status(db, path):
    record = status(db)
    gate_path = os.environ.get('CATALOG_SOURCE_GATE')
    record['localPauseReason'] = record.get('pauseReason')
    record['localPhase'] = record.get('phase')
    if gate_path:
        gate = json.loads(Path(gate_path).read_text())
        if gate.get('hold') or (gate.get('until') or 0) > time.time():
            record['phase'] = 'manual_hold' if gate.get('hold') else 'cooldown'
            record['pauseReason'] = gate.get('reason')
            if gate.get('until'):
                shared = datetime.fromtimestamp(gate['until'],timezone.utc)
                local = datetime.fromisoformat(record['resumeAfter']) if record.get('resumeAfter') else shared
                record['resumeAfter'] = max(local,shared).isoformat()
    record['workerCheckedAt'] = utcnow()
    target = Path(path)
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(record,ensure_ascii=False,indent=2), encoding='utf-8')
    os.replace(temp,target)
    ops_file = target.parent / 'rds' / '운영검토.json'
    operating_reviews = json.loads(ops_file.read_text(encoding='utf-8')) if ops_file.exists() else {}
    if not isinstance(operating_reviews,dict) or not all(valid_id(k) and isinstance(v,str) for k,v in operating_reviews.items()):
        raise ValueError('Invalid operational review mapping')
    write_review_csv(audit_rows(db), target.with_name('개별검토.csv'), operating_reviews)


def ingest_supplies(db, folder):
    folder.mkdir(exist_ok=True)
    for path in sorted(folder.glob('*.jsonl')):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if db.execute('SELECT 1 FROM candidate_feeds WHERE name=? AND digest=?',(path.name,digest)).fetchone():
            continue
        try:
            rows = list(read_rows(path))
            for item in rows:
                if not isinstance(item,dict) or not valid_id(item.get('id')) or not isinstance(item.get('sourceUrl'),str):
                    raise ValueError('Expected numeric ID and a public source URL')
        except (ValueError,TypeError) as exc:
            print('Invalid supply file',path.name,type(exc).__name__)
            continue
        with db:
            for item in rows:
                queue_candidate(db,str(item['id']),item['sourceUrl'])
            db.execute('INSERT OR REPLACE INTO candidate_feeds VALUES(?,?)',(path.name,digest))



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, help='Persistent SQLite checkpoint path')
    sub = parser.add_subparsers(dest='action', required=True)
    init = sub.add_parser('seed', help='Freeze nationwide shops export, JSON array or JSONL')
    init.add_argument('snapshot')
    init.add_argument('--recent-days', type=int, default=7, help='Reuse dated Place evidence from RDS (0 forces all live)')
    add = sub.add_parser('candidates', help='Append search result IDs from JSON or JSONL')
    add.add_argument('path')
    review = sub.add_parser('reviews', help='Apply individually reviewed Place observations to the checkpoint')
    review.add_argument('path')
    crawl = sub.add_parser('scan', help='Single sequential worker, checkpointing each result')
    crawl.add_argument('--limit', type=int, default=300)
    crawl.add_argument('--gap', type=float, default=5)
    crawl.add_argument('--candidates-only', action='store_true')
    worker = sub.add_parser('worker', help='Run one bounded scheduled slice and write a status receipt')
    worker.add_argument('--status', required=True)
    worker.add_argument('--gap', type=float, default=6)
    worker.add_argument('--limit', type=int, default=100)
    sub.add_parser('resume', help='Clear a manually reviewed hold; never shorten the site cooldown')
    report = sub.add_parser('report')
    report.add_argument('--out', help='Write decisions and photo-ranked replacement rows into this directory')
    pub = sub.add_parser('publish', help='Reconcile the post-apply full RDS snapshot and atomically write the slot manifest')
    pub.add_argument('snapshot')
    pub.add_argument('output')
    pub.add_argument('--suppressed', required=True, help='Current RDS suppression ID array')
    args = parser.parse_args()
    with sqlite3.connect(args.db) as db:
        db.executescript(SCHEMA)
        if args.action == 'seed':
            seed(db, args.snapshot, args.recent_days)
        elif not db.execute("SELECT 1 FROM meta WHERE key='inventory_at'").fetchone():
            parser.error('First seed a nationwide RDS snapshot')
        elif args.action == 'candidates':
            for item in read_rows(args.path):
                sid = str(item['id'] if isinstance(item, dict) else item)
                queue_candidate(db,sid,item.get('sourceUrl') if isinstance(item,dict) else None)
        elif args.action == 'reviews':
            add_reviews(db, args.path)
        elif args.action in ('scan', 'worker'):
            if not 1 <= args.gap <= 3600 or args.limit < 1:
                parser.error('gap must be 1–3600 seconds, limit must be positive')
            if args.action == 'worker':
                ingest_supplies(db, Path(args.status).parent/'incoming-candidates')
            scan(db, args.limit, args.gap, getattr(args, 'candidates_only', False))
            if args.action == 'worker':
                write_status(db, args.status)
        elif args.action == 'resume':
            if not meta(db).get('manual_hold'):
                parser.error('There is no manual hold')
            db.execute("DELETE FROM meta WHERE key IN ('manual_hold','limit_count')")
        elif args.action == 'report':
            db.execute('BEGIN')
            print(json.dumps(status(db), ensure_ascii=False))
            if args.out:
                rows = list(audit_rows(db))
                refills = [json.loads(row) for row, in db.execute(
                    'SELECT candidate_row FROM evidence WHERE candidate_row IS NOT NULL ORDER BY photo_count DESC,id')]
                folder = Path(args.out)
                folder.mkdir(parents=True, exist_ok=True)
                observed = ({'id':sid,'checkedAt':stamp,**json.loads(payload)} for sid,stamp,payload in
                            db.execute('SELECT id,checked,payload FROM observations ORDER BY id'))
                for name, items in [('decisions', rows), ('verified-refills', refills), ('observations', observed)]:
                    with tempfile.NamedTemporaryFile(dir=folder,mode='w',encoding='utf-8',delete=False) as out:
                        for record in items:
                            out.write(json.dumps(record,ensure_ascii=False) + '\n')
                    os.replace(out.name,folder/(name+'.jsonl'))
        elif args.action == 'publish':
            publish(db, args.snapshot, args.output, args.suppressed)


if __name__ == '__main__':
    main()
