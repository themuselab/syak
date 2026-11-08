---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "web/src/**/*.ts"
  - "web/src/**/*.tsx"
---
# 웹 아키텍처

- `ARCHITECTURE.md`의 DDD-lite·헥사고날 경계를 따른다. 컨텍스트끼리 직접 import하지 않고 app에서 연결한다.
- domain은 순수 타입·함수만, application은 domain과 ports에 의존한다. 네트워크·SDK·스토리지는 infrastructure로 격리한다.
- 포트와 어댑터의 연결은 `src/app/composition-root.ts`에서 한다.
- 데이터 저장소 설명이 과거 문서와 다르면 현재 어댑터와 백엔드 계약을 확인한다. 브라우저가 수집기를 직접 호출하지 않는다.
- 웹과 Apps-in-Toss 환경 차이는 기존 플랫폼 어댑터를 통해 처리한다.
