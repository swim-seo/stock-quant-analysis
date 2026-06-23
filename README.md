# 한국 주식 AI 분석 시스템

기술적 분석 + 퀀트 팩터 + ML 예측 + 유튜브 전문가 인사이트 + 실시간 웹검색을 통합한 한국 주식 의사결정 지원 시스템.

배포: **https://web-beryl-eight-90.vercel.app**

---

## 핵심 기능

### AI 투자 채팅 (`/chat`)
Claude 기반 주식 투자 상담 챗봇. 종목 질문과 시장 전반 질문 모두 대응.

- **종목 분석**: 질문에서 종목명 자동 감지 → `trade_signals` + 주가·뉴스·유튜브·증권사 목표가 병렬 조회
- **실행 신호 해석**: `execution_signal` (BUY_OK/BUY_SMALL/WATCH/BLOCKED) + 시장 위험도 + 포지션 크기를 컨텍스트로 주입 → "BUY인데 사도 돼?"에 정확하게 답변
- **시장 전반 질문 대응**: 코스피 급락·금리·환율 등 매크로 질문 시 Tavily 실시간 웹검색 결과를 컨텍스트로 주입
- **세션 메모리**: 팔로업 질문 시 이전 종목 컨텍스트 유지 (`X-Detected-Ticker` 헤더)
- **섹터 피어 비교**: 종목 데이터 없을 때 같은 섹터 관련종목으로 자동 추론
- **데이터 새로고침 버튼**: KIS API 주가·팩터·신호 재계산 (Claude 토큰 미사용)

### 매매 신호 센터 (`/signals`)
종목별 2단계 신호. Stage 1 = 종목 품질, Stage 2 = 오늘 실행 가능 여부.

**복합점수 구조: 퀀트 품질(40%) × 타이밍(60%)**

| 컴포넌트 | 비중 | 세부 |
|----------|------|------|
| 퀀트 팩터 (Quality) | **40%** | factor_scores — 모멘텀·상대강도·저변동성·수급 z-score |
| 기술적 점수 (Tech) | **30%** | MA 정배열·RSI·MACD·골든크로스·거래량·ADX·OBV |
| 뉴스 감성 (News) | **13%** | 종목 뉴스 sentiment + trading_signal + news_impact_score |
| 유튜브 감성 (YT) | **11%** | 전문가 언급 빈도 + 시장 감성 + investment_signals |
| 증권사 목표가 (Analyst) | **6%** | 현재가 대비 목표가 upside/downside |

※ Timing 내부 비중: tech 50% / news 22% / yt 18% / analyst 10%

**실행 신호 (Execution Signal)** — 상위 시장 필터 적용 후 오늘 실제 행동:

| 값 | 의미 |
|----|------|
| `BUY_OK` | 매수 가능 (포지션 25%) |
| `BUY_SMALL` | 소량 매수 (포지션 10%) |
| `WATCH` | 관망 — 종목은 좋지만 시장 위험 |
| `BLOCKED` | 진입 금지 — 시장 위험도 EXTREME |
| `HOLD` / `REDUCE` | 기존 보유분 유지/축소 |

**시장 위험도 (Market Risk)** — SOX·나스닥·원달러·NVDA·KOSPI 기준:
- `LOW / MEDIUM` → 정상 매수 가능
- `HIGH` → 포지션 축소, 손절 -5%로 타이트
- `EXTREME` → 신규 매수 전면 차단

**포지션 자동 계산**:
- 익절 +10% / 손절: LOW-MEDIUM -6%, HIGH -5%, EXTREME -4%
- 최대 보유 기간: HIGH/EXTREME 7일, 고점수 15일, 기본 10일

**트레이드 유형 (Trade Type)**:
- `SNIPER` — 퀄리티 A + 타이밍≥75 + BUY_OK (단기 집중)
- `SWING` — BUY 신호 + BULL 시장
- `LONG_TERM` — BUY 신호 + NEUTRAL 시장
- `WATCH` — 관망 중

추가 로직:
- **시장 국면 5단계**: STRONG_BULL / BULL / NEUTRAL / BEAR / STRONG_BEAR (4개 지표 히스테리시스)
- **외국인·기관 수급 boost**: 연속 매수/매도 스트릭에 따라 ±18점
- **데이터 신선도 점수**: 주가·팩터·뉴스·유튜브·목표가 미수신 시 페널티
- **섹터 집중 경고**: 동일 섹터 BUY_OK 3개 이상 시 배너 표시

