"""
eval_factor_ic.py — 팩터 IC(Information Coefficient) 측정 및 가중치 최적화

IC(정보계수): 예측 점수와 실제 수익률의 Spearman 순위 상관계수
  IC > 0.05  → 의미 있는 예측력
  IC > 0.10  → 우수한 예측력
  ICIR > 0.5 → 안정적인 팩터

측정 항목:
  1. 컴포넌트별 1일 방향 IC (tech/ml/news/yt/composite)
  2. 복합 점수 구간별 승률 (Decile 분석)
  3. 포워드 수익률 IC (5/10/20 거래일)
  4. IC 안정성 (월별 Rolling IC)
  5. 최적 가중치 제안

실행: python eval_factor_ic.py
"""

import os
import sys
import json
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
KST = timezone(timedelta(hours=9))

_SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

LOOKBACK_DAYS = 120   # 최근 N일 데이터로 IC 계산
FORWARD_DAYS  = [5, 10, 20]  # 포워드 수익률 기간 (거래일)
MIN_SAMPLES   = 30   # IC 신뢰도를 위한 최소 샘플 수


# ── Supabase 헬퍼 ─────────────────────────────────────────────────────────────
def _sb_get(table: str, params: str = "") -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=_SB_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  [Supabase 오류] {table}: {e}")
        return []


# ── IC 계산 유틸 ──────────────────────────────────────────────────────────────
def spearman_ic(scores: pd.Series, returns: pd.Series) -> float | None:
    """Spearman 순위 상관계수 (IC). scipy 없이 순수 numpy 구현."""
    df = pd.DataFrame({"score": scores, "ret": returns}).dropna()
    if len(df) < MIN_SAMPLES:
        return None
    # 순위 변환 후 Pearson 상관계수 = Spearman IC
    rank_s = df["score"].rank()
    rank_r = df["ret"].rank()
    n = len(df)
    if rank_s.std() == 0 or rank_r.std() == 0:
        return None
    ic = float(np.corrcoef(rank_s, rank_r)[0, 1])
    return ic if not np.isnan(ic) else None


def icir(ic_series: pd.Series) -> float | None:
    """IC Information Ratio = mean(IC) / std(IC). 값이 클수록 안정적."""
    valid = ic_series.dropna()
    if len(valid) < 3 or valid.std() == 0:
        return None
    return float(valid.mean() / valid.std())


def win_rate_by_decile(df: pd.DataFrame, score_col: str, outcome_col: str, n: int = 5) -> pd.DataFrame:
    """점수를 N분위로 나눠 구간별 승률 계산."""
    df = df[[score_col, outcome_col]].dropna()
    if len(df) < n * MIN_SAMPLES / n:
        return pd.DataFrame()
    df["decile"] = pd.qcut(df[score_col], q=n, labels=[f"Q{i+1}" for i in range(n)], duplicates="drop")
    result = df.groupby("decile", observed=True)[outcome_col].agg(["mean", "count"])
    result.columns = ["win_rate", "count"]
    result["win_rate"] = result["win_rate"] * 100
    return result


# ── 포워드 수익률 계산 ──────────────────────────────────────────────────────────
def _fetch_forward_returns(ticker: str, start_date: str, forward_n: int) -> dict[str, float]:
    """KIS OHLCV로 start_date 이후 N거래일 수익률 계산."""
    try:
        from kis_fetcher import get_client as _get_kis
        code = ticker.split(".")[0]
        rows = _get_kis().fetch_ohlcv_daily(code, days=forward_n + 60)
        if not rows:
            return {}
        df = pd.DataFrame(rows)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()

        target = pd.Timestamp(start_date)
        # target 날짜 이후 첫 거래일 찾기
        available = df.index[df.index >= target]
        if len(available) < forward_n + 1:
            return {}

        entry_price = df.loc[available[0], "close"]
        exit_price  = df.loc[available[min(forward_n, len(available)-1)], "close"]
        if entry_price > 0:
            return {f"ret_{forward_n}d": (exit_price / entry_price - 1)}
    except Exception:
        pass
    return {}


