// Catalog 도메인 — 필터/정렬/컬렉션 규칙. 순수 함수만.

import type { ShopSummary, PriceTier } from "./shop";
import type { Category } from "../../../shared/domain/category";

export interface FilterCriteria {
  gus?: string[]; // 선택한 지역(구/시) — 여러 개 = 합집합(AND 다중선택)
  categories?: Category[];
  priceTiers?: PriceTier[];
  services?: string[]; // 시술(젤네일/패디…) — 하나라도 제공하면 통과
  reservableOnly?: boolean;
  hasEventOnly?: boolean;
  firstVisitOnly?: boolean;
}

export function matchesFilter(shop: ShopSummary, c: FilterCriteria): boolean {
  if (c.gus?.length && !c.gus.includes(shop.gu)) return false;
  if (c.categories?.length && !c.categories.some((cat) => shop.categories.includes(cat))) return false;
  if (c.priceTiers?.length && !c.priceTiers.includes(shop.priceTier)) return false;
  if (c.services?.length && !c.services.some((sv) => shop.services?.includes(sv))) return false;
  if (c.reservableOnly && !shop.reservable) return false;
  if (c.hasEventOnly && !shop.hasEvent) return false;
  if (c.firstVisitOnly && !shop.firstVisitDeal) return false;
  return true;
}

export function applyFilter(shops: ShopSummary[], c: FilterCriteria): ShopSummary[] {
  return shops.filter((s) => matchesFilter(s, c));
}

// ── 컬렉션(가로 스크롤 큐레이션) 규칙 ──────────────────────

export type CollectionKey = "event" | "price1" | "price2" | "firstVisit" | "manyReviews";

export interface Collection {
  key: CollectionKey;
  title: string;
  shops: ShopSummary[];
}

export function buildCollections(shops: ShopSummary[]): Collection[] {
  const byReviews = (a: ShopSummary, b: ShopSummary) => b.reviewCount - a.reviewCount;
  return [
    { key: "event", title: "이벤트 · 할인", shops: shops.filter((s) => s.hasEvent).sort(byReviews) },
    { key: "firstVisit", title: "첫방문 특가", shops: shops.filter((s) => s.firstVisitDeal).sort(byReviews) },
    { key: "price1", title: "1만원대", shops: shops.filter((s) => s.priceTier === "1만원대").sort(byReviews) },
    { key: "price2", title: "2만원대", shops: shops.filter((s) => s.priceTier === "2만원대").sort(byReviews) },
    { key: "manyReviews", title: "리뷰 많은 샵", shops: [...shops].sort(byReviews) },
  ].map((c) => ({ ...c, shops: c.shops.slice(0, 12) }));
}
