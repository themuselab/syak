import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault('API_BASE_URL', 'https://example.invalid')
os.environ.setdefault('INTERNAL_API_KEY', 'test')
from enrich_events import parse_event, fetch_one


class EventParserTests(unittest.TestCase):
    def test_brackets_quotes_and_newlines_in_description(self):
        desc = '[첫 방문] "네일" 20% 할인\n지금 예약'
        html = '<script>' + json.dumps({'eventDescJson': [{'desc': desc}]}, ensure_ascii=False) + '</script>'
        self.assertEqual(parse_event(html), ('[첫 방문] "네일" 20% 할인 지금 예약', '20% 할인'))

    def test_verified_empty_and_non_promotional_entries(self):
        for rows in ([], [{'desc': '안녕하세요'}]):
            self.assertEqual(parse_event(json.dumps({'eventDescJson': rows})), (None, None))

    def test_missing_truncated_and_invalid_entries_raise(self):
        for html in ('<html>loading</html>', '"eventDescJson":[{"desc":"[할인]',
                     '"eventDescJson":null', '"eventDescJson":[null]', '"eventDescJson":[{"desc":3}]'):
            with self.subTest(html=html), self.assertRaises(ValueError):
                parse_event(html)

    def test_batch_preserves_old_event_on_invalid_page(self):
        with patch('enrich_events.urllib.request.urlopen') as request, patch('enrich_events.PACE'):
            request.return_value.read.return_value = b'"eventDescJson":[{"desc":"broken'
            self.assertEqual(fetch_one({'id': '1', 'biz_id': '2', 'item_id': '3'}), ('1', '__ERR__', None))


if __name__ == '__main__':
    unittest.main()
