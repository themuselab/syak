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

    def test_four_shards_per_run_interleave_and_cover_all_addresses(self):
        from urllib.parse import parse_qs,urlsplit
        visited=[]
        def page(url):
            query=parse_qs(urlsplit(url).query)
            if 'kind' in query: return {'targets':[]}
            part=int(query['shard'][0])
            visited.append(part)
            return {'targets':[(part,n) for n in range(5)]}
        with patch.object(resolver,'api_get',side_effect=page):
            for run in range(1,9):
                rows=resolver.candidate_targets(None,5,run)
                self.assertEqual([n for _,n in rows],[0,0,0,0,1])
        self.assertEqual(visited,list(range(32)))

    def test_snapshot_keeps_owned_photos_and_zero_count_without_repeating_home_fetch(self):
        data={'id':'12345','images':{'gallery':['https://ldb-phinf.pstatic.net/one']},
              '_observations':{'visitorReviewCount':0,'reviews':[{'body':'시술 후기'}]},'phone':'02-123-4567'}
        with patch('general_shop_refresh.request_html') as visit:
            snapshot=resolver.initial_snapshot(data,None)
        visit.assert_not_called()
        self.assertEqual(snapshot,{'visitorReviewCount':0,'reviews':[{'body':'시술 후기'}],
            'photos':data['images']['gallery'],'phone':'02-123-4567'})
