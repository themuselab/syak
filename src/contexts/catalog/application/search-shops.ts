// Catalog 유스케이스 — 뷰포트/지역/이름 기반 조회. 포트만 의존.
import type { ShopRepository, Bounds } from "../ports/shop-repository";
import type { ShopSummary } from "../domain/shop";

/** 지도 영역 안의 샵 요약 (리스트용) */
export function makeSearchInBounds(repo: ShopRepository) {
  return (b: Bounds, limit?: number): Promise<ShopSummary[]> => repo.inBounds(b, limit);
}

/** 지도 영역 안의 경량 핀 (지도 마커용 — 밀집도) */
export function makePinsInBounds(repo: ShopRepository) {
  return (b: Bounds, limit?: number) => repo.pinsInBounds(b, limit);
}

/** 지역(구/시) 선택 */
export function makeSearchByGu(repo: ShopRepository) {
  return (gu: string, limit?: number): Promise<ShopSummary[]> => repo.byGu(gu, limit);
}

/** 여러 지역 동시 선택(합집합) */
export function makeSearchByGus(repo: ShopRepository) {
  return (gus: string[], limit?: number): Promise<ShopSummary[]> => repo.byGus(gus, limit);
}

/** 이름 검색 (서버측) */
export function makeSearchByName(repo: ShopRepository) {
  return (query: string): Promise<ShopSummary[]> => repo.searchByName(query);
}
