# 한국 주식 AI 분석 시스템

기술적 분석 + ML 예측 + 유튜브 전문가 인사이트 + 퀀트 팩터를 통합한 한국 주식 의사결정 지원 시스템.

배포: **https://web-beryl-eight-90.vercel.app**

---

## 핵심 기능

### 매매 신호 센터 (`/signals`)
종목별 BUY / SELL / HOLD 통합 신호. 4개 컴포넌트 점수를 가중평균.
- **기술적 점수(40%)**: MA 정배열, RSI, MACD, 골든크로스, 거래량, ADX
- **팩터 점수(25%)**: 모멘텀·상대강도·저변동성·수급
- **유튜브 점수(20%)**: 최근 7일 전문가 언급 빈도 + 감성 + investment_signals
- **뉴스 점수(15%)**: 종목 뉴스 sentiment + trading_signal

추가 정보:
- **신호 일치도**: 기술적·유튜브가 같은 방향일 때 1.15× 가중치 부스트
- **시장 국면**: 유튜브 전문가 합의 기반 BULL/BEAR/NEUTRAL (히스테리시스 60% 진입 / 45% 복귀)
- **데이터 품질 점수**: 입력 완성도 0~100%
- **YT 언급 0건 fallback**: 중립 50점 + `yt_no_data` 플래그

### 퀀트 스크리너 (`/screener`)
~158개 종목을 멀티팩터 z-score로 랭킹. 모멘텀(40%) + 상대강도(25%) + 저변동성(15%) + 수급(20%).
섹터 필터, 컬럼 정렬, 행 클릭 시 팩터 상세 확장.

### 오늘의 뉴스 & 유튜브 주목 테마 (대시보드)
RSS 4개 매체(네이버·연합·한경·매경) + 유튜브 인사이트 48h를 함께 Claude에 전달해 테마 7개 추출.
- **출처 배지**: 📰+📺 양쪽 / 📺 유튜브 / 📰 뉴스
- **신뢰도 점수**: 양쪽 모두 등장 시 자동 부스트
- **ticker_aliases 검증**: Claude가 생성한 종목명을 ~227개 매핑 테이블로 사후 필터링 (환각 방지)
- RSS 실패 시 유튜브 단독으로 자동 fallback

### 종목 차트 분석 (`/stock?ticker=...`)
- 캔들스틱 + MA5/20/60 + RSI + MACD + 볼린저밴드 + 거래량
- 진입 신호 5조건 판단 (정배열·골든크로스·RSI·주봉추세·거래량) → 🟢/🟡/🔴
- ML 모델 예측 (XGBoost + LightGBM 앙상블, 31개 피처, ~51–52% 정확도)
- 종목별 뉴스, 유튜브 언급, 외국인·기관 수급
- ML 예측 적중률 추적 (`prediction_log` 누적)

### 가상 투자 시뮬레이션 (`/portfolio`)
- 매매 신호 기반 매수/매도 시뮬레이션
- 일별 수익률, 벤치마크(KOSPI) 대비 초과수익 추적
- `portfolio_signals` 테이블에 누적 저장

### 모닝 브리핑 (`/briefing`)
매일 아침 Claude가 자동 생성:
- 시장 요약 + 오늘 주목 종목 TOP5
- 섹터 전망, 전문가 종합 의견, 리스크 경고
- BUY 신호 TOP5 (매매 신호 시스템 연동)

### 공포탐욕 지수 (대시보드 카드)
한국판 5컴포넌트 (100점 만점):
- KOSPI 변동성 / KOSPI 모멘텀 / 거래량 모멘텀
- 미국 CNN F&G 연동 / 유튜브 시장 감성

### 파이프라인 알림 (`/`)
`pipeline_alerts` 테이블에서 수집 실패·Claude 호출 오류 등을 자동 감지·표시.

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ Railway (Python collectors, cron 0 22,7 * * * UTC)          │
│   ├─ news_collector.py     → stock_news                     │
│   ├─ youtube_collector.py  → youtube_insights + ChromaDB    │
│   ├─ theme_scanner.py      → theme_signals (RSS+YT 혼합)    │
│   ├─ factor_calculator.py  → factor_scores                  │
│   ├─ signal_aggregator.py  → trade_signals + prediction_log │
│   ├─ morning_briefing.py   → morning_briefing               │
│   └─ trigger_server.py     → 수동 트리거 HTTP API           │
└─────────────────────┬───────────────────────────────────────┘
                      ▼
              Supabase (PostgreSQL, public_read RLS)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Vercel (Next.js 16 web)                                     │
