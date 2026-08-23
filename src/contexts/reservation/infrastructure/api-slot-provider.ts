// Reservation 어댑터 — 백엔드 API(RDS slots)에서 슬롯 조회.
import type { SlotProvider } from "../ports/slot-provider";
import { apiGet } from "../../../shared/platform/api";

const hm = (t: string): string => t.slice(0, 5); // "14:00:00" → "14:00"

export class ApiSlotProvider implements SlotProvider {
  async shopSlots(shopId: string, date: string): Promise<string[]> {
    try {
      const rows = await apiGet<{ start_time: string }[]>(
        `web/slots/shop?shopId=${encodeURIComponent(shopId)}&date=${date}`,
      );
      return rows.map((r) => hm(r.start_time));
    } catch {
      return [];
    }
  }

  async shopsOpenAt(date: string, hour: string): Promise<string[]> {
    try {
      const rows = await apiGet<{ shop_id: string }[]>(
        `web/slots/open-at?date=${date}&hour=${encodeURIComponent(hour)}`,
      );
      return [...new Set(rows.map((r) => r.shop_id))];
    } catch {
      return [];
    }
  }
}
