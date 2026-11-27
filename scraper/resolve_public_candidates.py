"""Resolve a public business ID to a verified Place using visible links and the ID-matched shop page."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
import re
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from catalog_audit import LIMIT_MSG, Pause, VisibleText, linked_place_id, parse_place, request_html
from slot_ingest import api_get, api_post
from general_source_budget import SourceBudget, SourcePaused

GATE = '/internal/shops/source-backoff'
QUEUE = '/internal/shops/semas-candidates'
CATEGORIES = {'네일아트,네일샵', '미용실', '남성전문미용실', '이용원', '메이크업'}


def clock():
    return datetime.now(timezone.utc)


def allow():
    state = api_get(GATE)
    until = state.get('untilAt')
    return state['manualHold'] is False and (not until or datetime.fromisoformat(until.replace('Z','+00:00')) <= clock())


def visible_places(html, url):
    dom = VisibleText()
    dom.feed(html)
    text = ' '.join(dom.parts)
    if any(msg in text for msg in LIMIT_MSG):
        raise Pause('Place access notice',0)
    ids = list(dict.fromkeys(sid for href in dom.links if (sid := linked_place_id(href,url))))
    if not ids and not any(msg in text for msg in ('검색결과가 없습니다','검색 결과가 없습니다','검색 결과가 없어요')):
        return None  # Incomplete or dynamic page cannot prove the absence of a business.
    return ids


def discover(target):
    query = ' '.join(dict.fromkeys(filter(None,[target['roadAddress'],target['name'],target.get('branch')])))
    url = 'https://search.naver.com/search.naver?' + urlencode({'query':query})
    req = Request(url,headers={'Accept-Language':'ko','User-Agent':'SyakCatalog/1.0'})
    with urlopen(req,timeout=20) as response:
        body = response.read(8_000_001)
        if len(body)>8_000_000:
            return None
        return visible_places(body.decode('utf-8','replace'),url)


def norm(text):
    return re.sub('[^가-힣a-z0-9]','',unicodedata.normalize('NFKC',text).lower())


def building(address):
    match = re.search(r'([가-힣A-Za-z0-9·.\-]+(?:로|길))\s*(\d+(?:-\d+)?)(?=$|[^\d-])',address)
    return match.groups() if match else None


def same_shop(target, place):
    base, branch = norm(target['name']),norm(target.get('branch') or '')
    name = base if base.endswith(branch) else base+branch
    road = building(target['roadAddress'])
    try:
        lat,lon = float(place['y']),float(place['x'])
    except (KeyError,ValueError,TypeError):
        return False
    delta = math.hypot((lon-target['longitude'])*111195*math.cos(math.radians((lat+target['latitude'])/2)),
                       (lat-target['latitude'])*111195)
    return (norm(place.get('name') or '')==name and road and road==building(place.get('roadAddress_full') or '')
            and delta<=100 and place.get('category_detail') in CATEGORIES)


def run(shard, limit):
    counts = Counter()
    if not allow():
        return {'shared_hold':1}
    budget = SourceBudget(time.monotonic()+540)
    targets = api_get(QUEUE+'?'+urlencode({'shard':shard,'limit':limit}))['targets']
    for target in targets:
        if not allow():
            counts['shared_hold']+=1
            break
        result = {'publicId':target['publicId'],'identityKey':target['identityKey'],'observedAt':clock().isoformat()}
        try:
            if target.get('proposedPlaceId'):
                ids = [target['proposedPlaceId']]
            else:
                budget.before('place')
                ids = discover(target)
            result['outcome'] = 'unavailable' if ids is None else 'no_match' if not ids else 'ambiguous'
            matches = []
            if ids and len(ids)<=3:
                for sid in ids:
                    budget.before('place')
                    place,_,_=parse_place(request_html(sid),sid)
                    if same_shop(target,place):
                        matches.append({'id':sid,'url':f'https://m.place.naver.com/place/{sid}/home',
                          'name':place['name'],'sourceCategory':place['category_detail'],'roadAddress':place['roadAddress_full'],
                          'latitude':float(place['y']),'longitude':float(place['x'])})
                if len(matches)==1:
                    result.update(outcome='verified',place=matches[0])
        except SourcePaused:
            counts['shared_hold_or_budget']+=1
            break
        except Pause as exc:
            budget.blocked(exc)
            counts['upstream_hold']+=1
            break
        except HTTPError as exc:
            host = urlsplit(exc.url).hostname or ''
            if not host.endswith('.naver.com'):
                raise
            if exc.code in (401,403,429,503):
                budget.blocked(exc)
                counts['upstream_hold']+=1
                break
            result['outcome']='unavailable'
        except (URLError,ValueError,TimeoutError):
            result['outcome']='unavailable'
        try:
            applied=api_post(QUEUE,result)['applied']
        except HTTPError as exc:
            if exc.code not in (400,409) or result['outcome']!='verified':
                raise
            result.pop('place')
            result['outcome']='ambiguous'
            applied=api_post(QUEUE,result)['applied']
        counts[result['outcome'] if applied else 'stale']+=1
    return counts


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shard',type=int,choices=range(32),default=int(time.time()//900)%32)
    parser.add_argument('--limit',type=int,choices=range(1,33),default=12)
    args=parser.parse_args()
    print(json.dumps(run(args.shard,args.limit)))
