-- theme_signals 전체 생성 (테이블 + 모든 컬럼 + RLS)
-- 기존 fix_theme_signals_rls.sql / add_theme_signals_source_types.sql 대신 이거 하나만 실행
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS theme_signals (
  id               BIGSERIAL PRIMARY KEY,
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  theme_name       TEXT NOT NULL,
  keywords         TEXT[] DEFAULT '{}',
  related_stocks   TEXT[] DEFAULT '{}',
  reason           TEXT,
  urgency          TEXT DEFAULT '이번주',
  source_headlines TEXT[] DEFAULT '{}',
  -- 하이브리드 (뉴스 + 유튜브)
  source_types     TEXT[] DEFAULT '{}',
  confidence_score NUMERIC(5,2),
  source_youtube   TEXT[] DEFAULT '{}'
);

-- 기존 테이블이 있을 경우 누락 컬럼 보강
ALTER TABLE theme_signals
  ADD COLUMN IF NOT EXISTS source_types     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS source_youtube   TEXT[] DEFAULT '{}';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_theme_signals_scanned_at   ON theme_signals(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_theme_signals_source_types ON theme_signals USING GIN (source_types);

-- RLS public read
ALTER TABLE theme_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON theme_signals;
CREATE POLICY "public read" ON theme_signals FOR SELECT USING (true);
