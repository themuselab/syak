// Catalog 포트 — 읽기(Query) 전용 인터페이스. 구현은 infrastructure/.
import type { ShopSummary, ShopDetail } from "../domain/shop";

export interface ShopRepository {
  /** 전체 요약 목록 (read model 로드) */
  all(): Promise<ShopSummary[]>;
  /** 상세 1건 */
  byId(id: string): Promise<ShopDetail | null>;
}
