// 조립(Composition Root) — 포트 ↔ 어댑터를 연결하는 유일한 장소.
// 나머지 코드는 포트(인터페이스)에만 의존한다. 어댑터 교체는 여기 한 곳만 바꾸면 된다.

import { ApiShopRepository } from "../contexts/catalog/infrastructure/api-shop-repository";
import { makeSearchInBounds, makePinsInBounds, makeSearchByGus, makeGetPartners, makeSearchByName } from "../contexts/catalog/application/search-shops";
import { makeGetShopDetail } from "../contexts/catalog/application/get-shop-detail";

import { GA4AnalyticsSink } from "../contexts/analytics/infrastructure/ga4-analytics-sink";
import { MetaPixelSink } from "../contexts/analytics/infrastructure/meta-pixel-sink";
import { CompositeAnalyticsSink } from "../contexts/analytics/infrastructure/composite-analytics-sink";
import { makeTrack } from "../contexts/analytics/application/track";

import { ApiLeadRepository } from "../contexts/lead/infrastructure/api-lead-repository";
import { makeRegisterAlert } from "../contexts/lead/application/register-alert";

import { ApiSlotProvider } from "../contexts/reservation/infrastructure/api-slot-provider";
import { makeFindOpenShops } from "../contexts/reservation/application/find-open-shops";
import { makeGetShopSlots } from "../contexts/reservation/application/get-shop-slots";

// ── 어댑터 인스턴스화 (구현 선택) ─────────────────────────
// 카탈로그/슬롯: 백엔드 API(RDS)에서 조회. Supabase 직접 호출을 이전(egress 정지 회피).
const shopRepo = new ApiShopRepository();
// GA4 + Meta 픽셀로 fan-out. 메타 픽셀은 VITE_META_PIXEL_ID 있을 때만 활성(없으면 no-op).
const analyticsSink = new CompositeAnalyticsSink([
  new GA4AnalyticsSink(import.meta.env.VITE_TARGET === "toss" ? "toss" : "web"),
  new MetaPixelSink(),
]);
const leadRepo = new ApiLeadRepository();
const slotProvider = new ApiSlotProvider(); // 백엔드 API → RDS slots(스크래퍼/사장님 통합)

// ── 유스케이스 묶음 (앱 전체가 이걸 통해 도메인 사용) ──────
export const usecases = {
  catalog: {
    inBounds: makeSearchInBounds(shopRepo),
    pinsInBounds: makePinsInBounds(shopRepo),
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
