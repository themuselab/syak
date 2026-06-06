// Reservation 어댑터 — Supabase slots 테이블 조회 (anon 키). 외부 의존 격리.
import type { SlotProvider } from "../ports/slot-provider";
import { sbFetch } from "../../../shared/platform/supabase";

// "14:00:00" → "14:00"
function hm(t: string): string {
  return t.slice(0, 5);
}

function nextHour(hour: string): string {
  const h = Number(hour.slice(0, 2));
  return `${String((h + 1) % 24).padStart(2, "0")}:00:00`;
}

export class SupabaseSlotProvider implements SlotProvider {
  async shopSlots(shopId: string, date: string): Promise<string[]> {
    const res = await sbFetch(
      `slots?shop_id=eq.${encodeURIComponent(shopId)}&slot_date=eq.${date}&select=start_time&order=start_time`,
    );
    if (!(res.ok || res.status === 206)) return [];
    const rows = (await res.json()) as { start_time: string }[];
    return rows.map((r) => hm(r.start_time));
  }

  async shopsOpenAt(date: string, hour: string): Promise<string[]> {
    const from = hour.length === 5 ? `${hour}:00` : hour; // "14:00" → "14:00:00"
    const to = nextHour(from);
    const res = await sbFetch(
      `slots?slot_date=eq.${date}&start_time=gte.${from}&start_time=lt.${to}&select=shop_id`,
    );
    if (!(res.ok || res.status === 206)) return [];
    const rows = (await res.json()) as { shop_id: string }[];
    return [...new Set(rows.map((r) => r.shop_id))];
  }
}