│   /, /stock, /signals, /screener, /briefing,                │
│   /portfolio, /search, /guide                               │
└─────────────────────────────────────────────────────────────┘
```

**원칙**: Supabase가 유일한 데이터 허브. Python은 쓰기만, Next.js는 읽기만 (서버에서 trigger-pipeline만 예외).

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 16 (Turbopack) + TypeScript |
| Backend collectors | Python 3.12+, yfinance, anthropic, supabase-py |
| DB | Supabase (PostgreSQL) — RLS 활성화 |
| Vector DB | ChromaDB + KR-SBERT |
| ML | XGBoost + LightGBM 앙상블 |
| AI | Claude API (claude-sonnet-4-6) |
| 배포 | Vercel (web) + Railway (collectors, trigger-server) |

---

## 주요 Supabase 테이블

| 테이블 | Writer | 핵심 컬럼 |
|--------|--------|-----------|
| `stock_news` | news_collector.py | sentiment, trading_signal, news_impact_score, investor_data |
| `youtube_insights` | youtube_collector.py | market_sentiment, key_stocks[], key_sectors[], investment_signals, urgency, trading_type |
| `theme_signals` | theme_scanner.py | theme_name, source_types[], confidence_score, related_stocks[], source_youtube[] |
| `factor_scores` | factor_calculator.py | composite_score, z_momentum/rs/volatility/flow |
| `trade_signals` | signal_aggregator.py | signal, composite_score, tech/yt/factor/news_score, signal_agreement, market_regime |
| `prediction_log` | railway_job.py | predicted_up, probability, tech/ml/news/yt/composite_score, actual_up, correct |
| `portfolio_signals` | railway_job.py | signal_date, entry_price, return_pct, status |
| `morning_briefing` | morning_briefing.py | market_summary, top_stocks, sector_outlook, top_trade_signals |
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
pip install -r requirements.txt

# 단일 실행
python news_collector.py
python youtube_collector.py [morning|afternoon]
python factor_calculator.py
python signal_aggregator.py
python theme_scanner.py
python morning_briefing.py

# 통합 파이프라인 (Railway가 매일 자동 실행하는 것과 동일)
python railway_job.py morning      # 07:00 KST: 뉴스+유튜브+팩터+신호+브리핑
python railway_job.py afternoon    # 16:00 KST: 뉴스+유튜브 갱신
python railway_job.py all
```

### Trigger server (수동 트리거)
```bash
export TRIGGER_SECRET=your-secret-here   # 필수 (없으면 시작 거부)
python trigger_server.py                 # :8080
```

---

## 환경 변수

| 변수 | 위치 | 용도 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Railway / 로컬 | Claude API |
| `SUPABASE_URL` / `SUPABASE_KEY` | Railway / 로컬 | service-role key (쓰기) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | anon key (읽기 전용) |
| `YOUTUBE_API_KEY` | Railway | YouTube Data API v3 |
| `TRIGGER_SECRET` | Railway trigger-server | 수동 트리거 인증 |
| `PIPELINE_TRIGGER_URL` / `PIPELINE_TRIGGER_SECRET` | Vercel | Next.js → trigger-server 프록시 |
| `GMAIL_SENDER` / `GMAIL_APP_PASSWORD` | Railway | 일일 리포트 이메일 (선택) |

---

## 배포

| 영역 | 방식 |
|------|------|
| Web (Next.js) | GitHub push → Vercel 자동 재배포 |
| Collectors | GitHub push → Railway 자동 재배포 |
| Trigger server | 별도 Railway 서비스로 운영 |
| Cron 스케줄 | Railway cron `0 22,7 * * *` UTC (평일 07:00 / 16:00 KST) |

DB 스키마 변경 시: `migrations/*.sql` 작성 후 Supabase Dashboard SQL Editor에서 실행.

---

## 보안 정책

- `.env`, 쿠키 파일, 토큰 파일은 절대 커밋 금지 (`.gitignore` 패턴으로 차단)
- `git add -A` 같은 와일드카드 staging 금지 — 항상 파일을 명시
- Supabase service-role key는 Python(server-side)에서만 사용, Next.js 클라이언트에서는 anon key만
- 모든 write 엔드포인트는 Origin/Referer CSRF 검증 적용
- trigger-server는 `hmac.compare_digest`로 타이밍 공격 방지 + IP rate limit

---

## 핵심 철학

> 주식 시장은 이전 패턴이 반복되지 않는다. 과거 기술적 신호만으로는 현재 시장 국면과 맞지 않을 수 있다.  
> 전문가들의 시장 해석을 실시간으로 수집·종합하여 현재 국면을 먼저 파악하고, 그에 맞는 기술적 신호와 팩터를 결합한다.

투자 판단의 책임은 본인에게 있습니다. 본 서비스는 참고용입니다.
