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

    def test_non_salon_categories_are_rejected_across_all_catalog_categories(self):
        for category, source in [('태닝', '화장품,향수'), ('반영구', '미용기기,재료'),
                                 ('피부', '산부인과'), ('속눈썹', '미용교육'), ('헤어', '미용학원')]:
            with self.subTest(category=category), self.assertRaises(ValueError):
                build_summary({'id': 'new', 'categories': [category], 'category_detail': source}, None)

    def test_salon_with_ambiguous_name_and_unknown_source_is_not_removed(self):
        for source in ('네일아트,네일샵', None):
            result = build_summary({'id': 'real', 'name': '네일공장 아카데미',
                                    'categories': ['네일'], 'category_detail': source}, None)
            self.assertEqual(result['category'], '네일')

    def test_specific_source_corrects_single_keyword_category_but_preserves_multi_service(self):
        record = {'id': 'shop', 'category_detail': '미용실', 'categories': ['왁싱']}
        self.assertEqual(build_summary(record, None)['category'], '헤어')
        record['categories'] = ['왁싱', '헤어']
        self.assertEqual(build_summary(record, None)['categories'], ['왁싱', '헤어'])

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
