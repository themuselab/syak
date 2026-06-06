// Catalog 어댑터 — read model(정적 JSON) 구현. 외부 의존(fetch)은 여기만.
// 앱은 네이버 API를 실시간 호출하지 않는다.
//  - 요약(전체 목록): /data/shops.summary.json       (지도/리스트/컬렉션용)
//  - 상세(가게 1건):  /data/details/<bucket>.json      (id%SHARDS 버킷, 지연 로딩 + 캐시)
import type { ShopRepository } from "../ports/shop-repository";
import type { ShopSummary, ShopDetail } from "../domain/shop";

const SHARDS = 256; // build_read_model.py와 동일해야 함

export class StaticShopRepository implements ShopRepository {
  private summaries: ShopSummary[] | null = null;
  private bucketCache = new Map<number, Record<string, ShopDetail>>();

  constructor(private readonly base = "/data") {}

  async all(): Promise<ShopSummary[]> {
    if (this.summaries) return this.summaries;
    const res = await fetch(`${this.base}/shops.summary.json`);
    if (!res.ok) throw new Error(`summary load failed: ${res.status}`);
    this.summaries = (await res.json()) as ShopSummary[];
    return this.summaries;
  }

  async byId(id: string): Promise<ShopDetail | null> {
    const bucket = Number(id) % SHARDS;
    let map = this.bucketCache.get(bucket);
    if (!map) {
      const res = await fetch(`${this.base}/details/${bucket}.json`);
      map = res.ok ? ((await res.json()) as Record<string, ShopDetail>) : {};
      this.bucketCache.set(bucket, map);
    }
    return map[id] ?? null;
  }
}
