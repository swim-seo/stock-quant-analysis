import pandas as pd
import numpy as np


def add_moving_averages(df: pd.DataFrame, windows: list = [5, 20, 60]) -> pd.DataFrame:
    """
    이동평균선 추가

    Args:
        df: OHLCV 데이터프레임
        windows: 이동평균 기간 리스트 (기본: 5일, 20일, 60일)
    """
    for window in windows:
        df[f"MA{window}"] = df["종가"].rolling(window=window).mean()
    return df


def add_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """
    RSI (상대강도지수) 추가
    - 70 이상: 과매수 (매도 신호)
    - 30 이하: 과매도 (매수 신호)
    """
    delta = df["종가"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()

    rs = avg_gain / avg_loss
    df["RSI"] = 100 - (100 / (1 + rs))
    return df


def add_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """
    MACD (이동평균 수렴확산) 추가
    - MACD가 시그널선 위로 교차: 매수 신호
    - MACD가 시그널선 아래로 교차: 매도 신호
    """
    ema_fast = df["종가"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["종가"].ewm(span=slow, adjust=False).mean()

    df["MACD"] = ema_fast - ema_slow
    df["MACD_signal"] = df["MACD"].ewm(span=signal, adjust=False).mean()
    df["MACD_hist"] = df["MACD"] - df["MACD_signal"]
    return df


def add_bollinger_bands(df: pd.DataFrame, window: int = 20, num_std: float = 2.0) -> pd.DataFrame:
    """
    볼린저 밴드 추가
    - 상단 밴드 돌파: 과매수
    - 하단 밴드 이탈: 과매도
    """
    ma = df["종가"].rolling(window=window).mean()
    std = df["종가"].rolling(window=window).std()

    df["BB_upper"] = ma + (num_std * std)
    df["BB_middle"] = ma
    df["BB_lower"] = ma - (num_std * std)
    df["BB_width"] = (df["BB_upper"] - df["BB_lower"]) / df["BB_middle"]
    return df


def add_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    매수/매도 신호 생성
    - 골든크로스 (MA5 > MA20): 매수
    - 데드크로스 (MA5 < MA20): 매도
    - RSI < 30: 매수 보조 신호
    - RSI > 70: 매도 보조 신호
    """
    # 골든/데드 크로스
    df["golden_cross"] = (df["MA5"] > df["MA20"]) & (df["MA5"].shift(1) <= df["MA20"].shift(1))
    df["dead_cross"] = (df["MA5"] < df["MA20"]) & (df["MA5"].shift(1) >= df["MA20"].shift(1))

    # RSI 신호
    df["rsi_buy"] = df["RSI"] < 30
    df["rsi_sell"] = df["RSI"] > 70

    # 종합 신호
    df["signal"] = "중립"
    df.loc[df["golden_cross"] | df["rsi_buy"], "signal"] = "매수"
    df.loc[df["dead_cross"] | df["rsi_sell"], "signal"] = "매도"

    return df


def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """모든 지표 한번에 추가"""
    df = add_moving_averages(df)
    df = add_rsi(df)
    df = add_macd(df)
    df = add_bollinger_bands(df)
    df = add_signals(df)
    return df


if __name__ == "__main__":
    from data_collector import get_stock_data

    df = get_stock_data("005930.KS", period="1y")
    df = add_all_indicators(df)

    print("=== 최근 5일 지표 ===")
    cols = ["종가", "MA5", "MA20", "RSI", "MACD", "signal"]
    print(df[cols].tail(5).to_string())

    print("\n=== 최근 매수/매도 신호 ===")
    signals = df[df["signal"] != "중립"][["종가", "RSI", "signal"]].tail(10)
    print(signals.to_string())