# ── 메인 분석 함수들 ────────────────────────────────────────────────────────────
def analyze_direction_ic(rows: list[dict]) -> dict:
    """1일 방향 IC: 점수 vs actual_up (binary 0/1)"""
    df = pd.DataFrame(rows)
    df["direction"] = df["actual_up"].apply(lambda x: 1 if x else -1)

    components = {
        "composite_score": "복합 점수",
        "tech_score":      "기술적 점수",
        "ml_score":        "ML 점수",
        "news_score":      "뉴스 점수",
        "yt_score":        "유튜브 점수",
    }

    results = {}
    for col, label in components.items():
        if col not in df.columns:
            continue
        ic = spearman_ic(df[col], df["direction"])
        n  = df[[col, "direction"]].dropna().__len__()
        results[col] = {"label": label, "ic": ic, "n": n}

    return results


def analyze_decile_accuracy(rows: list[dict]) -> None:
    """복합 점수 분위별 예측 적중률"""
    df = pd.DataFrame(rows)
    df["correct_num"] = df["correct"].apply(lambda x: 1 if x else 0)

    deciles = win_rate_by_decile(df, "composite_score", "correct_num", n=5)
    if deciles.empty:
        return

    print(f"\n  {'분위':^6} {'샘플':>6} {'적중률':>8}  {'평가':}")
    print("  " + "-" * 32)
    for decile, row in deciles.iterrows():
        wr = row["win_rate"]
        bar = "█" * int(wr / 10)
        grade = "🔥" if wr >= 60 else ("✅" if wr >= 55 else ("⚠️ " if wr >= 50 else "❌"))
        print(f"  {decile:^6} {int(row['count']):>5}개  {wr:>6.1f}%  {grade} {bar}")


def analyze_rolling_ic(rows: list[dict], window_days: int = 30) -> pd.Series:
    """월별 Rolling IC — IC가 안정적인지 시간축으로 확인"""
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df["direction"] = df["actual_up"].apply(lambda x: 1 if x else -1)
    df = df.sort_values("date")

    monthly_ic = {}
    for period, grp in df.groupby(df["date"].dt.to_period("M")):
        ic = spearman_ic(grp["composite_score"], grp["direction"])
        monthly_ic[str(period)] = ic

    return pd.Series(monthly_ic)


def analyze_forward_return_ic(rows: list[dict], sample_n: int = 80) -> dict:
    """포워드 수익률 IC: N거래일 후 실제 수익률 vs 점수 (KIS 데이터 사용)"""
    print(f"\n  KIS에서 포워드 수익률 계산 중 (최대 {sample_n}개 샘플)...")

    df = pd.DataFrame(rows).sort_values("date", ascending=False)
    # 최근 데이터부터 샘플링
    sample = df.drop_duplicates("ticker").head(sample_n)

    ic_results: dict[int, list[float]] = {n: [] for n in FORWARD_DAYS}
    scores: dict[int, list[float]] = {n: [] for n in FORWARD_DAYS}

    for i, (_, row) in enumerate(sample.iterrows()):
        ticker     = row["ticker"]
        date_str   = str(row["date"])
        comp_score = row.get("composite_score")
        if comp_score is None:
            continue

        print(f"\r  [{i+1}/{len(sample)}] {ticker} 처리 중...", end="", flush=True)

        for n in FORWARD_DAYS:
            fwd = _fetch_forward_returns(ticker, date_str, forward_n=n)
            ret = fwd.get(f"ret_{n}d")
            if ret is not None:
                scores[n].append(comp_score)
                ic_results[n].append(ret)
        time.sleep(0.07)  # KIS rate limit

    print()
    results = {}
    for n in FORWARD_DAYS:
        if len(ic_results[n]) >= MIN_SAMPLES:
            ic = spearman_ic(pd.Series(scores[n]), pd.Series(ic_results[n]))
            results[n] = {"ic": ic, "n": len(ic_results[n]),
                          "avg_ret": np.mean(ic_results[n]) * 100}
        else:
            results[n] = {"ic": None, "n": len(ic_results[n]), "avg_ret": None}

    return results


