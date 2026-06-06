// Analytics 도메인 — 순수. 이벤트 타입/규칙만.

export type EventName =
  | "session_start"
  | "impression" // 카드/핀 노출
  | "pin_click" // 지도 핀 클릭
  | "card_click" // 리스트 카드 클릭
  | "detail_view" // 상세 진입
  | "reserve_click" // 예약루트 버튼 클릭
  | "collection_click"
  | "filter_apply";

export type EntryRoute = "organic" | "campaign" | "deeplink" | "share";

export interface AnalyticsEvent {
  event: EventName;
  shopId?: string;
  shopCategory?: string;
  shopDistrict?: string;
  route?: string; // 예약 루트(naver/talktalk/…) 또는 진입 경로
  entry?: EntryRoute;
  ms?: number; // dwell 또는 time-to-click
}
