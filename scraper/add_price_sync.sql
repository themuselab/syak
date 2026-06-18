-- 가격 롤링 동기화용 — 샵별 '마지막 가격 확인 시각'.
-- price_sync.py가 가장 오래된 것부터 갱신하며 now()로 도장 → 큐처럼 순환.
-- 한 번만 실행. 기존 행은 NULL(=아직 안 봄)이라 큐 맨 앞에서 먼저 처리됨.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS price_synced_at timestamptz;
CREATE INDEX IF NOT EXISTS shops_price_synced_idx ON shops (price_synced_at ASC NULLS FIRST);
