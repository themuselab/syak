// 공통 값객체 — 좌표. 순수.
export interface Coordinate {
  lat: number; // 위도 (read model의 y)
  lng: number; // 경도 (read model의 x)
}

const SEOUL_CENTER: Coordinate = { lat: 37.5665, lng: 126.978 };
export { SEOUL_CENTER };

/** 두 좌표 간 거리(m) — Haversine. 순수. */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
