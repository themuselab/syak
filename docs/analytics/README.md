# 소비자 행동 계측 v2

## 핵심 지표

`reserve_click` 중 `reservation_method = naver`를 선택하고 `shop_type = partner / general`로 나눈다.
이벤트 횟수는 클릭 수, GA 총 사용자/Hackle 유니크 사용자는 클릭한 사용자 수다.
샵별 상세 방문도 `shop_view` + 같은 `shop_type`/`shop_id`로 집계한다.
이 분류는 **이벤트 발생 시 화면에 표시된 샵의 isPartner 값**이다. 코드 발급 여부나 현재 파트너 목록으로 과거 이벤트를 다시 분류하지 않는다.

네이버 이동 버튼 클릭까지 측정한다. 네이버 페이지 도착·예약 완료·오프라인 방문은 확인할 수 없다.
별도 확인 신호 없이 reservation_complete 이벤트를 만들지 않는다. 클릭 사용자/상세 사용자 비율은 동일 기간·동일 샵 유형 기준으로 보되, 순차 전환율은 사용자별 퍼널에서 계산한다.

## 이벤트와 분기

| 단계 | 웹 | 앱 웹뷰 | 분기·속성 |
|---|---|---|---|
| 유입·재방문 | service_enter, service_leave | service_enter, service_background, service_resume, app_first_open | platform, source, entry, ms |
| 화면 이동 | page_path 공통 속성 | app_screen_view | screen_name, page_path |
| 위치 | location_request, location_result | 기존 위치 UI 행동 + api_error | result=available/unavailable; 좌표 전송 없음 |
| 검색 | search, search_no_result | search, search_no_result | search_term_length, result_count; 검색 원문 제외 |
| 탐색 결과 | shop_list_view | shop_list_view | result_count; 웹 partner_count |
| 카드 실제 노출 | impression | 결과 노출은 shop_list_view | 웹 카드 50% 이상 보일 때, 마운트당 1회 |
| 카드·지도 선택 | card_click, map_pin_click | shop_select | shop_id, source; 웹 shop_type |
| 필터·정렬 | filter_open, filter_apply, filter_reset, region_open, region_select, collection_click, custom_find_open, custom_find_apply | category_select, sort_change, filter_apply, filter_reset, neighborhood_set | category, action, filter, source |
| 상세 방문 | shop_view | shop_view | shop_id, shop_type, is_partner, 카테고리·지역; 성공한 상세 데이터 기준 |
| 상세 탐색 | gallery_view, menu_view, review_view, detail_close | shop_section_view, slot_list_view | section, day, slot_count, trigger, ms |
| 예약 이동 | reserve_click | reserve_click | shop_id, shop_type, reservation_method; 선택한 경우만 slot_date/slot_time |
| 로그인 유도 | 해당 UI 없음 | login_prompt_view, login_prompt_dismiss, login_prompt_click | 비회원 게이트 표시/닫기/로그인 선택 |
| 로그인·가입 | 해당 UI 없음 | login_start, login_cancelled, login_failed, login, sign_up, guest_browse, logout | method; 성공은 API 결과, 취소는 실패와 구분 |
| 즐겨찾기 | 해당 UI 없음 | favorite_submit, favorite_add, favorite_remove | action, shop_id; 성공은 서버 반영 뒤 |
| 빈자리 알림 | lead_form_view, lead_submit, lead_created, lead_failed | slot_alert_start, slot_alert_form_view, slot_alert_form_close, slot_alert_submit, slot_alert_created, slot_alert_failed, slot_alert_deleted | shop_id, time_count, error_code; 전화번호·신청 시각 원문 제외 |
| 푸시·알림함 | 해당 UI 없음 | push_permission_request, push_permission_result, push_permission_granted, push_opened, notification_tab_view | result, trigger, section, shop_id; 토큰 전송 없음 |
| 앱 이동 | app_open_click | 해당 없음 | placement, store |
| 일반 UI 조작 | ui_interaction | ui_interaction | 사용자 클릭만; action은 data-analytics 또는 역할:화면 내 위치. 텍스트/입력값/링크 원문 제외 |
| 스크롤 | scroll_depth | scroll_depth | 각 스크롤 영역의 25/50/75/90% 도달, 화면 내 영역당 1회 |
| 오류 | api_error, service_error, client_error | api_error, client_error | status_code, error_code, stage; 원문 오류·요청/응답 본문 제외 |

전체 경로의 조합마다 이벤트를 생성하지 않는다. 위 행동을 사용자·세션·시간 순서로 연결하고, 성공/실패/취소, 플랫폼, 샵 유형으로 분기한다.
일반 UI 이벤트의 위치 기반 action은 화면 구조가 바뀌면 달라질 수 있다. 주요 전환은 위의 이름 있는 이벤트를 사용하고 중요한 보조 버튼에는 정적인 data-analytics를 붙인다.
OS 화면·외부 앱 내부 행동은 이 수집 범위 밖이다. 페이지 이탈은 강제 종료/오프라인에서 누락될 수 있으므로 이탈률은 퍼널의 다음 단계 미발생으로 계산한다.

## 추천 퍼널

