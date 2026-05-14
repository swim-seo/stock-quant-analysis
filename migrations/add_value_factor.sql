-- factor_scores에 가치 팩터 컬럼 추가
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE factor_scores
  ADD COLUMN IF NOT EXISTS pbr     FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS z_value FLOAT DEFAULT NULL;
