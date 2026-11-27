"""Count public response outcomes without logging inventory or retaining page bodies."""
import os
import time
from collections import Counter

import enrich_events
import price_sync
from general_source_budget import SourceBudget, SourcePaused


def main():
    n = max(1,min(100,int(os.environ.get('SAMPLE_COUNT','10'))))
    budget = SourceBudget(time.monotonic()+600)
    counts = Counter()
    try:
        for shop in enrich_events.load_targets()[:n]:
            _, event, _ = enrich_events.fetch_one(shop,budget)
            counts['booking_incomplete' if event == '__ERR__' else 'booking_ok'] += 1
        for shop in price_sync.load_targets()[:n]:
            result = price_sync.fetch_place(shop['id'],budget)
            counts['place_ok' if result is not None else 'place_incomplete'] += 1
    except SourcePaused:
        counts['deferred'] += 1
    print(dict(counts))


if __name__ == '__main__':
    main()
