// Catalog 유스케이스 — 홈 컬렉션(가로 스크롤) 생성. 포트만 의존.
import type { ShopRepository } from "../ports/shop-repository";
import { buildCollections, type Collection, type FilterCriteria, applyFilter } from "../domain/filters";

export function makeListCollections(repo: ShopRepository) {
  return async function listCollections(scope: FilterCriteria = {}): Promise<Collection[]> {
    const all = await repo.all();
    const scoped = applyFilter(all, scope); // 지역 등으로 먼저 좁히고 컬렉션 구성
    return buildCollections(scoped);
  };
}
