import io
import unittest
from email.message import Message
from urllib.error import HTTPError
from unittest.mock import Mock, patch

from PIL import Image
import archive_business_photos as photos


class ArchivePhotosTests(unittest.TestCase):
    def test_normalizes_and_removes_metadata(self):
        image = Image.new('RGB', (3100, 650), 'red')
        output = io.BytesIO()
        exif = Image.Exif()
        exif[315] = 'artist'
        image.save(output, 'JPEG', exif=exif)
        with Image.open(io.BytesIO(photos.normalized_jpeg(output.getvalue()))) as result:
            self.assertEqual(result.format, 'JPEG')
            self.assertEqual(result.size, (2048, 429))
            self.assertFalse(result.getexif())

    def test_small_and_animated_sources_are_excluded(self):
        for images in ([Image.new('RGB', (120, 300))],
                       [Image.new('RGB', (300, 300), color) for color in ('white', 'red')]):
            out = io.BytesIO()
            images[0].save(out, 'PNG', save_all=True, append_images=images[1:])
            with self.assertRaises(photos.Unsupported):
                photos.normalized_jpeg(out.getvalue())

    def test_validates_destination_before_request_and_never_redirects(self):
        budget = Mock()
        for url in ['http://ldb-phinf.pstatic.net/a', 'https://ldb-phinf.pstatic.net.evil/a',
                    'https://test@ldb-phinf.pstatic.net/a', 'https://ldb-phinf.pstatic.net:443/a',
                    'https://ldb-phinf.pstatic.net/a\\b']:
            with self.assertRaises(photos.Unsupported):
                photos.source_image(url, budget)
        budget.before.assert_not_called()
        self.assertIsNone(photos.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other/a'))

    @patch.object(photos, 'api_post')
    @patch.object(photos, 'api_get')
    @patch.object(photos, 'SourceBudget')
    def test_cooldown_prevents_source_lookup(self, budget, get, post):
        budget.return_value.check.side_effect = photos.SourcePaused()
        self.assertEqual(photos.run()['source_paused'], 1)
        get.assert_not_called()
        post.assert_not_called()

    @patch.object(photos, 'api_post')
    @patch.object(photos, 'source_image')
    @patch.object(photos, 'api_get')
    @patch.object(photos, 'SourceBudget')
    def test_429_reports_then_stops_without_mutating_intake(self, budget, get, fetch, post):
        row = {'shopId':'123', 'sourceUrl':'https://ldb-phinf.pstatic.net/a', 'attempts':0}
        get.return_value = {'targets':[row, row]}
        err = HTTPError(row['sourceUrl'], 429, 'wait', Message(), None)
        fetch.side_effect = err
        self.assertEqual(photos.run()['source_paused'], 1)
        budget.return_value.blocked.assert_called_once_with(err)
        self.assertEqual(fetch.call_count, 1)
        post.assert_not_called()
