# 샥 (syak) 2.0

> 서울 뷰티샵 디스커버리 — Apps-in-Toss 미니앱.
> 지도에서 내 주변 뷰티샵(네일·헤어·속눈썹·왁싱·반영구·피부·마사지·태닝)을 둘러보고, 바로 예약 루트로 연결한다.

네이버 플레이스에서 수집한 **서울 뷰티샵 7,635곳**의 위치·사진·영업시간·메뉴·가격·리뷰·인스타·예약 정보를 지도와 컬렉션으로 보여준다.

---

## 주요 기능

- 🗺️ **지도 탐색** — 카카오 지도 위 샵 핀(카테고리별 색), 클러스터링
- 📋 **바텀시트 리스트** — 드래그로 지도 ↔ 목록 전환
- 🎞️ **컬렉션** — 이벤트·할인 / 첫방문특가 / 가격대(1·2만원대) / 리뷰 많은 샵 (가로 스크롤)
- 🔎 **필터** — 분야 · 가격대 · 혜택 · 예약가능 복합 필터
- 🏪 **샵 상세** — 대표/홍보/메뉴/리뷰 사진, 영업시간, 메뉴·가격, 방문자 리뷰, 인스타
- 📅 **예약 루트** — 네이버 예약 / 톡톡 / 카카오 / 인스타 / 전화 (샵별 가능한 채널)
- 🔔 **취소석 알림 사전등록** — 빈자리 매칭 서비스 출시 알림(전화번호)
- 📊 **클릭 집계** — 핀/카드/상세/예약 클릭 이벤트 트래킹

## 아키텍처

**DDD-lite + 헥사고날(클린아키텍처) + 읽기/쓰기 분리(CQRS-lite).** 자세한 규칙은 [`ARCHITECTURE.md`](./ARCHITECTURE.md).

```
src/
├─ contexts/              # 독립 도메인 (bounded contexts) — 서로 직접 import 금지
│  ├─ catalog/            # 🔵 샵 탐색·필터·상세·컬렉션 (읽기측, Query)
│  ├─ analytics/          # 🟢 클릭/노출 이벤트 (쓰기 + 읽기)
│  ├─ lead/               # 🟡 취소석 전화번호 등록 (쓰기)
│  └─ reservation/        # ⛔ 예약/슬롯 — 포트만, 구현은 추후 AWS 백엔드
├─ shared/                # 공통 커널 (값객체·플랫폼 어댑터·공통 UI)
└─ app/                   # 조립(composition-root) + 라우팅
```

각 컨텍스트는 4겹 레이어:

```
ui → application → domain
            │
            ▼
          ports ◀── infrastructure (어댑터)
```

- `domain/` — 순수 비즈니스 로직. React·fetch·DB **import 금지**.
- `application/` — 유스케이스. 포트로만 도메인 오케스트레이션.
- `ports/` — 인터페이스(의존성 역전 경계).
- `infrastructure/` — 어댑터. 외부 의존(fetch/JSON/SDK)은 **여기만**.
- 조립은 [`src/app/composition-root.ts`](./src/app/composition-root.ts) 한 곳에서 포트↔어댑터를 연결.

> **예약/슬롯 도메인은 지금 포트만 있다.** 앱은 실시간으로 네이버를 호출하지 않는다. 추후 AWS 백엔드가
> 매일 00시 배치로 다음날 슬롯을 미리 계산해 저장하면, `SlotProvider` 어댑터 하나를 주입하는 것으로 붙는다.

## 데이터 (read model)

앱은 외부 API를 실시간 호출하지 않고, 미리 만들어진 **정적 read model**만 읽는다 (CQRS 읽기측).

- `public/data/shops.summary.json` — 전체 요약(지도/리스트/컬렉션용)
- `public/data/details/<id>.json` — 가게별 상세(상세 진입 시 지연 로딩)

read model은 원본 상세 데이터에서 파생필드(가격대·첫방문할인·이벤트·예약루트)를 계산해 생성한다:

```bash
python tools/build_read_model.py   # 원본 상세 JSON → public/data/*
```

> 원본 수집 데이터(`seoul_shops_detailed.json`)는 용량이 커 이 레포에 포함하지 않는다.
> read model 산출물만 커밋되어 있어 그대로 빌드/배포된다.

## 개발

```bash
npm install
npm run dev:web      # 일반 웹(Vercel 타깃) 개발 서버 — vite dev
npm run dev          # 앱인토스(granite) 개발
npm run build:web    # Vercel 빌드 (VITE_TARGET=vercel vite build)
npm run build        # 앱인토스 빌드 (ait build)
```

### 카카오 지도 키

지도는 카카오 JS 키를 쓴다(`VITE_KAKAO_KEY` env 우선, 없으면 fallback). **JS 키는 도메인 제한**이라
배포 도메인을 [카카오 디벨로퍼 콘솔](https://developers.kakao.com)의 사이트 도메인 화이트리스트에 추가해야
지도가 렌더된다. (localhost / 배포 도메인 각각 등록)

## 배포 (Vercel)

`vercel.json` 포함. Vercel에 이 레포를 연결하면 `VITE_TARGET=vercel vite build`로 빌드된다.
`/data/*`는 SPA 리라이트에서 제외돼 정적 JSON으로 서빙된다.

> 클릭집계(`/api/track`)·전화등록(`/api/submit`)은 별도 백엔드(themuselab.kr)로 전송한다.

## 로드맵

- [ ] 예약/슬롯 도메인 — AWS 백엔드(매일 00시 배치) + `SlotProvider` 어댑터, "맞춤 시간 찾기" 활성화
- [ ] details read model 샤딩(7,635 파일 → 버킷)으로 경량화
- [ ] TDS(토스 디자인 시스템) 컴포넌트로 UI 정식화
- [ ] 파트너 샵 강조 레이어
