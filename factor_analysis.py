import pandas as pd
import numpy as np
import yfinance as yf
from data_collector import get_stock_data, KOSPI_STOCKS
from indicators import add_all_indicators
from multi_timeframe import add_mtf_signal, MTFBacktester
from backtester import print_result


def get_fundamental_data(ticker: str) -> dict:
    """
    종목 재무 팩터 수집
    - PER: 주가 / 주당순이익 (낮을수록 저평가)
    - PBR: 주가 / 주당순자산 (낮을수록 저평가)
    - ROE: 순이익 / 자기자본 (높을수록 수익성 좋음)
    - 배당수익률: 낮은 주가에 배당 많으면 매력적
    """
    stock = yf.Ticker(ticker)
    info = stock.info

    return {
        "PER": info.get("trailingPE", None),
        "PBR": info.get("priceToBook", None),
        "ROE": info.get("returnOnEquity", None),
        "배당수익률": info.get("dividendYield", None),
        "영업이익률": info.get("operatingMargins", None),
        "부채비율": info.get("debtToEquity", None),
        "시가총액": info.get("marketCap", None),
        "52주최고": info.get("fiftyTwoWeekHigh", None),
        "52주최저": info.get("fiftyTwoWeekLow", None),
        "현재가": info.get("currentPrice", None),
    }


def score_fundamentals(data: dict) -> dict:
    """
    재무 팩터 점수화 (0~100점)
    각 팩터별로 좋은 조건이면 점수 부여
    """
    score = 0
    reasons = []

    per = data.get("PER")
    pbr = data.get("PBR")
    roe = data.get("ROE")
    div = data.get("배당수익률")
    margin = data.get("영업이익률")
    debt = data.get("부채비율")

    # PER 점수 (낮을수록 저평가)
    if per is not None:
        if per < 10:
            score += 25
            reasons.append(f"PER {per:.1f} → 저평가 (25점)")
        elif per < 15:
            score += 15
            reasons.append(f"PER {per:.1f} → 적정 (15점)")
        elif per < 25:
            score += 5
            reasons.append(f"PER {per:.1f} → 약간 고평가 (5점)")
        else:
            reasons.append(f"PER {per:.1f} → 고평가 (0점)")

    # PBR 점수 (1 이하면 자산 대비 저평가)
    if pbr is not None:
        if pbr < 1.0:
            score += 25
            reasons.append(f"PBR {pbr:.2f} → 자산 대비 저평가 (25점)")
        elif pbr < 2.0:
            score += 15
            reasons.append(f"PBR {pbr:.2f} → 적정 (15점)")
        else:
            score += 5
            reasons.append(f"PBR {pbr:.2f} → 고평가 (5점)")

    # ROE 점수 (높을수록 수익성 좋음)
    if roe is not None:
        roe_pct = roe * 100
        if roe_pct > 20:
            score += 25
            reasons.append(f"ROE {roe_pct:.1f}% → 우수 (25점)")
        elif roe_pct > 10:
            score += 15
            reasons.append(f"ROE {roe_pct:.1f}% → 양호 (15점)")
        elif roe_pct > 0:
            score += 5
            reasons.append(f"ROE {roe_pct:.1f}% → 보통 (5점)")
        else:
            reasons.append(f"ROE {roe_pct:.1f}% → 적자 (0점)")

    # 배당수익률 점수
    if div is not None:
        div_pct = div * 100
        if div_pct > 4:
            score += 15
            reasons.append(f"배당수익률 {div_pct:.1f}% → 고배당 (15점)")
        elif div_pct > 2:
            score += 8
            reasons.append(f"배당수익률 {div_pct:.1f}% → 양호 (8점)")

    # 부채비율 점수 (낮을수록 재무 안전)
    if debt is not None:
        if debt < 50:
            score += 10
            reasons.append(f"부채비율 {debt:.0f}% → 매우 안전 (10점)")
        elif debt < 100:
            score += 5
            reasons.append(f"부채비율 {debt:.0f}% → 양호 (5점)")
        else:
            reasons.append(f"부채비율 {debt:.0f}% → 주의 (0점)")

    return {
        "점수": score,
        "등급": "매수적합" if score >= 50 else "중립" if score >= 30 else "매수부적합",
        "근거": reasons,
    }


def screen_stocks(tickers: dict) -> pd.DataFrame:
    """
    여러 종목 팩터 스크리닝
    점수 기반으로 종목 순위 매기기
    """
    results = []
    for name, ticker in tickers.items():
        print(f"분석 중: {name}")
        data = get_fundamental_data(ticker)
        scored = score_fundamentals(data)
        results.append({
            "종목": name,
            "티커": ticker,
            "PER": round(data["PER"], 1) if data["PER"] else "-",
            "PBR": round(data["PBR"], 2) if data["PBR"] else "-",
            "ROE": f"{data['ROE']*100:.1f}%" if data["ROE"] else "-",
            "점수": scored["점수"],
            "등급": scored["등급"],
        })

    df = pd.DataFrame(results).sort_values("점수", ascending=False)
    return df


def add_factor_filter(df_daily: pd.DataFrame, fundamental_score: int, threshold: int = 50) -> pd.DataFrame:
    """
    재무 팩터 점수가 threshold 이상일 때만 매수 신호 활성화
    → 재무가 나쁜 종목은 기술적 매수 신호가 와도 무시
    """
    df_daily = df_daily.copy()

    if fundamental_score < threshold:
        # 재무 불량 → 매수 신호 제거
        df_daily.loc[df_daily["mtf_signal"] == "매수", "mtf_signal"] = "중립"
        print(f"재무 점수 {fundamental_score}점 → 매수 신호 비활성화")
    else:
        print(f"재무 점수 {fundamental_score}점 → 매수 신호 활성화")

    return df_daily


if __name__ == "__main__":
    # 1. 종목 스크리닝
    print("=" * 50)
    print("  코스피 주요 종목 팩터 스크리닝")
    print("=" * 50)
    screening = screen_stocks(KOSPI_STOCKS)
    print(screening.to_string(index=False))

    # 2. 삼성전자 상세 분석
    print("\n\n=== 삼성전자 재무 상세 ===")
    samsung_data = get_fundamental_data("005930.KS")
    samsung_score = score_fundamentals(samsung_data)
    print(f"종합 점수: {samsung_score['점수']}점 ({samsung_score['등급']})")
    for reason in samsung_score["근거"]:
        print(f"  - {reason}")

    # 3. 팩터 필터 적용 백테스트
    print("\n\n=== 팩터 필터 적용 백테스트 ===")
    df = get_stock_data("005930.KS", period="2y")
    df = add_all_indicators(df)
    df = add_mtf_signal(df)
    df = add_factor_filter(df, samsung_score["점수"], threshold=50)

    bt = MTFBacktester(initial_capital=10_000_000, stop_loss=0.05, take_profit=0.10)
    result = bt.run(df)
    print_result(result, "삼성전자 (팩터 필터 적용)")
