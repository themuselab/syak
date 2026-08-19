// Analytics 어댑터 — GA4(gtag)로 이벤트 전송. fire-and-forget, 실패 silent.
// gtag 스니펫은 index.html <head>에서 로드된다(측정 ID G-Q0WLLSMTXM).
import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent, EventName } from "../domain/event";
import { device } from "../../../shared/platform/visitor";

type Gtag = (command: "event", name: string, params?: Record<string, unknown>) => void;

// GA4 예약 이벤트명과 겹치지 않게 일부는 개명. session_*는 GA4가 자동 집계하므로 보내지 않는다.
const NAME_MAP: Partial<Record<EventName, string | null>> = {
  detail_view: "shop_view", // 관리자 GA4 조회가 shop_view 기준
  pin_click: "map_pin_click",
  session_start: null, // GA4 자동
  session_end: null, // GA4 자동(user_engagement)
};

export class GA4AnalyticsSink implements AnalyticsSink {
  constructor(private readonly platform: "toss" | "web" = "web") {}

  send(event: AnalyticsEvent): void {
    try {
      const gtag = (window as unknown as { gtag?: Gtag }).gtag;
      if (typeof gtag !== "function") return;

      const mapped = NAME_MAP[event.event];
      if (mapped === null) return; // 보내지 않음
      const name = mapped ?? event.event;

      // snake_case 파라미터, 값 있는 것만. 커스텀 측정기준(shop_id 등)과 이름 일치.
      const params: Record<string, unknown> = { platform: this.platform, device };
      if (event.shopId) params.shop_id = String(event.shopId);
      if (event.shopCategory) params.shop_category = event.shopCategory;
      if (event.shopDistrict) params.shop_district = event.shopDistrict;
      if (event.route) params.route = event.route;
      if (event.entry) params.entry = event.entry;
      if (event.source) params.source = event.source;
      if (event.ms != null) params.ms = event.ms;
      if (event.slotDate) params.slot_date = event.slotDate;
      if (event.slotTime) params.slot_time = event.slotTime;

      gtag("event", name, params);
    } catch {
      // silent
    }
  }
}
