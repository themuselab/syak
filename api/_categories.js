// SEO 카테고리 정의 — 렌더러(api/seo.js)와 사이트맵(api/sitemap.js) 공유.
// slug(URL 영문) ↔ ko(한글, RDS category 값) ↔ place(카피용 명사).
// seo_generate.py 의 CATEGORIES 와 동일하게 유지할 것.
export const CATEGORIES = {
  nail:     { ko: "네일",   place: "네일샵" },
  hair:     { ko: "헤어",   place: "헤어샵" },
  waxing:   { ko: "왁싱",   place: "왁싱샵" },
  eyelash:  { ko: "속눈썹", place: "속눈썹샵" },
  pmu:      { ko: "반영구", place: "반영구" },
  massage:  { ko: "마사지", place: "마사지샵" },
  skincare: { ko: "피부",   place: "피부관리" },
  tanning:  { ko: "태닝",   place: "태닝샵" },
};
export const CAT_SLUGS = Object.keys(CATEGORIES);
export const KO_TO_SLUG = Object.fromEntries(
  Object.entries(CATEGORIES).map(([slug, v]) => [v.ko, slug])
);
