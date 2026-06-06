// Catalog 유스케이스 — 샵 상세 조회. 포트만 의존.
import type { ShopRepository } from "../ports/shop-repository";
import type { ShopDetail } from "../domain/shop";

export function makeGetShopDetail(repo: ShopRepository) {
  return async function getShopDetail(id: string): Promise<ShopDetail | null> {
    return repo.byId(id);
  };
}
