"""할인 수집 실패 원인 진단 — 표본 N곳을 요청해 응답을 종류별로 센다(저장은 안 함).

  python scraper/diag_events.py [N]

종류: ok(정상) / no_event_marker(200인데 eventDescJson 없음) / http_<코드> / timeout / error
200인데 마커가 없는 응답은 몇 개를 diag_samples/에 저장해 무엇이 왔는지 직접 볼 수 있게 한다.
"""
import collections, os, random, socket, sys, time, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import enrich_events as ev  # load_targets·UA 재사용

N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
WORKERS = int(sys.argv[2]) if len(sys.argv) > 2 else 1  # 1 = 하나씩(0.3초 간격), 12 = 운영과 같은 동시 요청
OUT = Path(__file__).parent / "diag_samples"


def classify(r):
    item = (r.get("item_ids") or ([r["item_id"]] if r.get("item_id") else [None]))[0]
    if not item:
        return "no_item", None, ""
    url = f"https://m.booking.naver.com/booking/{r.get('biz_type') or 13}/bizes/{r['biz_id']}/items/{item}"
    try:
        resp = urllib.request.urlopen(urllib.request.Request(url, headers=ev.UA), timeout=20)
        body = resp.read().decode("utf-8", "ignore")
        if "eventDescJson" in body:
            return "ok", resp.status, url
        return "no_event_marker", (resp.status, resp.geturl(), body), url
    except urllib.error.HTTPError as e:
        return f"http_{e.code}", None, url
    except (socket.timeout, TimeoutError):
        return "timeout", None, url
    except Exception as e:
        return f"error:{type(e).__name__}", None, url


def main():
    targets = ev.load_targets()
    random.seed(1)
    sample = random.sample(targets, min(N, len(targets)))
    counts = collections.Counter()
    OUT.mkdir(exist_ok=True)
    saved = 0
    t0 = time.time()
    if WORKERS > 1:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            results = list(ex.map(classify, sample))
    else:
        results = []
        for r in sample:
            results.append(classify(r))
            time.sleep(0.3)
    for kind, extra, url in results:
        counts[kind] += 1
        if kind == "no_event_marker" and saved < 5:
            status, final_url, body = extra
            title = body.split("<title>")[1].split("</title>")[0][:80] if "<title>" in body else "-"
            import re
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<(script|style)[^>]*>.*?</>", " ", body))).strip()
            print(f"  · {status} len={len(body)} final={final_url[:90]} title={title} text={text[:160]}")
            (OUT / f"sample_{saved}.html").write_text(body, encoding="utf-8")
            saved += 1
    print(f"표본 {len(sample)}곳 · 동시 {WORKERS} · {time.time()-t0:.0f}초")
    for k, v in counts.most_common():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
