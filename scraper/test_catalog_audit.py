import csv
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from catalog_place_observations import observations
from catalog_audit import (SCHEMA, Pause, add_reviews, audit_rows, category_decision, parse_place,
                           publish, scan, seed, utcnow, record_pause, linked_place_id, meta, write_review_csv)


class CatalogAuditTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        self.db = sqlite3.connect(self.folder / 'state.sqlite')
        self.addCleanup(self.db.close)
        self.db.executescript(SCHEMA)

    def write(self, name, rows):
        path = self.folder / name
        path.write_text(json.dumps(rows), encoding='utf-8')
        return path

    def seed(self, *rows):
        seed(self.db, self.write('original.json', list(rows)), 7)
        self.db.commit()

    def row(self, sid, category, source):
        return {'id': sid, 'category': category, 'categories': [category], 'is_partner': False,
                'source_category': source, 'source_checked_at': utcnow() if source else None}

    def test_parse_identity_links_and_visible_notice(self):
        state = {'other': {'__typename': 'PlaceDetailBase', 'id': '1', 'category': '제조업'},
                 'own': {'__typename': 'PlaceDetailBase', 'id': '2', 'category': '미용실'},
                 'ROOT_QUERY': {'placeDetail(test)': {'base': {'__ref': 'own'}, 'homepages': {
                     'repr': {'url': 'https://www.instagram.com/shop/'}}}}}
        page = '<p>예약 정보가 실제와 다를 수 있습니다</p><script>window.__APOLLO_STATE__ = ' + json.dumps(state) + ';</script>'
        rec, notice, _ = parse_place(page, '2')
        self.assertEqual((rec['category_detail'], notice, rec['instagram']),
                         ('미용실', 1, 'https://www.instagram.com/shop/'))
        with self.assertRaises(ValueError):
            parse_place(page, '3')
        self.assertEqual(parse_place(page.replace('<p>예약 정보가 실제와 다를 수 있습니다</p>',
                                                  '<script>const msg="정보가 다를 수 있어요"</script>'), '2')[1], 0)
        state['ROOT_QUERY']['placeDetail(test)']['base'] = {'__ref':'other'}
        with self.assertRaises(ValueError):
            parse_place('<script>window.__APOLLO_STATE__ = '+json.dumps(state)+'</script>','2')
        with self.assertRaises(Pause):
            parse_place('<title>서비스 이용이 제한되었습니다</title>', '2')

    def test_ambiguous_categories_and_owners_preserved(self):
        self.assertEqual(category_decision('마사지', ['마사지'], False, '의료용품,기기제조'), 'exclude')
        self.assertEqual(category_decision('마사지', ['마사지'], True, '의료용품,기기제조'), 'review-partner')
        for category in ('왁싱', '마사지'):
            self.assertEqual(category_decision(category, [category], False, '피부,체형관리'), 'review-category')
        self.assertEqual(category_decision('왁싱', ['왁싱','피부'], False, '메이크업'), 'review-category')

    def test_block_stops_queue_and_prevents_immediate_resumption(self):
        self.seed(self.row('1','헤어',None), self.row('2','마사지','제조업'))
        with patch('catalog_audit.request_html', side_effect=Pause('HTTP 429',86400)) as fetch:
            scan(self.db, 10, 5, False)
            scan(self.db, 10, 5, False)
            fetch.assert_called_once_with('2')
        self.assertEqual(dict(self.db.execute('SELECT key,value FROM meta'))['pause_reason'], 'HTTP 429')
        self.assertEqual(list(audit_rows(self.db))[0]['decision'], 'pending')

    def test_backoff_respects_server_and_manual_challenges(self):
        with patch('catalog_audit.time.time', return_value=1000):
            for delay in (900,1800,3600,7200):
                record_pause(self.db, 'HTTP 429', 0)
                self.assertEqual(float(meta(self.db)['resume_after']), 1000+delay)
                self.assertNotIn('manual_hold', meta(self.db))
            record_pause(self.db, 'HTTP 429', 9*86400)
            self.assertEqual(float(meta(self.db)['resume_after']), 1000+9*86400)
            record_pause(self.db, 'HTTP 403', 86400)
            self.assertIn('manual_hold', meta(self.db))

    def test_cached_matches_still_scanned_and_discovery_rejects_booking_ids(self):
        self.seed(self.row('1000','헤어','미용실'))
        html = '<script>window.__APOLLO_STATE__ = {"b":{"__typename":"PlaceDetailBase","id":"1000","category":"미용실"}};</script>'
        html += '<a href="/nailshop/2000/home">네일</a><a href="https://elsewhere.test/hairshop/3000">광고</a>'
        with patch('catalog_audit.request_html', return_value=html) as fetch:
            scan(self.db, 2, 1, False)
            fetch.assert_called_once_with('1000')
        self.assertEqual(list(audit_rows(self.db))[0]['origin'],'live-place')
        self.assertEqual(self.db.execute('SELECT id FROM candidates').fetchall(),[('2000',)])
        self.assertIsNone(linked_place_id('https://booking.naver.com/booking/13/bizes/98765', 'https://example.org'))
        self.assertEqual(linked_place_id('https://store.naver.com/hairshops/detail?id=11111', ''), '11111')

    def test_complete_requires_reconciled_changes_and_one_to_one_replacement(self):
        kept, wrong, removed = self.row('1','헤어','미용실'), self.row('2','왁싱','미용실'), self.row('3','마사지','제조업')
        self.seed(kept,wrong,removed)
        out = self.folder / 'manifest.json'
        suppressed = self.write('suppressed.json', ['3'])
        with self.assertRaises(ValueError):
            publish(self.db, self.folder / 'original.json', out,suppressed)
        self.assertFalse(out.exists())
        self.db.execute("UPDATE evidence SET origin='live-place'")
        corrected = self.row('2','헤어','미용실')
        with self.assertRaises(ValueError):
            publish(self.db, self.write('latest.json', [kept,corrected]), out,suppressed)
        self.db.executemany("INSERT INTO candidates VALUES(?)",[('4',),('5',)])
        self.db.execute("INSERT INTO evidence(id,source,checked,candidate_row,notice,origin) VALUES('4','메이크업',?,?,1,'live-place')",
                        (utcnow(),json.dumps({'category':'메이크업'})))
        publish(self.db,self.write('latest.json',[kept,corrected,self.row('4','메이크업','메이크업')]),out,suppressed)
        manifest = json.loads(out.read_text())
        self.assertEqual(manifest['verifiedShopIds'], ['1','2','4'])
        self.assertEqual(manifest['availabilityNoticeShopIds'], ['4'])
        self.db.execute("INSERT INTO evidence(id,source,checked,candidate_row,origin) VALUES('5','미용실',?,?,'live-place')",
                        (utcnow(),json.dumps({'category':'헤어'})))
        surplus = [kept, corrected, self.row('4','메이크업','메이크업'),self.row('5','헤어','미용실')]
        publish(self.db,self.write('latest.json',surplus),out,suppressed)
        self.assertEqual(len(json.loads(out.read_text())['priorityShopIds']),4)
        with self.assertRaises(ValueError):
            publish(self.db,self.write('latest.json',surplus),out,self.write('suppressed.json',['5']))

    def test_observations_are_scoped_and_do_not_emit_missing_values(self):
        state = {'ROOT_QUERY':{'visitorReviews({"input":{"businessId":"2"}})':{'items':[{'__ref':'r'}]},
                               'visitorReviews({"input":{"businessId":"1"}})':{'items':[{'__ref':'other'}]}},
                 'r':{'__typename':'VisitorReview','body':'좋았어요','author':'리뷰어','visited':'11.26.'},
                 'other':{'__typename':'VisitorReview','body':'다른 샵'},
                 'unlinked':{'__typename':'BookingItem','bookingUrl':'https://booking.naver.com/booking/13/bizes/99'}}
        detail = {'bookingItems':[{'bookingUrl':'https://m.booking.naver.com/booking/13/bizes/12/items/65?track=xyz','name':'상담'},
                                  {'bookingUrl':'https://unknown.example/booking/1/bizes/9'}]}
        result = observations(state, detail, {'visitorReviewsTotal':0},'2')
        self.assertEqual(result['visitorReviewCount'],0)
        self.assertEqual(result['reviews'],[{'body':'좋았어요','visited':'11.26.'}])
        self.assertEqual(result['bookingItems'],[{'bookingUrl':'https://m.booking.naver.com/booking/13/bizes/12/items/65',
                                                  'bizId':'12','bizType':13,'itemId':'65','name':'상담'}])
        self.assertEqual(observations(state,{}, {},'3'),{})
        state['r']['body'] = '문의 010-1234-5678'
        self.assertNotIn('reviews',observations(state,detail,{},'2'))

    def test_review_csv_combines_operational_notes_and_hides_pending(self):
        self.seed(self.row('5','헤어',None), self.row('8','왁싱','미용'),self.row('9','헤어','미용실'))
        self.db.execute("UPDATE inventory SET name='=SUM(1,2)' WHERE id='8'")
        path = self.folder / '개별검토.csv'
        write_review_csv(audit_rows(self.db), path, {'8':'소유권 확인','9':'수정 충돌'})
        self.assertTrue(path.read_bytes().startswith(b'\xef\xbb\xbf'))
        with path.open(encoding='utf-8-sig', newline='') as inp:
            records = list(csv.DictReader(inp))
        self.assertEqual([r['플레이스 ID'] for r in records], ['8','9'])
        self.assertEqual(records[0]['샵 이름'], "'=SUM(1,2)")
        self.assertIn('소유권 확인',records[0]['보류 사유'])
        self.assertTrue(records[0]['카카오맵 검색 URL'].startswith('https://map.kakao.com/link/search/'))
        self.assertEqual(records[1]['검토 종류'],'운영 반영 검토')

    def test_review_requires_matching_place_and_recent_evidence(self):
        self.seed(self.row('10','왁싱','미용'))
        review = {'id':'10','placeUrl':'https://m.place.naver.com/place/99/home','checkedAt':utcnow(),
                  'sourceCategory':'미용','decision':'keep','note':'샵의 왁싱 메뉴 확인'}
        with self.assertRaises(ValueError):
            add_reviews(self.db,self.write('reviews', [review]))
        review['placeUrl'] = 'https://m.place.naver.com/place/10/home'
        add_reviews(self.db,self.write('reviews', [review]))
        self.assertEqual(list(audit_rows(self.db))[0]['decision'], 'keep')
        self.db.execute('UPDATE evidence SET checked=? WHERE id=?', (utcnow(),'10'))
        self.assertEqual(list(audit_rows(self.db))[0]['decision'], 'review-source')


if __name__ == '__main__':
    unittest.main()
