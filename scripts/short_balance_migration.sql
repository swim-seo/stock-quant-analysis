-- 공매도 잔고 데이터 컬럼 추가
ALTER TABLE stock_news ADD COLUMN IF NOT EXISTS short_data JSONB;
