-- 부분 익절 추적 컬럼 추가
ALTER TABLE sniper_positions
  ADD COLUMN IF NOT EXISTS partial_exit_done  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS partial_exit_price NUMERIC,
  ADD COLUMN IF NOT EXISTS partial_exit_date  DATE;