### 퀀트 스크리너 (`/screener`)
~158개 종목을 멀티팩터 z-score로 랭킹.

- **팩터 비중**: 모멘텀(40%) + 상대강도(25%) + 저변동성(15%) + 수급(20%)
- 섹터 필터, 컬럼 정렬, 외국인·기관 연속 수급 스트릭 표시
- 행 클릭 시 팩터 상세 확장

### 스나이퍼 전략 (`/sniper`)
월 25일~다음달 10일 집중 매수 구간 종목 선별.

- BUY 신호 상위 종목 + 오늘 호재 뉴스 `has_catalyst` 뱃지
- 포지션 관리, 실현 PnL, 누적 수익률 차트
- `sniper_positions` 테이블에 진입·청산 이력 누적

### 오늘의 뉴스 & 유튜브 주목 테마 (대시보드)
RSS 4개 매체(네이버·연합·한경·매경) + 유튜브 인사이트 48h를 Claude에 전달해 테마 7개 추출.

- **출처 배지**: 📰+📺 양쪽 / 📺 유튜브 / 📰 뉴스
- **신뢰도 점수**: 양쪽 모두 등장 시 자동 부스트
- **ticker_aliases 검증**: Claude 생성 종목명을 ~227개 매핑 테이블로 사후 필터링 (환각 방지)
- RSS 실패 시 유튜브 단독 자동 fallback

### 종목 차트 분석 (`/stock?ticker=...`)
- 캔들스틱 + MA5/20/60 + RSI + MACD + 볼린저밴드 + 거래량
- 진입 신호 5조건 판단 (정배열·골든크로스·RSI·주봉추세·거래량) → 🟢/🟡/🔴
- ML 모델 예측 (XGBoost + LightGBM 앙상블, 31개 피처, ~51–52% 정확도)
- 종목별 뉴스, 유튜브 언급, 외국인·기관 수급, 증권사 목표가
- ML 예측 적중률 추적 (`prediction_log` 누적)

### 가상 투자 시뮬레이션 (`/portfolio`)
- 매매 신호 기반 매수/매도 시뮬레이션
- 일별 수익률, 벤치마크(KOSPI) 대비 초과수익 추적
- `portfolio_signals` 테이블에 누적 저장

### 모닝 브리핑 (`/briefing`)
매일 아침 Claude가 자동 생성:
- **시장 위험도 카드**: 색상별 배너 (LOW → 초록 / EXTREME → 빨강) + 위험 이유
- 시장 요약 + 오늘 주목 종목 TOP5
- 섹터 전망, 전문가 종합 의견, 리스크 경고
- BUY 신호 TOP5 (매매 신호 시스템 연동)

### 공포탐욕 지수 (대시보드 카드)
한국판 5컴포넌트 (100점 만점):
- KOSPI 변동성 / KOSPI 모멘텀 / 거래량 모멘텀
- 미국 CNN F&G 연동 / 유튜브 시장 감성

### BUY_OK 전환 이메일 알림
`signal_aggregator.py` 실행 후 WATCH/BLOCKED → BUY_OK/BUY_SMALL로 전환된 종목이 있으면 Gmail 자동 발송.
- 종목명, 섹터, 시장 위험도, 포지션 크기, 익절/손절 가격 포함

### 파이프라인 알림
`pipeline_alerts` 테이블에서 수집 실패·Claude 호출 오류 등을 자동 감지·표시. 2회 재시도 후 Claude가 원인 진단.

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│ Railway (Python collectors, cron 0 22,7 * * * UTC)              │
│   ├─ news_collector.py         → stock_news                     │
│   ├─ youtube_collector.py      → youtube_insights + ChromaDB    │
│   ├─ theme_scanner.py          → theme_signals (RSS+YT 혼합)    │
│   ├─ factor_calculator.py      → factor_scores                  │
│   ├─ market_risk_filter.py     → (라이브러리) 시장 위험도 계산   │
│   ├─ signal_aggregator.py      → trade_signals + prediction_log │
│   │                               + signal_performance (진입)   │
│   ├─ signal_performance_tracker.py → signal_performance (성과)  │
│   ├─ morning_briefing.py       → morning_briefing               │
│   └─ trigger_server.py         → 수동 트리거 HTTP API           │
│         POST /trigger {mode: morning|afternoon|all|prices}      │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
              Supabase (PostgreSQL, public_read RLS)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Vercel (Next.js web)                                            │
