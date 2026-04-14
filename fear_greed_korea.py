"""
한국판 공포탐욕지수 (Korea Fear & Greed Index)

5가지 구성 요소, 각 최대 20점, 총 100점 만점:
  1. 코스피 변동성      (20점): 변동성 낮을수록 탐욕
  2. 코스피 모멘텀      (20점): 20일 이평선 대비 위치
  3. 거래량 모멘텀      (20점): 오늘 vs 20일 평균
  4. 미국 F&G 연동      (20점): CNN Fear & Greed 현재 점수
  5. 유튜브 심리 점수   (20점): get_market_sentiment_score()
"""

import numpy as np
import requests
import streamlit as st
import yfinance as yf

from youtube_collector import get_market_sentiment_score


# ── 구성 요소 계산 ────────────────────────────────────────────────────────

def _score_volatility() -> dict:
    """코스피 20일 변동성. 낮을수록 탐욕 (높은 점수)."""
    try:
        df = yf.download("^KS11", period="3mo", progress=False, auto_adjust=True)
        close = df["Close"].squeeze().dropna()
        returns = close.pct_change().dropna()
        vol20 = float(returns.rolling(20).std().iloc[-1]) * np.sqrt(252) * 100  # 연환산 %

        # 범위 설정: 10% 이하=극탐욕, 30% 이상=극공포
        score = round(np.clip((30 - vol20) / 20 * 20, 0, 20), 1)

        if score >= 16:
            label = "매우 낮은 변동성"
        elif score >= 12:
            label = "낮은 변동성"
        elif score >= 8:
            label = "보통 변동성"
        elif score >= 4:
            label = "높은 변동성"
        else:
            label = "매우 높은 변동성"

        return {"score": score, "label": label, "detail": f"연환산 변동성 {vol20:.1f}%"}
    except Exception as e:
        return {"score": 10.0, "label": "데이터 오류", "detail": str(e)}


def _score_momentum() -> dict:
    """코스피 현재가 vs 20일 이평선. 위면 탐욕, 아래면 공포."""
    try:
        df = yf.download("^KS11", period="3mo", progress=False, auto_adjust=True)
        close = df["Close"].squeeze().dropna()
        current = float(close.iloc[-1])
        ma20 = float(close.rolling(20).mean().iloc[-1])
        deviation = (current - ma20) / ma20 * 100  # %

        # 범위: -5% 이하=극공포, +5% 이상=극탐욕
        score = round(np.clip((deviation + 5) / 10 * 20, 0, 20), 1)

        if score >= 16:
            label = "강한 상승 추세"
        elif score >= 12:
            label = "상승 추세"
        elif score >= 8:
            label = "중립"
        elif score >= 4:
            label = "하락 추세"
        else:
            label = "강한 하락 추세"

        direction = "위" if deviation >= 0 else "아래"
        return {
            "score": score,
            "label": label,
            "detail": f"20일MA {direction} {abs(deviation):.1f}% (현재 {current:,.1f})",
        }
    except Exception as e:
        return {"score": 10.0, "label": "데이터 오류", "detail": str(e)}


def _score_volume() -> dict:
    """오늘 거래량 vs 20일 평균. 많을수록 탐욕."""
    try:
        # KODEX 200 ETF로 코스피 거래량 대리 측정
        df = yf.download("069500.KS", period="3mo", progress=False, auto_adjust=True)
        vol = df["Volume"].squeeze().dropna()
        today_vol = float(vol.iloc[-1])
        avg20 = float(vol.rolling(20).mean().iloc[-1])
        ratio = today_vol / avg20

        # 범위: 0.5배 이하=극공포, 2.0배 이상=극탐욕
        score = round(np.clip((ratio - 0.5) / 1.5 * 20, 0, 20), 1)

        if score >= 16:
            label = "매우 높은 거래량"
        elif score >= 12:
            label = "높은 거래량"
        elif score >= 8:
            label = "평균 거래량"
        elif score >= 4:
            label = "낮은 거래량"
        else:
            label = "매우 낮은 거래량"

        return {
            "score": score,
            "label": label,
            "detail": f"20일 평균 대비 {ratio:.2f}x",
        }
    except Exception as e:
        return {"score": 10.0, "label": "데이터 오류", "detail": str(e)}


def _score_us_fear_greed() -> dict:
    """CNN Fear & Greed Index 현재 점수를 0~20 스케일로 환산."""
    try:
        resp = requests.get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        data = resp.json()
        us_score = float(data["fear_and_greed"]["score"])
        us_label_raw = data["fear_and_greed"]["rating"]

        score = round(us_score / 100 * 20, 1)

        label_map = {
            "extreme fear": "극도의 공포",
            "fear": "공포",
            "neutral": "중립",
            "greed": "탐욕",
            "extreme greed": "극도의 탐욕",
        }
        label = label_map.get(us_label_raw.lower(), us_label_raw)

        return {
            "score": score,
            "label": f"미국 {label} ({us_score:.0f})",
            "detail": f"CNN Fear & Greed: {us_score:.0f}/100",
        }
    except Exception as e:
        return {"score": 10.0, "label": "데이터 오류", "detail": str(e)}


