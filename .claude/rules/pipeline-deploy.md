---
paths:
  - "**/scraper/**/*.py"
  - "**/.github/workflows/**"
  - "**/api/**"
  - "**/vercel.json"
  - "**/granite.config.ts"
---
# 수집과 배포

- 수집은 기존 GitHub Actions 배치를 따른다. 실데이터 수집을 검증용으로 반복 실행하지 말고 관련 파서·샘플로 확인한다.
- 백엔드 `/internal/*` 계약, 키, 데이터 정합성과 재실행 시 중복 처리를 확인한다.
- SEO·sitemap·RSS 함수의 경로와 생성 데이터 형식을 함께 검토한다.
- Vercel 웹 빌드와 `ait build`·`ait deploy`를 구분한다. 배포 요청의 프로젝트·팀·환경을 확인한다.
