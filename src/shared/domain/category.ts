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

// 서울 인접/생활권 경기 시 (데이터 저장 라벨과 동일 — 시 단위 필터)
export const GYEONGGI_SI = [
  "성남시", "고양시", "부천시", "안양시", "안산시", "남양주시", "용인시",
  "광명시", "하남시", "구리시", "과천시", "의정부시", "김포시", "시흥시", "군포시", "의왕시",
] as const;

// 인천 광역시 (저장 라벨과 동일)
export const INCHEON_GU = [
  "인천 중구", "인천 동구", "인천 미추홀구", "인천 연수구", "인천 남동구",
  "인천 부평구", "인천 계양구", "인천 서구", "인천 강화군",
] as const;

export type District =
  | (typeof SEOUL_GU)[number]
  | (typeof GYEONGGI_SI)[number]
  | (typeof INCHEON_GU)[number];

// 예약 item에서 추출한 시술 태그 (backfill_booking.py의 SERVICE_TAGS 라벨과 동일)
// "젤네일 되는 샵 찾기" 발견 필터용
export const SERVICE_FILTERS = [
  "젤네일", "패디큐어", "네일아트", "손연장", "케어",
  "속눈썹", "왁싱", "반영구", "펌", "염색", "커트", "피부관리", "마사지", "태닝",
] as const;
