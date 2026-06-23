"""
장전 시장 위험도 필터
오늘 BUY 신호를 실제로 실행해도 되는지 판단하는 상위 필터.

market_risk_level: LOW / MEDIUM / HIGH / EXTREME
execution_signal:  BUY_OK / BUY_SMALL / WATCH / BLOCKED / HOLD / REDUCE
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MarketRisk:
    level: str                    # LOW / MEDIUM / HIGH / EXTREME
    score: float                  # 0~100 (높을수록 위험)
    reasons: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


def _safe_pct_change(ticker: str, period: str = "5d") -> float | None:
    try:
        import yfinance as yf
        df = yf.Ticker(ticker).history(period=period)
        if df is None or df.empty or len(df) < 2:
            return None
        last = float(df["Close"].iloc[-1])
        prev = float(df["Close"].iloc[-2])
        if prev == 0:
            return None
        return round((last - prev) / prev * 100, 2)
    except Exception:
        return None


def get_global_market_snapshot() -> dict[str, Any]:
    """글로벌·한국 핵심 지표 수집 (yfinance 기반 1차 버전)."""
    import concurrent.futures

    targets = {
        "nasdaq100_pct": "^NDX",
        "sox_pct":       "^SOX",
        "nvda_pct":      "NVDA",
        "mu_pct":        "MU",
        "kospi_pct":     "^KS11",
        "usdkrw_pct":    "KRW=X",
    }

    results: dict[str, Any] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(_safe_pct_change, sym): key for key, sym in targets.items()}
        for fut, key in futures.items():
            try:
                results[key] = fut.result(timeout=15)
            except Exception:
                results[key] = None

    return results


def calc_market_risk(snapshot: dict[str, Any]) -> MarketRisk:
    """
    0~100점 위험 점수 산출. 점수가 높을수록 오늘 BUY 실행을 조심해야 함.

    가중치 근거:
    - SOX(반도체 지수)가 한국 반도체 대형주에 직접 연동 → 최대 25점
    - 나스닥(기술주 심리) → 최대 20점
    - 원/달러 환율(외국인 자금 부담) → 최대 20점
    - AI 핵심주(NVDA/MU) → 각 10점
    - 코스피 전일 흐름 → 10점
    """
    score = 0.0
    reasons: list[str] = []

    nasdaq = snapshot.get("nasdaq100_pct")
    sox    = snapshot.get("sox_pct")
    nvda   = snapshot.get("nvda_pct")
    mu     = snapshot.get("mu_pct")
    usdkrw = snapshot.get("usdkrw_pct")
    kospi  = snapshot.get("kospi_pct")

    # 미국 기술주 (최대 20점)
    if nasdaq is not None:
        if nasdaq <= -2.0:
            score += 20
            reasons.append(f"나스닥100 급락({nasdaq:+.1f}%)")
        elif nasdaq <= -1.0:
            score += 10
            reasons.append(f"나스닥100 약세({nasdaq:+.1f}%)")
        elif nasdaq >= 1.5:
            score -= 5  # 긍정 신호 → 위험 완화

    # 반도체 지수 (최대 25점 — 한국장 직접 연동)
    if sox is not None:
        if sox <= -3.0:
            score += 25
            reasons.append(f"미국 반도체지수(SOX) 급락({sox:+.1f}%)")
        elif sox <= -1.5:
            score += 12
            reasons.append(f"미국 반도체지수(SOX) 약세({sox:+.1f}%)")
        elif sox >= 2.0:
            score -= 8

    # AI 핵심주 (최대 10점 each)
    if nvda is not None and nvda <= -3.0:
        score += 10
        reasons.append(f"엔비디아 약세({nvda:+.1f}%)")
    if mu is not None and mu <= -3.0:
        score += 10
        reasons.append(f"마이크론 약세({mu:+.1f}%)")

    # 원/달러 환율 (최대 20점)
    if usdkrw is not None:
        if usdkrw >= 1.0:
            score += 20
            reasons.append(f"원/달러 급등({usdkrw:+.1f}%) — 외국인 자금 부담")
        elif usdkrw >= 0.5:
            score += 10
            reasons.append(f"원/달러 상승({usdkrw:+.1f}%)")
        elif usdkrw <= -0.5:
            score -= 5

    # 코스피 전일 흐름 (최대 10점)
    if kospi is not None and kospi <= -2.0:
        score += 10
        reasons.append(f"코스피 전일 약세({kospi:+.1f}%)")

    score = float(max(0.0, min(100.0, score)))

    if score >= 75:
        level = "EXTREME"
    elif score >= 50:
        level = "HIGH"
    elif score >= 25:
        level = "MEDIUM"
    else:
        level = "LOW"

    if not reasons:
        reasons.append("주요 위험 신호 제한적 — 시장 환경 양호")

    return MarketRisk(level=level, score=round(score, 2), reasons=reasons, raw=snapshot)


def apply_execution_filter(signal: str, market_risk_level: str) -> tuple[str, str]:
    """
    종목 신호(BUY/HOLD/SELL) + 시장 위험도 → 실전 행동 신호.

    BUY는 종목 후보 선정이고, execution_signal이 오늘 실행 여부를 결정한다.
    """
    if signal == "BUY":
        if market_risk_level == "LOW":
            return "BUY_OK",    "시장 위험 낮음 — BUY 실행 가능"
        if market_risk_level == "MEDIUM":
            return "BUY_SMALL", "시장 위험 보통 — 소액/분할 매수만 권장"
        if market_risk_level == "HIGH":
            return "WATCH",     "시장 위험 높음 — 후보 등록만, 매수 보류"
        return     "BLOCKED",   "시장 위험 매우 높음 — 신규매수 금지"

    if signal == "SELL":
        if market_risk_level in ("HIGH", "EXTREME"):
            return "REDUCE",    "시장 위험 높음 — 단기 보유분 축소 검토"
        return     "REDUCE",    "SELL 신호 — 신규매수 제외, 보유분 점검"

    return "HOLD", "관망"


def risk_summary_text(risk: MarketRisk) -> str:
    """브리핑/로그용 한 줄 요약."""
    badge = {"LOW": "✅ 낮음", "MEDIUM": "⚠️ 보통", "HIGH": "🔴 높음", "EXTREME": "⛔ 매우 높음"}
    return f"{badge.get(risk.level, risk.level)} ({risk.score:.0f}/100) | {' / '.join(risk.reasons[:3])}"
