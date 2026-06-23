-- Position sizing & risk management columns for trade_signals
-- suggested_position_pct: % of available budget to allocate (e.g. 25 = 25%)
-- take_profit_pct: target gain % (e.g. 10 = +10%)
-- stop_loss_pct: max loss % stored as positive (e.g. 6 = -6%)
-- max_holding_days: maximum trading days to hold before forced exit

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS suggested_position_pct NUMERIC(5,2);

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS take_profit_pct NUMERIC(5,2);

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS stop_loss_pct NUMERIC(5,2);

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS max_holding_days INT;
