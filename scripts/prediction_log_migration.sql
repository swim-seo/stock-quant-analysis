-- 예측 로그 테이블 (Option B: 실시간 적중률 추적)
CREATE TABLE IF NOT EXISTS prediction_log (
  date        DATE    NOT NULL,
  ticker      TEXT    NOT NULL,
  predicted_up BOOLEAN NOT NULL,
  probability  REAL    NOT NULL,
  actual_up    BOOLEAN,           -- 다음날 실제 결과 (처음엔 NULL)
  correct      BOOLEAN,           -- actual_up 업데이트 시 계산
  PRIMARY KEY (date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_prediction_log_ticker ON prediction_log(ticker);
CREATE INDEX IF NOT EXISTS idx_prediction_log_date   ON prediction_log(date DESC);

ALTER TABLE prediction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read"   ON prediction_log FOR SELECT USING (true);
CREATE POLICY "anon insert" ON prediction_log FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update" ON prediction_log FOR UPDATE USING (true);
