"""
다종목 백테스트 (20개 종목)
- XGBoost + LightGBM 앙상블
- 슬리피지 0.1% + 수수료 0.15% 반영
- 종목별 성과 + 전체 평균 출력
"""
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pandas as pd
import numpy as np
from data_collector import get_stock_data
from indicators import add_all_indicators
from multi_timeframe import add_mtf_signal
from ml_model import build_features, train_model, add_ml_signal, FEATURE_COLS, EnsembleModel
from backtester import Backtester, print_result

# 테스트 종목 (20개)
TEST_STOCKS = {
    "삼성전자": "005930.KS",
    "SK하이닉스": "000660.KS",
    "현대차": "005380.KS",
    "NAVER": "035420.KS",
    "카카오": "035720.KS",
    "LG화학": "051910.KS",
    "삼성SDI": "006400.KS",
    "셀트리온": "068270.KS",
    "기아": "000270.KS",
    "KB금융": "105560.KS",
    "신한지주": "055550.KS",
    "현대모비스": "012330.KS",
    "LG전자": "066570.KS",
    "삼성물산": "028260.KS",
    "SK텔레콤": "017670.KS",
    "한미반도체": "042700.KS",
    "삼성전기": "009150.KS",
    "KT": "030200.KS",
    "하나금융지주": "086790.KS",
    "포스코퓨처엠": "003670.KS",
}


def backtest_single(name: str, ticker: str) -> dict | None:
    """단일 종목 백테스트"""
    try:
        # 데이터 수집
        df = get_stock_data(ticker, period="3y")
        if df is None or len(df) < 200:
            print(f"  [스킵] 데이터 부족 ({len(df) if df is not None else 0}일)")
            return None

        # 지표 + 피처 생성
        df = add_all_indicators(df)
        df = add_mtf_signal(df)
        df = build_features(df)

        # 피처 유효성 확인
        valid = df.dropna(subset=FEATURE_COLS + ["target"])
        if len(valid) < 100:
            print(f"  [스킵] 유효 데이터 부족 ({len(valid)}일)")
            return None

        # 모델 학습 (출력 억제)
        import io
        import contextlib
        f = io.StringIO()
        with contextlib.redirect_stdout(f):
            model, test_idx = train_model(df)

        # ML 신호 추가
        df = add_ml_signal(df, model)

        # 신호 분포 확인
        signal_counts = df["final_signal"].value_counts()
        buy_count = signal_counts.get("매수", 0)
        sell_count = signal_counts.get("매도", 0)

        # 백테스트 실행 (현실적 수수료 + 슬리피지)
        bt_ml = Backtester(
            initial_capital=10_000_000,
            stop_loss=0.05,
            take_profit=0.10,
            slippage=0.001,    # 슬리피지 0.1%
        )
        df_ml = df.copy()
        df_ml["signal"] = df_ml["final_signal"]
        result_ml = bt_ml.run(df_ml, fee_rate=0.0015)  # 수수료 0.15%

        # 기존 MTF 전략도 비교
        bt_base = Backtester(
            initial_capital=10_000_000,
            stop_loss=0.05,
            take_profit=0.10,
            slippage=0.001,
        )
        df_base = df.copy()
        df_base["signal"] = df_base["mtf_signal"]
        result_base = bt_base.run(df_base, fee_rate=0.0015)

        return {
            "종목명": name,
            "ticker": ticker,
            "데이터일수": len(df),
            "매수신호": buy_count,
            "매도신호": sell_count,
            "MTF_수익률": result_base["수익률"],
            "MTF_MDD": result_base["MDD"],
            "MTF_승률": result_base["승률"],
            "MTF_거래수": result_base["총거래횟수"],
            "ML_수익률": result_ml["수익률"],
            "ML_MDD": result_ml["MDD"],
            "ML_승률": result_ml["승률"],
            "ML_거래수": result_ml["총거래횟수"],
        }

    except Exception as e:
        print(f"  [에러] {e}")
        return None


def main():
    print("=" * 70)
    print("  다종목 백테스트 (20개 종목)")
    print("  슬리피지 0.1% + 수수료 0.15% 반영")
    print("=" * 70)

    results = []
    for i, (name, ticker) in enumerate(TEST_STOCKS.items()):
        print(f"\n[{i+1}/{len(TEST_STOCKS)}] {name} ({ticker})")
        result = backtest_single(name, ticker)
        if result:
            print(f"  MTF: {result['MTF_수익률']:+.2f}% (MDD {result['MTF_MDD']:.2f}%) | "
                  f"ML: {result['ML_수익률']:+.2f}% (MDD {result['ML_MDD']:.2f}%)")
            results.append(result)

    if not results:
        print("\n결과 없음")
        return

    # 결과 테이블
    df_results = pd.DataFrame(results)

    print("\n")
    print("=" * 70)
    print("  종목별 결과")
    print("=" * 70)
    print(f"{'종목명':<12} {'MTF수익률':>10} {'MTF_MDD':>10} {'ML수익률':>10} {'ML_MDD':>10} {'ML승률':>8} {'거래수':>6}")
    print("-" * 70)
    for _, r in df_results.iterrows():
        print(f"{r['종목명']:<12} {r['MTF_수익률']:>+9.2f}% {r['MTF_MDD']:>9.2f}% "
              f"{r['ML_수익률']:>+9.2f}% {r['ML_MDD']:>9.2f}% {r['ML_승률']:>7.1f}% {r['ML_거래수']:>5.0f}")

    print("-" * 70)
    print(f"{'평균':<12} {df_results['MTF_수익률'].mean():>+9.2f}% {df_results['MTF_MDD'].mean():>9.2f}% "
          f"{df_results['ML_수익률'].mean():>+9.2f}% {df_results['ML_MDD'].mean():>9.2f}% "
          f"{df_results['ML_승률'].mean():>7.1f}% {df_results['ML_거래수'].mean():>5.0f}")

    # ML이 MTF보다 나은 종목 수
    ml_wins = (df_results["ML_수익률"] > df_results["MTF_수익률"]).sum()
    print(f"\nML이 MTF보다 나은 종목: {ml_wins}/{len(df_results)}개")
    print(f"ML 평균 수익률: {df_results['ML_수익률'].mean():+.2f}%")
    print(f"MTF 평균 수익률: {df_results['MTF_수익률'].mean():+.2f}%")

    # 결과 저장
    df_results.to_csv("backtest_results.csv", index=False, encoding="utf-8-sig")
    print("\n결과 저장: backtest_results.csv")


if __name__ == "__main__":
    main()
