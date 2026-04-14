import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta


# 한국 주요 종목 코드
KOSPI_STOCKS = {
    "삼성전자": "005930.KS",
    "SK하이닉스": "000660.KS",
    "LG에너지솔루션": "373220.KS",
    "삼성바이오로직스": "207940.KS",
    "현대차": "005380.KS",
}

KOSDAQ_STOCKS = {
    "에코프로비엠": "247540.KQ",
    "셀트리온헬스케어": "091990.KQ",
    "카카오게임즈": "293490.KQ",
}

# 지수
INDICES = {
    "코스피": "^KS11",
    "코스닥": "^KQ11",
    "S&P500": "^GSPC",
}


def get_stock_data(ticker: str, period: str = "1y") -> pd.DataFrame:
    """
    주가 데이터 수집

    Args:
        ticker: 종목 코드 (예: '005930.KS', '^KS11')
        period: 기간 (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)

    Returns:
        OHLCV 데이터프레임
    """
    stock = yf.Ticker(ticker)
    df = stock.history(period=period)

    if df.empty:
        print(f"데이터 없음: {ticker}")
        return None

    # 컬럼명 한글화
    df = df[["Open", "High", "Low", "Close", "Volume"]]
    df.columns = ["시가", "고가", "저가", "종가", "거래량"]
    df.index.name = "날짜"

    return df


def get_multiple_stocks(tickers: dict, period: str = "1y") -> dict:
    """
    여러 종목 데이터 한번에 수집

    Args:
        tickers: {종목명: 티커코드} 딕셔너리
        period: 기간

    Returns:
        {종목명: 데이터프레임} 딕셔너리
    """
    result = {}
    for name, ticker in tickers.items():
        print(f"수집 중: {name} ({ticker})")
        df = get_stock_data(ticker, period)
        if df is not None:
            result[name] = df
    return result


def get_stock_info(ticker: str) -> dict:
    """종목 기본 정보 조회"""
    stock = yf.Ticker(ticker)
    info = stock.info

    return {
        "종목명": info.get("longName", ""),
        "현재가": info.get("currentPrice", ""),
        "시가총액": info.get("marketCap", ""),
        "PER": info.get("trailingPE", ""),
        "PBR": info.get("priceToBook", ""),
        "52주 최고": info.get("fiftyTwoWeekHigh", ""),
        "52주 최저": info.get("fiftyTwoWeekLow", ""),
    }


if __name__ == "__main__":
    # 삼성전자 1년치 데이터
    print("=== 삼성전자 주가 데이터 ===")
    df = get_stock_data("005930.KS", period="1y")
    print(df.tail(5))
    print()

    # 코스피 지수
    print("=== 코스피 지수 ===")
    kospi = get_stock_data("^KS11", period="3mo")
    print(kospi.tail(5))
    print()

    # 삼성전자 기본 정보
    print("=== 삼성전자 기본 정보 ===")
    info = get_stock_info("005930.KS")
    for k, v in info.items():
        print(f"{k}: {v}")
