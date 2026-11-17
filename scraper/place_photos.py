"""Only shop-owned still images belong in a shop's gallery.

Apollo also contains reviewer avatars, clips, adverts and nearby places. Never
scan every URL in the cache: use photo items explicitly owned by this place.
"""
from urllib.parse import urlparse


def business_photos(apollo, shop_id):
    result = []
    for node in (apollo or {}).values():
        if not isinstance(node, dict):
            continue
        if node.get('__typename') not in ('PlaceDetailTopPhotoItem', 'PhotoViewerItem'):
            continue
        if not str(node.get('id', '')).startswith(f'{shop_id}_business_'):
            continue
        if node.get('mediaSource') != 'business' or node.get('mediaFormat') != 'image':
            continue
        url = node.get('originalUrl') or node.get('thumbnailUrl')
        if not isinstance(url, str):
            continue
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname not in (
            'ldb-phinf.pstatic.net', 'naverbooking-phinf.pstatic.net',
        ):
            continue
        if url not in result:
            result.append(url)
    return result
