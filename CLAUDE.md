# Syak 소비자 웹·Apps-in-Toss

독립 레포 `themuselab/syak`. React 18 / TypeScript / Vite / TDS / Emotion. `scraper/`는 Python 수집기, `api/`는 Vercel 서버 함수다.

- 웹 개발: `npm run dev:web`. Toss 개발: `npm run dev`.
- 검증: `npm run lint`, `npm run build` (Toss). 웹은 `npm run build:web` (POSIX); Windows에서는 루트 `node .claude/scripts/workspace.cjs check web`을 사용한다.
- 포맷: `npm run format`은 전체를 수정하므로 범위를 확인하고 실행한다.
- 아키텍처는 `ARCHITECTURE.md`, 최근 데이터 흐름은 README·실제 어댑터·`.github/workflows/`를 확인한다. Supabase에서 RDS/API로 이전한 기록과 현재 구현을 구분한다.
- `src/contexts/` 도메인 경계를 유지하고 `src/app/composition-root.ts`에서 어댑터를 조립한다.
- 웹·Toss의 플랫폼별 동작과 Vercel 함수/SEO를 구분해서 검증한다. `npm run deploy`는 실제 Toss 배포다.
- `.claude/rules/`에 아키텍처와 수집·배포 규칙을 분리했다. 전체 지도는 `../CLAUDE.md`.

공통 MCP·명령·훅은 상위 `syak/`에서 Claude Code를 실행해 사용한다.
