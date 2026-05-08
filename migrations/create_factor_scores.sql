-- factor_scores 테이블 생성
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS factor_scores (
  id               SERIAL PRIMARY KEY,
  ticker           VARCHAR(20)  NOT NULL,
  stock_name       VARCHAR(100),
  sector           VARCHAR(50),
  calculated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- 순위
  rank_total       INT,
  composite_score  FLOAT,

  -- 원시 팩터 값
  momentum_3m          FLOAT,
  momentum_6m          FLOAT,
  momentum_12m         FLOAT,
  relative_strength_3m FLOAT,
  volatility_20d       FLOAT,
  volatility_60d       FLOAT,
  foreign_flow_5d      BIGINT,
  foreign_flow_20d     BIGINT,
  institution_flow_5d  BIGINT,
  institution_flow_20d BIGINT,

  -- 정규화 z-score
  z_momentum   FLOAT,
  z_rs         FLOAT,
  z_volatility FLOAT,
  z_flow       FLOAT,

  UNIQUE (ticker)
);

-- 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_factor_scores_composite ON factor_scores (composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_factor_scores_sector     ON factor_scores (sector);
CREATE INDEX IF NOT EXISTS idx_factor_scores_calc       ON factor_scores (calculated_at DESC);

-- Row Level Security (읽기 허용)
ALTER TABLE factor_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON factor_scores;
CREATE POLICY "public read" ON factor_scores FOR SELECT USING (true);
