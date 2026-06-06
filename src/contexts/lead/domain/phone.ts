// Lead 도메인 — 순수. 전화번호 값객체 + 검증 규칙.

const KR_MOBILE = /^01[016789]\d{7,8}$/;

export class PhoneNumber {
  private constructor(public readonly value: string) {}

  /** 하이픈/공백 제거 후 한국 휴대폰 형식 검증 */
  static parse(raw: string): PhoneNumber | null {
    const digits = raw.replace(/[^0-9]/g, "");
    if (!KR_MOBILE.test(digits)) return null;
    return new PhoneNumber(digits);
  }

  formatted(): string {
    const v = this.value;
    return v.length === 11 ? `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7)}` : `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}`;
  }
}
