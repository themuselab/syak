// Lead 유스케이스 — 취소석 알림 등록. 도메인 검증 + 포트 의존.
import type { LeadRepository } from "../ports/lead-repository";
import { PhoneNumber } from "../domain/phone";

export type RegisterResult = { ok: true } | { ok: false; reason: "invalid_phone" };

export function makeRegisterAlert(repo: LeadRepository) {
  return async function registerAlert(input: {
    phoneRaw: string;
    district?: string;
    category?: string;
  }): Promise<RegisterResult> {
    const phone = PhoneNumber.parse(input.phoneRaw);
    if (!phone) return { ok: false, reason: "invalid_phone" };
    await repo.register({ phone, district: input.district, category: input.category });
    return { ok: true };
  };
}
