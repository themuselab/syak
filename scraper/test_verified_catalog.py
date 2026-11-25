import unittest
from build_verified_catalog import build_verified_row


class VerifiedCatalogTests(unittest.TestCase):
    def record(self, **extra):
        return {'id': '999999999999', 'name': '실제샵', 'accepted': True,
                'category_detail': '피부,체형관리', 'roadAddress_full': '부산 부산진구 중앙대로 1',
                'x': 129.05, 'y': 35.15, 'checkedAt': '2026-11-25T12:00:00Z', **extra}

    def test_original_category_and_address_override_search_query(self):
        result = build_verified_row(self.record(category='마사지', gu='강남구', is_partner=True, today_open=True))
        self.assertEqual(result['category'], '피부')
        self.assertEqual(result['gu'], '부산 부산진구')
        self.assertIs(result['is_partner'], False)
        self.assertIs(result['today_open'], False)
        self.assertIs(result['reservable'], False)

    def test_invalid_candidates_cannot_be_imported(self):
        for fields in ({'id': '37445846'}, {'accepted': False}, {'closed': True},
                       {'category_detail': '미용교육'}, {'category_detail': None},
                       {'checkedAt': None}, {'x': 0}, {'roadAddress_full': ''}):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                build_verified_row(self.record(**fields))

    def test_legacy_gwangju_address_is_assigned_to_the_same_city(self):
        result = build_verified_row(self.record(roadAddress_full='전남광주 동구 남문로 689', x=126.92, y=35.14))
        self.assertEqual(result['gu'], '광주 동구')

    def test_booking_route_is_preserved_without_inventing_availability(self):
        result = build_verified_row(self.record(bookingItems=[{
            'name': '예약', 'bookingUrl': 'https://m.booking.naver.com/booking/13/bizes/123'}, {
            'name': '상담', 'bookingUrl': 'https://m.booking.naver.com/booking/13/bizes/123/items/456'}]))
        self.assertEqual(result['biz_id'], '123')
        self.assertEqual(result['item_id'], '456')
        self.assertEqual(result['item_ids'], ['456'])
        self.assertEqual(result['biz_type'], 13)
        self.assertIs(result['reservable'], True)
        self.assertIs(result['today_open'], False)

    def test_price_ranges_are_preserved_as_text_not_concatenated_integers(self):
        result = build_verified_row(self.record(menus=[
            {'name': '범위 가격', 'price': '60,000~70,000'},
            {'name': '일반 가격', 'price': '50,000원'},
        ]))
        self.assertEqual(result['min_price'], 50000)
        self.assertIsNone(result['detail']['menus'][0]['price'])
        self.assertEqual(result['detail']['menus'][0]['priceText'], '60,000~70,000')
