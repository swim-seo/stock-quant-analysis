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


def add_atr(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """
    ATR (Average True Range) - 변동성 지표
    값이 클수록 변동성이 큰 상태
    """
    high = df["고가"]
    low = df["저가"]
    close = df["종가"].shift(1)
    tr = pd.concat([
        high - low,
        (high - close).abs(),
        (low - close).abs(),
    ], axis=1).max(axis=1)
    df["ATR"] = tr.rolling(window=period).mean()
    df["ATR_pct"] = df["ATR"] / df["종가"] * 100  # 종가 대비 ATR %
    return df


def add_stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> pd.DataFrame:
    """
    스토캐스틱 오실레이터
    - %K > 80: 과매수
    - %K < 20: 과매도
    - %K가 %D를 상향 돌파: 매수 신호
    """
    low_min = df["저가"].rolling(window=k_period).min()
    high_max = df["고가"].rolling(window=k_period).max()
    df["STOCH_K"] = ((df["종가"] - low_min) / (high_max - low_min + 1e-9)) * 100
    df["STOCH_D"] = df["STOCH_K"].rolling(window=d_period).mean()
    return df


def add_obv(df: pd.DataFrame) -> pd.DataFrame:
    """
    OBV (On Balance Volume) - 거래량 누적 지표
    가격이 오르면 거래량 더하고, 내리면 빼서 매집/분산 파악
    """
    direction = np.sign(df["종가"].diff())
    df["OBV"] = (direction * df["거래량"]).cumsum()
    df["OBV_MA20"] = df["OBV"].rolling(20).mean()
    df["OBV_signal"] = df["OBV"] - df["OBV_MA20"]  # OBV > MA20이면 매집 중
    return df


def add_adx(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """
    ADX (Average Directional Index) - 추세 강도 지표
    - ADX > 25: 강한 추세 (트렌드 추종 유효)
    - ADX < 20: 약한 추세 (횡보, 트렌드 추종 비효율)
    """
    high = df["고가"]
    low = df["저가"]
    close = df["종가"]

    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm[plus_dm < 0] = 0
    minus_dm[minus_dm < 0] = 0
    # +DM이 -DM보다 작으면 0
    plus_dm[plus_dm < minus_dm] = 0
    minus_dm[minus_dm < plus_dm] = 0

    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)

    atr = tr.rolling(window=period).mean()
    plus_di = 100 * (plus_dm.rolling(window=period).mean() / (atr + 1e-9))
    minus_di = 100 * (minus_dm.rolling(window=period).mean() / (atr + 1e-9))

    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di + 1e-9))
    df["ADX"] = dx.rolling(window=period).mean()
    df["PLUS_DI"] = plus_di
    df["MINUS_DI"] = minus_di
    return df


def add_cci(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """
    CCI (Commodity Channel Index) - 추세 이탈 지표
    - CCI > 100: 과매수
    - CCI < -100: 과매도
    """
    tp = (df["고가"] + df["저가"] + df["종가"]) / 3
    ma = tp.rolling(window=period).mean()
    md = tp.rolling(window=period).apply(lambda x: np.abs(x - x.mean()).mean())
    df["CCI"] = (tp - ma) / (0.015 * md + 1e-9)
    return df


def add_williams_r(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """
    Williams %R - 모멘텀 오실레이터
    - %R > -20: 과매수
    - %R < -80: 과매도
    """
    high_max = df["고가"].rolling(window=period).max()
    low_min = df["저가"].rolling(window=period).min()
    df["WILLIAMS_R"] = ((high_max - df["종가"]) / (high_max - low_min + 1e-9)) * -100
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
    df = add_atr(df)
    df = add_stochastic(df)
    df = add_obv(df)
    df = add_adx(df)
    df = add_cci(df)
    df = add_williams_r(df)
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
