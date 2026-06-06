// Lead 어댑터 — themuselab.kr /api/submit 로 전화번호 등록. 외부 의존 격리.
import type { LeadRepository, AlertRegistration } from "../ports/lead-repository";

const ENDPOINT = "https://themuselab.kr/api/submit";

export class HttpLeadRepository implements LeadRepository {
  async register(reg: AlertRegistration): Promise<void> {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: reg.phone.value,
        district: reg.district ?? null,
        category: reg.category ?? null,
        kind: "missed_seat_alert",
        ts: Date.now(),
      }),
    });
  }
}
