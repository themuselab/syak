"""Fields directly connected to the requested Place entity in a home-page state."""
import json
import re
from urllib.parse import urlsplit, urlunsplit

PRIVATE_CONTACT = re.compile(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|(?<!\d)01[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)|(?<!\w)@[A-Za-z0-9_.]+')
BOOKING_PATH = re.compile(r'/booking/([0-9]+)/bizes/([0-9]+)(?:/items/([0-9]+))?/?')


def belongs_to_query(key, sid):
    args = re.fullmatch(r'\w+\((\{.*\})\)', key)
    if not args:
        return False
    try:
        obj = json.loads(args[1])
    except ValueError:
        return False
    while isinstance(obj, dict):
        if 'placeId' in obj or 'businessId' in obj:
            identifiers = [str(obj[k]) for k in ('placeId','businessId') if k in obj]
            return all(v == sid for v in identifiers)
        obj = obj.get('input')
    return False


def scoped_nodes(value, state, kind, sid, seen, depth=0):
    if depth > 8:
        return
    if isinstance(value, list):
        for v in value:
            yield from scoped_nodes(v,state,kind,sid,seen,depth+1)
    elif isinstance(value,dict):
        if '__ref' in value:
            ref = value['__ref']
            if isinstance(ref,str) and ref not in seen:
                seen.add(ref)
                yield from scoped_nodes(state.get(ref),state,kind,sid,seen,depth+1)
            return
        if 'placeId' in value and str(value['placeId']) != sid:
            return
        if value.get('__typename') == kind or (kind == 'BookingItem' and isinstance(value.get('bookingUrl'),str)):
            yield value
            return
        for key in ('items','list','edges','node','nodes','reviews','visitorReviews','bookingItems','bookingItemList'):
            if key in value:
                yield from scoped_nodes(value[key],state,kind,sid,seen,depth+1)


def booking_item(node):
    href = node.get('bookingUrl')
    if not isinstance(href,str):
        return None
    u = urlsplit(href)
    if u.scheme != 'https' or u.netloc not in ('booking.naver.com','m.booking.naver.com'):
        return None
    match = BOOKING_PATH.fullmatch(u.path)
    if not match:
        return None
    item = {'bookingUrl': urlunsplit((u.scheme,u.netloc,u.path,'','')),
            'bizType':int(match[1]), 'bizId':match[2]}
    if match[3]:
        item['itemId'] = match[3]
    if isinstance(node.get('name'),str) and node['name'].strip():
        item['name'] = node['name']
    return item


def observations(state, detail, base, sid):
    out = {}
    count = base.get('visitorReviewsTotal')
    if type(count) is int and count >= 0:
        out['visitorReviewCount'] = count
    elif isinstance(count,str) and re.fullmatch(r'[0-9]+(?:,[0-9]{3})*',count):
        out['visitorReviewCount'] = int(count.replace(',',''))
    roots = {'VisitorReview': [], 'BookingItem': []}
    for name, node in detail.items():
        field = name.partition('(')[0]
        if field in ('visitorReviews','visitorReviewList'):
            roots['VisitorReview'].append(node)
        elif field in ('bookingItems','bookingItemList','naverBooking','booking'):
            roots['BookingItem'].append(node)
    for field in ('bookingUrl','naverBookingUrl'):
        if isinstance(base.get(field),str):
            roots['BookingItem'].append({'bookingUrl':base[field]})
    for key, value in (state.get('ROOT_QUERY') or {}).items():
        field = key.partition('(')[0]
        if field in ('visitorReviews','visitorReviewList','bookingItems','bookingItemList') and belongs_to_query(key,sid):
            roots['VisitorReview' if field.startswith('visitor') else 'BookingItem'].append(value)
    reviews = []
    for node in scoped_nodes(roots['VisitorReview'],state,'VisitorReview',sid,set()):
        body = node.get('body')
        if (node.get('status') not in (None,'ACTIVE') or not isinstance(body,str) or not body.strip()
                or PRIVATE_CONTACT.search(body) or len(body) > 4000):
            continue
        author = node.get('author') or node.get('writer') or {}
        if isinstance(author,dict) and '__ref' in author:
            author = state.get(author['__ref'],{})
        if isinstance(author,dict) and any(isinstance(value,str) and len(value.strip()) >= 2 and value in body
                                           for value in (author.get('name'),author.get('nickname'),author.get('nickName'))):
            continue
        review = {'body': body}
        when = node.get('visited') or node.get('visitedDate')
        if isinstance(when,str) and when.strip():
            review['visited'] = when
        if review not in reviews:
            reviews.append(review)
        if len(reviews) >= 10:
            break
    if reviews:
        out['reviews'] = reviews
    items = {}
    for node in scoped_nodes(roots['BookingItem'],state,'BookingItem',sid,set()):
        item = booking_item(node)
        if item:
            items.setdefault(item['bookingUrl'],item)
    if items:
        out['bookingItems'] = list(items.values())
    return out
