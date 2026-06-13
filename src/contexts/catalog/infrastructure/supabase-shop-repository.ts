// Catalog 어댑터 — Supabase(PostgREST)에서 카탈로그 조회.
// 뷰포트 기반: 지도 영역 안의 샵만 로드 (egress 절약). byId(): detail jsonb.
import type { ShopRepository, Bounds } from "../ports/shop-repository";
import type { ShopSummary, ShopDetail, ShopPin } from "../domain/shop";
import { sbFetch } from "../../../shared/platform/supabase";

const SUMMARY_COLS =
  "id,name,category,categories,gu,lat,lng,representative_image,review_count,price_tier,min_price,first_visit_deal,has_event,reservable,services,event_desc,event_price";

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
    hasEvent: !!r.event_desc, // 실시간 수집한 할인 텍스트 유무로 파생
    eventDesc: r.event_desc ?? null,
    eventPrice: r.event_price ?? null,
    reservable: r.reservable,
    services: r.services ?? [],
  };
}

export class SupabaseShopRepository implements ShopRepository {
  private detailCache = new Map<string, ShopDetail | null>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rows(q: string): Promise<any[]> {
    const res = await sbFetch(q);
    if (!(res.ok || res.status === 206)) throw new Error(`shops query failed: ${res.status}`);
    return res.json();
  }

  async inBounds(b: Bounds, limit = 600): Promise<ShopSummary[]> {
    // 지도 영역 안 + 인기순 상한 → 1회 ~수백곳만 전송
    const q =
      `shops?select=${SUMMARY_COLS}` +
      `&lat=gte.${b.swLat}&lat=lte.${b.neLat}&lng=gte.${b.swLng}&lng=lte.${b.neLng}` +
      `&order=review_count.desc&limit=${limit}`;
    return (await this.rows(q)).map(toSummary);
  }

  async byIds(ids: string[]): Promise<ShopSummary[]> {
    if (!ids.length) return [];
    const out: ShopSummary[] = [];
    // URL 길이 보호: 300개씩 끊어서 in.()
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300).map((x) => encodeURIComponent(x)).join(",");
      const q = `shops?select=${SUMMARY_COLS}&id=in.(${chunk})`;
      out.push(...(await this.rows(q)).map(toSummary));
    }
    return out;
  }

  async pinsInBounds(b: Bounds, limit = 5000): Promise<ShopPin[]> {
    // 마커에 필요한 최소 컬럼만 → 1핀 ~70B (요약의 1/6)
    const q =
      `shops?select=id,name,category,gu,lat,lng,event_desc,event_price` +
      `&lat=gte.${b.swLat}&lat=lte.${b.neLat}&lng=gte.${b.swLng}&lng=lte.${b.neLng}` +
      `&order=review_count.desc&limit=${limit}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await this.rows(q)).map((r: any) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      gu: r.gu,
      coord: { lat: r.lat, lng: r.lng },
      hasEvent: !!r.event_desc,
      eventPrice: r.event_price ?? null,
    }));
  }

  async byGu(gu: string, limit = 600): Promise<ShopSummary[]> {
    const q = `shops?select=${SUMMARY_COLS}&gu=eq.${encodeURIComponent(gu)}&order=review_count.desc&limit=${limit}`;
    return (await this.rows(q)).map(toSummary);
  }

  async byGus(gus: string[], limit = 600): Promise<ShopSummary[]> {
    if (!gus.length) return [];
    if (gus.length === 1) return this.byGu(gus[0], limit);
    const inList = gus.map((g) => `"${encodeURIComponent(g)}"`).join(",");
    const q = `shops?select=${SUMMARY_COLS}&gu=in.(${inList})&order=review_count.desc&limit=${limit}`;
    return (await this.rows(q)).map(toSummary);
  }

  async searchByName(query: string): Promise<ShopSummary[]> {
    const q0 = query.trim();
    if (!q0) return [];
    const pat = encodeURIComponent(`*${q0}*`);
    const q = `shops?select=${SUMMARY_COLS}&name=ilike.${pat}&order=review_count.desc&limit=30`;
    return (await this.rows(q)).map(toSummary);
  }

  async byId(id: string): Promise<ShopDetail | null> {
    if (this.detailCache.has(id)) return this.detailCache.get(id)!;
    const res = await sbFetch(`shops?id=eq.${encodeURIComponent(id)}&select=detail,services,item_ids,slot_summary,event_desc,event_price,biz_id,biz_type`);
    let detail: ShopDetail | null = null;
    if (res.ok || res.status === 206) {
      const rows = await res.json();
      const row = rows[0];
      if (row?.detail) {
        // 네이버 예약(biz_id) 있는데 detail.reservationRoutes에 naver가 없으면 보강
        // (슬롯은 biz_id 백필로 들어오는데 옛 detail엔 예약URL이 없어 인스타로 빠지는 버그)
        let routes = (row.detail.reservationRoutes ?? []) as ShopDetail["reservationRoutes"];
        if (row.biz_id && !routes.some((r) => r.type === "naver")) {
          const url = `https://m.booking.naver.com/booking/${row.biz_type ?? 13}/bizes/${row.biz_id}`;
          routes = [{ type: "naver", label: "네이버 예약", value: url }, ...routes];
        }
        // detail jsonb엔 services/staffCount/slotSummary/event가 없음 → 컬럼에서 합쳐줌
        detail = {
          ...(row.detail as ShopDetail),
          reservationRoutes: routes,
          services: row.services ?? row.detail.services ?? [],
          staffCount: Array.isArray(row.item_ids) ? row.item_ids.length : 0,
          slotSummary: Array.isArray(row.slot_summary) ? row.slot_summary : [],
          hasEvent: !!row.event_desc,
          eventDesc: row.event_desc ?? null,
          eventPrice: row.event_price ?? null,
        };
      }
    }
    this.detailCache.set(id, detail);
    return detail;
  }
}
