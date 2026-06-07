// 네이버 pstatic CDN 이미지 썸네일 리사이즈.
// 원본(최대 1500px)을 그대로 쓰면 스크롤/슬라이드 시 페인트 비용이 큼 → 표시 크기에 맞게 축소 요청.
// pstatic은 ?type=f{w}_{h} (fit/crop) 파라미터 지원.

// 이미지 없음/깨짐(404) 폴백 — public/fallback.png (로고 포함 플레이스홀더)
export const FALLBACK_IMAGE = "/fallback.png";

/** <img onError> 핸들러 — 깨진 이미지를 폴백으로 교체. 무한루프 방지(1회만). */
export function onImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget;
  if (el.dataset.fallback) return; // 이미 폴백이면 멈춤 (폴백 자체가 404여도 루프 X)
  el.dataset.fallback = "1";
  el.src = FALLBACK_IMAGE;
}

export function thumb(url: string | null | undefined, size = 160): string | undefined {
  if (!url) return undefined;
  if (url.includes("pstatic.net") || url.includes("phinf") || url.includes("pstatic")) {
    return `${url.split("?")[0]}?type=f${size}_${size}`;
  }
  return url;
}

/** 가로형(갤러리)용 — 폭 기준 리사이즈 */
export function thumbW(url: string | null | undefined, width = 600): string | undefined {
  if (!url) return undefined;
  if (url.includes("pstatic")) {
    return `${url.split("?")[0]}?type=w${width}`;
  }
  return url;
}
