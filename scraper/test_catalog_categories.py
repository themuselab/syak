import unittest
from build_read_model import build_summary, SUPPRESSED_IDS


class CatalogCategoryTests(unittest.TestCase):
    def summary(self, source):
        return build_summary({'id': 'test', 'categories': ['마사지'], 'category_detail': source}, None)

    def test_keyword_or_menu_does_not_prove_massage_business(self):
        for source in (None, '종합가전', '치료,재활', '생활용품', '의료용품,기기제조', '교육원,교육센터'):
            with self.subTest(source=source), self.assertRaises(ValueError):
                self.summary(source)

    def test_skin_care_is_not_massage(self):
        self.assertEqual(self.summary('피부,체형관리')['categories'], ['피부'])

    def test_massage_source_is_preserved(self):
        result = self.summary('안마,마사지,지압')
        self.assertEqual(result['categories'], ['마사지'])
        self.assertEqual(result['sourceCategory'], '안마,마사지,지압')

    def test_owner_removal_and_healthcare_removed_but_verified_massage_remains(self):
        self.assertIn('37445846', SUPPRESSED_IDS)
        self.assertIn('31572101', SUPPRESSED_IDS)
        self.assertNotIn('1685687060', SUPPRESSED_IDS)


if __name__ == '__main__':
    unittest.main()
