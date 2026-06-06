// Catalog 어댑터 — Supabase(PostgREST)에서 카탈로그 조회.
// all(): 요약 컬럼 페이지네이션(1000행 제한 대응). byId(): detail jsonb.
import type { ShopRepository } from "../ports/shop-repository";
import type { ShopSummary, ShopDetail } from "../domain/shop";
import { sbFetch } from "../../../shared/platform/supabase";

const SUMMARY_COLS =
  "id,name,category,categories,gu,lat,lng,representative_image,review_count,price_tier,min_price,first_visit_deal,has_event,reservable";
const PAGE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(r: any): ShopSummary {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    categories: r.categories ?? [],
    gu: r.gu,
    coord: { lat: r.lat, lng: r.lng },
    representativeImage: r.representative_image,
    reviewCount: r.review_count ?? 0,
    priceTier: r.price_tier,
    minPrice: r.min_price,
    firstVisitDeal: r.first_visit_deal,
    hasEvent: r.has_event,
    reservable: r.reservable,
  };
}

export class SupabaseShopRepository implements ShopRepository {
  private summaries: ShopSummary[] | null = null;
  private detailCache = new Map<string, ShopDetail | null>();

  async all(): Promise<ShopSummary[]> {
    if (this.summaries) return this.summaries;
    const q = `shops?select=${SUMMARY_COLS}&order=review_count.desc`;
    // 1페이지 + 전체 개수
    const first = await sbFetch(q, { headers: { Prefer: "count=exact", Range: `0-${PAGE - 1}` } });
    if (!first.ok && first.status !== 206) throw new Error(`shops load failed: ${first.status}`);
    const total = Number((first.headers.get("content-range") || "/0").split("/")[1]) || 0;
    const firstRows = await first.json();
    const pages = Math.ceil(total / PAGE);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, (_, i) => {
        const from = (i + 1) * PAGE;
        return sbFetch(q, { headers: { Range: `${from}-${from + PAGE - 1}` } }).then((r) => r.json());
      }),
    );
    const rows = [firstRows, ...rest].flat();
    this.summaries = rows.map(toSummary);
    return this.summaries;
  }

  async byId(id: string): Promise<ShopDetail | null> {
    if (this.detailCache.has(id)) return this.detailCache.get(id)!;
    const res = await sbFetch(`shops?id=eq.${encodeURIComponent(id)}&select=detail`);
    let detail: ShopDetail | null = null;
    if (res.ok || res.status === 206) {
      const rows = await res.json();
      detail = (rows[0]?.detail as ShopDetail) ?? null;
    }
    this.detailCache.set(id, detail);
    return detail;
  }
}
