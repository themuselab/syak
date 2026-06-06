// Reservation 포트 — 예약/슬롯 조회 인터페이스.
// ⛔ 구현(어댑터) 없음. 추후 AWS 백엔드가 이 포트를 구현해 composition-root에서 주입한다.
// 앱은 이 인터페이스에만 의존하므로, 백엔드가 생겨도 나머지 코드는 안 바뀐다.

export interface Slot {
  start: string; // ISO datetime
  end: string;
  available: boolean;
}

export interface DaySlots {
  shopId: string;
  date: string; // YYYY-MM-DD (보통 '내일')
  slots: Slot[];
  fetchedAt: string;
}

export interface SlotProvider {
  /** 특정 가게의 특정 날짜 슬롯 (미리 계산된 결과를 백엔드에서 조회) */
  daySlots(shopId: string, date: string): Promise<DaySlots | null>;
  /** 조건(날짜/시간/지역/분야)에 맞는, 빈자리 있는 가게 id 목록 */
  shopsWithOpenSlots(query: {
    date: string;
    fromTime?: string;
    gu?: string;
    category?: string;
  }): Promise<string[]>;
}
