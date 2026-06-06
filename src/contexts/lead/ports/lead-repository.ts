// Lead 포트 — 취소석 알림 사전등록(쓰기) 인터페이스. 구현은 infrastructure/.
import type { PhoneNumber } from "../domain/phone";

export interface AlertRegistration {
  phone: PhoneNumber;
  district?: string;
  category?: string;
}

export interface LeadRepository {
  register(reg: AlertRegistration): Promise<void>;
}
