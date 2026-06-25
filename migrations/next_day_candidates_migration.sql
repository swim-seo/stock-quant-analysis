-- next_day_candidates: 전일 종가 버팀 기반 다음날 매수 후보 테이블
-- signal_date: 후보를 생성한 날짜 (종가 기준일)
-- target_date: 실제 매수 고려 날짜 (다음 거래일)
-- status: PENDING → APPROVED/REJECTED (아침 승인 후), ENTERED (진입 기록)

create table if not exists next_day_candidates (
  id bigserial primary key,
  signal_date date not null,
  target_date date not null,
  ticker text not null,
  stock_name text,
  close_price numeric,
  after_hours_price numeric,
  close_hold_score numeric,
  next_day_score numeric,
  reason text[],
  risk_flags text[],
  status text default 'PENDING',
  final_execution_signal text,
  rejection_reason text,
  created_at timestamptz default now(),
  approved_at timestamptz,
  unique(signal_date, ticker)
);

create index if not exists idx_next_day_candidates_target_date
  on next_day_candidates(target_date, status);

create index if not exists idx_next_day_candidates_signal_date
  on next_day_candidates(signal_date);
