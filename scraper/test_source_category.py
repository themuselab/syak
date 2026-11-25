import os
import unittest
from unittest.mock import patch

with patch.dict(os.environ, {'API_BASE_URL': 'https://example.invalid', 'INTERNAL_API_KEY': 'test'}):
    from price_sync import parse_source_category


class SourceCategoryTests(unittest.TestCase):
    def test_uses_requested_place_not_another_embedded_business(self):
        state = {
            'other': {'__typename': 'PlaceDetailBase', 'id': '1', 'category': '미용교육'},
            'requested': {'__typename': 'PlaceDetailBase', 'id': '2',
                          'category': '네일아트,네일샵', 'categoryCodeList': ['test-code']},
        }
        self.assertEqual(parse_source_category(state, '2'), {
            'sourceCategory': '네일아트,네일샵', 'sourceCategoryCodeList': ['test-code']})

    def test_missing_category_does_not_overwrite_previous_evidence(self):
        self.assertEqual(parse_source_category({}, '2'), {})
        self.assertEqual(parse_source_category({'base': {
            '__typename': 'PlaceDetailBase', 'id': '2', 'category': None}}, '2'), {})
