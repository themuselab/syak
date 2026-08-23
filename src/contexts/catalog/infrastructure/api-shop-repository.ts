// Catalog 어댑터 — 백엔드 API(RDS)에서 카탈로그 조회.
// (예전 Supabase 직접 호출 → api-shop-repository로 이전. 매핑은 동일, 원천만 RDS)
import type { ShopRepository, Bounds } from "../ports/shop-repository";
import type { ShopSummary, ShopDetail, ShopPin } from "../domain/shop";
import { apiGet } from "../../../shared/platform/api";

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
    hasEvent: !!r.event_desc,
    eventDesc: r.event_desc ?? null,
    eventPrice: r.event_price ?? null,
    isPartner: !!r.is_partner,
    pilotCoupon: r.pilot_coupon ?? null,
    todayOpen: !!r.today_open,
    reservable: r.reservable,
    services: r.services ?? [],
  };
}

const bboxQuery = (b: Bounds, limit: number) =>
  `swLat=${b.swLat}&swLng=${b.swLng}&neLat=${b.neLat}&neLng=${b.neLng}&limit=${limit}`;

export class ApiShopRepository implements ShopRepository {
  private detailCache = new Map<string, ShopDetail | null>();

  async inBounds(b: Bounds, limit = 600): Promise<ShopSummary[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await apiGet<any[]>(`web/shops/in-bounds?${bboxQuery(b, limit)}`);
    return rows.map(toSummary);
  }

  async pinsInBounds(b: Bounds, limit = 5000): Promise<ShopPin[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await apiGet<any[]>(`web/shops/pins?${bboxQuery(b, limit)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      gu: r.gu,
      coord: { lat: r.lat, lng: r.lng },
      hasEvent: !!r.event_desc,
      eventPrice: r.event_price ?? null,
      isPartner: !!r.is_partner,
      todayOpen: !!r.today_open,
    }));
  }

  async byGu(gu: string, limit = 600): Promise<ShopSummary[]> {
    return this.byGus([gu], limit);
  }

  async byGus(gus: string[], limit = 600): Promise<ShopSummary[]> {
    if (!gus.length) return [];
    const q = encodeURIComponent(gus.join(","));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await apiGet<any[]>(`web/shops/by-gu?gus=${q}&limit=${limit}`);
    return rows.map(toSummary);
  }

  async partners(limit = 200): Promise<ShopSummary[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await apiGet<any[]>(`web/shops/partners?limit=${limit}`);
    return rows.map(toSummary);
  }

  async searchByName(query: string): Promise<ShopSummary[]> {
    const q0 = query.trim();
    if (!q0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await apiGet<any[]>(`web/shops/search?q=${encodeURIComponent(q0)}`);
    return rows.map(toSummary);
  }

  async byId(id: string): Promise<ShopDetail | null> {
    if (this.detailCache.has(id)) return this.detailCache.get(id)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await apiGet<any[]>(`web/shops/${encodeURIComponent(id)}/detail`);
    let detail: ShopDetail | null = null;
    const row = rows[0];
    if (row?.detail) {
      let routes = (row.detail.reservationRoutes ?? []) as ShopDetail["reservationRoutes"];
      if (row.biz_id && !routes.some((r) => r.type === "naver")) {
        const url = `https://m.booking.naver.com/booking/${row.biz_type ?? 13}/bizes/${row.biz_id}`;
        routes = [{ type: "naver", label: "네이버 예약", value: url }, ...routes];
      }
      detail = {
        ...(row.detail as ShopDetail),
        reservationRoutes: routes,
        services: row.services ?? row.detail.services ?? [],
        hasEvent: !!row.event_desc,
        eventDesc: row.event_desc ?? null,
        eventPrice: row.event_price ?? null,
        isPartner: !!row.is_partner,
        pilotCoupon: row.pilot_coupon ?? null,
        pilotHours: row.pilot_hours ?? null,
        todayOpen: !!row.today_open,
      };
    }
    this.detailCache.set(id, detail);
    return detail;
  }
}