def _score_youtube_sentiment() -> dict:
    """YouTube 인사이트 심리 점수를 0~20 스케일로 환산."""
    try:
        sentiment = get_market_sentiment_score()
        raw_score = sentiment.get("score", 0)  # -100 ~ +100 범위 가정

        # get_market_sentiment_score가 반환하는 score 범위에 따라 정규화
        # score가 양수면 탐욕, 음수면 공포
        score = round(np.clip((raw_score + 100) / 200 * 20, 0, 20), 1)
        label = sentiment.get("label", "중립")
        pos = sentiment.get("details", {}).get("긍정", 0)
        neg = sentiment.get("details", {}).get("부정", 0)

        return {
            "score": score,
            "label": f"유튜브 {label}",
            "detail": f"긍정 {pos}개 / 부정 {neg}개",
        }
    except Exception as e:
        return {"score": 10.0, "label": "데이터 오류", "detail": str(e)}


# ── 공개 API ─────────────────────────────────────────────────────────────

@st.cache_data(ttl=3600, show_spinner=False)
def calculate_korea_fear_greed() -> dict:
    """
    한국판 공포탐욕지수 계산.

    Returns
    -------
    {
      "score": 67,
      "label": "탐욕",
      "components": {
        "volatility":        {"score": 15, "label": "낮은 변동성",      "detail": "..."},
        "momentum":          {"score": 14, "label": "상승 추세",         "detail": "..."},
        "volume":            {"score": 12, "label": "평균 거래량",        "detail": "..."},
        "us_fear_greed":     {"score": 16, "label": "탐욕 (72)",          "detail": "..."},
        "youtube_sentiment": {"score": 10, "label": "중립",               "detail": "..."},
      }
    }
    """
    components = {
        "volatility":        _score_volatility(),
        "momentum":          _score_momentum(),
        "volume":            _score_volume(),
        "us_fear_greed":     _score_us_fear_greed(),
        "youtube_sentiment": _score_youtube_sentiment(),
    }

    total = sum(v["score"] for v in components.values())
    score = round(total, 1)

    if score >= 81:
        label = "극도의 탐욕"
    elif score >= 61:
        label = "탐욕"
    elif score >= 41:
        label = "중립"
    elif score >= 21:
        label = "공포"
    else:
        label = "극도의 공포"

    return {"score": score, "label": label, "components": components}


def get_fear_greed_color(score: int) -> str:
    """점수에 따른 hex 색상 반환."""
    if score >= 81:
        return "#00a550"   # 진초록 (극도의 탐욕)
    elif score >= 61:
        return "#6bcb77"   # 연초록 (탐욕)
    elif score >= 41:
        return "#ffd93d"   # 노랑 (중립)
    elif score >= 21:
        return "#ff6b6b"   # 연빨강 (공포)
    else:
        return "#ff0000"   # 빨강 (극도의 공포)


def display_fear_greed_widget(score_data: dict):
    """Streamlit 사이드바용 공포탐욕 위젯."""
    score = score_data["score"]
    label = score_data["label"]
    color = get_fear_greed_color(score)
    components = score_data["components"]

    bar_pct = int(score)

    # 구성 요소 행 HTML 빌더
    comp_labels = {
        "volatility":        "변동성",
        "momentum":          "모멘텀",
        "volume":            "거래량",
        "us_fear_greed":     "미국 F&G",
        "youtube_sentiment": "유튜브 심리",
    }

    rows_html = ""
    for key, meta in components.items():
        s = meta["score"]
        c_color = get_fear_greed_color(s * 5)  # 20점 → 100점 환산 후 색상
        bar_w = int(s / 20 * 100)
        rows_html += f"""
<div style="margin-bottom:7px;">
  <div style="display:flex;justify-content:space-between;font-size:10px;
              color:#9e9e9e;margin-bottom:3px;">
    <span>{comp_labels.get(key, key)}</span>
    <span style="color:{c_color};font-weight:600;">{s:.0f}/20</span>
  </div>
  <div style="height:3px;background:#1e1e28;border-radius:2px;">
    <div style="height:100%;width:{bar_w}%;background:{c_color};border-radius:2px;"></div>
  </div>
</div>"""

    html = f"""
<div style="background:#111118;border:1px solid #1e1e28;border-radius:10px;padding:16px;margin-top:8px;">
  <div style="font-size:10px;letter-spacing:2px;color:#555568;margin-bottom:10px;">KOREA FEAR &amp; GREED</div>

  <div style="text-align:center;margin-bottom:14px;">
    <div style="font-size:40px;font-weight:800;color:{color};line-height:1;">{score:.0f}</div>
    <div style="font-size:12px;font-weight:600;color:{color};margin-top:4px;">{label}</div>
  </div>

  <div style="height:6px;background:#1e1e28;border-radius:3px;margin-bottom:14px;overflow:hidden;">
    <div style="height:100%;width:{bar_pct}%;
                background:linear-gradient(90deg,#ff0000,#ff6b6b,#ffd93d,#6bcb77,#00a550);
                border-radius:3px;"></div>
  </div>

  {rows_html}

  <div style="display:flex;justify-content:space-between;font-size:9px;
              color:#333340;margin-top:6px;padding-top:6px;border-top:1px solid #1e1e28;">
    <span>극도공포</span><span>공포</span><span>중립</span><span>탐욕</span><span>극도탐욕</span>
  </div>
</div>"""

    st.markdown(html, unsafe_allow_html=True)
