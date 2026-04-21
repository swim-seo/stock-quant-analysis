# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
# Web frontend (Next.js, Vercel deployment)
cd web
npm install
npm run dev   # http://localhost:3000

# Data collection (one-shot)
python youtube_collector.py              # collect all playlists
python youtube_collector.py morning      # morning only
python youtube_collector.py afternoon    # afternoon only
python youtube_collector.py historical --days 7   # past N days
python youtube_collector.py backfill --days 365   # bulk backfill (~$28 API cost)
python youtube_collector.py scan --days 180       # preview count before backfill

# Full pipeline (news + youtube + briefing) — same as Railway cron
python railway_job.py

# Individual utilities
python news_collector.py          # collect news + investor flow
python morning_briefing.py        # generate briefing locally
python ml_model.py                # train/evaluate XGBoost+LightGBM model
python backtester.py              # single-stock backtest
python backtest_multi.py          # 20-stock backtest with slippage
```

Required env vars: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`

## Architecture

**Data flow**: Collectors (Python/Railway) → Supabase (PostgreSQL hub) → Next.js web (Vercel)

```
youtube_collector.py  ─┐
news_collector.py     ─┤  Railway Cron (Mon–Fri 07:00/16:00 KST)
railway_job.py        ─┘     │ Claude API analysis
                             ▼
                     Supabase (youtube_insights, stock_news, morning_briefing tables)
                             │ Supabase client (src/lib/supabase.ts)
                             ▼
                     Next.js web (Vercel) — reads DB, computes indicators live
```

Supabase is the only bridge between Python and Next.js — Python writes, Next.js reads. No shared API server.

## Web Pages (`web/src/app/`)

| Route | Purpose |
|-------|---------|
| `/` (page.tsx) | Dashboard: fear & greed gauge, sector sentiment, top-mentioned stocks, insights feed |
| `/stock?ticker=005930.KS` | Stock analysis: candlestick chart, entry signal (5 conditions), news, ML prediction, YouTube insights |
| `/briefing` | Morning briefing: market summary, top stocks, sector outlook, risk alerts |
| `/search` | Search results for a stock name |

Live API routes in `web/src/app/api/`:
- `stock/route.ts` — yfinance price data + technical indicators
- `fear-greed/route.ts` — Korea F&G index (5 components, 0–100)
- `news/route.ts` — news + investor flow from Supabase
- `briefing/route.ts` — today's briefing from Supabase

## Key Modules

- **`indicators.py`** — 12 technical indicators (MA, RSI, MACD, BB, ATR, Stoch, OBV, ADX, CCI, Williams%R)
- **`ml_model.py`** — XGBoost + LightGBM ensemble (31 features, TimeSeriesSplit 5-fold, ~51–52% accuracy); target = next-day close > today
- **`multi_timeframe.py`** — daily + weekly MA signals; weekly trend gates daily buy signals
- **`backtester.py`** — entry/exit simulation with 0.1% slippage + 0.15% commission
- **`fear_greed_korea.py`** — 5-component Korea index: KOSPI volatility + momentum, volume momentum, US CNN F&G, YouTube sentiment
- **`youtube_collector.py`** — yt-dlp download → 2-stage keyword filter → Claude analysis (summary, sentiment, tickers, sectors, signals) → Supabase + ChromaDB
- **`community_summarizer.py`** — Hybrid RAG: ChromaDB vector (KR-SBERT) + Supabase keyword + RRF merge

## Entry Signal Logic (5 conditions, 3-tier)

Each condition scores ✅ 1 / ⚠️ 0.5 / ❌ 0; final ≥4 → 🟢 enter, 2.5–3.5 → 🟡 wait, <2.5 → 🔴 danger.

① MA alignment (MA5>MA20>MA60), ② Golden cross (last 10d), ③ RSI 40–60, ④ Weekly trend, ⑤ Volume >1.2× 20d avg

## Supabase Tables

| Table | Writer | Reader |
|-------|--------|--------|
| `youtube_insights` | youtube_collector.py | Next.js /api, page.tsx |
| `stock_news` | news_collector.py | Next.js /api/news |
| `morning_briefing` | morning_briefing.py | Next.js /api/briefing |

## Deployment

- **Web** → Vercel (`web/` root directory, `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- **Collectors** → Railway Docker (`railway.json`, `Dockerfile`, cron: `0 22,7 * * 1-5` UTC = Mon–Fri 07:00/16:00 KST)
- **Legacy Streamlit** → moved to `_legacy/` (no longer active)
