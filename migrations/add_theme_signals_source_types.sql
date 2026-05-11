-- theme_signals 테이블 확장: RSS+YouTube 하이브리드 소스 추적
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE theme_signals
  ADD COLUMN IF NOT EXISTS source_types     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS source_youtube   TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_theme_signals_source_types ON theme_signals USING GIN (source_types);

-- 기존 fix_theme_signals_rls.sql 의 정책이 이미 실행되었다면 아래는 건너뜀
ALTER TABLE theme_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON theme_signals;
CREATE POLICY "public read" ON theme_signals FOR SELECT USING (true);
