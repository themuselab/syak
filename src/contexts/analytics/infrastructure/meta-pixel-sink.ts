// Meta(Facebook) 픽셀 sink — 웹 이벤트를 표준 메타 이벤트로 전송.
// 목적: 메타가 "클릭"이 아니라 "실제 방문·전환"을 보고 광고를 최적화하게 한다.
//   설치 후 메타 캠페인 목표를 링크클릭 → 랜딩페이지조회/전환 으로 바꾸면
//   지출 대비 실방문이 오른다.
//
// 픽셀 ID는 하드코딩하지 않고 빌드 환경변수 VITE_META_PIXEL_ID 로 주입(없으면 완전 no-op).
//   Vercel 프로젝트 환경변수에 설정 → 배포 시 활성화. dev/로컬은 미설정이라 안 뜬다.
import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent } from "../domain/event";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() || "";

// 픽셀 base 스니펫 로드(1회). 표준 fbevents.js. 실패는 조용히 통과.
function loadPixel(id: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.fbq) return; // 이미 로드됨
  const n: Fbq = function (...args: unknown[]) {
    // callMethod가 붙기 전엔 큐에 쌓았다가, fbevents.js 로드 후 flush.
    const f = n as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
    if (f.callMethod) f.callMethod(...args);
    else f.queue.push(args);
  } as Fbq;
  n.queue = [];
  n.loaded = true;
  window.fbq = n;
  window._fbq = window._fbq || n;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  const first = document.getElementsByTagName("script")[0];
  first?.parentNode?.insertBefore(s, first);
  window.fbq("init", id);
  window.fbq("track", "PageView");
}

function fbqTrack(event: string, params?: Record<string, unknown>, custom = false): void {
  try {
    window.fbq?.(custom ? "trackCustom" : "track", event, params);
  } catch {
    /* silent */
  }
}

export class MetaPixelSink implements AnalyticsSink {
  private readonly enabled: boolean;

  constructor() {
    this.enabled = !!PIXEL_ID;
    if (this.enabled) loadPixel(PIXEL_ID);
  }

  // 앱 이벤트 → 표준 메타 이벤트 매핑. 표준 이벤트라야 메타가 최적화/전환에 쓸 수 있다.
  send(e: AnalyticsEvent): void {
    if (!this.enabled) return;
    switch (e.event) {
      case "detail_view": // 샵 상세 진입 = 콘텐츠 조회
        fbqTrack("ViewContent", {
          content_type: "shop",
          content_ids: e.shopId ? [e.shopId] : undefined,
          content_category: e.shopCategory,
        });
        break;
      case "reserve_click": // 예약 버튼 클릭 = 리드(핵심 전환)
        fbqTrack("Lead", { content_ids: e.shopId ? [e.shopId] : undefined, content_category: e.shopCategory });
        break;
      case "filter_apply":
      case "region_select":
      case "collection_click": // 검색/탐색 의도
        fbqTrack("Search", { search_string: e.source ?? e.shopDistrict });
        break;
      case "session_start":
        // PageView는 로드 시 1회 발화됨(loadPixel) — 중복 방지 위해 여기선 생략.
        break;
      default:
        // 나머지는 커스텀 이벤트로 (핀/카드 클릭·갤러리 등 — 최적화엔 안 쓰이나 관측용).
        fbqTrack(`syak_${e.event}`, { shop_id: e.shopId }, true);
    }
  }
}
