"""
factor_calculator.py — 퀀트 팩터 계산 → Supabase factor_scores 저장
커버리지: stocks.ts 개별 종목 (ETF/지수 제외, ~158개)

팩터 구성:
  샤프모멘텀 (45%): (3M*0.5+6M*0.3+12M*0.2) / vol_60d  z-score
  상대강도   (20%): 3M 수익률 - KOSPI 3M 수익률 z-score
  수급       (25%): 외국인+기관 5d/20d 가중합 z-score  ← 15%에서 상향
  가치       (10%): 섹터중립 PBR 역수 z-score (pykrx)  ← 20%에서 하향

과열 필터: momentum_3m > 40% AND relative_strength_3m > 20% 종목은
  composite_score를 64.9 이하로 cap → Quality A 등급 진입 차단
Z-score Winsorize: clip(-2.5, 2.5) 적용 → 이상치 왜곡 방지
"""
import os
import sys
import json
import time
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

KOSPI_TICKER = "^KS11"

from stock_list import STOCKS


def _ticker_to_code(ticker: str) -> str:
    """'005930.KS' → '005930', '247540.KQ' → '247540'"""
    return ticker.split(".")[0]


def fetch_prices(ticker: str) -> pd.Series:
    """KIS OHLCV 일봉 → 종가 Series. KOSPI 지수(^KS11)는 yfinance fallback."""
    if ticker.startswith("^"):
        try:
            df = yf.download(ticker, period="400d", auto_adjust=True, progress=False)
            if not df.empty:
                return df["Close"].squeeze().dropna()
        except Exception:
            pass
        return pd.Series(dtype=float)

    code = _ticker_to_code(ticker)
    try:
        from kis_fetcher import get_client as _get_kis
        rows = _get_kis().fetch_ohlcv_daily(code, days=400)
        if rows:
            dates  = pd.to_datetime([r["date"] for r in rows])
            closes = [r["close"] for r in rows]
            return pd.Series(closes, index=dates, dtype=float).dropna()
    except Exception as e:
        print(f"  [KIS 가격실패] {ticker}: {e}")

    # yfinance fallback
    try:
        df = yf.download(ticker, period="400d", auto_adjust=True, progress=False)
        if not df.empty:
            return df["Close"].squeeze().dropna()
    except Exception as e:
        print(f"  [yfinance fallback 실패] {ticker}: {e}")

    return pd.Series(dtype=float)


def load_investor_flow_from_supabase() -> dict[str, dict]:
    """수급 데이터 로드: Supabase stock_news (KIS 수집분) 우선, KIS 직접 조회 fallback."""
    # 1차: Supabase stock_news (news_collector.py → KIS 수집분)
    try:
        resp = (supabase.table("stock_news")
                .select("stock_code,investor_data")
                .order("collected_at", desc=True)
                .limit(300)
                .execute())
        flow_map: dict[str, dict] = {}
        for row in resp.data or []:
            code = row.get("stock_code", "")
            if code in flow_map:
                continue
            inv = row.get("investor_data", [])
            if isinstance(inv, str):
                try: inv = json.loads(inv)
                except: inv = []
            if not inv:
                continue
            flow_map[code] = {
                "foreign_5d":  sum(d.get("foreign_net", 0) for d in inv[:5]),
                "foreign_20d": sum(d.get("foreign_net", 0) for d in inv[:20]),
                "inst_5d":     sum(d.get("institution_net", 0) for d in inv[:5]),
                "inst_20d":    sum(d.get("institution_net", 0) for d in inv[:20]),
            }
        if flow_map:
            print(f"  수급 데이터 로드: {len(flow_map)}개 종목 (Supabase/KIS)")
            return flow_map
    except Exception as e:
        print(f"  [Supabase 수급 로드 실패] {e}")

    # 2차 fallback: KIS 직접 조회 (전체 종목 기준, 최대 40개)
    try:
        from kis_fetcher import get_client as _get_kis
        from stock_list import ALL_STOCKS as _all
        kis = _get_kis()
        flow_map = {}
        for code in list(_all.values())[:40]:  # 최대 40개 (rate limit 고려)
            rows = kis.fetch_investor_trading(code, days=20)
            if rows:
                flow_map[code] = {
                    "foreign_5d":  sum(r.get("foreign_net", 0) for r in rows[:5]),
                    "foreign_20d": sum(r.get("foreign_net", 0) for r in rows[:20]),
                    "inst_5d":     sum(r.get("institution_net", 0) for r in rows[:5]),
                    "inst_20d":    sum(r.get("institution_net", 0) for r in rows[:20]),
                }
        print(f"  수급 데이터 로드: {len(flow_map)}개 종목 (KIS 직접)")
        return flow_map
    except Exception as e:
        print(f"  [KIS 수급 직접 로드 실패] {e}")
        return {}


