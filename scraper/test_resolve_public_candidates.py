import unittest
from unittest.mock import patch
import resolve_public_candidates as resolver


class Resolution(unittest.TestCase):
    def test_public_search_accepts_only_canonical_entity_links(self):
        html = '<a href="https://map.naver.com/p/entry/place/12345">샵</a><a href="https://other.test/place/9999">X</a>'
        self.assertEqual(resolver.visible_places(html,'https://search.naver.com/search.naver'),['12345'])
        self.assertIsNone(resolver.visible_places('<main></main>','https://search.naver.com/'))
        self.assertEqual(resolver.visible_places('검색 결과가 없습니다','https://search.naver.com/'),[])

    def test_same_branch_building_and_distance_are_required(self):
        target = {'name':'샥 네일','branch':'서초점','roadAddress':'서울 서초구 사임당로1길 24', 'latitude':37.489,'longitude':127.013}
        got = {'name':'샥네일 서초점','category_detail':'네일아트,네일샵','roadAddress_full':'서울 서초구 사임당로1길 24 2층', 'x':'127.013','y':'37.4891'}
        self.assertTrue(resolver.same_shop(target,got))
        self.assertFalse(resolver.same_shop(target,{**got,'name':'샥네일 역삼점'}))
        self.assertFalse(resolver.same_shop(target,{**got,'x':'127.034'}))
        self.assertFalse(resolver.same_shop(target,{**got,'roadAddress_full':'사임당로1길 240'}))

    def test_shared_hold_makes_no_source_or_target_request(self):
        with patch.object(resolver,'allow',return_value=False), patch.object(resolver,'api_get') as get, patch.object(resolver,'discover') as discover:
            self.assertEqual(resolver.run(0,10),{'shared_hold':1})
            get.assert_not_called()
            discover.assert_not_called()
