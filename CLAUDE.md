# stock_analysis

한국 주식 퀀트 분석 시스템. YouTube 전문가 인사이트 수집·분석, 기술적 지표, 팩터 분석, 2단계 매매 신호(종목 품질 × 시장 실행 필터), 모닝 브리핑을 통합한 AI 기반 퀀트 투자 의사결정 지원 도구.

## 핵심 철학

주식 시장은 이전 패턴이 반복되지 않는다. 과거 기술적 신호(캔들, MA, 수평선 등)만으로는 현재 시장 국면과 맞지 않을 수 있다. 전문가들의 시장 해석을 실시간으로 수집·종합하여 현재 국면을 먼저 파악하고, 그에 맞는 기술적 신호와 팩터를 결합하는 것이 목표다. 도메인 전문가가 아니므로 Claude + Codex + Gemini 오케스트레이션을 통해 더 나은 설계 아이디어를 함께 만들어간다.

## 신호 모델 (2단계 구조)

```
Stage 1 — Quality Gate
  factor_scores → A(≥65) / B(≥40) / C(<40)
  C티어는 BUY 금지

Stage 2 — Timing
  tech(50%) + news(22%) + yt(18%) + analyst(10%)
  외국인·기관 수급 스트릭 boost ±최대 18점

복합점수 = Quality×40% + Timing×60%
signal: BUY / HOLD / SELL (종목 자체 품질)

Execution Filter (시장 위험도 적용)
  BUY + LOW/MEDIUM  → BUY_OK   (포지션 25%)
  BUY + HIGH        → BUY_SMALL (포지션 10%)
  BUY + EXTREME     → BLOCKED
  SELL              → REDUCE
  execution_signal: BUY_OK / BUY_SMALL / WATCH / BLOCKED / HOLD / REDUCE
```

signal = "이 종목이 구조적으로 좋은가"  
execution_signal = "오늘 실제로 살 수 있는가" (상위 시장 필터 반영)

시장 국면: STRONG_BULL / BULL / NEUTRAL / BEAR / STRONG_BEAR (5단계)

## 설계 방향

- 전문가 인사이트 수집: YouTube 전문가 채널 스크립트 수집 → 지금 시장이 어떤 국면인지 파악 (거시 흐름, 섹터 로테이션, 수급 등)
- 인사이트 종합: ChromaDB에 누적·검색 → 현재 국면에 맞는 전문가 분석 RAG 활용
- 팩터 모델: 시장 국면을 반영한 동적 멀티팩터 스코어링 (모멘텀, 밸류, 퀄리티 등)
- 실행 필터: 상위 시장(SOX·NASDAQ·원달러·VIX 등) 위험도를 종목 신호에 덧씌워 오늘의 행동 신호 결정
- 신호 성과 추적: BUY/SELL 신호 발생 후 5일/10일 실제 수익률 자동 추적
- 자동화: Railway 스케줄러로 일/월 단위 파이프라인 실행

## Tech Stack

- 언어: Python
- DB: Supabase (PostgreSQL)
- 벡터 DB: ChromaDB (chroma_db/)
- 프론트엔드: Next.js (web/)
- 배포: Railway, Vercel
- Package: pip, requirements.txt

## 주요 모듈

```
data_collector.py            # 주가 데이터 수집 (KIS API + yfinance)
youtube_collector.py         # YouTube 영상 수집·Claude 분석
news_collector.py            # 뉴스·수급·증권사 목표가 수집
indicators.py                # 기술적 지표 계산 (MA/RSI/MACD/볼린저/OBV/ADX)
factor_calculator.py         # 팩터 계산 (모멘텀·상대강도·저변동성·수급 z-score)
market_risk_filter.py        # 시장 위험도 계산 (SOX/NASDAQ/원달러 기반) + 실행 필터
signal_aggregator.py         # 2단계 매매 신호 계산 + BUY_OK 전환 이메일 알림
signal_performance_tracker.py # BUY/SELL 신호 5d/10d 실제 수익률 자동 추적
morning_briefing.py          # 모닝 브리핑 생성 (시장위험도 포함)
agent_supervisor.py          # 파이프라인 감시·재시도·Claude 오류 진단
railway_job.py               # Railway 파이프라인 오케스트레이터
monthly_agent.py             # 월간 종목 선정
theme_scanner.py             # 테마 스캐너 (RSS + YouTube)
fear_greed_korea.py          # 한국판 공포탐욕지수 (5컴포넌트)
web/                         # Next.js 대시보드
migrations/                  # DB 마이그레이션 SQL
```

## 멀티 에이전트 규칙

- 사고/로그/코드: 영어
- 사용자 응답: 한국어
- 설계 판단 필요 시 → Codex CLI 위임
- 대규모 리서치/문서 분석 → Gemini CLI 위임
- 자세한 규칙: .claude/rules/
