import io
import json
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from daily_slots import recheck_notice, read_manifest, run, publication, validate_manifest
from partner_refresh import HourlyScheduleUnavailable, ScheduleAccessRestricted, decode_slots


class DailySlotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'report.json'

    def test_remote_publication_is_pinned_and_uses_only_priority_members(self):
        version = 'a' * 64
        with patch('daily_slots.api_get', return_value={'state':'pending'}):
            self.assertIsNone(publication('batch'))
            with self.assertRaises(ValueError):
                publication('batch',version)
        with patch('daily_slots.api_get', return_value={'state':'complete','version':'b'*64}):
            with self.assertRaises(ValueError):
                publication('batch',version)
        manifest = {'schemaVersion':1,'complete':True,'checkedAt':'2020-01-01T00:00:00Z','auditedShopCount':2,
                    'verifiedShopIds':['100001','100002'],'priorityShopIds':['100001'],'availabilityNoticeShopIds':['100002']}
        with patch('daily_slots.api_get',return_value={'state':'complete','version':version,'manifest':manifest}) as get:
            info = publication('batch',version)
            self.assertEqual(validate_manifest(info['manifest'],priority_only=True),({'100001'},set()))
            get.assert_called_once_with('/internal/shops/catalog-audit?batch=batch&version='+version)
        with self.assertRaises(ValueError):
            validate_manifest({**manifest,'priorityShopIds':['999999']},priority_only=True)

    def test_public_partition_output_and_cursor_contain_counts_without_ids(self):
        version = 'b' * 64
        cursor = self.path.with_suffix('.cursor')
        with patch('daily_slots.api_get',return_value={'targets':[{'id':'734611'}]}), \
                patch('daily_slots.slots_for',side_effect=ValueError('failed source')):
            run({'734611'},set(),0,1,self.path,cursor_path=cursor,public_version=version)
        report = json.loads(self.path.read_text())
        self.assertEqual(report['unresolvedCount'],1)
        self.assertNotIn('734611',self.path.read_text()+cursor.read_text())
        self.assertEqual(json.loads(cursor.read_text()),{'position':1,'version':version})

    def test_requires_explicit_completion_and_valid_verified_ids(self):
        base = {'schemaVersion': 1, 'complete': True, 'checkedAt': '2020-01-01T00:00:00Z',
                'auditedShopCount': 2, 'verifiedShopIds': ['1'], 'availabilityNoticeShopIds': ['1']}
        self.path.write_text(json.dumps(base))
        self.assertEqual(read_manifest(self.path), ({'1'}, {'1'}))
        for patch_data in [{'complete': False}, {'verifiedShopIds': ['1', '1']}, {'checkedAt': '2020-01-01'},
                           {'availabilityNoticeShopIds': ['3']}, {'verifiedShopIds': []}]:
            self.path.write_text(json.dumps({**base, **patch_data}))
            with self.assertRaises(ValueError):
                read_manifest(self.path)

    def test_only_visible_matched_place_notice_counts(self):
        html = '<script>window.__APOLLO_STATE__ = {"base":{"__typename":"PlaceDetailBase","id":"1","category":"네일","description":"정보가 다를 수 있습니다"}};</script>'
        with patch('catalog_audit.request_html') as fetch, patch('daily_slots.pause'), \
                patch('daily_slots.record_restriction'):
            fetch.return_value = html
            self.assertEqual(recheck_notice('1'), 'notice_not_seen')
            fetch.return_value = html + '<p>실제 예약 정보와 다를 수 있어요.</p>'
            self.assertEqual(recheck_notice('1'), 'notice_present')
            with self.assertRaises(ValueError):
                recheck_notice('9')
            fetch.return_value = '<body>접근이 제한되었습니다</body>'
            with self.assertRaises(ScheduleAccessRestricted):
                recheck_notice('1')

    def test_only_successful_whole_shops_are_saved_and_flagged_shops_are_checked(self):
        targets = [{'id': str(i)} for i in range(1, 6)]
        with ExitStack() as ctx:
            ctx.enter_context(patch('daily_slots.api_get', return_value={'targets': targets}))
            collect = ctx.enter_context(patch('daily_slots.slots_for', side_effect=[
                {'slots': [{'date':'2026-11-28','startTime':'11:00'}], 'summary': [{'name': '예약', 'times': []}]}, HourlyScheduleUnavailable(), ValueError('partial response')]))
            checked = ctx.enter_context(patch('daily_slots.recheck_notice', return_value='notice_present'))
            save = ctx.enter_context(patch('daily_slots.api_post', return_value={'applied': True, 'newSlots': []}))
            notify = ctx.enter_context(patch('daily_slots.notify'))
            run({'1', '2', '3', '6'}, {'1', '6'}, 0, 1, self.path)
            self.assertEqual(collect.call_count, 3)
            self.assertEqual([c.args[0] for c in checked.call_args_list], ['1', '6'])
            self.assertEqual(save.call_count, 1)
            self.assertEqual(save.call_args.args[1]['data']['summary'], [])
            self.assertTrue(save.call_args.args[1]['data']['noticeChecked'])
            self.assertEqual(save.call_args.args[1]['data']['noticeStatus'], 'notice_present')
            notify.assert_not_called()
        report = json.loads(self.path.read_text())
        self.assertEqual(report['unresolved'], {'3': 'ValueError'})
        self.assertEqual(report['counts']['no_nationwide_booking_target'], 1)

    def test_warning_and_empty_calendar_preserve_existing_shop_data(self):
        with patch('daily_slots.api_get', return_value={'targets': [{'id': '1'}]}), \
                patch('daily_slots.recheck_notice', return_value='notice_present'), \
                patch('daily_slots.slots_for', return_value={'slots': [], 'summary': []}), \
                patch('daily_slots.api_post') as save:
            run({'1'}, {'1'}, 0, 1, self.path)
            save.assert_not_called()
            self.assertEqual(json.loads(self.path.read_text())['unresolved'], {'1': 'notice_empty_unconfirmed'})

    def test_budget_preserves_next_shop_and_later_run_resumes_there(self):
        shops = [{'id': sid} for sid in ['1', '2', '3']]
        cursor = self.path.with_suffix('.cursor')
        with patch('daily_slots.api_get', return_value={'targets': shops}), \
                patch('daily_slots.time.monotonic', side_effect=[1, 2, 10]), \
                patch('daily_slots.slots_for', return_value=None):
            run({'1','2','3'}, set(), 0, 1, self.path, deadline=5, cursor_path=cursor)
        report = json.loads(self.path.read_text())
        self.assertEqual((report['counts']['deferred_budget'], report['nextId']), (1, '3'))
        self.assertEqual(json.loads(cursor.read_text()), {'lastId': '2'})
        with patch('daily_slots.api_get', return_value={'targets': shops}), \
                patch('daily_slots.slots_for', return_value=None) as collect:
            run({'1','2','3'}, set(), 0, 1, self.path, cursor_path=cursor)
            self.assertEqual([c.args[0]['id'] for c in collect.call_args_list], ['3', '1', '2'])

    def test_out_of_window_closed_rows_are_not_authoritative_zero(self):
        raw = {'data': {'schedule': {'bizItemSchedule': {'hourly': [{
            'isUnitBusinessDay': False, 'isUnitSaleDay': False, 'unitStartTime': '2026-11-01T00:00:00',
        }]}}}}
        with self.assertRaises(ValueError):
            decode_slots(raw, '2026-11-28', '2026-11-30')

    def test_throttle_stops_all_following_shops_and_persists_retry_after(self):
        error = HTTPError('https://example.org', 429, 'throttled', {'Retry-After': '172800'}, io.BytesIO())
        cooldown = self.path.with_suffix('.cooldown')
        with patch('daily_slots.api_get', return_value={'targets': [{'id': '1'}, {'id': '2'}]}), \
                patch('daily_slots.slots_for', side_effect=error) as collect, \
                patch('daily_slots.api_post') as save, patch('daily_slots.time.time', return_value=123), \
                patch('daily_slots.COOLDOWN', cooldown):
            with self.assertRaises(HTTPError):
                run({'1', '2'}, set(), 0, 1, self.path)
            self.assertEqual(collect.call_count, 1)
            save.assert_not_called()
            self.assertEqual(json.loads(cooldown.read_text()), {'retryAt': 172923})


if __name__ == '__main__':
    unittest.main()
