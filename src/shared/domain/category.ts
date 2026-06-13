// 공통 값객체 — 뷰티 카테고리. 순수.
export const CATEGORIES = ["네일", "헤어", "속눈썹", "왁싱", "반영구", "피부", "마사지", "태닝"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

// 서울 25개 자치구
export const SEOUL_GU = [
  "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구",
  "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구",
  "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구",
] as const;

// 경기 시 (데이터 저장 라벨과 동일 — 시 단위 필터)
export const GYEONGGI_SI = [
  "수원시",
  "성남시", "고양시", "부천시", "안양시", "안산시", "남양주시", "용인시",
  "광명시", "하남시", "구리시", "과천시", "의정부시", "김포시", "시흥시", "군포시", "의왕시",
  // 경기 나머지
  "화성시", "평택시", "파주시", "광주시", "오산시", "이천시", "안성시",
  "여주시", "양평군", "포천시", "동두천시", "양주시", "가평군", "연천군",
] as const;

// 인천 광역시 (저장 라벨과 동일)
export const INCHEON_GU = [
  "인천 중구", "인천 동구", "인천 미추홀구", "인천 연수구", "인천 남동구",
  "인천 부평구", "인천 계양구", "인천 서구", "인천 강화군",
] as const;

// 부산 광역시 (저장 라벨 "부산 {구}")
export const BUSAN_GU = [
  "부산 중구", "부산 서구", "부산 동구", "부산 영도구", "부산 부산진구", "부산 동래구",
  "부산 남구", "부산 북구", "부산 해운대구", "부산 사하구", "부산 금정구", "부산 강서구",
  "부산 연제구", "부산 수영구", "부산 사상구", "부산 기장군",
] as const;

// 대구 광역시 (저장 라벨 "대구 {구}")
export const DAEGU_GU = [
  "대구 중구", "대구 동구", "대구 서구", "대구 남구", "대구 북구",
  "대구 수성구", "대구 달서구", "대구 달성군",
] as const;

// 광주 광역시 (저장 라벨 "광주 {구}")
export const GWANGJU_GU = ["광주 동구", "광주 서구"] as const;

// 경상 (경남: 창원·진주 / 경북: 포항) — 데이터 있는 주요 도시
export const GYEONGSANG_SI = ["창원시", "진주시", "포항시"] as const;

// 전라 (전북: 전주 / 전남: 여수)
export const JEOLLA_SI = ["전주시", "여수시"] as const;

export type District =
  | (typeof SEOUL_GU)[number]
  | (typeof GYEONGGI_SI)[number]
  | (typeof INCHEON_GU)[number]
  | (typeof BUSAN_GU)[number]
  | (typeof DAEGU_GU)[number]
  | (typeof GWANGJU_GU)[number]
  | (typeof GYEONGSANG_SI)[number]
  | (typeof JEOLLA_SI)[number];

// 예약 item에서 추출한 시술 태그 (backfill_booking.py의 SERVICE_TAGS 라벨과 동일)
// "젤네일 되는 샵 찾기" 발견 필터용
export const SERVICE_FILTERS = [
  "젤네일", "패디큐어", "네일아트", "손연장", "케어",
  "속눈썹", "왁싱", "반영구", "펌", "염색", "커트", "피부관리", "마사지", "태닝",
] as const;
