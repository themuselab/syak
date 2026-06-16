// 플랫폼 어댑터 — 방문자 식별/디바이스. 모듈 로드 시 1회 평가(세션 내 안정).
// client_id: 영속(localStorage) → 순방문자·재방문(리텐션) 집계용.
// isReturningVisitor: cid가 '이미 있었나'로 판정 (생성 전에 읽어야 정확).
// device: UA로 PC/iOS/Android 구분 (GA4식 디바이스 분류).

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

const _hadCid = !!read("syak_cid");
let _cid = read("syak_cid");
if (!_cid) {
  _cid = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  write("syak_cid", _cid);
}

export const clientId: string = _cid;
export const isReturningVisitor: boolean = _hadCid;

export const device: "pc" | "ios" | "android" = (() => {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "pc";
})();
