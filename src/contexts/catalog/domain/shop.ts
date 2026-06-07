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
  hasEvent: boolean; // 쿠폰/이벤트 보유
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
  hoursText: string | null;
  conveniences: string[];
  instagram: string | null;
  phone: string | null;
  menus: Menu[];
  images: { representative: string | null; gallery: string[]; menu: string[]; review: string[] };
  reservationRoutes: ReservationRoute[];
  reviews: Review[];
  reviewTotal: number;
  blogReviewTotal: number;
  staffCount: number; // 예약 item(디자이너/메뉴) 수 — 2 이상이면 슬롯 "합산 기준" 안내
}

// ── 도메인 규칙 (순수 함수) ───────────────────────────────

export function priceTierOf(minPrice: number | null): PriceTier {
  if (minPrice == null) return "미정";
  if (minPrice < 20000) return "1만원대";
  if (minPrice < 30000) return "2만원대";
  if (minPrice < 40000) return "3만원대";
  return "4만원이상";
}

export function isInDistrict(shop: ShopSummary, gu: string): boolean {
  return shop.gu === gu;
}

export function hasCategory(shop: ShopSummary, category: Category): boolean {
  return shop.categories.includes(category);
}
