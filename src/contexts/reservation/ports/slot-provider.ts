// Reservation 포트 — 빈 슬롯 조회. 구현은 infrastructure/ (Supabase) 또는 추후 AWS.
// 앱은 미리 수집된(매 정각 배치) 빈자리 결과만 읽는다.

export interface SlotProvider {
  /** 한 가게의 특정 날짜 빈 시간 목록. 예: ["14:00","14:30","15:00"] */
  shopSlots(shopId: string, date: string): Promise<string[]>;
  /** 특정 날짜·시(hour)에 빈자리 있는 가게 id 목록. hour="14:00" → [14:00,15:00) 내 빈 슬롯 보유 가게 */
  shopsOpenAt(date: string, hour: string): Promise<string[]>;
}
