-- prediction_log에 복합 점수 컬럼 추가
ALTER TABLE prediction_log
  ADD COLUMN IF NOT EXISTS tech_score REAL,
  ADD COLUMN IF NOT EXISTS ml_score REAL,
  ADD COLUMN IF NOT EXISTS news_score REAL,
  ADD COLUMN IF NOT EXISTS yt_score REAL,
  ADD COLUMN IF NOT EXISTS composite_score REAL;

-- 복합 점수 기준 인덱스 (포트폴리오 신호 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_prediction_log_composite
  ON prediction_log (date DESC, composite_score DESC NULLS LAST);
