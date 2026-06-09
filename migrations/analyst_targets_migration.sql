-- 증권사 목표주가 테이블
-- news_collector.py가 Naver 뉴스에서 Claude로 파싱해 저장

CREATE TABLE IF NOT EXISTS analyst_targets (
    id          BIGSERIAL PRIMARY KEY,
    stock_code  TEXT NOT NULL,
    firm_name   TEXT NOT NULL,
    target_price INTEGER NOT NULL,
    current_price INTEGER,
    upside_pct  NUMERIC(6,2),
    direction   TEXT CHECK (direction IN ('상향', '하향', '유지', '신규')),
    rating      TEXT,
    report_date DATE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (stock_code, firm_name, report_date)
);

CREATE INDEX IF NOT EXISTS idx_analyst_targets_stock_date
    ON analyst_targets (stock_code, report_date DESC);

-- trade_signals 에 analyst_score 컬럼 추가
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS analyst_score NUMERIC(6,2);
