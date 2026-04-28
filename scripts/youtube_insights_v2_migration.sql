-- youtube_insights 고도화 컬럼 추가
ALTER TABLE youtube_insights
  ADD COLUMN IF NOT EXISTS market_narrative TEXT,
  ADD COLUMN IF NOT EXISTS key_stocks_analysis TEXT,
  ADD COLUMN IF NOT EXISTS key_events TEXT;
