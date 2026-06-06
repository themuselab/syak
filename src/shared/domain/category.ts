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
export type District = (typeof SEOUL_GU)[number];
