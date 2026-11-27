"""Archive verified shop-owned Place stills in private storage via the internal API."""
import base64
from collections import Counter
import hashlib
from http.client import HTTPException
import io
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image, ImageOps, UnidentifiedImageError

from general_source_budget import SourceBudget, SourcePaused
from slot_ingest import api_get, api_post

API = '/internal/shops/business-photos'
SOURCE = re.compile(r'https://(?:ldb-phinf|naverbooking-phinf)\.pstatic\.net/[^\s\\#]+')
MAX_SOURCE_BYTES = 12 * 1024 * 1024
MAX_JPEG_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 32_000_000


class Unsupported(ValueError):
    """The recorded source cannot supply a supported business still."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(NoRedirect())


def normalized_jpeg(raw):
    try:
        with Image.open(io.BytesIO(raw), formats=['JPEG', 'PNG', 'WEBP']) as image:
            if min(image.size) < 240 or image.width * image.height > MAX_PIXELS or getattr(image, 'is_animated', False):
                raise Unsupported()
            out = io.BytesIO()
            rgb = ImageOps.exif_transpose(image).convert('RGB')
            rgb.thumbnail((2048, 2048))
            rgb.save(out, format='JPEG', quality=90, optimize=True)
            if out.tell() > MAX_JPEG_BYTES:
                raise Unsupported()
            return out.getvalue()
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError, SyntaxError) as err:
        raise Unsupported() from err


def source_image(url, budget):
    if not isinstance(url, str) or len(url) > 2048 or not SOURCE.fullmatch(url):
        raise Unsupported()
    # All Place HTML, photo and candidate workers share the same allocation.
    budget.before('place')
    deadline = time.monotonic() + 25
    with OPENER.open(Request(url, headers={'Accept': 'image/jpeg,image/png,image/webp'}), timeout=15) as res:
        if res.status != 200:
            raise OSError('Unexpected source response')
        if res.headers.get_content_type() in ('text/html', 'application/xhtml+xml'):
            prefix = res.read(8192).decode('utf-8','replace').lower()
            if any(x in prefix for x in ('접근이 제한', '비정상적인 접근', '자동입력', 'access denied', 'captcha')):
                raise HTTPError(url, 403, 'Source access restricted', res.headers, None)
            raise OSError('Unexpected source document')
        length = res.headers.get('Content-Length', '')
        if length.isdigit() and int(length) > MAX_SOURCE_BYTES:
            raise Unsupported()
        data = bytearray()
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError()
            chunk = res.read1(min(65536, MAX_SOURCE_BYTES + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > MAX_SOURCE_BYTES:
                raise Unsupported()
    return normalized_jpeg(data)


def run():
    stats = Counter()
    budget = SourceBudget(time.monotonic() + 300)
    try:
        budget.check()
        rows = api_get(API + '?limit=12', tries=2)['targets']
        for row in rows:
            payload = {k: row[k] for k in ('shopId', 'sourceUrl', 'attempts')}
            try:
                jpeg = source_image(row['sourceUrl'], budget)
                payload.update(outcome='archive', sha256=hashlib.sha256(jpeg).hexdigest(),
                               jpeg=base64.b64encode(jpeg).decode('ascii'))
            except HTTPError as err:
                if err.fp is not None:
                    err.close()
                if err.code in (401, 403, 429, 503):
                    budget.blocked(err)
                    stats['source_paused'] += 1
                    break
                payload['outcome'] = 'unsupported' if err.code in (404, 410) else 'unavailable'
            except Unsupported:
                payload['outcome'] = 'unsupported'
            except (URLError, OSError, HTTPException):
                payload['outcome'] = 'unavailable'
            result = api_post(API, payload, tries=2)
            status = result['status']
            if status not in ('archived', 'recorded', 'skipped'):
                raise RuntimeError('Unexpected archive acknowledgement')
            stats[payload['outcome'] if status == 'recorded' else status] += 1
    except SourcePaused:
        stats['source_paused'] += 1
    return stats


if __name__ == '__main__':
    try:
        print(json.dumps(dict(run()), sort_keys=True))
    except Exception:
        # Never send upstream URLs, request payloads or backend responses to the public workflow log.
        print('Business photo archive run failed', file=sys.stderr)
        sys.exit(1)
