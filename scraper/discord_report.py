"""샥 검증 리포트 → Discord 웹훅.

최근 N시간(기본 24h) events/leads 집계:
 - 방문자(세션) 수, 진입 키워드별, 평균 잔류시간, 가게 클릭, 네이버 예약 클릭, 취소석 신청

env: SUPABASE_URL, SUPABASE_SECRET_KEY, DISCORD_WEBHOOK  (GitHub Actions Secrets)
"""
import json, os, sys, urllib.request, urllib.error
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HOURS = int(os.environ.get("REPORT_HOURS", "24"))

ENV = dict(os.environ)
_local = Path(__file__).parent / ".env"
if _local.exists():
    for line in _local.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            ENV.setdefault(k.strip(), v.strip())
SB_URL = ENV["SUPABASE_URL"].rstrip("/")
SB_SECRET = ENV["SUPABASE_SECRET_KEY"]
WEBHOOK = ENV["DISCORD_WEBHOOK"]


def sb_get(path):
    rows, frm = [], 0
    while True:
        req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", headers={
            "apikey": SB_SECRET, "Authorization": f"Bearer {SB_SECRET}",
            "Prefer": "count=exact", "Range": f"{frm}-{frm+999}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            chunk = json.loads(r.read())
            total = int((r.headers.get("content-range") or "/0").split("/")[1] or 0)
        rows.extend(chunk)
        frm += 1000
        if frm >= total or not chunk:
            break
    return rows


def main():
    kst = timezone(timedelta(hours=9))
    since = (datetime.now(timezone.utc) - timedelta(hours=HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    events = sb_get(f"events?created_at=gte.{since}&select=session_id,event,source,ms,route")
    leads = sb_get(f"leads?created_at=gte.{since}&select=id")

    sessions = {e["session_id"] for e in events if e.get("session_id")}
    starts = [e for e in events if e["event"] == "session_start"]
    sources = Counter((e.get("source") or "direct") for e in starts)
    dwell_ms = [e["ms"] for e in events if e["event"] == "session_end" and e.get("ms")]
    avg_dwell = round(sum(dwell_ms) / len(dwell_ms) / 1000, 1) if dwell_ms else 0
    shop_clicks = sum(1 for e in events if e["event"] == "detail_view")
    reserve_clicks = sum(1 for e in events if e["event"] == "reserve_click")
    naver_clicks = sum(1 for e in events if e["event"] == "reserve_click" and e.get("route") == "naver")

    src_text = "\n".join(f"· {s}: {n}" for s, n in sources.most_common(6)) or "—"

    embed = {
        "title": f"📊 샥 검증 리포트 (최근 {HOURS}시간)",
        "color": 0xEC4899,
        "fields": [
            {"name": "방문자(세션)", "value": f"{len(sessions)}명", "inline": True},
            {"name": "평균 잔류시간", "value": f"{avg_dwell}초", "inline": True},
            {"name": "취소석 신청", "value": f"{len(leads)}건", "inline": True},
            {"name": "가게 클릭", "value": f"{shop_clicks}회", "inline": True},
            {"name": "예약 버튼 클릭", "value": f"{reserve_clicks}회", "inline": True},
            {"name": "└ 네이버 예약", "value": f"{naver_clicks}회", "inline": True},
            {"name": "진입 키워드", "value": src_text, "inline": False},
        ],
        "footer": {"text": f"기준: {datetime.now(kst).strftime('%Y-%m-%d %H:%M')} KST"},
    }
    payload = {"username": "샥 검증봇", "embeds": [embed]}
    req = urllib.request.Request(WEBHOOK, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "syak-report/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"✅ Discord 리포트 전송 ({r.status}) | 세션 {len(sessions)} 예약클릭 {reserve_clicks} 신청 {len(leads)}")
    except urllib.error.HTTPError as e:
        print("Discord 전송 실패", e.code, e.read().decode(errors="ignore")[:400])
        raise


if __name__ == "__main__":
    main()
