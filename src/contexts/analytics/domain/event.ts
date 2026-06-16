// Analytics 도메인 — 순수. 이벤트 타입/규칙만.

export type EventName =
  | "session_start"
  | "session_end" // 이탈 (ms=잔류시간)
  | "impression" // 카드/핀 노출
  | "pin_click" // 지도 핀 클릭
  | "card_click" // 리스트 카드 클릭
  | "detail_view" // 상세 진입
  | "detail_close" // 상세 이탈 (ms=상세 체류시간)
  | "reserve_click" // 예약루트 버튼 클릭
  | "collection_click" // 컬렉션 칩(오늘예약/할인/가격대…) 선택
  | "region_select" // 지역(구/시) 선택
  | "gallery_view" // 상세에서 포폴 사진 넘겨봄
  | "menu_view" // 상세에서 메뉴·가격 더보기
  | "filter_apply";

export type EntryRoute = "organic" | "campaign" | "deeplink" | "share";

export interface AnalyticsEvent {
  event: EventName;
  shopId?: string;
  shopCategory?: string;
  shopDistrict?: string;
  route?: string; // 예약 루트(naver/talktalk/…) 또는 진입 경로
  entry?: EntryRoute;
  source?: string; // 진입 키워드/소스 (utm_source, src 등)
  ms?: number; // dwell 또는 time-to-click
  slotDate?: string; // reserve_click: 클릭한 슬롯 날짜 (전환 추적용)
  slotTime?: string; // reserve_click: 클릭한 슬롯 시간 "14:00"
}