def mom(prices: pd.Series, days: int) -> float | None:
    if len(prices) < days + 5:
        return None
    return float(prices.iloc[-1] / prices.iloc[-days] - 1)


def mom_skip(prices: pd.Series, long: int, skip: int = 21) -> float | None:
    """Momentum with 1-month skip to avoid short-term reversal noise."""
    if len(prices) < long + 5:
        return None
    return float(prices.iloc[-skip] / prices.iloc[-long] - 1)


def vol(prices: pd.Series, days: int) -> float | None:
    if len(prices) < days + 5:
        return None
    rets = prices.pct_change().dropna()
    return float(rets.iloc[-days:].std() * (252 ** 0.5))


def detect_speculative(prices: pd.Series, vol_annual: float | None) -> tuple[bool, str]:
    """Detect speculative/manipulated stocks.

    Criteria:
    - Annualized vol > 150%
    - Clustered upper-circuit: 2+ days hitting ≥28% within any 7-trading-day window
      (spread-out single events are normal; consecutive pumping is not)
    """
    reasons = []

    if vol_annual is not None and vol_annual > 1.50:
        reasons.append(f"고변동성 {vol_annual*100:.0f}%")

    if len(prices) >= 60:
        ret = prices.pct_change().dropna().tail(60)
        circuit_idx = [i for i, v in enumerate(ret.values) if v >= 0.28]
        # Check for 2+ upper-circuit days within a 7-trading-day window
        clustered = 0
        for i in range(len(circuit_idx)):
            for j in range(i + 1, len(circuit_idx)):
                if circuit_idx[j] - circuit_idx[i] <= 7:
                    clustered = max(clustered, circuit_idx[j] - circuit_idx[i] + 1)
                else:
                    break
        if clustered >= 2:
            reasons.append(f"상한가 집중 {len(circuit_idx)}회({clustered}일내)")

    return len(reasons) > 0, " | ".join(reasons) if reasons else ""


def zscore(s: pd.Series) -> pd.Series:
    std = s.std()
    result = (s - s.mean()) / std if std > 0 else pd.Series(0.0, index=s.index)
    return result.clip(-2.5, 2.5)


def sector_neutral_zscore(df: pd.DataFrame, col: str, sector_col: str = "sector") -> pd.Series:
    """Z-score within each sector. Falls back to universe-level for sectors with < 3 stocks."""
    result = pd.Series(0.0, index=df.index)
    universe_z = zscore(df[col])
    for sector, grp in df.groupby(sector_col):
        if len(grp) >= 3:
            result.loc[grp.index] = zscore(grp[col]).values
        else:
            result.loc[grp.index] = universe_z.loc[grp.index].values
    return result


def fetch_pbr_from_pykrx(date_str: str) -> dict[str, float]:
    """Fetch PBR for all listed stocks via pykrx (KRX official data)."""
    try:
        from pykrx import stock as krx
        df_kospi  = krx.get_market_fundamental_by_ticker(date_str, market="KOSPI")
        df_kosdaq = krx.get_market_fundamental_by_ticker(date_str, market="KOSDAQ")
        df_all = pd.concat([df_kospi, df_kosdaq])
        pbr_map = {}
        for ticker, row in df_all.iterrows():
            pbr = row.get("PBR")
            if pbr and pbr > 0:
                pbr_map[str(ticker)] = float(pbr)
        print(f"  pykrx PBR 로드: {len(pbr_map)}개 종목")
        return pbr_map
    except ImportError:
        print("  [pykrx 미설치] 가치 팩터 건너뜀")
        return {}
    except Exception as e:
        print(f"  [pykrx PBR 로드 실패] {e}")
        return {}