│   /, /chat, /stock, /signals, /screener,                        │
│   /briefing, /portfolio, /sniper, /search, /guide              │
│                                                                 │
│   /api/chat → Anthropic Claude + Tavily 웹검색                  │
│   /api/trigger-pipeline → Railway trigger-server 프록시         │
│   /api/watchlist → 관심종목 CRUD                                │
└─────────────────────────────────────────────────────────────────┘
```

**원칙**: Supabase가 유일한 데이터 허브. Python은 쓰기만, Next.js는 읽기만 (trigger-pipeline은 예외).

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js + TypeScript |
| Backend collectors | Python 3.12+, yfinance, anthropic, supabase-py |
| DB | Supabase (PostgreSQL) — RLS 활성화 |
| Vector DB | ChromaDB + KR-SBERT |
| ML | XGBoost + LightGBM 앙상블 |
| AI | Claude API (claude-sonnet-4-6) |
| 실시간 검색 | Tavily Search API (매크로 질문 시 웹검색) |
| 배포 | Vercel (web) + Railway (collectors, trigger-server) |

---

## 주요 Supabase 테이블

| 테이블 | Writer | 핵심 컬럼 |
|--------|--------|-----------|
| `stock_news` | news_collector.py | sentiment, trading_signal, news_impact_score, investor_data |
| `youtube_insights` | youtube_collector.py | market_sentiment, key_stocks[], investment_signals, urgency, trading_type |
| `theme_signals` | theme_scanner.py | theme_name, source_types[], confidence_score, related_stocks[] |
| `factor_scores` | factor_calculator.py | composite_score, z_momentum/rs/volatility/flow |
| `trade_signals` | signal_aggregator.py | signal, execution_signal, market_risk_level/score, suggested_position_pct, take_profit_pct, stop_loss_pct, max_holding_days, trade_type, data_freshness_score, market_regime, composite_score |
| `signal_performance` | signal_aggregator.py / tracker | signal_date, entry_price, close_5d, close_10d, return_5d, return_10d, hit_take_profit, hit_stop_loss |
| `analyst_targets` | news_collector.py | firm_name, target_price, upside_pct, direction, report_date |
| `stock_prices` | data_collector.py | ticker, trade_date, open, close, volume |
| `sniper_positions` | (수동/신호) | ticker, entry_price, shares, pnl_pct, status |
| `prediction_log` | railway_job.py | predicted_up, probability, tech/yt/news/composite_score, actual_up, correct |
| `portfolio_signals` | railway_job.py | signal_date, entry_price, return_pct, status |
| `morning_briefing` | morning_briefing.py | market_summary, top_stocks, market_risk_level/score, action_guide |
| `watchlist` | web/api/watchlist | user_id, ticker, stock_name, added_at |
| `pipeline_alerts` | agent_supervisor.py | step, diagnosis, resolved |
| `ticker_aliases` | (마이그레이션) | 한글 종목명·별칭 → ticker 매핑 (~227개) |

모든 테이블에 `public read` RLS 정책 적용.

---

## 로컬 실행

### Web (Next.js)
```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm run build && npm run lint
```

### Python collectors
```bash
# Railway 환경변수 사용 (로컬 .env 없는 경우)
railway run python3 signal_aggregator.py
railway run python3 factor_calculator.py

