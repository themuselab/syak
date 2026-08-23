// Lead 어댑터 — 취소석 알림 신청을 백엔드 API(RDS leads)로 저장.
import type { LeadRepository, AlertRegistration } from "../ports/lead-repository";
import { apiPost } from "../../../shared/platform/api";

export class ApiLeadRepository implements LeadRepository {
  async register(reg: AlertRegistration): Promise<void> {
    const res = await apiPost("web/leads", {
      phone: reg.phone.value,
      district: reg.district ?? null,
      category: reg.category ?? null,
    });
    if (!res.ok) throw new Error(`lead register failed: ${res.status}`);
  }
}