def suggest_weights(direction_ic: dict) -> None:
    """IC 기반 최적 가중치 제안."""
    components = {
        "tech_score":  ("tech",  0.40),
        "ml_score":    ("ml",    0.00),
        "news_score":  ("news",  0.15),
        "yt_score":    ("yt",    0.20),
    }
    # composite_score 제외, 컴포넌트만 추출
    valid_ics = {}
    for col, (label, current) in components.items():
        ic_data = direction_ic.get(col)
        if ic_data and ic_data["ic"] is not None and ic_data["n"] >= MIN_SAMPLES:
            valid_ics[label] = max(ic_data["ic"], 0)  # 음수 IC는 0으로 처리

    if not valid_ics or sum(valid_ics.values()) == 0:
        print("\n  IC 기반 가중치 제안: 데이터 부족으로 계산 불가")
        return

    total_ic = sum(valid_ics.values())
    suggested = {k: v / total_ic for k, v in valid_ics.items()}

    print(f"\n  {'컴포넌트':10} {'현재 가중치':>10} {'IC 기반 제안':>12} {'변화':>8}")
    print("  " + "-" * 44)
    current_weights = {"tech": 0.40, "ml": 0.00, "news": 0.15, "yt": 0.20}
    for label in ["tech", "ml", "news", "yt"]:
        cur  = current_weights.get(label, 0)
        sugg = suggested.get(label, 0)
        diff = sugg - cur
        arrow = "▲" if diff > 0.02 else ("▼" if diff < -0.02 else "→")
        print(f"  {label:10} {cur*100:>9.1f}%  {sugg*100:>11.1f}%  {arrow} {diff*100:>+5.1f}%")

    print("\n  ※ factor_calculator.py 가중치 (25%)는 별도 IC 측정 필요")
    print("  ※ IC 음수 컴포넌트는 가중치 0으로 조정됨")


