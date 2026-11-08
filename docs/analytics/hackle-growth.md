# Hackle CTA 실험

Muse Lab(118110)의 현재 표시 플랜 **그로스 해킹**에서 A/B 실험 `5`, 기능 플래그 `4`, 원격 구성 `syak_naver_cta_label`을 소비자 웹에 연결했다. 요금제 변경과 CRM 발송은 없다.

- [실험 콘솔](https://dashboard.hackle.io/workspaces/118110/experiments/517927/detail): 2026-11-08 12:22 KST 시작, 전체 대상 기기 A/B 50:50.
- 분배는 `device Id`. 기존 `syak_cid`를 재사용하여 비회원도 참여한다. 로그인 ID로 분배를 전환하지 않는다. 웹·앱 저장소는 별개이므로 기기 수와 사람 수를 구별한다.
- 네이버 URL이 있는 상세 하단 버튼만 A=기존 문구, B=`네이버에서 확인하기`. URL·예약 수단 우선순위·슬롯 버튼은 기존 동작을 유지한다.
- 플래그 Off나 SDK 오류는 기존 문구로 동작한다. 기존 SDK 인스턴스를 재사용하고 60초마다 설정을 갱신한다. 이미 열린 CTA는 상세 재진입 시 갱신된다.
- 원격 문구는 공백 제외, 24자 이하만 허용한다. 실험 진행 중 문구를 바꾸면 별도 버전으로 평가한다.
- 성공 지표는 `reserve_click` + `reservation_method=naver` + `shop_type=partner`의 고유 기기 / 전체 실험 노출 기기. 일반샵·전체 전환율은 보조 지표다.
- `booking_cta_view`는 표시한 그룹과 샵을 기록하는 보조 이벤트이며 예약 완료를 의미하지 않는다. 네이버 이동 이후 행동은 확인할 수 없다.
- QA SDK 호출은 `syak-qa-device-20261108`, `internal_qa=true`로 구별한다. 표본이 쌓이기 전에 승자를 결정하지 않는다.

[성장 리포트](https://dashboard.hackle.io/workspaces/118110/reports/64215)에 전체·파트너샵·일반샵 퍼널을 저장했다. 기기 기준 `service_enter → shop_view → reserve_click`, 마지막 단계는 네이버만, 파트너/일반은 상세·클릭 모두 동일한 `shop_type`을 필터링한다. 전환 완료 1일, 최근 3일 조회이며 샵 ID 일치까지 강제한 퍼널은 아니다.

운영 배포: `dpl_HUqe9hy5TbZqbZq5p5KtsvR7gGFK` → `www.themuselab.kr`. TypeScript, analytics 테스트 8개, lint(오류 0), 웹·Toss 빌드를 통과했다. Toss 미니앱 배포는 별도 절차이며 이번 배포는 Vercel 웹이다.

앱 레포의 `docs/hackle-growth.md`에 전체 콘솔 링크와 운영 절차를 함께 기록한다.
