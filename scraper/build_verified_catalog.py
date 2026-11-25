"""Build ordinary-shop import rows from individually checked Place records.

This module never fetches pages or writes to a database. Unverified search
results, suppressed IDs and unknown business categories cannot be imported.
"""
import json
import re
from pathlib import Path
from datetime import datetime
from build_read_model import build_summary, build_detail, min_menu_price, SUPPRESSED_IDS

VERIFIED_CATEGORIES = {
    '안마,마사지,지압': '마사지', '스포츠마사지': '마사지', '마사지': '마사지',
    '피부,체형관리': '피부', '미용문신,반영구화장': '반영구',
    '속눈썹증모,연장': '속눈썹', '왁싱,제모': '왁싱', '태닝': '태닝',
}


def region_from_address(address):
    words = address.split()
    if not words:
        raise ValueError('Missing address')
    city = re.sub(r'(광역시|특별시)$', '', words[0])
    # Naver still returns this historic province-prefixed city label for some places.
    if city == '전남광주':
        city = '광주'
    if city.startswith('서울'):
        return next((w for w in words[1:] if w.endswith('구')), '')
    if city.startswith('세종'):
        return '세종시'
    if city in {'부산', '대구', '인천', '광주', '대전', '울산'}:
        district = next((w for w in words[1:] if w.endswith(('구', '군'))), '')
        return f'{city} {district}'.strip()
    return next((w for w in words[1:] if w.endswith(('시', '군'))), '')


def build_verified_row(record):
    sid = str(record.get('id', ''))
    category = VERIFIED_CATEGORIES.get(record.get('category_detail'))
    if not sid.isdigit() or sid in SUPPRESSED_IDS:
        raise ValueError('Invalid or suppressed ID')
    if record.get('accepted') is not True or record.get('closed') or not category:
        raise ValueError('An individually verified salon category is required')
    checked_at = record.get('checkedAt')
    if not checked_at:
        raise ValueError('Missing verification timestamp')
    datetime.fromisoformat(checked_at.replace('Z', '+00:00'))
    name = str(record.get('name') or '').strip()
    address = str(record.get('roadAddress_full') or '').strip()
    gu = region_from_address(address)
    lat, lng = float(record.get('y') or 0), float(record.get('x') or 0)
    if not name or not gu or not (32 < lat < 40 and 124 < lng < 132):
        raise ValueError('Verified name, address and Korean coordinates are required')
    # Derive category and region from the detail, never the discovery query.
    source = {**record, 'id': sid, 'name': name, 'categories': [category], 'gus': [gu]}
    normalized_menus = []
    for menu in record.get('menus') or []:
        text = str(menu.get('price') or '').strip()
        # Do not concatenate ranges such as 60,000~70,000 into 6000070000.
        value = int(re.sub(r'[^0-9]', '', text)) if re.fullmatch(r'[\d,]+\s*원?', text) else None
        if value is not None and not (0 <= value <= 2_000_000):
            value = None
        normalized_menus.append({**menu, 'price': value, 'priceText': text})
    source['menus'] = normalized_menus
    source['bookingItems'] = [b for b in record.get('bookingItems') or []
                              if re.match(r'^https://(?:m\.)?booking\.naver\.com/booking/\d+/bizes/\d+(?:/|$)', b.get('bookingUrl') or '')]
    source['reservable'] = bool(source.get('bookingItems'))
    summary = build_summary(source, min_menu_price(source.get('menus')))
    detail = build_detail(source, summary)
    for menu, raw in zip(detail['menus'], [m for m in normalized_menus if m.get('name')]):
        if raw['priceText']:
            menu['priceText'] = raw['priceText']
    detail['sourceCategoryCheckedAt'] = checked_at
    detail['catalogImportBatch'] = 'verified-refill-20261125'
    if record.get('businessHours'):
        detail['businessHours'] = record['businessHours']
    bookings = [(re.search(r'/booking/(\d+)/bizes/(\d+)(?:/items/(\d+))?', b['bookingUrl']), b)
                for b in source['bookingItems']]
    booking = next((m for m, _ in bookings if m and m.group(3)), bookings[0][0] if bookings else None)
    items = {m.group(3): {'id': m.group(3), 'name': b.get('name') or '예약'}
             for m, b in bookings if m and m.group(3) and booking and m.group(2) == booking.group(2)}
    return {
        'id': sid, 'name': name, 'category': category, 'categories': [category], 'gu': gu,
        'lat': lat, 'lng': lng, 'representative_image': summary['representativeImage'],
        'review_count': summary['reviewCount'], 'price_tier': summary['priceTier'],
        'min_price': summary['minPrice'], 'first_visit_deal': summary['firstVisitDeal'],
        'has_event': summary['hasEvent'], 'reservable': summary['reservable'],
        'biz_id': booking.group(2) if booking else None,
        'biz_type': int(booking.group(1)) if booking else None,
        'item_id': booking.group(3) if booking else None,
        'item_ids': list(items), 'items': list(items.values()),
        'detail': detail, 'is_partner': False, 'today_open': False,
    }


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    records = json.loads(args.input.read_text(encoding='utf-8'))
    rows = [build_verified_row(r) for r in records if r.get('accepted')]
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate verified IDs')
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Prepared {len(rows)} verified ordinary shops; no database changes made')
