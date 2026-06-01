-- 스나이퍼 포지션 추적 테이블
CREATE TABLE IF NOT EXISTS sniper_positions (
    id           BIGSERIAL PRIMARY KEY,
    period       TEXT NOT NULL,          -- '2026-06 스나이퍼 (6월25일~7월10일)'
    stock_name   TEXT NOT NULL,
    stock_code   TEXT NOT NULL,
    entry_date   DATE NOT NULL,
    entry_price  NUMERIC NOT NULL,
    shares       INTEGER NOT NULL,
    cost         NUMERIC,
    status       TEXT DEFAULT 'open',    -- 'open' | 'closed'
    signal_score NUMERIC,
    news_score   NUMERIC,
    yt_score     NUMERIC,
    exit_price   NUMERIC,
    exit_date    DATE,
    pnl_pct      NUMERIC,
    pnl_amount   NUMERIC,
    exit_reason  TEXT,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sniper_period_status
    ON sniper_positions (period, status);
