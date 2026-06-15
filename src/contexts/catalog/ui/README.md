# catalog/ui

이 컨텍스트의 React 화면. application 유스케이스(`usecases.catalog.*`)만 호출하고, domain 타입을 표시한다.
(fetch/SDK 직접 호출 금지 — 데이터는 유스케이스로, 플랫폼은 shared/platform 어댑터로.)

## 컴포넌트
- `MapView.tsx` — 카카오 지도 + 샵 핀. diff 기반 마커(클러스터러 1회 생성 후 추가/제거 delta), 파트너·오늘예약 핀은 비클러스터 직접 표시. 핀 우선순위: 파트너(금별)>오늘예약(초록체크)>이벤트(분홍%)>분야(회색점).
- `ShopListSheet.tsx` — 바텀시트 리스트뷰. `ShopCard` 나열.
- `ShopCard.tsx` — 리스트 한 줄(썸네일·이름·가격·뱃지).
- `ShopDetailSheet.tsx` — 상세 바텀시트(이미지 갤러리/오늘·내일 예약 슬롯/최저가 배너/파일럿 쿠폰/메뉴/리뷰/예약 버튼).
- `CollectionChips.tsx` — 가로 스크롤 컬렉션 칩(할인·가격대·첫방문·리뷰많은).
- `FilterModal.tsx` — 정렬(기본/가격/샥파트너) + 분야/가격/시술/혜택 복합 필터 + 초기화.
- `RegionPicker.tsx` — 지역(구/시) 다중 선택(합집합).
- `ActiveFilters.tsx` — 적용된 필터 요약 칩.
- `CustomFindModal.tsx` — "젤네일 되는 곳" 같은 시술 기반 찾기.
- `hooks/useCatalog.ts` — 유스케이스 ↔ React 연결(뷰포트 로딩·필터·검색).
