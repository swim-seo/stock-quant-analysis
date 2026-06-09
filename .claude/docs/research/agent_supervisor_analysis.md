# agent_supervisor.py Analysis
_Generated: 2026-06-08_

## 1. Railway Start Command

**No `railway.toml` exists** in `C:\Users\hp\stock_analysis\`. No `Procfile` or `nixpacks.toml` either.

The start command must be configured directly in the Railway dashboard UI (not in a config file in the repo). Based on the deploy logs ending with "AI Supervisor 완료", the start command is almost certainly:

```
python agent_supervisor.py morning
```

or Railway is configured to run `agent_supervisor.py` as the main process.

---

## 2. What agent_supervisor.py Runs (ordered step list)

`agent_supervisor.py` wraps `railway_job.py` functions with retry logic (`run_step(step_name, fn, max_retry=2)`). The pattern "[단계] 시도 1/2 ..." in logs is produced by `run_step()` at line 125.

### Morning mode steps (lines 177–188):

| Order | Step name | Function called |
|-------|-----------|-----------------|
| 1 | 뉴스 수집 | `rj.collect_news` |
| 2 | 유튜브 수집(아침) | `rj.collect_youtube(collect_time="morning")` |
| 3 | 브리핑 생성 | `rj.generate_briefing` |
| 4 | 주가 수집 | `rj._collect_stock_data()` |
| 5 | 예측 저장 | `rj.save_predictions(stock_data)` |
| 6 | 포트폴리오 신호 | `rj.save_portfolio_signals(stock_data)` |
| 7 | 수익률 업데이트 | `rj.update_portfolio_returns` |
| 8 | 테마 스캐너 | `rj._run_theme_scanner` |
| 9 | 일일 리포트 | `rj.send_daily_report` |

### Afternoon mode steps (lines 189–193):

| Order | Step name | Function called |
|-------|-----------|-----------------|
| 1 | 뉴스 수집(오후) | `rj.collect_news` |
| 2 | 유튜브 수집(오후) | `rj.collect_youtube(collect_time="afternoon")` |
| 3 | 브리핑 생성 | `rj.generate_briefing` |
| 4 | 수익률 업데이트 | `rj.update_portfolio_returns` |

---

## 3. Are factor_calculator / signal_aggregator Called?

**NO. Neither `_run_factor_calculator` nor `_run_signal_aggregator` appear anywhere in `agent_supervisor.py`.**

This is the root cause of the issue.

---

## 4. Gap Between railway_job.py Morning Mode vs agent_supervisor.py

### railway_job.py morning mode (lines 1843–1868) calls:
1. collect_news()
2. collect_youtube(collect_time="morning")
3. generate_briefing()
4. collect_stock_prices(days=5)       ← **MISSING from supervisor**
5. collect_sector_index()             ← **MISSING from supervisor**
6. _collect_stock_data()
7. save_predictions(stock_data)
8. save_portfolio_signals(stock_data)
9. update_portfolio_returns()
10. _run_theme_scanner()
11. **_run_factor_calculator()**      ← **MISSING from supervisor**
12. **_run_signal_aggregator()**      ← **MISSING from supervisor**
13. send_daily_report()
14. monthly_sniper (if is_sniper_period()) ← **MISSING from supervisor**
15. monthly_agent.run_monthly_agent() ← **MISSING from supervisor**

### agent_supervisor.py morning mode calls (9 steps total):
Steps 1–3, 6–9, 10, 13 from the above list — but **missing steps 4, 5, 11, 12, 14, 15**.

### Critical missing steps summary:
| Missing step | Impact |
|---|---|
| `collect_stock_prices(days=5)` | KIS 가격 데이터 미저장 → stock_prices 테이블 미업데이트 |
| `collect_sector_index()` | sector_index 테이블 미업데이트 → /api/sector-rotation 빈 데이터 |
| `_run_factor_calculator()` | **factor_scores 테이블 미업데이트** — screener 페이지 스테일 |
| `_run_signal_aggregator()` | **trade_signals 테이블 미업데이트** — signals 페이지 스테일 |
| `monthly_sniper` | 스나이퍼 신호 미스캔 (스나이퍼 기간 중) |
| `monthly_agent` | 월간 종목 선정 미실행 |

---

## 5. Other Issues Found

### agent_supervisor.py was not updated after railway_job.py was updated
The supervisor appears to be an older version that was written before several new features were added to `railway_job.py`:
- KIS stock price collection (`collect_stock_prices`)
- Sector index collection (`collect_sector_index`)
- Factor calculator step
- Signal aggregator step
- Sniper strategy integration
- Monthly agent integration

### railway_job.py is NOT being run directly
Since the logs show "[단계] 시도 1/2 ..." retry patterns (which come from `agent_supervisor.run_step()`), Railway is running `agent_supervisor.py` — NOT `railway_job.py` directly. Any new steps added to `railway_job.py` have NO effect unless also added to `agent_supervisor.py`.

---

## Fix Required

Add the missing steps to `agent_supervisor.py` morning mode block (after 테마 스캐너, before 일일 리포트):

```python
if mode == "morning":
    run_step("뉴스 수집",            rj.collect_news)
    run_step("유튜브 수집(아침)",     lambda: rj.collect_youtube(collect_time="morning"))
    run_step("브리핑 생성",           rj.generate_briefing)
    run_step("주가 수집(KIS)",        lambda: rj.collect_stock_prices(days=5))   # ADD
    run_step("섹터 인덱스",           rj.collect_sector_index)                   # ADD

    state = {"stock_data": {}}
    run_step("주가 수집",             lambda: state.update(stock_data=rj._collect_stock_data()))
    run_step("예측 저장",             lambda: rj.save_predictions(state["stock_data"]))
    run_step("포트폴리오 신호",       lambda: rj.save_portfolio_signals(state["stock_data"]))
    run_step("수익률 업데이트",       rj.update_portfolio_returns)
    run_step("테마 스캐너",           rj._run_theme_scanner)
    run_step("팩터 계산",             rj._run_factor_calculator)                 # ADD
    run_step("신호 집계",             rj._run_signal_aggregator)                 # ADD
    run_step("일일 리포트",           rj.send_daily_report)
    # sniper + monthly_agent can be added optionally
```
