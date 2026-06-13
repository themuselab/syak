// Catalog 포트 — 읽기(Query) 전용 인터페이스. 구현은 infrastructure/.
import type { ShopSummary, ShopDetail, ShopPin } from "../domain/shop";

export interface Bounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface ShopRepository {
  /** 지도 영역(뷰포트) 안의 샵 요약 — 리스트용. 인기순 상한(작게). */
  inBounds(b: Bounds, limit?: number): Promise<ShopSummary[]>;
  /** 지도 영역 안의 경량 핀 — 지도 마커용. 대량 상한(밀집도). */
  pinsInBounds(b: Bounds, limit?: number): Promise<ShopPin[]>;
  /** id 목록으로 조회 (맞춤찾기: 그 시간 빈 샵들) */
  byIds(ids: string[]): Promise<ShopSummary[]>;
  /** 지역(구/시) 선택 시 그 지역 샵 (인기순 상한) */
  byGu(gu: string, limit?: number): Promise<ShopSummary[]>;
  /** 여러 지역 동시 선택(합집합) */
  byGus(gus: string[], limit?: number): Promise<ShopSummary[]>;
  /** 이름 검색 (서버측 ilike) */
  searchByName(query: string): Promise<ShopSummary[]>;
  /** 상세 1건 */
  byId(id: string): Promise<ShopDetail | null>;
}
