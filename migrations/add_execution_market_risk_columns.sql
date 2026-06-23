-- Comprehensive migration: execution signal, market risk, position sizing, trade type, data freshness
-- Safe to re-run (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS)

-- ── trade_signals: 실행 신호 ──────────────────────────────────────────────────
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS execution_signal   VARCHAR(20);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS execution_reason   TEXT;

-- ── trade_signals: 시장 위험도 ──────────────────────────────────────────────
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS market_risk_level   VARCHAR(20);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS market_risk_score   NUMERIC(5,2);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS market_risk_reasons JSONB DEFAULT '[]';

-- ── trade_signals: 포지션 크기 / 손익 기준 ────────────────────────────────
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS suggested_position_pct NUMERIC(5,2);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS take_profit_pct        NUMERIC(5,2);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS stop_loss_pct          NUMERIC(5,2);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS max_holding_days       INTEGER;

-- ── trade_signals: 매매 유형 / 데이터 신선도 ──────────────────────────────
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS trade_type            VARCHAR(20);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS data_freshness_score  NUMERIC(5,2);
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS stale_components      JSONB DEFAULT '[]';

-- ── market_regime CHECK 제약 수정 (STRONG_BULL / STRONG_BEAR 허용) ─────────
ALTER TABLE trade_signals DROP CONSTRAINT IF EXISTS trade_signals_market_regime_check;
ALTER TABLE trade_signals
  ADD CONSTRAINT trade_signals_market_regime_check
  CHECK (market_regime IN ('STRONG_BULL', 'BULL', 'NEUTRAL', 'BEAR', 'STRONG_BEAR'));

-- ── execution_signal CHECK 제약 ───────────────────────────────────────────
ALTER TABLE trade_signals DROP CONSTRAINT IF EXISTS trade_signals_execution_signal_check;
ALTER TABLE trade_signals
  ADD CONSTRAINT trade_signals_execution_signal_check
  CHECK (execution_signal IS NULL OR
         execution_signal IN ('BUY_OK', 'BUY_SMALL', 'WATCH', 'BLOCKED', 'HOLD', 'REDUCE'));

-- ── trade_type CHECK 제약 ─────────────────────────────────────────────────
ALTER TABLE trade_signals DROP CONSTRAINT IF EXISTS trade_signals_trade_type_check;
ALTER TABLE trade_signals
  ADD CONSTRAINT trade_signals_trade_type_check
  CHECK (trade_type IS NULL OR
         trade_type IN ('SNIPER', 'SWING', 'LONG_TERM', 'WATCH'));

-- ── 인덱스 ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trade_signals_execution_signal ON trade_signals(execution_signal);
CREATE INDEX IF NOT EXISTS idx_trade_signals_market_risk      ON trade_signals(market_risk_level);
CREATE INDEX IF NOT EXISTS idx_trade_signals_trade_type       ON trade_signals(trade_type);

-- ── morning_briefing: 시장 위험도 / 행동 가이드 ───────────────────────────
ALTER TABLE morning_briefing ADD COLUMN IF NOT EXISTS market_risk_level   VARCHAR(20);
ALTER TABLE morning_briefing ADD COLUMN IF NOT EXISTS market_risk_score   NUMERIC(5,2);
ALTER TABLE morning_briefing ADD COLUMN IF NOT EXISTS market_risk_reasons JSONB DEFAULT '[]';
ALTER TABLE morning_briefing ADD COLUMN IF NOT EXISTS action_guide        JSONB DEFAULT '{}';
