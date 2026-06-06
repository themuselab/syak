// 플랫폼 어댑터 — 사용자 현재 위치. 실패/거부 시 null.
import type { Coordinate } from "../domain/coordinate";

export function getUserPosition(timeoutMs = 6000): Promise<Coordinate | null> {
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
      { enableHighAccuracy: true, timeout: timeoutMs },
    );
  });
}
