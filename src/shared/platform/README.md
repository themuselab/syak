# shared/platform

플랫폼 SDK 어댑터 격리 계층. 도메인/유스케이스는 여기를 모른다 (ui나 composition-root에서만 사용).

예정:
- `kakao-map.ts` — 카카오 지도 SDK 래퍼 (지도 렌더·핀·이벤트)
- `toss.ts` — Apps-in-Toss SDK 래퍼 (위치권한, 공유, 딥링크 등)
- `geolocation.ts` — 사용자 현재 위치

이렇게 분리해두면 지도 SDK를 바꾸거나(네이버지도↔카카오) 토스 SDK가 업데이트돼도 영향 범위가 여기로 한정된다.
