-- KIS OHLCV 일봉 데이터 저장 테이블
-- Railway 크론이 매일 수집해서 저장

CREATE TABLE IF NOT EXISTS stock_prices (
    id          BIGSERIAL PRIMARY KEY,
    ticker      TEXT NOT NULL,           -- e.g. '005930.KS'
    stock_name  TEXT,
    trade_date  DATE NOT NULL,
    open        INTEGER,
    high        INTEGER,
    low         INTEGER,
    close       INTEGER NOT NULL,
    volume      BIGINT,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ticker, trade_date)
);

-- 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_stock_prices_ticker_date
    ON stock_prices (ticker, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_prices_date
    ON stock_prices (trade_date DESC);
