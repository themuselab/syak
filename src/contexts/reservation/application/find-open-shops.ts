// Reservation 유스케이스 — 특정 날짜·시에 빈자리 있는 가게 id. 포트만 의존.
import type { SlotProvider } from "../ports/slot-provider";

export function makeFindOpenShops(provider: SlotProvider) {
  return function findOpenShops(date: string, hour: string): Promise<string[]> {
    return provider.shopsOpenAt(date, hour);
  };
}
