import unittest
from place_photos import business_photos


class BusinessPhotosTests(unittest.TestCase):
    def test_only_requested_shop_business_stills_are_collected(self):
        photo = {'__typename': 'PlaceDetailTopPhotoItem', 'id': '123_business_1',
                 'mediaSource': 'business', 'mediaFormat': 'image',
                 'originalUrl': 'https://ldb-phinf.pstatic.net/shop.jpg'}
        apollo = {'photo': photo, 'duplicate': dict(photo),
                  'otherShop': {**photo, 'id': '456_business_1'},
                  'clip': {**photo, 'id': '123_clip_1', 'mediaSource': 'clip'},
                  'video': {**photo, 'mediaFormat': 'video'},
                  'avatar': {'__typename': 'PhotoViewerItemAuthor',
                             'imageUrl': 'https://phinf.pstatic.net/contact/avatar.jpg'},
                  'ad': {**photo, 'originalUrl': 'https://maps-service.pstatic.net/maps-cms/banner.jpg'},
                  'review': {**photo, 'id': '123_visitor_1', 'mediaSource': 'placeReview'}}
        self.assertEqual(business_photos(apollo, '123'), [photo['originalUrl']])

    def test_does_not_guess_gallery_from_unrelated_cache_entries(self):
        self.assertEqual(business_photos({'base': {'imageUrl': 'https://ldb-phinf.pstatic.net/ad.jpg'}}, '123'), [])
        self.assertEqual(business_photos(None, '123'), [])


if __name__ == '__main__':
    unittest.main()
