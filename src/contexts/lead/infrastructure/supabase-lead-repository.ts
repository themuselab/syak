// Lead 어댑터 — leads 테이블에 전화번호 저장 (Supabase, anon insert).
import type { LeadRepository, AlertRegistration } from "../ports/lead-repository";
import { SUPABASE_URL, SUPABASE_ANON } from "../../../shared/platform/supabase";

export class SupabaseLeadRepository implements LeadRepository {
  async register(reg: AlertRegistration): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        phone: reg.phone.value,
        district: reg.district ?? null,
        category: reg.category ?? null,
        kind: "missed_seat_alert",
      }),
    });
    if (!res.ok) throw new Error(`lead register failed: ${res.status}`);
  }
}
