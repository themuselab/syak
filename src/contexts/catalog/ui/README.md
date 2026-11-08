# catalog/ui

이 컨텍스트의 React 화면. application 유스케이스(`usecases.catalog.*`)만 호출하고, domain 타입을 표시한다.
(fetch/SDK 직접 호출 금지 — 데이터는 유스케이스로, 플랫폼은 shared/platform 어댑터로.)

## 컴포넌트
- `MapView.tsx` — 카카오 지도 + 샵 핀. diff 기반 마커(클러스터러 1회 생성 후 추가/제거 delta), 파트너·오늘예약 핀은 비클러스터 직접 표시. 핀 우선순위: 파트너(금별)>오늘예약(초록체크)>이벤트(분홍%)>분야(회색점).
- `ShopListSheet.tsx` — 바텀시트 리스트뷰. `ShopCard` 나열.
- `HomeChrome.tsx` — 앱과 같은 검색바·카테고리·시트 필터 바.
- `ShopCard.tsx` — 앱 피드 카드(메타·시간·사진 3장·리뷰).
- `ShopDetailSheet.tsx` — 앱 상세 구조, 고정 탭·가격·3일 예약·리뷰와 하단 예약 버튼.
- `CollectionChips.tsx` — 가로 스크롤 컬렉션 칩(할인·가격대·첫방문·리뷰많은).
- `FilterModal.tsx` — 통합 정렬·가격 범위·예약시간 패널, 추가 분야·시술·혜택 조건과 초기화.
- `RegionPicker.tsx` — 지역(구/시) 다중 선택(합집합).
- `ActiveFilters.tsx` — 적용된 필터 요약 칩.
- `CustomFindModal.tsx` — "젤네일 되는 곳" 같은 시술 기반 찾기.
- `hooks/useCatalog.ts` — 유스케이스 ↔ React 연결(뷰포트 로딩·필터·검색).
