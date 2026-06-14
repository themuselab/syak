// 조립(Composition Root) — 포트 ↔ 어댑터를 연결하는 유일한 장소.
// 나머지 코드는 포트(인터페이스)에만 의존한다. 어댑터 교체는 여기 한 곳만 바꾸면 된다.

import { SupabaseShopRepository } from "../contexts/catalog/infrastructure/supabase-shop-repository";
import { makeSearchInBounds, makePinsInBounds, makeSearchByGu, makeSearchByGus, makeGetPartners, makeSearchByName } from "../contexts/catalog/application/search-shops";
import { makeGetShopDetail } from "../contexts/catalog/application/get-shop-detail";

import { SupabaseAnalyticsSink } from "../contexts/analytics/infrastructure/supabase-analytics-sink";
import { makeTrack } from "../contexts/analytics/application/track";

import { SupabaseLeadRepository } from "../contexts/lead/infrastructure/supabase-lead-repository";
import { makeRegisterAlert } from "../contexts/lead/application/register-alert";

import { SupabaseSlotProvider } from "../contexts/reservation/infrastructure/supabase-slot-provider";
import { makeFindOpenShops } from "../contexts/reservation/application/find-open-shops";
import { makeGetShopSlots } from "../contexts/reservation/application/get-shop-slots";

// ── 어댑터 인스턴스화 (구현 선택) ─────────────────────────
// 카탈로그: Supabase에서 조회 (정적 JSON에서 DB로 이전).
// JSON으로 되돌리려면 StaticShopRepository로 교체만 하면 됨.
const shopRepo = new SupabaseShopRepository();
const analyticsSink = new SupabaseAnalyticsSink("toss");
const leadRepo = new SupabaseLeadRepository();
const slotProvider = new SupabaseSlotProvider(); // 매 정각 배치가 채운 Supabase slots 조회

// ── 유스케이스 묶음 (앱 전체가 이걸 통해 도메인 사용) ──────
export const usecases = {
  catalog: {
    inBounds: makeSearchInBounds(shopRepo),
    pinsInBounds: makePinsInBounds(shopRepo),
    byGu: makeSearchByGu(shopRepo),
    byGus: makeSearchByGus(shopRepo),
    partners: makeGetPartners(shopRepo),
    searchByName: makeSearchByName(shopRepo),
    getShopDetail: makeGetShopDetail(shopRepo),
  },
  analytics: {
    track: makeTrack(analyticsSink),
  },
  lead: {
    registerAlert: makeRegisterAlert(leadRepo),
  },
  reservation: {
    findOpenShops: makeFindOpenShops(slotProvider),
    getShopSlots: makeGetShopSlots(slotProvider),
  },
} as const;

export type Usecases = typeof usecases;
