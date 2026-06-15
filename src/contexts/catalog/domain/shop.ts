// Catalog 도메인 — 순수. 외부(React/fetch/DB) import 금지.
// read model의 가게를 표현하는 엔티티/값객체와 도메인 규칙.

import type { Coordinate } from "../../../shared/domain/coordinate";
import type { Category } from "../../../shared/domain/category";

export type PriceTier = "1만원대" | "2만원대" | "3만원대" | "4만원이상" | "미정";

export type ReservationRouteType =
  | "naver" // 네이버 예약
  | "talktalk" // 네이버 톡톡
  | "instagram" // 인스타 DM
  | "kakao" // 카카오 채널
  | "phone"; // 전화

export interface ReservationRoute {
  type: ReservationRouteType;
  label: string; // 버튼 라벨 (예: "네이버로 예약", "톡톡으로 문의")
  value: string; // URL 또는 전화번호
}

/** 지도 핀 전용 경량 타입 — 마커+클릭에 필요한 최소 필드만 (대량 전송 절약) */
export interface ShopPin {
  id: string;
  name: string;
  category: Category;
  gu: string;
  coord: Coordinate;
  hasEvent: boolean; // 할인/이벤트 중 → 지도 특별핀
  eventPrice: string | null; // 핀 배지 라벨 ("50% 할인", "29,000원~")
  isPartner: boolean; // 샥 파트너(파일럿) → 지도 골드핀 + 클러스터 제외 + 리스트 상단
  todayOpen: boolean; // 오늘 빈자리 있음 → 지도 초록핀 (당일 예약 가능)
}

/** 리스트/지도 카드에 쓰는 요약 */
export interface ShopSummary {
  id: string;
  name: string;
  category: Category; // 대표 카테고리
  categories: Category[];
  gu: string;
  coord: Coordinate;
  representativeImage: string | null;
  reviewCount: number;
  // 파생 필드 (build_read_model.py가 미리 계산)
  priceTier: PriceTier;
  minPrice: number | null;
  firstVisitDeal: boolean; // 첫방문 할인 메뉴 존재
  hasEvent: boolean; // 쿠폰/이벤트 보유 (event_desc 유무로 파생)
  eventDesc: string | null; // 할인/이벤트 원문 텍스트
  eventPrice: string | null; // 추출 라벨 ("50% 할인", "29,000원~")
  isPartner: boolean; // 샥 파트너(파일럿) → 리스트 상단 + 배지
  pilotCoupon: string | null; // 파일럿 샵 전용 이벤트/할인 문구(수동, 사장님 기존 할인 등)
  todayOpen: boolean; // 오늘 빈자리 있음 (당일 예약 가능)
  reservable: boolean;
  services: string[]; // 시술 태그(젤네일/패디/속눈썹…) — 예약 item에서 추출
}

export interface Menu {
  name: string;
  price: number | null;
  recommend: boolean;
}

export interface Review {
  body: string;
  visited: string | null;
  images: string[];
  keywords: string[];
  ownerReply: string | null;
}

/** 상세 화면용 (요약 + 풍부한 정보) */
export interface ShopDetail extends ShopSummary {
  roadAddress: string | null;
  instagram: string | null;
  phone: string | null;
  menus: Menu[];
  images: { representative: string | null; gallery: string[]; menu: string[]; review: string[] };
  reservationRoutes: ReservationRoute[];
  reviews: Review[];
  reviewTotal: number;
  pilotHours: string | null; // 파일럿 샵 빈 시간대 안내 ("주로 평일 낮" 등)
}

