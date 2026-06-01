-- KIS API access token cache (24h TTL)
-- Run this in Supabase SQL editor before using kis_fetcher.py

CREATE TABLE IF NOT EXISTS kis_token (
    mode        TEXT PRIMARY KEY,           -- 'real' | 'paper'
    token       TEXT NOT NULL,
    token_type  TEXT NOT NULL DEFAULT 'Bearer',
    issued_at   TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL
);

-- sector index snapshot (updated by railway cron)
CREATE TABLE IF NOT EXISTS sector_index (
    id              SERIAL PRIMARY KEY,
    sector_code     TEXT NOT NULL,
    sector_name     TEXT NOT NULL,
    current_index   NUMERIC,
    change_pct      NUMERIC,
    volume          BIGINT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sector_code)
);

-- sector index history (5-week trend)
CREATE TABLE IF NOT EXISTS sector_index_history (
    id          SERIAL PRIMARY KEY,
    sector_code TEXT NOT NULL,
    trade_date  DATE NOT NULL,
    open_index  NUMERIC,
    high_index  NUMERIC,
    low_index   NUMERIC,
    close_index NUMERIC,
    volume      BIGINT,
    UNIQUE (sector_code, trade_date)
);
