-- Market risk filter columns
-- Adds execution_signal (실전 행동 신호) separate from existing signal (종목 자체 점수)

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS market_risk_level  VARCHAR(20)
    CHECK (market_risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'EXTREME'));

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS market_risk_score  NUMERIC(5,2);

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS market_risk_reasons JSONB DEFAULT '[]';

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS execution_signal   VARCHAR(20)
    CHECK (execution_signal IN ('BUY_OK', 'BUY_SMALL', 'WATCH', 'BLOCKED', 'HOLD', 'REDUCE'));

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS execution_reason   TEXT;

ALTER TABLE morning_briefing
ADD COLUMN IF NOT EXISTS market_risk_level  VARCHAR(20);

ALTER TABLE morning_briefing
ADD COLUMN IF NOT EXISTS market_risk_score  NUMERIC(5,2);

ALTER TABLE morning_briefing
ADD COLUMN IF NOT EXISTS market_risk_reasons JSONB DEFAULT '[]';

ALTER TABLE morning_briefing
ADD COLUMN IF NOT EXISTS action_guide       JSONB DEFAULT '{}';
