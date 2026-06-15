// Catalog 도메인 — 필터/정렬 규칙. 순수 함수만.

import type { ShopSummary, PriceTier } from "./shop";
import type { Category } from "../../../shared/domain/category";

export type SortKey = "recommend" | "priceLow" | "priceHigh" | "partner";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recommend", label: "기본순" },
  { key: "priceLow", label: "가격 낮은순" },
  { key: "priceHigh", label: "가격 높은순" },
  { key: "partner", label: "샥 파트너" },
];

export interface FilterCriteria {
  gus?: string[]; // 선택한 지역(구/시) — 여러 개 = 합집합(AND 다중선택)
  categories?: Category[];
  priceTiers?: PriceTier[];
  services?: string[]; // 시술(젤네일/패디…) — 하나라도 제공하면 통과
  reservableOnly?: boolean;
  hasEventOnly?: boolean;
  firstVisitOnly?: boolean;
  sortBy?: SortKey; // 리스트 정렬 기준 (미지정 = recommend). "partner"=샥 파트너만
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
