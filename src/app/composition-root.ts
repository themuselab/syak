// 조립(Composition Root) — 포트 ↔ 어댑터를 연결하는 유일한 장소.
// 나머지 코드는 포트(인터페이스)에만 의존한다. 어댑터 교체는 여기 한 곳만 바꾸면 된다.

import { StaticShopRepository } from "../contexts/catalog/infrastructure/static-shop-repository";
import { makeSearchShops, makeSearchByName } from "../contexts/catalog/application/search-shops";
import { makeListCollections } from "../contexts/catalog/application/list-collections";
import { makeGetShopDetail } from "../contexts/catalog/application/get-shop-detail";

import { HttpAnalyticsSink } from "../contexts/analytics/infrastructure/http-analytics-sink";
import { makeTrack } from "../contexts/analytics/application/track";

import { HttpLeadRepository } from "../contexts/lead/infrastructure/http-lead-repository";
import { makeRegisterAlert } from "../contexts/lead/application/register-alert";

// ── 어댑터 인스턴스화 (구현 선택) ─────────────────────────
const shopRepo = new StaticShopRepository();
const analyticsSink = new HttpAnalyticsSink("toss");
const leadRepo = new HttpLeadRepository();

// ⛔ reservation: 어댑터 없음. AWS 백엔드 생기면 여기서 주입.
// const slotProvider = new HttpSlotProvider();

// ── 유스케이스 묶음 (앱 전체가 이걸 통해 도메인 사용) ──────
export const usecases = {
  catalog: {
    searchShops: makeSearchShops(shopRepo),
    searchByName: makeSearchByName(shopRepo),
    listCollections: makeListCollections(shopRepo),
    getShopDetail: makeGetShopDetail(shopRepo),
  },
  analytics: {
    track: makeTrack(analyticsSink),
  },
  lead: {
    registerAlert: makeRegisterAlert(leadRepo),
  },
  // reservation: 추후 AWS 어댑터 주입 후 활성화
} as const;

export type Usecases = typeof usecases;