# ── 메인 실행 ──────────────────────────────────────────────────────────────────
def run(skip_forward: bool = False) -> None:
    print("\n" + "=" * 60)
    print("  팩터 IC (Information Coefficient) 분석")
    print(f"  기준: 최근 {LOOKBACK_DAYS}일 / 최소 샘플 {MIN_SAMPLES}개")
    print("=" * 60)

    # ── 데이터 로드 ─────────────────────────────────────────────
    cutoff = (datetime.now(KST) - timedelta(days=LOOKBACK_DAYS)).date().isoformat()
    rows = _sb_get(
        "prediction_log",
        f"date=gte.{cutoff}"
        f"&correct=not.is.null"
        f"&select=date,ticker,composite_score,tech_score,ml_score,news_score,yt_score,"
        f"predicted_up,actual_up,correct"
        f"&order=date.desc&limit=2000",
    )

    if not rows:
        print("\n  ❌ prediction_log에 actual_up 데이터가 없습니다.")
        print("  → 최소 2일 이상 railway_job.py morning을 실행해야 데이터가 쌓입니다.")
        return

    total = len(rows)
    correct_count = sum(1 for r in rows if r.get("correct"))
    print(f"\n  데이터: {total}개 예측 (적중 {correct_count}개, 전체 적중률 {correct_count/total*100:.1f}%)")

    # ── 1. 1일 방향 IC ──────────────────────────────────────────
    print("\n" + "─" * 60)
    print("  [1] 컴포넌트별 1일 방향 IC (Spearman)")
    print("─" * 60)
    direction_ic = analyze_direction_ic(rows)

    print(f"  {'컴포넌트':14} {'IC':>8} {'샘플':>6}  {'해석':}")
    print("  " + "-" * 45)
    for col, data in direction_ic.items():
        ic  = data["ic"]
        n   = data["n"]
        lbl = data["label"]
        if ic is None:
            interp = "데이터 부족"
        elif ic >= 0.10:
            interp = "🔥 우수"
        elif ic >= 0.05:
            interp = "✅ 양호"
        elif ic >= 0.02:
            interp = "⚠️  약함"
        elif ic >= 0:
            interp = "➡️  노이즈 수준"
        else:
            interp = "❌ 역방향 (제거 검토)"
        ic_str = f"{ic:+.4f}" if ic is not None else "N/A"
        print(f"  {lbl:14} {ic_str:>8} {n:>5}개  {interp}")

    # ── 2. 분위별 적중률 ────────────────────────────────────────
    print("\n" + "─" * 60)
    print("  [2] 복합 점수 분위별 예측 적중률 (Q1=낮음, Q5=높음)")
    print("─" * 60)
    analyze_decile_accuracy(rows)

    # ── 3. Monthly Rolling IC ────────────────────────────────────
    print("\n" + "─" * 60)
    print("  [3] 월별 Rolling IC (안정성 확인)")
    print("─" * 60)
    rolling = analyze_rolling_ic(rows)
    if not rolling.empty:
        for month, ic in rolling.items():
            ic_str = f"{ic:+.4f}" if ic is not None else "N/A   "
            bar = ""
            if ic is not None:
                bar_len = int(abs(ic) * 80)
                bar = ("█" if ic >= 0 else "░") * min(bar_len, 20)
            print(f"  {month}: {ic_str}  {bar}")

        valid_rolling = rolling.dropna()
        if len(valid_rolling) >= 2:
            ir = icir(valid_rolling)
            print(f"\n  ICIR: {ir:.3f}" if ir else "")
            print(f"  IC 평균: {valid_rolling.mean():+.4f} / IC 표준편차: {valid_rolling.std():.4f}")
            if ir and abs(ir) >= 0.5:
                print("  ✅ ICIR ≥ 0.5 → 안정적인 팩터")
            elif ir:
                print("  ⚠️  ICIR < 0.5 → 팩터 불안정 (데이터 누적 필요)")

    # ── 4. 포워드 수익률 IC (KIS 데이터) ─────────────────────────
    if not skip_forward:
        print("\n" + "─" * 60)
        print("  [4] 포워드 수익률 IC (KIS 실제 가격 기반)")
        print("─" * 60)
        fwd_ic = analyze_forward_return_ic(rows, sample_n=60)
        print(f"  {'기간':>8} {'IC':>8} {'샘플':>6} {'평균수익':>10}  {'해석':}")
        print("  " + "-" * 50)
        for n, data in fwd_ic.items():
            ic  = data["ic"]
            cnt = data["n"]
            avg = data["avg_ret"]
            if ic is None:
                interp = "데이터 부족"
                ic_str, avg_str = "N/A", "N/A"
            else:
                ic_str  = f"{ic:+.4f}"
                avg_str = f"{avg:+.2f}%" if avg is not None else "N/A"
                interp  = ("🔥 우수" if ic >= 0.10 else
                           "✅ 양호" if ic >= 0.05 else
                           "⚠️  약함" if ic >= 0.02 else
                           "❌ 역방향" if ic < 0 else "➡️  노이즈")
            print(f"  {n:>3}거래일 {ic_str:>8} {cnt:>5}개 {avg_str:>9}  {interp}")
    else:
        fwd_ic = {}

    # ── 5. 최적 가중치 제안 ──────────────────────────────────────
    print("\n" + "─" * 60)
    print("  [5] IC 기반 최적 가중치 제안")
    print("─" * 60)
    suggest_weights(direction_ic)

    # ── 요약 ─────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  분석 완료")
    comp_ic = direction_ic.get("composite_score", {}).get("ic")
    if comp_ic is not None:
        if comp_ic >= 0.05:
            print(f"  ✅ 복합 점수 IC={comp_ic:+.4f}: 예측력 있음")
        elif comp_ic >= 0:
            print(f"  ⚠️  복합 점수 IC={comp_ic:+.4f}: 약한 예측력 (데이터 누적 필요)")
        else:
            print(f"  ❌ 복합 점수 IC={comp_ic:+.4f}: 역방향 신호! 가중치 재검토 필요")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="팩터 IC 분석")
    parser.add_argument("--skip-forward", action="store_true",
                        help="포워드 수익률 IC 계산 생략 (빠른 실행)")
    parser.add_argument("--days", type=int, default=LOOKBACK_DAYS,
                        help=f"분석 기간 (기본: {LOOKBACK_DAYS}일)")
    args = parser.parse_args()

    LOOKBACK_DAYS = args.days
    run(skip_forward=args.skip_forward)
