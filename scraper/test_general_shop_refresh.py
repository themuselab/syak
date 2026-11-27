import json
import time
import unittest
from unittest.mock import Mock,patch
from urllib.error import HTTPError

from general_source_budget import SourceBudget,SourcePaused
from general_shop_refresh import fast_slots, metadata


def html(state, text=''):
    return '<p>'+text+'</p><script>window.__APOLLO_STATE__ = '+json.dumps(state)+'</script>'


class OrdinaryShopRefreshTests(unittest.TestCase):
    def setUp(self):
        self.shop={'id':'110001','category':'네일','categories':['네일']}
        base={'__typename':'PlaceDetailBase','id':self.shop['id'],'category':'네일아트,네일샵',
              'phone':'02-123-4567','virtualPhone':'0507-123-4567','visitorReviewsTotal':12}
        home={'ROOT_QUERY':{'placeDetail':{'base':base,'homepages':{
            'etc':[{'url':'https://instagram.com/example','type':'instagram'}]}}},
              'image':{'__typename':'PhotoViewerItem','id':'110001_business_a','mediaSource':'business',
                       'mediaFormat':'image','originalUrl':'https://ldb-phinf.pstatic.net/source'}}
        self.home=html(home)
        self.budget=Mock()

    def test_observations_match_the_requested_shop(self):
        reviews={'ROOT_QUERY':{
            'visitorReviews({"placeId":"110002"})':{'items':[{'__typename':'VisitorReview','body':'other'}]},
            'visitorReviews({"placeId":"110001"})':{'items':[{'__typename':'VisitorReview','body':'review','visited':'11.3','author':{'nickname':'name'}}]}}}
        with patch('general_shop_refresh.request_html',side_effect=[self.home,html(reviews)]):
            outcome,data=metadata(self.shop,self.budget)
        self.assertEqual(outcome,'observed')
        self.assertEqual(data['photos'],['https://ldb-phinf.pstatic.net/source'])
        self.assertEqual(data['contacts'][0]['url'],'https://instagram.com/example')
        self.assertEqual(data['visitorReviewCount'],12)
        self.assertEqual(data['reviews'],[{'body':'review','visited':'11.3'}])
        self.assertEqual(data['virtualPhone'],'0507-123-4567')

    def test_primary_category_is_checked_alongside_secondary_categories(self):
        self.shop['categories']=['메이크업']
        with patch('general_shop_refresh.request_html',side_effect=[self.home,html({})]):
            self.assertEqual(metadata(self.shop,self.budget)[0],'observed')

    def test_review_restriction_retains_home_and_stops_source(self):
        error=HTTPError('https://example.invalid',429,'limited',{'Retry-After':'60'},None)
        with patch('general_shop_refresh.request_html',side_effect=[self.home,error]):
            outcome,data=metadata(self.shop,self.budget)
        self.assertEqual(outcome,'observed')
        self.assertEqual(data['visitorReviewCount'],12)
        self.assertNotIn('reviews',data)
        self.budget.blocked.assert_called_once_with(error)

    def test_central_hold_permits_zero_requests(self):
        with patch('general_source_budget.api_get',return_value={'manualHold':True,'untilAt':None}), \
                patch('general_source_budget.api_post') as reserve, patch('general_shop_refresh.request_html') as upstream:
            with self.assertRaises(SourcePaused):
                metadata(self.shop,SourceBudget(time.monotonic()+3))
            upstream.assert_not_called()
            reserve.assert_not_called()

    def test_internal_auth_error_never_looks_like_source_restriction(self):
        error=HTTPError('https://internal.invalid',401,'denied',{},None)
        with patch('general_source_budget.api_get',side_effect=error), patch('general_source_budget.api_post') as send:
            with self.assertRaisesRegex(RuntimeError,'Internal source state unavailable'):
                SourceBudget(time.monotonic()+3).before('place')
            send.assert_not_called()

    def test_restriction_reports_retry_after_and_blocks_next_call(self):
        error=HTTPError('https://example.invalid',429,'limited',{'Retry-After':'120'},None)
        budget=SourceBudget(time.monotonic()+3)
        with patch('general_source_budget.api_post') as send,patch('general_source_budget.api_get') as status:
            budget.blocked(error)
            with self.assertRaises(SourcePaused):
                budget.before('booking')
        send.assert_called_once_with('/internal/shops/source-backoff',{'status':429,'retryAfterSeconds':120})
        status.assert_not_called()

    def test_fast_checks_notice_before_changing_empty_snapshot(self):
        self.shop.update({'_at':'stamp','availability_notice':True})
        with patch('general_shop_refresh.request_html',return_value=self.home.replace('<p></p>','<p>정보가 다를 수 있습니다</p>')), \
                patch('general_shop_refresh.slots_for',return_value={'slots':[],'summary':[]}), \
                patch('general_shop_refresh.api_post') as save:
            self.assertEqual(fast_slots(self.shop,self.budget),('notice-empty',{}))
            save.assert_not_called()
