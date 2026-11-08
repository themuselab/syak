import unittest
from unittest.mock import patch
from partner_refresh import decode_slots, slots_for


class PartnerRefreshTests(unittest.TestCase):
    def test_missing_schedule_is_not_an_empty_calendar(self):
        for raw in ({}, {"errors": [{"message": "failed"}]}, {"data": {"schedule": None}}):
            with self.assertRaises(ValueError):
                decode_slots(raw)

    def test_verified_empty_calendar_is_authoritative(self):
        self.assertEqual(decode_slots({"data": {"schedule": {"bizItemSchedule": {"hourly": []}}}}), [])

    def test_closed_and_sold_out_times_are_not_available(self):
        base = {"unitStartTime": "2026-11-08 14:00:00", "isUnitBusinessDay": True, "isUnitSaleDay": True, "stock": 1, "bookingCount": 0}
        raw = lambda rows: {"data": {"schedule": {"bizItemSchedule": {"hourly": rows}}}}
        self.assertEqual(decode_slots(raw([base])), [('2026-11-08', '14:00')])
        self.assertEqual(decode_slots(raw([{**base, 'bookingCount': 1}, {**base, 'isUnitSaleDay': False}])), [])

    def test_deadline_never_submits_an_incomplete_shop(self):
        with patch('partner_refresh.time.monotonic', return_value=10):
            with self.assertRaises(TimeoutError):
                slots_for({'biz_id': '1', 'item_ids': ['2', '3']}, '2026-11-08', '2026-11-10', deadline=5)


if __name__ == '__main__':
    unittest.main()