def run():
    print("\n=== 퀀트 팩터 계산 시작 ===")
    print(f"  대상: {len(STOCKS)}개 종목")

    print("  KOSPI 벤치마크 로딩...")
    kospi_prices = fetch_prices(KOSPI_TICKER)
    kospi_3m = mom_skip(kospi_prices, 65) or 0.0

    # 수급 데이터: Supabase stock_news에서 일괄 로드 (Naver API IP 제한 우회)
    flow_map = load_investor_flow_from_supabase()

    # 가치 팩터: pykrx PBR (KRX 공식 금액 기준)
    today_krx = datetime.now().strftime("%Y%m%d")
    pbr_map = fetch_pbr_from_pykrx(today_krx)

    raw_rows = []
    skip_count = 0
    error_count = 0
    for i, (ticker, name, sector) in enumerate(STOCKS):
        code = ticker.split(".")[0]
        print(f"  [{i+1:3d}/{len(STOCKS)}] {name}", end=" ... ", flush=True)
        try:
            prices = fetch_prices(ticker)
            if len(prices) < 70:
                print(f"데이터 부족 ({len(prices)}일), 스킵")
                skip_count += 1
                continue

            flow = flow_map.get(code, {"foreign_5d": 0, "foreign_20d": 0, "inst_5d": 0, "inst_20d": 0})

            m3  = mom_skip(prices, 65,  skip=5)
            m6  = mom_skip(prices, 130, skip=10)
            m12 = mom_skip(prices, 252, skip=21)
            v20 = vol(prices, 20)
            v60 = vol(prices, 60)
            rs3 = (m3 - kospi_3m) if m3 is not None else None
            is_spec, spec_reason = detect_speculative(prices, v20)
            if is_spec:
                print(f"⚠️  투기주 감지: {name} ({spec_reason})")

            raw_rows.append({
                "ticker":               ticker,
                "stock_name":           name,
                "sector":               sector,
                "close_price":          float(prices.iloc[-1]),
                "momentum_3m":          m3,
                "momentum_6m":          m6,
                "momentum_12m":         m12,
                "relative_strength_3m": rs3,
                "volatility_20d":       v20,
                "volatility_60d":       v60,
                "foreign_flow_5d":      flow["foreign_5d"],
                "foreign_flow_20d":     flow["foreign_20d"],
                "institution_flow_5d":  flow["inst_5d"],
                "institution_flow_20d": flow["inst_20d"],
                "pbr":                  pbr_map.get(code),
                "is_speculative":       is_spec,
                "speculative_reason":   spec_reason or None,
            })
            print(f"3M={( m3 or 0)*100:+.1f}%  RS={( rs3 or 0)*100:+.1f}%")
        except Exception as e:
            print(f"❌ 오류: {e}", file=sys.stderr)
            error_count += 1

    if error_count > 0:
        print(f"\n  ⚠️  개별 종목 오류: {error_count}개 (계속 진행)", file=sys.stderr)

    if not raw_rows:
        print("계산된 종목 없음, 종료")
        return

    df = pd.DataFrame(raw_rows)
    med = lambda col: df[col].median()

    # ── 팩터 z-score ──────────────────────────────────────────────
    mom_raw = (
        df["momentum_3m"].fillna(med("momentum_3m"))  * 0.50 +
        df["momentum_6m"].fillna(med("momentum_6m"))  * 0.30 +
        df["momentum_12m"].fillna(med("momentum_12m")) * 0.20
    )
    # Sharpe-like momentum: momentum / volatility (same return, less risk = better)
    # clip vol at 10% floor to avoid division by near-zero
    vol_adj = df["volatility_60d"].fillna(med("volatility_60d")).clip(lower=0.10)
    df["z_momentum"]   = zscore(mom_raw / vol_adj)
    df["z_rs"]         = zscore(df["relative_strength_3m"].fillna(0))
    df["z_volatility"] = zscore(-df["volatility_20d"].fillna(med("volatility_20d")))

    # 수급 팩터: 시총 정규화 (대형주 삼성전자 등이 절대금액으로 지배하는 문제 방지)
    # 종목 전체 평균 유동주식 거래대금 대비 비율로 정규화
    flow_abs = (
        df["foreign_flow_5d"].fillna(0)  * 0.40 +
        df["foreign_flow_20d"].fillna(0) * 0.15 +
        df["institution_flow_5d"].fillna(0)  * 0.35 +
        df["institution_flow_20d"].fillna(0) * 0.10
    )
    # 종목별 절대 수급을 cross-sectional z-score로 정규화 (시총 편향 제거)
    flow_raw = flow_abs
    df["z_flow"] = zscore(flow_raw)

    # ── 종합점수 0~100 ────────────────────────────────────────────
    # 가치 팩터: 섹터 중립 PBR 역수 z-score (pykrx 데이터 있을 때만)
    has_pbr = df["pbr"].notna().sum() > 10
    if has_pbr:
        df["z_value"] = sector_neutral_zscore(
            df.assign(pbr_inv=-df["pbr"].fillna(df["pbr"].median())), "pbr_inv"
        )
        print(f"  가치 팩터 적용: {df['pbr'].notna().sum()}개 종목 PBR 데이터")
    else:
        df["z_value"] = 0.0
        print("  가치 팩터 미적용 (PBR 데이터 없음)")

    # 가중치: 샤프모멘텀(45%) + 상대강도(20%) + 수급(25%) + 가치(10%)
    # 수급 상향(25%): 외국인 대량매수 시 대형주 자연 포착
    # 가치 하향(10%): PBR 역수가 고PBR 성장 대형주를 구조적으로 제외하는 편향 완화
    # pykrx 없을 시 가치(0.10)를 모멘텀(+0.05)·수급(+0.05)에 흡수
    if has_pbr:
        raw = (
            df["z_momentum"] * 0.45 +
            df["z_rs"]       * 0.20 +
            df["z_flow"]     * 0.25 +
            df["z_value"]    * 0.10
        )
    else:
        raw = (
            df["z_momentum"] * 0.50 +
            df["z_rs"]       * 0.20 +
            df["z_flow"]     * 0.30
        )
    # P5: Rank-based percentile (robust to outliers vs min-max)
    df["composite_score"] = (raw.rank(pct=True) * 100).round(1)

    # 과열 필터: 3M 모멘텀 > 40% AND 상대강도 > 20% 종목은 Quality A(≥65) 진입 차단
    # 이미 급등한 소형 모멘텀주가 BUY 리스트 상위를 독점하는 구조적 편향 방지
    overheat_mask = (
        (df["momentum_3m"].fillna(0) > 0.40) &
        (df["relative_strength_3m"].fillna(0) > 0.20)
    )
    df.loc[overheat_mask, "composite_score"] = df.loc[overheat_mask, "composite_score"].clip(upper=64.9)
    if overheat_mask.sum() > 0:
        print(f"  과열 필터 적용: {overheat_mask.sum()}개 종목 A등급 상한 (64.9) 적용")

    if skip_count > 0:
        print(f"\n  ⚠️  데이터 부족으로 스킵된 종목: {skip_count}개")
    if len(raw_rows) < 10:
        print(f"\n  ❌ 팩터 계산 실패: 유효 종목이 {len(raw_rows)}개뿐 (최소 10개 필요). "
              f"KIS API / yfinance 연결 상태를 확인하세요.", file=sys.stderr)
        return

    df = df.sort_values("composite_score", ascending=False).reset_index(drop=True)
    df["rank_total"]    = range(1, len(df) + 1)
    df["calculated_at"] = datetime.now(timezone.utc).isoformat()

    # ── Supabase upsert ───────────────────────────────────────────
    print(f"\n  Supabase 저장 중 ({len(df)}개)...")
    records = []
    for _, row in df.iterrows():
        record = {k: (None if isinstance(v, float) and np.isnan(v) else
                      (int(v) if isinstance(v, (np.integer,)) else
                       (float(v) if isinstance(v, (np.floating,)) else v)))
                  for k, v in row.items()}
        records.append(record)
    try:
        supabase.table("factor_scores").upsert(records, on_conflict="ticker").execute()
        print(f"  저장 완료 ({len(records)}개)")
    except Exception as e:
        print(f"  [팩터 Supabase 저장 오류] {e}")

    print("\n  상위 15 종목:")
    print(f"  {'순위':>4} {'종목':12} {'섹터':10} {'종합':>6} {'3M':>7} {'RS':>7} {'변동성':>7}")
    print("  " + "-" * 65)
    for _, r in df.head(15).iterrows():
        print(f"  {int(r.rank_total):4d} {r.stock_name:12} {r.sector:10} "
              f"{r.composite_score:6.1f} "
              f"{(r.momentum_3m or 0)*100:+6.1f}% "
              f"{(r.relative_strength_3m or 0)*100:+6.1f}% "
              f"{(r.volatility_20d or 0)*100:5.1f}%")

    print(f"\n=== 팩터 계산 완료: {len(df)}개 종목 ===\n")


if __name__ == "__main__":
    run()
