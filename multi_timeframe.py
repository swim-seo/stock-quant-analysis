import pandas as pd
import numpy as np
from data_collector import get_stock_data
from indicators import add_all_indicators
from backtester import Backtester, print_result


def resample_to_weekly(df: pd.DataFrame) -> pd.DataFrame:
    """일봉 데이터를 주봉으로 변환"""
    weekly = df.resample("W").agg({
        "시가": "first",
        "고가": "max",
        "저가": "min",
        "종가": "last",
        "거래량": "sum",
    }).dropna()
    return weekly


def get_weekly_trend(df_weekly: pd.DataFrame) -> pd.Series:
    """
    주봉 기준 추세 판단
    - MA5 > MA20: 상승추세
    - MA5 < MA20: 하락추세
    """
    df_weekly = add_all_indicators(df_weekly.copy())
    trend = pd.Series(index=df_weekly.index, dtype=str)
    trend[df_weekly["MA5"] >= df_weekly["MA20"]] = "상승"
    trend[df_weekly["MA5"] < df_weekly["MA20"]] = "하락"
    return trend


def add_mtf_signal(df_daily: pd.DataFrame) -> pd.DataFrame:
    """
    멀티 타임프레임 신호 추가

    규칙:
    - 주봉 상승추세 + 일봉 매수 신호 → 매수
    - 주봉 하락추세 OR 일봉 매도 신호 → 매도
    → 주봉이 하락추세면 일봉 매수 신호가 와도 무시
    """
    df_weekly = resample_to_weekly(df_daily)
    weekly_trend = get_weekly_trend(df_weekly)

    # 주봉 추세를 일봉에 매핑 (forward fill)
    trend_daily = weekly_trend.reindex(df_daily.index, method="ffill")
    df_daily["주봉추세"] = trend_daily.values

    # 멀티 타임프레임 신호
    df_daily["mtf_signal"] = "중립"

    # 주봉 상승 + 일봉 매수 → 매수
    buy_cond = (df_daily["주봉추세"] == "상승") & (df_daily["signal"] == "매수")
    df_daily.loc[buy_cond, "mtf_signal"] = "매수"

    # 주봉 하락 OR 일봉 매도 → 매도
    sell_cond = (df_daily["주봉추세"] == "하락") | (df_daily["signal"] == "매도")
    df_daily.loc[sell_cond, "mtf_signal"] = "매도"

    return df_daily


class MTFBacktester(Backtester):
    """멀티 타임프레임 신호를 사용하는 백테스터"""

    def run(self, df: pd.DataFrame, fee_rate: float = 0.00015) -> dict:
        # mtf_signal을 signal로 교체해서 기존 백테스터 활용
        df = df.copy()
        df["signal"] = df["mtf_signal"]
        return super().run(df, fee_rate)


if __name__ == "__main__":
    df = get_stock_data("005930.KS", period="2y")
    df = add_all_indicators(df)
    df = add_mtf_signal(df)

    print("주봉 추세 분포:")
    print(df["주봉추세"].value_counts())
    print()

    # 기존 전략 vs 멀티 타임프레임 비교
    bt = Backtester(initial_capital=10_000_000, stop_loss=0.05, take_profit=0.10)
    result_base = bt.run(df)
    print_result(result_base, "기존 전략 (일봉만)")

    mtf_bt = MTFBacktester(initial_capital=10_000_000, stop_loss=0.05, take_profit=0.10)
    result_mtf = mtf_bt.run(df)
    print_result(result_mtf, "멀티 타임프레임 (일봉+주봉)")

    print("\n=== 비교 요약 ===")
    print(f"{'':20} {'기존':>10} {'MTF':>10}")
    print(f"{'수익률':20} {result_base['수익률']:>9.2f}% {result_mtf['수익률']:>9.2f}%")
    print(f"{'MDD':20} {result_base['MDD']:>9.2f}% {result_mtf['MDD']:>9.2f}%")
    print(f"{'승률':20} {result_base['승률']:>9.1f}% {result_mtf['승률']:>9.1f}%")
    print(f"{'총거래횟수':20} {result_base['총거래횟수']:>10} {result_mtf['총거래횟수']:>10}")
