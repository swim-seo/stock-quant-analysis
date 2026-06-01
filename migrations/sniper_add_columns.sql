-- 기존 sniper_positions 테이블에 누락 컬럼 추가 (이미 있으면 무시)
ALTER TABLE sniper_positions
  ADD COLUMN IF NOT EXISTS max_price           NUMERIC,
  ADD COLUMN IF NOT EXISTS exit_label          TEXT,
  ADD COLUMN IF NOT EXISTS partial_exit_done   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS partial_exit_price  NUMERIC,
  ADD COLUMN IF NOT EXISTS partial_exit_date   DATE;
