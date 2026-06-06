# catalog/ui

이 컨텍스트의 React 화면. application 유스케이스만 호출하고, domain 타입을 표시한다.
(fetch/SDK 직접 호출 금지 — 데이터는 유스케이스로, 플랫폼은 shared/platform 어댑터로.)

예정 컴포넌트:
- `MapView.tsx` — 카카오 지도 + 샵 핀 (이벤트중 샵은 아이콘 분기)
- `ShopListSheet.tsx` — 바텀시트 리스트뷰 (드래그로 지도/리스트 전환)
- `CollectionRail.tsx` — 가로 스크롤 컬렉션 (이벤트/가격대/첫방문/리뷰많은)
- `FilterModal.tsx` — 가격대/혜택/예약가능 복합 필터 + 초기화
- `ShopDetail.tsx` — 상세 (이미지/정보/메뉴/이벤트/예약루트 버튼)
- `SearchBar.tsx` — 이름 검색
- `hooks/` — useShops, useCollections 등 (유스케이스 ↔ React 연결)
