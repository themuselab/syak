// 플랫폼 어댑터 — "앱으로 보기" 이동 대상 = 앱 설치 링크.
// iPhone/iPad·PC → App Store 소비자 앱 페이지 / 안드로이드 → Google Play.
// Play는 아직 비공개 테스트라 공개 페이지가 404 → PLAY_PUBLISHED를 true로 바꾸기 전까지 안드로이드는 앱 웹 버전으로 보낸다.
// 모듈 로드 시 1회 평가(세션 내 안정).

export const APP_STORE_URL = "https://apps.apple.com/kr/app/id6807780736";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=kr.themuselab.syak";
export const APP_WEB_URL = "https://app.themuselab.kr";
const PLAY_PUBLISHED = false;

const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";

// iPadOS 13+ 사파리는 데스크톱(Macintosh) UA를 보내므로 터치 지원으로 iPad를 가려낸다.
const isIOS =
  /iPhone|iPad|iPod/i.test(ua) ||
  (/Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);

const isAndroid = /Android/i.test(ua);
const isMobile = isIOS || isAndroid || /Mobi/i.test(ua);

const target: { url: string; store: "ios" | "android" | "web" } = isAndroid
  ? PLAY_PUBLISHED
    ? { url: PLAY_STORE_URL, store: "android" }
    : { url: APP_WEB_URL, store: "web" }
  : { url: APP_STORE_URL, store: "ios" }; // iPhone·iPad·PC(웹 App Store 페이지에서 설치 안내)

export const appLink: { url: string; store: "ios" | "android" | "web"; sameTab: boolean } = {
  ...target,
  // 모바일은 같은 탭(스토어/앱 웹으로 자연스럽게 전환), 데스크톱은 새 탭(지도 유지)
  sameTab: isMobile,
};
