// Reservation 유스케이스 — 한 가게의 그 날짜 빈 시간. 포트만 의존.
import type { SlotProvider } from "../ports/slot-provider";

export function makeGetShopSlots(provider: SlotProvider) {
  return function getShopSlots(shopId: string, date: string): Promise<string[]> {
    return provider.shopSlots(shopId, date);
  };
}
