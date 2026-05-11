-- morning_briefing 테이블에 top_trade_signals 컬럼 추가
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE morning_briefing
  ADD COLUMN IF NOT EXISTS top_trade_signals TEXT DEFAULT '[]';
