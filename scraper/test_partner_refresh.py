import unittest
from unittest.mock import AsyncMock, Mock, patch
from types import SimpleNamespace
from partner_refresh import decode_slots, slots_for, fast, HourlyScheduleUnavailable, fetch_partner_detail


class PartnerRefreshTests(unittest.TestCase):
    def test_missing_schedule_is_not_an_empty_calendar(self):
        for raw in ({}, {"errors": [{"message": "failed"}]}, {"data": {"schedule": None}}):
            with self.assertRaises(ValueError):
                decode_slots(raw)

    def test_verified_empty_calendar_is_authoritative(self):
        self.assertEqual(decode_slots({"data": {"schedule": {"bizItemSchedule": {"hourly": []}}}}), [])

    def test_null_hourly_is_distinct_from_errors_and_missing_fields(self):
        raw = {"data": {"schedule": {"bizItemSchedule": {"hourly": None}}}}
        with self.assertRaises(HourlyScheduleUnavailable):
            decode_slots(raw)
        for invalid in ({'errors': [{}], **raw}, {'data': {'schedule': {'bizItemSchedule': {}}}}):
            with self.assertRaises(ValueError) as failure:
                decode_slots(invalid)
            self.assertNotIsInstance(failure.exception, HourlyScheduleUnavailable)

    def test_unavailable_does_not_write_and_other_shops_continue(self):
        shops = [{'id': '1', 'due': True}, {'id': '2', 'due': True}]
        with patch('partner_refresh.pages', side_effect=lambda kind: [shops] if kind == 'slots' else []), \
             patch('partner_refresh.slots_for', side_effect=[HourlyScheduleUnavailable(), {'slots': []}]), \
             patch('partner_refresh.apply', return_value={'applied': True}) as save, \
             patch('partner_refresh.notify_new_slots') as notify, \
             patch('partner_refresh.time.sleep'), patch('partner_refresh.report'):
            self.assertEqual(fast(), 0)
            self.assertEqual(save.call_count, 1)
            self.assertEqual(save.call_args.args[0]['id'], '2')
            notify.assert_not_called()

    def test_real_error_still_fails_without_writing(self):
        with patch('partner_refresh.pages', side_effect=lambda kind: [[{'id': '1', 'due': True}]] if kind == 'slots' else []), \
             patch('partner_refresh.slots_for', side_effect=ValueError('Invalid schedule')), \
             patch('partner_refresh.apply') as save, \
             patch('partner_refresh.time.sleep'), patch('partner_refresh.report'):
            self.assertEqual(fast(), 1)
            save.assert_not_called()

    def test_closed_and_sold_out_times_are_not_available(self):
        base = {"unitStartTime": "2026-11-08 14:00:00", "isUnitBusinessDay": True, "isUnitSaleDay": True, "stock": 1, "bookingCount": 0}
        raw = lambda rows: {"data": {"schedule": {"bizItemSchedule": {"hourly": rows}}}}
        self.assertEqual(decode_slots(raw([base])), [('2026-11-08', '14:00')])
        self.assertEqual(decode_slots(raw([{**base, 'bookingCount': 1}, {**base, 'isUnitSaleDay': False}])), [])

    def test_deadline_never_submits_an_incomplete_shop(self):
        with patch('partner_refresh.time.monotonic', return_value=10):
            with self.assertRaises(TimeoutError):
                slots_for({'biz_id': '1', 'item_ids': ['2', '3']}, '2026-11-08', '2026-11-10', deadline=5)


class DetailLoadingTests(unittest.IsolatedAsyncioTestCase):
    async def test_incomplete_load_retries_then_extracts(self):
        page = SimpleNamespace(goto=AsyncMock(), wait_for_function=AsyncMock(side_effect=[TimeoutError(), None]),
                               evaluate=AsyncMock(return_value={'ROOT_QUERY': {}}))
        extract = Mock(return_value={'name_detail': 'Shop'})
        with patch.dict('sys.modules', {'enrich_details': SimpleNamespace(extract_detail=extract)}), \
             patch('partner_refresh.time.monotonic', return_value=0), \
             patch('partner_refresh.asyncio.sleep', new_callable=AsyncMock), patch('partner_refresh.report'):
            _, detail = await fetch_partner_detail(page, '1', 60)
            self.assertEqual(detail['name_detail'], 'Shop')
            self.assertEqual(page.goto.await_count, 2)
            extract.assert_called_once()

    async def test_persistent_failure_stops_after_one_retry(self):
        page = SimpleNamespace(goto=AsyncMock(), wait_for_function=AsyncMock(side_effect=TimeoutError()), evaluate=AsyncMock())
        with patch.dict('sys.modules', {'enrich_details': SimpleNamespace(extract_detail=Mock())}), \
             patch('partner_refresh.time.monotonic', return_value=0), \
             patch('partner_refresh.asyncio.sleep', new_callable=AsyncMock), patch('partner_refresh.report'):
            with self.assertRaises(TimeoutError):
                await fetch_partner_detail(page, '1', 60)
            self.assertEqual(page.goto.await_count, 2)
            page.evaluate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
