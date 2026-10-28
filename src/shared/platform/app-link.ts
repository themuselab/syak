// 플랫폼 어댑터 — "앱으로 보기" 이동 대상.
// iPhone/iPad → App Store 소비자 앱 페이지 / 그 외(안드로이드·PC) → 앱의 웹 버전(app.themuselab.kr).
// 모듈 로드 시 1회 평가(세션 내 안정).

export const APP_STORE_URL = "https://apps.apple.com/kr/app/id6807780736";
export const APP_WEB_URL = "https://app.themuselab.kr";

const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";

// iPadOS 13+ 사파리는 데스크톱(Macintosh) UA를 보내므로 터치 지원으로 iPad를 가려낸다.
const isIOS =
  /iPhone|iPad|iPod/i.test(ua) ||
  (/Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);

const isMobile = isIOS || /Android|Mobi/i.test(ua);

export const appLink: { url: string; store: "ios" | "web"; sameTab: boolean } = {
  url: isIOS ? APP_STORE_URL : APP_WEB_URL,
  store: isIOS ? "ios" : "web",
  // 모바일은 같은 탭(스토어/앱 웹으로 자연스럽게 전환), 데스크톱은 새 탭(지도 유지)
  sameTab: isMobile,
};