# 통합 파이프라인 (Railway가 매일 자동 실행하는 것과 동일)
python3 agent_supervisor.py morning    # 07:00 KST: 뉴스+유튜브+팩터+신호+브리핑
python3 agent_supervisor.py afternoon  # 16:00 KST: 뉴스+유튜브 갱신
python3 agent_supervisor.py prices     # 주가+팩터+신호만 (Claude 토큰 미사용)
```

### Trigger server (수동 트리거)
```bash
export TRIGGER_SECRET=your-secret-here
python3 trigger_server.py              # :8080
```

---

## 환경 변수

| 변수 | 위치 | 용도 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Railway / Vercel | Claude API |
| `SUPABASE_URL` / `SUPABASE_KEY` | Railway / 로컬 | service-role key (쓰기) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | anon key (읽기 전용) |
| `YOUTUBE_API_KEY` | Railway | YouTube Data API v3 |
| `TRIGGER_SECRET` | Railway trigger-server | 수동 트리거 인증 |
| `PIPELINE_TRIGGER_URL` / `PIPELINE_TRIGGER_SECRET` | Vercel | Next.js → trigger-server 프록시 |
| `TAVILY_API_KEY` | Vercel | 실시간 웹검색 (매크로 질문 대응) |
| `GMAIL_SENDER` / `GMAIL_APP_PASSWORD` | Railway | 일일 리포트 + BUY_OK 전환 이메일 |
| `REPORT_EMAIL` | Railway | 이메일 수신 주소 (미설정 시 GMAIL_SENDER로 발송) |

---

## 배포

| 영역 | 방식 |
|------|------|
| Web (Next.js) | GitHub push → Vercel 자동 재배포 |
| Collectors | GitHub push → Railway 자동 재배포 |
| Trigger server | 별도 Railway 서비스 (`Dockerfile.trigger`) |
| Cron 스케줄 | Railway cron `0 22,7 * * *` UTC (07:00 / 16:00 KST) |

DB 스키마 변경 시: `migrations/*.sql` 작성 후 Supabase Dashboard SQL Editor에서 실행.

---

## 방법론 요약

### 신호 산출 2단계 구조
```
Stage 1 — Quality Gate (퀀트 팩터)
  factor_scores.composite_score → A티어(≥65) / B티어(≥40) / C티어(<40)
  C티어는 타이밍 무관 BUY 금지

Stage 2 — Timing Signal (기술·감성·수급)
  tech(50%) + news(22%) + yt(18%) + analyst(10%)
  외국인·기관 수급 스트릭 boost ±최대 18점

최종 복합점수 = Quality×40% + Timing×60%
BUY/SELL/HOLD 임계값은 시장 국면(5단계)에 따라 동적 조정
```

### 실행 필터 (Execution Filter)
```
BUY 신호 + 시장 위험도 → 오늘 실제 행동 결정

시장 위험도 = SOX(25pt) + NASDAQ(20pt) + KRW/USD(20pt)
             + NVDA/MU(각 10pt) + KOSPI(10pt) + VIX(5pt)
             → LOW / MEDIUM / HIGH / EXTREME

BUY + LOW/MEDIUM → BUY_OK (포지션 25%)
BUY + HIGH       → BUY_SMALL (포지션 10%)
BUY + EXTREME    → BLOCKED
SELL → REDUCE
```

### 시장 국면 판단 (히스테리시스)
```
4개 지표 독립 집계 (YouTube 감성 / KOSPI MA20 / 외국인 수급 / 뉴스 감성):
  bear_signals ≥ 3     → BEAR
  bull_signals ≥ 4, bear=0 → STRONG_BULL
  bull_signals ≥ 3, bear≤1 → BULL
  그 외               → NEUTRAL

BEAR 국면: 타이밍 점수 ×0.80 dampener 적용
```

### 신호 성과 추적
```
signal_aggregator.py 실행 시 BUY/SELL 종목 → signal_performance 진입 기록
7일 후 signal_performance_tracker.py → 5일/10일 수익률, 최대낙폭, 익절/손절 도달 여부 자동 기록
```

---

## 약점 및 한계

| 약점 | 설명 | 현재 대응 |
|------|------|----------|
| **시장 위험도 과민** | SOX/NASDAQ 급락 시 모든 종목이 BLOCKED → 기회 손실 가능 | BUY_SMALL로 소량 진입 허용 |
| **검증 부담** | BUY 신호가 실제로 맞았는지 지속적인 추적 필요 | `signal_performance` 5d/10d 수익률 자동 추적 |
| **과최적화 위험** | 점수 구조가 복잡할수록 과거 데이터에만 맞는 곡선 피팅이 될 수 있음 | 가중치는 2020–2025 백테스트 그리드서치 기반 |
| **데이터 지연** | 뉴스·주가는 당일 수집 주기에 의존 (실시간 아님) | 채팅에서 Tavily 실시간 웹검색으로 보완 |
| **YT 데이터 편중** | 특정 채널 위주 수집 → 커버리지 한계 | `yt_no_data` 플래그로 중립 처리 |

---

## 핵심 철학

> 주식 시장은 이전 패턴이 반복되지 않는다. 과거 기술적 신호만으로는 현재 시장 국면과 맞지 않을 수 있다.  
> 전문가들의 시장 해석을 실시간으로 수집·종합하여 현재 국면을 먼저 파악하고, 그에 맞는 기술적 신호와 팩터를 결합한다.

투자 판단의 책임은 본인에게 있습니다. 본 서비스는 참고용입니다.
