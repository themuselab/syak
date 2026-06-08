// Catalog 유스케이스 — 뷰포트/지역/이름 기반 조회. 포트만 의존.
import type { ShopRepository, Bounds } from "../ports/shop-repository";
import type { ShopSummary } from "../domain/shop";

/** 지도 영역 안의 샵 (egress 절약 — 보이는 곳만) */
export function makeSearchInBounds(repo: ShopRepository) {
  return (b: Bounds, limit?: number): Promise<ShopSummary[]> => repo.inBounds(b, limit);
}

/** 지역(구/시) 선택 */
export function makeSearchByGu(repo: ShopRepository) {
  return (gu: string, limit?: number): Promise<ShopSummary[]> => repo.byGu(gu, limit);
}

/** 이름 검색 (서버측) */
export function makeSearchByName(repo: ShopRepository) {
  return (query: string): Promise<ShopSummary[]> => repo.searchByName(query);
}
