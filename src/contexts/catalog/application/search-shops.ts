// Catalog 유스케이스 — 필터 조건으로 샵 검색. 포트만 의존.
import type { ShopRepository } from "../ports/shop-repository";
import { applyFilter, type FilterCriteria } from "../domain/filters";
import type { ShopSummary } from "../domain/shop";

export function makeSearchShops(repo: ShopRepository) {
  return async function searchShops(criteria: FilterCriteria = {}): Promise<ShopSummary[]> {
    const all = await repo.all();
    return applyFilter(all, criteria);
  };
}

/** 이름으로 검색 (홈 상단 검색바) */
export function makeSearchByName(repo: ShopRepository) {
  return async function searchByName(query: string): Promise<ShopSummary[]> {
    const q = query.trim();
    if (!q) return [];
    const all = await repo.all();
    return all.filter((s) => s.name.includes(q)).slice(0, 30);
  };
}
