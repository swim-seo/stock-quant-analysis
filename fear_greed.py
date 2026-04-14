"""
한국판 공포탐욕지수 (Korea Fear & Greed Index)

6개 지표의 가중 평균으로 0~100 스코어 산출:
  - 코스피 모멘텀    (25%): 코스피 vs 125일 MA 괴리율
  - VKOSPI 변동성   (20%): 한국판 VIX, 높을수록 공포
  - 코스피 RSI      (20%): 과매도=공포, 과매수=탐욕
  - 달러/원 환율    (15%): 원화 약세(환율↑) = 공포
  - 코스닥 강도     (10%): 코스닥/코스피 비율 모멘텀
  - 거래량 모멘텀   (10%): 5일 vs 60일 평균 거래량
"""

import numpy as np
import yfinance as yf
import streamlit as st


def _rsi(series: "pd.Series", period: int = 14) -> float:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1])


def _normalize(value: float, low: float, high: float, invert: bool = False) -> float:
    """value를 [low, high] 범위 기준으로 0~100 스코어로 정규화."""
    score = (value - low) / (high - low) * 100
    score = float(np.clip(score, 0, 100))
    return 100 - score if invert else score


@st.cache_data(ttl=3600, show_spinner=False)
def get_fear_greed_index() -> dict:
    """한국판 공포탐욕지수를 계산하여 반환."""
    components = {}

    # ── 1. 코스피 모멘텀 ─────────────────────────────────────────────
    try:
        kospi_1y = yf.download("^KS11", period="1y", progress=False, auto_adjust=True)
        close = kospi_1y["Close"].squeeze().dropna()
        ma125 = close.rolling(125).mean()
        latest_close = float(close.iloc[-1])
        ma_val = float(ma125.iloc[-1])
        momentum_pct = (latest_close - ma_val) / ma_val * 100
        score = _normalize(momentum_pct, -15, 15)
        components["코스피 모멘텀"] = {
            "score": score,
            "detail": f"현재가 {latest_close:,.1f} / 125일MA {ma_val:,.1f} ({momentum_pct:+.1f}%)",
            "weight": 0.25,
        }
    except Exception as e:
        components["코스피 모멘텀"] = {"score": 50.0, "detail": f"오류: {e}", "weight": 0.25}

    # ── 2. VKOSPI 변동성 ─────────────────────────────────────────────
    try:
        vk_data = yf.download("^VKOSPI", period="1y", progress=False, auto_adjust=True)
        vk = vk_data["Close"].squeeze().dropna()
        current_vk = float(vk.iloc[-1])
        vk_mean = float(vk.mean())
        vk_std = float(vk.std())
        low = vk_mean - 2 * vk_std
        high = vk_mean + 2 * vk_std
        score = _normalize(current_vk, low, high, invert=True)
        components["VKOSPI 변동성"] = {
            "score": score,
            "detail": f"VKOSPI {current_vk:.1f} (1년평균 {vk_mean:.1f} / ±2σ {low:.1f}~{high:.1f})",
            "weight": 0.20,
        }
    except Exception as e:
        components["VKOSPI 변동성"] = {"score": 50.0, "detail": f"오류: {e}", "weight": 0.20}

    # ── 3. 코스피 RSI ────────────────────────────────────────────────
    try:
        kospi_6m = yf.download("^KS11", period="6mo", progress=False, auto_adjust=True)
        close_6m = kospi_6m["Close"].squeeze().dropna()
        rsi_val = _rsi(close_6m)
        score = _normalize(rsi_val, 30, 70)
        components["코스피 RSI"] = {
            "score": score,
            "detail": f"RSI(14) = {rsi_val:.1f}",
            "weight": 0.20,
        }
    except Exception as e:
        components["코스피 RSI"] = {"score": 50.0, "detail": f"오류: {e}", "weight": 0.20}

    # ── 4. 달러/원 환율 ──────────────────────────────────────────────
    try:
        krw_data = yf.download("KRW=X", period="6mo", progress=False, auto_adjust=True)
        krw = krw_data["Close"].squeeze().dropna()
        current_krw = float(krw.iloc[-1])
        ma60_krw = float(krw.rolling(60).mean().iloc[-1])
        deviation_pct = (current_krw - ma60_krw) / ma60_krw * 100
        # 환율 상승 = 원화 약세 = 공포 → invert
        score = _normalize(deviation_pct, -5, 5, invert=True)
        components["달러/원 환율"] = {
            "score": score,
            "detail": f"USD/KRW {current_krw:,.1f}원 (60일MA 대비 {deviation_pct:+.1f}%)",
            "weight": 0.15,
        }
    except Exception as e:
        components["달러/원 환율"] = {"score": 50.0, "detail": f"오류: {e}", "weight": 0.15}

    # ── 5. 코스닥 강도 ───────────────────────────────────────────────
    try:
        kosdaq_3m = yf.download("^KQ11", period="3mo", progress=False, auto_adjust=True)["Close"].squeeze().dropna()
        kospi_3m = yf.download("^KS11", period="3mo", progress=False, auto_adjust=True)["Close"].squeeze().dropna()
        min_len = min(len(kosdaq_3m), len(kospi_3m))
        ratio = (kosdaq_3m.iloc[-min_len:].values / kospi_3m.iloc[-min_len:].values)
        ratio_change = (ratio[-1] / ratio[-20] - 1) * 100 if len(ratio) >= 20 else 0
        score = _normalize(ratio_change, -5, 5)
        components["코스닥 강도"] = {
            "score": score,
            "detail": f"코스닥/코스피 비율 20일 변화: {ratio_change:+.1f}%",
            "weight": 0.10,
        }
    except Exception as e:
        components["코스닥 강도"] = {"score": 50.0, "detail": f"오류: {e}", "weight": 0.10}

    # ── 6. 거래량 모멘텀 ─────────────────────────────────────────────
    try:
        etf = yf.download("069500.KS", period="3mo", progress=False, auto_adjust=True)
        vol = etf["Volume"].squeeze().dropna()
        vol5 = float(vol.iloc[-5:].mean())
        vol60 = float(vol.iloc[-60:].mean()) if len(vol) >= 60 else float(vol.mean())
        vol_ratio = vol5 / vol60
        score = _normalize(vol_ratio, 0.5, 2.0)
        components["거래량 모멘텀"] = {
            "score": score,
            "detail": f"5일 평균 / 60일 평균 = {vol_ratio:.2f}x",
            "weight": 0.10,
        }
    except Exception as e:
        components["거래량 모멘텀"] = {"score": 50.0, "detail": f"오류: {e}", "weight": 0.10}

    # ── 최종 가중 평균 ───────────────────────────────────────────────
    total_w = sum(v["weight"] for v in components.values())
    final = sum(v["score"] * v["weight"] for v in components.values()) / total_w
    final = round(final, 1)

    if final >= 75:
        label, emoji, color = "극도의 탐욕", "🔥", "#ff1744"
    elif final >= 55:
        label, emoji, color = "탐욕", "😏", "#ff6d00"
    elif final >= 45:
        label, emoji, color = "중립", "😐", "#ffab00"
    elif final >= 25:
        label, emoji, color = "공포", "😰", "#2196f3"
    else:
        label, emoji, color = "극도의 공포", "😱", "#1565c0"

    return {
        "score": final,
        "label": label,
        "emoji": emoji,
        "color": color,
        "components": components,
    }
