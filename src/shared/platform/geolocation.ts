// 플랫폼 어댑터 — 사용자 현재 위치. 실패/거부 시 null.
// 토스 미니앱(웹뷰)은 navigator.geolocation이 막혀있어 앱인토스 SDK 브릿지를 써야 함.
// 웹(Vercel)은 표준 navigator.geolocation.
import type { Coordinate } from "../domain/coordinate";

const IS_AIT = import.meta.env.VITE_TARGET !== "vercel";

// 토스 앱: SDK의 getCurrentLocation 브릿지 (권한 거부 시 throw → null).
async function aitPosition(): Promise<Coordinate | null> {
  try {
    const mod: any = await import("@apps-in-toss/web-framework");
    const getLoc = mod?.getCurrentLocation;
    if (typeof getLoc !== "function") return null;
    const accuracy = mod?.Accuracy?.Balanced ?? 3; // 수백 m 이내면 충분 (지도 센터용)
    const res = await getLoc({ accuracy });
    const c = res?.coords ?? res;
    if (c && typeof c.latitude === "number" && typeof c.longitude === "number") {
      return { lat: c.latitude, lng: c.longitude };
    }
    return null;
  } catch {
    return null; // GetCurrentLocationPermissionError(거부) 포함 — 조용히 폴백
  }
}

// 웹/일부 웹뷰: 표준 브라우저 위치 (HTTPS 필요).
function browserPosition(timeoutMs: number): Promise<Coordinate | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (v: Coordinate | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        finish({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      // 지도 센터용이라 도시 수준이면 충분 → highAccuracy=false(빠르고 안정적) + 캐시 위치 허용
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600000 },
    );
  });
}

export async function getUserPosition(timeoutMs = 6000): Promise<Coordinate | null> {
  if (IS_AIT) {
    const p = await aitPosition();
    if (p) return p; // 실패 시 아래 navigator 폴백(일부 웹뷰는 동작)
  }
  return browserPosition(timeoutMs);
}