1. 소비자 획득: service_enter → shop_list_view → shop_view → reserve_click(naver), shop_type으로 비교.
2. 파트너 노출 효과: impression(partner) → shop_view(partner) → reserve_click(partner, naver). 카드 노출 퍼널은 웹에 우선 적용.
3. 검색 품질: search → shop_view → reserve_click; search_no_result와 카테고리·필터별 비교.
4. 회원 전환: login_prompt_view → login_start → sign_up/login; 취소·실패를 별도 분기.
5. 알림 전환: slot_alert_start → slot_alert_form_view → slot_alert_submit → slot_alert_created; 비회원 로그인 경로와 실패 경로 비교.
6. 웹 사전등록: lead_form_view → lead_submit → lead_created; failed 별도 비교.
7. 재방문: push_opened/service_enter → shop_view → reserve_click; 사용자 기준 리텐션.

## GA / GTM / Hackle

- GA 속성 Syak, 측정 ID `G-Q0WLLSMTXM`. shop_type을 이벤트 범위 맞춤 측정기준으로 등록했다.
- GTM 계정 Muse Lab, 컨테이너 Syak Consumer Web and App: `GTM-T6G3XFQQ`.
- GTM 가져오기 파일은 `gtm-container.json`. 새 컨테이너에 병합하고 Preview에서 확인한 뒤 게시한다.
- 트리거는 `syak_event`이면서 `analytics_transport=gtm`일 때만 GA 태그를 실행한다. 기존 직접 전송과 중복되지 않는다.
- dataLayer는 `{event:'syak_event', event_name, analytics_transport, event_params}`를 받는다. 매 이벤트 전에 event_params를 null로 초기화해 이전 이벤트 속성이 섞이지 않게 한다.
- Hackle 워크스페이스 Muse Lab(118110), 브라우저 SDK를 사용한다. 세션 내 한 인스턴스, 초기화 대기, 대기 이벤트 상한 128개, 실패 격리, 이벤트 시점의 사용자 식별자를 유지한다.
- 로그인은 내부 UUID, 익명은 기존 기기 ID를 사용한다. 이메일·전화·닉네임·검색 원문·토큰·오류 본문을 이벤트로 보내지 않는다.
- Native 앱에 별도 SDK를 추가하지 않는다. 웹뷰가 보내므로 동일 클릭 이중 수집을 피한다.

## 배포 환경변수

웹: `VITE_HACKLE_SDK_KEY`, `VITE_GTM_ID`, `VITE_ANALYTICS_TRANSPORT`.
앱 웹 빌드: `EXPO_PUBLIC_HACKLE_SDK_KEY`, `EXPO_PUBLIC_GTM_ID`, `EXPO_PUBLIC_ANALYTICS_TRANSPORT`.
브라우저 SDK 키만 사용한다. Server/API 키는 절대 브라우저에 넣지 않는다.
GTM ID와 transport=gtm은 게시된 컨테이너가 준비됐을 때 설정한다. 비어 있으면 기존 direct GA로 동작한다.
로컬 .env.local은 준비했지만 Git에 공유되지 않으며 Vercel 운영 환경에는 별도 반영·재빌드가 필요하다.

## 검증

`npm run test:analytics`, 웹 TypeScript/Vite 빌드, 앱 typecheck/lint 및 웹 export.
실기기 QA: 파트너/일반 × web/iOS/Android/Toss × 목록/지도/직접 진입 × 네이버/다른 수단/URL 없음 × 로그인/비회원.
각 네이버 버튼 1회에 reserve_click이 GA에 1회, Hackle에 1회 도착해야 한다. UI_interaction은 별개 보조 이벤트다.
DebugView/Tag Assistant/Hackle 이벤트 조회에서 shop_type, shop_id, reservation_method를 확인한다. 검증용 사용자는 테스트 환경 SDK 키를 사용한다.
GA 새 맞춤 측정기준은 과거 데이터에 소급되지 않는다. 과거 미설정 값은 일반 샵이나 네이버로 추정해서 채우지 않는다.

## SEO landing

SEO geo/hub HTML also loads /assets/analytics.js. Existing seo_landing, seo_cta_click, app_install_click, and seo_owner_click now use the same GA/GTM/Hackle delivery. These pages queue early events until the module is ready. GA page_view configuration remains in the original gtag bootstrap.

## Verified state (2026-11-08)

GTM version 2 was published with 1 GA4 event tag and a transport-gated custom-event trigger. Network inspection confirmed one partner and one general analytics_validation event per QA attempt, with reservation_method=naver, and successful GA HTTP 204 responses. The production-bundled Hackle SDK returned config HTTP 200 and event ingestion HTTP 204; analytics_validation is visible in workspace 118110. Only validation events were used, not reserve_click or shop_view. Exclude source=internal_qa from operational analysis.

Both consumer repositories passed TypeScript and analytics tests (web 6, app 4). Web production build and Expo static web export passed. Production environment variables and both Vercel production deployments were completed on 2026-11-08. Git changes remain local. See deployment receipt.

GA event-scoped dimensions configured: shop_type, section, result, error_code, stage (existing dimensions retained).
