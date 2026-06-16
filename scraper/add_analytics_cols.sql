-- GA4식 리포트용 컬럼 추가 (events 테이블)
-- device: pc | ios | android  /  client_id: 영속 방문자 id(순방문자·리텐션)
-- 한 번만 실행. 기존 행은 NULL로 남고, 지금부터 들어오는 이벤트에 채워진다.
ALTER TABLE events ADD COLUMN IF NOT EXISTS device text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id text;
CREATE INDEX IF NOT EXISTS events_client_id_idx ON events (client_id);
