"""Resolve a public business ID to a verified Place using visible links and the ID-matched shop page."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
import os
from itertools import zip_longest
import re
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from catalog_audit import LIMIT_MSG, Pause, VisibleText, linked_place_id, parse_place, request_html
from slot_ingest import api_get, api_post
from general_shop_refresh import fill_reviews
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


def candidate_targets(shard, limit, run_number):
    # Native and delayed Actions runs advance the same complete 32-shard rotation.
    shards = [shard] if shard is not None else [(4 * (run_number - 1) + n) % 32 for n in range(4)]
    pages = [api_get(QUEUE+'?'+urlencode({'shard':part,'limit':limit}))['targets'] for part in shards]
    pending = [target for group in zip_longest(*pages) for target in group if target is not None]
    linked_pages = [api_get(QUEUE+'?'+urlencode({'kind':'linked','shard':part,'limit':limit}))['targets'] for part in shards]
    linked = [target for group in zip_longest(*linked_pages) for target in group if target and target.get('verifiedPlaceId')]
    return [target for pair in zip_longest(pending,linked) for target in pair if target is not None][:limit]


def initial_snapshot(place, budget):
    record = {'photos':place['images']['gallery'][:100], **place.get('_observations',{})}
    fill_reviews(str(place['id']),record,budget)
    return {'reviews':record.get('reviews',[])[:10], 'photos':record['photos'],
            **{k:record[k] for k in ('visitorReviewCount',) if k in record},
            **{k:place[k] for k in ('phone','virtualPhone','instagram') if place.get(k)}}


def run(shard, limit, run_number=1):
    counts = Counter()
    if not allow():
        return {'shared_hold':1}
    budget = SourceBudget(time.monotonic()+540)
    targets = candidate_targets(shard,limit,run_number)
    for target in targets:
        if not allow():
            counts['shared_hold']+=1
            break
        result = {'publicId':target['publicId'],'identityKey':target['identityKey'],'observedAt':clock().isoformat()}
        try:
            if target.get('verifiedPlaceId'):
                result['refreshPlaceId'] = target['verifiedPlaceId']
                ids = [target['verifiedPlaceId']]
            elif target.get('proposedPlaceId'):
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
                        matches.append(place)
                if len(matches)==1:
                    place = matches[0]
                    sid = str(place['id'])
                    result.update(outcome='verified',place={
                        'id':sid,'url':f'https://m.place.naver.com/place/{sid}/home','name':place['name'],
                        'sourceCategory':place['category_detail'],'roadAddress':place['roadAddress_full'],
                        'latitude':float(place['y']),'longitude':float(place['x']),
                        'snapshot':initial_snapshot(place,budget)})
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
            ack=api_post(QUEUE,result)
            applied=ack['applied']
            if applied and result['outcome']=='verified':
                if ack.get('snapshotSaved') is not True:
                    raise RuntimeError('Missing candidate snapshot acknowledgement')
                snapshot=result['place']['snapshot']
                counts['review_samples']+=len(snapshot['reviews'])
                counts['business_photo_urls']+=len(snapshot['photos'])
        except HTTPError as exc:
            if exc.code not in (400,409) or result['outcome']!='verified':
                raise
            result.pop('place')
            result['outcome']='ambiguous'
            ack=api_post(QUEUE,result)
            applied=ack['applied']
            if applied and result['outcome']=='verified':
                if ack.get('snapshotSaved') is not True:
                    raise RuntimeError('Missing candidate snapshot acknowledgement')
                snapshot=result['place']['snapshot']
                counts['review_samples']+=len(snapshot['reviews'])
                counts['business_photo_urls']+=len(snapshot['photos'])
        counts[result['outcome'] if applied else 'stale']+=1
    return counts


def report_coverage(counts):
    # Internal RDS reads can continue while the upstream site is paused.
    coverage = api_get(QUEUE+'?kind=coverage')['coverage']
    print(json.dumps({'counts':counts,'coverage':coverage}))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary and coverage:
        with open(summary,'a',encoding='utf-8') as out:
            out.write('### 공공데이터 주소 후보 갱신\n\n')
            for label,key in [('등록 주소','registeredAddresses'),('플레이스 일치','linkedPlaces'),
                              ('리뷰 본문 보유 후보','withReviewSamples'),('매장 사진 URL 보유 후보','withBusinessPhotoUrls')]:
                out.write(f"- {label} {int(coverage[key]):,}곳\n")
            if counts.get('shared_hold') or counts.get('upstream_hold'):
                out.write('- 원본 서비스 대기 중\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shard',type=int,choices=range(32),help='Restrict a diagnostic run to one partition')
    parser.add_argument('--limit',type=int,choices=range(1,33),default=12)
    args=parser.parse_args()
    run_number=int(os.environ.get('GITHUB_RUN_NUMBER') or int(time.time()//900))
    report_coverage(run(args.shard,args.limit,run_number))
