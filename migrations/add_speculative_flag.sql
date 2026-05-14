-- factor_scores에 투기주 플래그 컬럼 추가
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE factor_scores
  ADD COLUMN IF NOT EXISTS is_speculative    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS speculative_reason TEXT    DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_factor_scores_speculative
  ON factor_scores (is_speculative);
