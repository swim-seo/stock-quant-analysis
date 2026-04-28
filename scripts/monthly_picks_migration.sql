-- 월급투자 에이전트 추적 테이블
CREATE TABLE IF NOT EXISTS monthly_picks (
    id               SERIAL PRIMARY KEY,
    pick_month       TEXT NOT NULL UNIQUE,   -- 'YYYY-MM' (월별 1건)
    stock_name       TEXT NOT NULL,
    stock_code       TEXT NOT NULL,
    score            REAL,
    win_rate         REAL,
    avg_return       REAL,
    buy_date         TEXT,                   -- 'YYYYMMDD'
    buy_price        REAL,
    target_price     REAL,                   -- buy_price * 1.05
    sell_date        TEXT,
    sell_price       REAL,
    final_return_pct REAL,
    status           TEXT DEFAULT 'active',  -- active | closed
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_picks_status
    ON monthly_picks (status, created_at DESC);
