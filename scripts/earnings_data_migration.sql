-- 분기 실적 데이터 컬럼 추가
ALTER TABLE stock_news ADD COLUMN IF NOT EXISTS earnings_data JSONB;
