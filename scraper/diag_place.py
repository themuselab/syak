"""가격·영업시간 수집(pcmap.place.naver.com) 실패 원인 진단 — 저장 안 함.

  python scraper/diag_place.py [N] [간격초]

종류: ok(__APOLLO_STATE__ 있음) / no_state(200인데 없음) / http_<코드> / timeout / error
"""
import collections, socket, sys, time, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import price_sync as ps  # HEADERS·load_targets 재사용

N = int(sys.argv[1]) if len(sys.argv) > 1 else 40
GAP = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0


def classify(shop_id):
    url = f"https://pcmap.place.naver.com/place/{shop_id}/home"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=ps.HEADERS), timeout=15) as r:
            body = r.read().decode("utf-8", "ignore")
        return ("ok" if "window.__APOLLO_STATE__ = " in body else "no_state"), len(body)
    except urllib.error.HTTPError as e:
        return f"http_{e.code}", 0
    except (socket.timeout, TimeoutError):
        return "timeout", 0
    except Exception as e:
        return f"error:{type(e).__name__}", 0


def main():
    targets = ps.load_targets()[:N]
    counts, first_fail = collections.Counter(), None
    t0 = time.time()
    for i, t in enumerate(targets):
        kind, n = classify(t["id"])
        counts[kind] += 1
        if kind != "ok" and first_fail is None:
            first_fail = (i, kind, n)
        time.sleep(GAP)
    print(f"표본 {len(targets)}곳 · 간격 {GAP}s · {time.time()-t0:.0f}초 · 첫 실패 {first_fail}")
    for k, v in counts.most_common():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
