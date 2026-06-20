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


GQL = "https://m.booking.naver.com/graphql?opName=hourlySchedule"
SCHED_Q = ("query h($p: ScheduleParams){schedule(input:$p){bizItemSchedule{hourly{unitStartTime bookingCount stock}}}}")


def naver_slot_booked(bt, biz, items, date, hhmm):
    """클릭한 슬롯(date hhmm)이 네이버에서 지금 예약 걸렸나 → bookingCount>0면 True."""
    for it in (items or [])[:6]:
        pl = {"operationName": "h", "variables": {"p": {"businessTypeId": int(bt or 13), "businessId": str(biz),
              "bizItemId": str(it), "startDateTime": f"{date}T00:00:00", "endDateTime": f"{date}T23:59:59",
              "fixedTime": True, "includesHolidaySchedules": True}}, "query": SCHED_Q}
        try:
            req = urllib.request.Request(GQL, data=json.dumps(pl).encode(), method="POST",
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as r:
                hourly = (((json.loads(r.read()).get("data") or {}).get("schedule") or {})
                          .get("bizItemSchedule", {}) or {}).get("hourly") or []
            for h in hourly:
                if h.get("unitStartTime", "")[11:16] == hhmm and (h.get("bookingCount") or 0) > 0:
                    return True
        except Exception:
            pass
    return False


def conversions(events):
    """reserve_click 중 슬롯 기록된 것 → 그 슬롯이 지금 예약 찼는지 (클릭 20분 경과분만)."""
    picks = [e for e in events if e["event"] == "reserve_click" and e.get("slot_date") and e.get("slot_time")]
    now = datetime.now(timezone.utc)
    cache, checked, hits = {}, 0, []
    for e in picks:
        try:
            ct = datetime.fromisoformat((e.get("created_at") or "").replace("Z", "+00:00"))
            if (now - ct).total_seconds() < 1200:  # 클릭 20분 지난 것만
                continue
        except Exception:
            continue
        sid = e["shop_id"]
        if sid not in cache:
            rows = sb_get(f"shops?id=eq.{sid}&select=name,biz_id,item_ids,biz_type")
            cache[sid] = rows[0] if rows else None
        sh = cache[sid]
        if not sh or not sh.get("biz_id"):
            continue
        checked += 1
        if naver_slot_booked(sh.get("biz_type"), sh["biz_id"], sh.get("item_ids"), e["slot_date"], e["slot_time"][:5]):
            d = e["slot_date"]  # 2026-06-12 → 6/12
            label = f"{int(d[5:7])}/{int(d[8:10])} {e['slot_time'][:5]}"
            hits.append(f"{(sh.get('name') or '?')[:12]} {label}")
    return len(hits), checked, len(picks), hits


KO_DOW = ["월", "화", "수", "목", "금", "토", "일"]


def src_bucket(s):
    """유입 소스 → 리포트 묶음. 인스타=페북=메타 한 묶음."""
    s = (s or "").lower()
    if s in ("instagram", "facebook", "meta", "ig", "fb"):
        return "인스타(메타)"
    if s in ("threads", "barcelona"):
        return "스레드"
    if s == "seo":
        return "검색(SEO)"
    if s in ("direct", ""):
        return "직접·링크"
    if s == "kakao":
        return "카카오"
    if s == "naver":
        return "네이버"
    if s == "google":
        return "구글"
    if s in ("twitter", "x.com", "t.co"):
        return "트위터/X"
    return s or "기타"


def shop_names_for(ids):
    """shop_id 리스트 → {id: name} (청크 조회)."""
    out, ids = {}, list(ids)
    for i in range(0, len(ids), 50):
        chunk = ",".join(str(x) for x in ids[i:i + 50])
        for r in sb_get(f"shops?id=in.({chunk})&select=id,name"):
            out[r["id"]] = r.get("name")
    return out


def main():
    kst = timezone(timedelta(hours=9))
    since = (datetime.now(timezone.utc) - timedelta(hours=HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    cols = "session_id,client_id,event,source,entry,route,device,ms,slot_date,slot_time,shop_id,shop_district,created_at"
    try:
        events = sb_get(f"events?created_at=gte.{since}&select={cols}")
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        # device/client_id 컬럼 미생성(SQL 전) → 빼고 조회 (degraded)
        cols = "session_id,event,source,entry,route,ms,slot_date,slot_time,shop_id,shop_district,created_at"
        events = sb_get(f"events?created_at=gte.{since}&select={cols}")
    leads = sb_get(f"leads?created_at=gte.{since}&select=id")

    starts = [e for e in events if e["event"] == "session_start"]
    sessions = {e["session_id"] for e in events if e.get("session_id")}
    visitors = {e["client_id"] for e in events if e.get("client_id")}
    new_n = sum(1 for e in starts if e.get("route") == "new")
    ret_n = sum(1 for e in starts if e.get("route") == "returning")

    # ── 유입 경로 (광고/자연 분리: entry=campaign이면 광고/태깅) ──
    buckets = {}  # 묶음 → [전체, 광고]
    for e in starts:
        rec = buckets.setdefault(src_bucket(e.get("source")), [0, 0])
        rec[0] += 1
        if e.get("entry") == "campaign":
            rec[1] += 1
    src_lines = []
    for b, (tot, paid) in sorted(buckets.items(), key=lambda x: -x[1][0])[:7]:
        extra = f" (광고 {paid}·자연 {tot - paid})" if paid else ""
        src_lines.append(f"· {b}: {tot}{extra}")
    src_text = "\n".join(src_lines) or "—"

    # ── 디바이스 ──
    dev = Counter(e.get("device") or "?" for e in starts)
    dev_label = {"pc": "PC", "ios": "iOS", "android": "Android", "?": "미상"}
    dev_text = " · ".join(f"{dev_label.get(k, k)} {v}" for k, v in dev.most_common()) or "—"

    # ── 시간대 / 요일 (KST) ──
    hours, dows = Counter(), Counter()
    for e in starts:
        try:
            ct = datetime.fromisoformat((e.get("created_at") or "").replace("Z", "+00:00")).astimezone(kst)
            hours[ct.hour] += 1
            dows[ct.weekday()] += 1
        except Exception:
            pass
    busy_h = " · ".join(f"{h}시({n})" for h, n in hours.most_common(3)) or "—"
    busy_d = " · ".join(f"{KO_DOW[d]}({n})" for d, n in dows.most_common(3)) or "—"

    # ── 세션 잔류 ──
    dwell_ms = [e["ms"] for e in events if e["event"] == "session_end" and e.get("ms")]
    avg_dwell = round(sum(dwell_ms) / len(dwell_ms) / 1000, 1) if dwell_ms else 0

    # ── 행동 ──
    detail_views = sum(1 for e in events if e["event"] == "detail_view")
    reserve_clicks = sum(1 for e in events if e["event"] == "reserve_click")
    route_clicks = Counter(e.get("route") for e in events if e["event"] == "reserve_click" and e.get("route"))
    route_label = {"naver": "네이버", "instagram": "인스타", "talktalk": "톡톡", "phone": "전화"}
    ext_text = "\n".join(f"· {route_label.get(r, r)}: {n}" for r, n in route_clicks.most_common()) or "—"

    # ── 샵별 상세 체류시간(초) — detail_close ms ──
    dwell_by_shop = {}
    for e in events:
        if e["event"] == "detail_close" and e.get("ms") and e.get("shop_id"):
            dwell_by_shop.setdefault(e["shop_id"], []).append(e["ms"])
    names = shop_names_for(dwell_by_shop.keys())
    top_dwell = sorted(((sid, sum(v) / len(v) / 1000, len(v)) for sid, v in dwell_by_shop.items()),
                       key=lambda x: -x[1])
    dwell_text = "\n".join(f"· {(names.get(sid) or '?')[:12]}: {sec:.0f}초 ({n}명)"
                           for sid, sec, n in top_dwell[:6]) or "—"

    # ── 상세 내부행동 (포폴 넘겨봄 / 메뉴 더보기) ──
    gallery_n = sum(1 for e in events if e["event"] == "gallery_view")
    menu_n = sum(1 for e in events if e["event"] == "menu_view")
    def pct(x):
        return f"{round(x / detail_views * 100)}%" if detail_views else "—"
    behav_text = f"포폴 넘겨봄 {gallery_n}회 ({pct(gallery_n)}) · 메뉴 더보기 {menu_n}회 ({pct(menu_n)})"

    # ── 컬렉션 칩 / 필터 / 지역 선택 ──
    chip_label = {"today": "오늘예약", "event": "할인·이벤트", "price1": "1만원대",
                  "price2": "2만원대", "firstVisit": "첫방문", "reviews": "리뷰많은"}
    chip_c = Counter(e.get("source") for e in events if e["event"] == "collection_click" and e.get("source"))
    chip_text = "\n".join(f"· {chip_label.get(k, k)}: {n}" for k, n in chip_c.most_common(6)) or "—"
    filt_items = Counter()
    for e in events:
        if e["event"] == "filter_apply" and e.get("source") and e["source"] != "none":
            for part in e["source"].split(","):
                filt_items[part] += 1
    filt_text = "\n".join(f"· {k}: {n}" for k, n in filt_items.most_common(6)) or "—"
    region_c = Counter()
    for e in events:
        if e["event"] == "region_select" and e.get("source"):
            for g in e["source"].split(","):
                region_c[g] += 1
    region_sel_text = "\n".join(f"· {g}: {n}" for g, n in region_c.most_common(8)) or "—"

    # ── 🤝 파트너 샵 (가게클릭/예약클릭) ──
    partner_rows = sb_get("shops?is_partner=eq.true&select=id,name")
    partner_name = {r["id"]: r.get("name") for r in partner_rows}
    p_rc = Counter(e.get("shop_id") for e in events
                   if e["event"] == "reserve_click" and e.get("shop_id") in partner_name)
    p_dv = sum(1 for e in events if e["event"] == "detail_view" and e.get("shop_id") in partner_name)
    if p_rc:
        lines = [f"· {(partner_name.get(sid) or '?')[:14]}: {n}회" for sid, n in p_rc.most_common(8)]
        partner_text = f"예약클릭 {sum(p_rc.values())}회 · 가게클릭 {p_dv}회\n" + "\n".join(lines)
    else:
        partner_text = f"예약클릭 0회 · 가게클릭 {p_dv}회 (파트너 {len(partner_rows)}곳)"

    # ── 🎯 예약 전환(추정): 클릭한 슬롯이 네이버에서 실제 예약 찼는지 ──
    conv, conv_checked, conv_picks, conv_hits = conversions(events)
    if conv:
        shown = ", ".join(conv_hits[:6]) + (f" 외 {conv - 6}건" if conv > 6 else "")
        conv_text = f"{conv}건 (확인 {conv_checked})\n({shown})"
    elif conv_checked:
        conv_text = f"0건 (확인 {conv_checked})"
    elif conv_picks:
        conv_text = f"슬롯클릭 {conv_picks} (집계 대기)"
    else:
        conv_text = "—"

    stamp = f"기준: {datetime.now(kst).strftime('%Y-%m-%d %H:%M')} KST · 최근 {HOURS}h"
    embed_traffic = {
        "title": f"📊 샥 트래픽 & 유입 (최근 {HOURS}시간)",
        "color": 0xEC4899,
        "fields": [
            {"name": "방문자", "value": f"세션 {len(sessions)} · 순방문 {len(visitors)}", "inline": True},
            {"name": "신규 / 재방문", "value": f"신규 {new_n} · 재방문 {ret_n}", "inline": True},
            {"name": "평균 세션 잔류", "value": f"{avg_dwell}초", "inline": True},
            {"name": "🔗 유입 경로", "value": src_text, "inline": False},
            {"name": "📱 디바이스", "value": dev_text, "inline": False},
            {"name": "⏰ 붐비는 시간", "value": busy_h, "inline": True},
            {"name": "📅 붐비는 요일", "value": busy_d, "inline": True},
        ],
        "footer": {"text": stamp},
    }
    embed_behavior = {
        "title": "🛍️ 행동 & 전환",
        "color": 0x9D176B,
        "fields": [
            {"name": "가게 클릭", "value": f"{detail_views}회", "inline": True},
            {"name": "예약 버튼", "value": f"{reserve_clicks}회", "inline": True},
            {"name": "취소석 신청", "value": f"{len(leads)}건", "inline": True},
            {"name": "↗️ 예약경로 클릭(외부)", "value": ext_text, "inline": False},
            {"name": "⏱️ 샵별 상세 체류시간", "value": dwell_text, "inline": False},
            {"name": "👀 상세 내부행동", "value": behav_text, "inline": False},
            {"name": "🏷️ 컬렉션 칩", "value": chip_text, "inline": True},
            {"name": "🔧 필터 사용", "value": filt_text, "inline": True},
            {"name": "📍 지역 선택", "value": region_sel_text, "inline": True},
            {"name": "🤝 파트너 샵 예약", "value": partner_text, "inline": False},
            {"name": "🎯 예약 전환(추정)", "value": conv_text, "inline": False},
        ],
        "footer": {"text": stamp},
    }
    payload = {"username": "샥 GA봇", "embeds": [embed_traffic, embed_behavior]}
    req = urllib.request.Request(WEBHOOK, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "syak-report/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"✅ Discord 리포트 전송 ({r.status}) | 세션 {len(sessions)} 방문자 {len(visitors)} 예약클릭 {reserve_clicks}")
    except urllib.error.HTTPError as e:
        print("Discord 전송 실패", e.code, e.read().decode(errors="ignore")[:400])
        raise


if __name__ == "__main__":
    main()
