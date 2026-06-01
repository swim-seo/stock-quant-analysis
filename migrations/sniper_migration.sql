-- 스나이퍼 포지션 추적 테이블
CREATE TABLE IF NOT EXISTS sniper_positions (
    id           BIGSERIAL PRIMARY KEY,
    period       TEXT NOT NULL,
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
    max_price    NUMERIC,               -- 보유 중 최고가 (트레일링 스탑용)
    exit_label   TEXT,                  -- 현재 매도 신호: '🟢 보유' | '⚠️ 촉매 약화' | '🔴 매도 신호'
    exit_price   NUMERIC,
    exit_date    DATE,
    pnl_pct      NUMERIC,
    pnl_amount   NUMERIC,
    exit_reason  TEXT,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sniper_period_status
    ON sniper_positions (period, status);
