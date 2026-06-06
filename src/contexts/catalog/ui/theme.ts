// 브랜드 컬러 + 표현용 상수.
import type { Category } from "../../../shared/domain/category";

export const BRAND = "#ec4899"; // syak 핑크 (granite.config primaryColor)
export const BRAND_DEEP = "#be185d";

// 지도 핀 — 브랜드 핑크의 농담(연하기)만 다르게 (카테고리 구분)
export const CATEGORY_COLORS: Record<Category, string> = {
  네일: "#ec4899",
  헤어: "#db2777",
  속눈썹: "#f472b6",
  왁싱: "#be185d",
  반영구: "#9d174d",
  피부: "#f9a8d4",
  마사지: "#831843",
  태닝: "#fb7185",
};
