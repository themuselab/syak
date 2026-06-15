# 샥 2.0 — 아키텍처 규칙

앱인토스(React/Vite) 미니앱. **DDD-lite + 헥사고날(클린아키텍처) + 읽기/쓰기 분리(CQRS-lite)**.

## 1. 독립 도메인 (bounded contexts)

`src/contexts/` 아래 각 도메인은 **독립**이다. 서로 직접 import 금지.
컨텍스트 간 통신이 필요하면 `app/`(조립 계층)에서 연결한다.

| 컨텍스트 | 역할 | 측 |
|---|---|---|
| `catalog` | 샵 탐색·필터·상세·컬렉션 | 읽기(Query) |
| `analytics` | 클릭/노출 이벤트 적재·집계 | 쓰기+읽기 |
| `lead` | 취소석 알림 전화번호 등록 | 쓰기 |
| `reservation` | 예약/슬롯(빈자리) 조회 | 🔵 Supabase `slots` provider 구현 |

## 2. 레이어 & 의존성 방향 (안쪽이 바깥을 모른다)

```
ui  →  application  →  domain
              │
              ▼
            ports  ◀──  infrastructure (구현)
```

- **domain/** — 순수 비즈니스 로직. 엔티티·값객체·도메인 규칙.
  - ❌ React, fetch, localStorage, DB, 외부 SDK **어떤 것도 import 금지**.
  - ✅ 순수 함수/타입만. 테스트가 외부 의존 없이 돈다.
- **application/** — 유스케이스. 도메인을 포트를 통해 오케스트레이션.
  - ✅ `domain/`, `ports/`만 import. 구현(infrastructure) 모름.
- **ports/** — 인터페이스(추상). 의존성 역전의 경계.
- **infrastructure/** — 어댑터. 포트의 **구현**. 외부 의존(fetch/SDK/JSON)은 **여기서만**.
- **ui/** — React 컴포넌트·훅. application 유스케이스를 호출.

## 3. 읽기/쓰기 분리 (CQRS-lite)

- **읽기**: 앱은 외부 API를 실시간 호출하지 않는다. 데이터 파이프라인이 미리 적재한 **Supabase read model**(`shops`/`slots` 테이블)만 뷰포트 기준으로 읽는다.
- **쓰기→읽기 투영**: GitHub Actions 배치(`scraper/`)가 네이버에서 수집·가공해 파생필드(가격대·이벤트·파트너·`today_open`)와 빈자리(`slots`)를 적재한다. (오프라인 배치)
- 앱 내부 쓰기(클릭이벤트·전화번호)는 `analytics`/`lead`의 sink 포트로만 나간다.

## 4. 조립 (composition root)

- `src/app/composition-root.ts` 에서만 **포트 ↔ 어댑터를 연결**한다.
- 나머지 코드는 인터페이스(포트)에만 의존 → 어댑터 교체(JSON→API, mock→real)가 1곳 수정으로 끝난다.
- 예) `reservation`은 지금 포트만 있고, AWS 백엔드가 생기면 어댑터 하나 추가 + 여기서 주입만 바꾼다.

## 폴더 빠른 참조

```
contexts/<도메인>/
  domain/          순수 (외부 import 금지)
  application/     유스케이스
  ports/           인터페이스
  infrastructure/  어댑터 (외부 의존 격리)
  ui/              React (catalog 등 화면 있는 컨텍스트만)
shared/            공통 커널 (값객체, 플랫폼 어댑터, 공통 UI)
app/               조립 + 라우팅
```
