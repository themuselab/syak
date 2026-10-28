// 브랜드 컬러 + 표현용 상수. 값은 소비자 앱 토큰(app/src/shared/theme/tokens.js)과 같다.
import type { Category } from "../../../shared/domain/category";
import { color } from "../../../shared/ui/tokens";

export const BRAND = color.primary[500]; // syak 핑크 (앱 primary-500)
export const BRAND_DEEP = color.primary[700];

// 카테고리별 핀 색 — 앱 primary 스케일의 농담만 다르게. (네이버 지도는 앱과 같은 PNG 핀을 쓰므로
// 이 값은 카카오 폴백 지도(MapView.tsx)에서만 쓰인다)
export const CATEGORY_COLORS: Record<Category, string> = {
  네일: color.primary[500],
  헤어: color.primary[600],
  속눈썹: color.primary[400],
  왁싱: color.primary[700],
  반영구: color.primary[800],
  피부: color.primary[300],
  마사지: color.primary[900],
  태닝: color.primary[200],
};
