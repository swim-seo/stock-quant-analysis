"""
factor_calculator.py — 퀀트 팩터 계산 → Supabase factor_scores 저장
커버리지: stocks.ts 개별 종목 (ETF/지수 제외, ~158개)

팩터 구성:
  모멘텀 (40%) : 3M*0.5 + 6M*0.3 + 12M*0.2 z-score
  상대강도 (25%): 3M 수익률 - KOSPI 3M 수익률 z-score
  저변동성 (15%): 20일 변동성 역수 z-score
  수급 (20%)   : 외국인+기관 5d/20d 가중합 z-score
"""
import os
import sys
import json
import time
import urllib.request
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

KOSPI_TICKER = "^KS11"
NAVER_HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://m.stock.naver.com"}

# ETF/지수 제외한 전 종목 (stocks.ts 동기화)
STOCKS: list[tuple[str, str, str]] = [
    # 반도체
    ("005930.KS", "삼성전자", "반도체"), ("000660.KS", "SK하이닉스", "반도체"),
    ("042700.KS", "한미반도체", "반도체"), ("009150.KS", "삼성전기", "반도체"),
    ("058470.KS", "리노공업", "반도체"), ("000990.KS", "DB하이텍", "반도체"),
    ("403870.KQ", "HPSP", "반도체"), ("101490.KQ", "에스앤에스텍", "반도체"),
    ("240810.KQ", "원익IPS", "반도체"), ("095610.KQ", "테스", "반도체"),
    ("140860.KQ", "파크시스템스", "반도체"), ("067310.KQ", "하나마이크론", "반도체"),
    ("033170.KQ", "시그네틱스", "반도체"), ("033640.KQ", "네패스", "반도체"),
    ("036540.KQ", "SFA반도체", "반도체"),
    # 2차전지/에너지
    ("373220.KS", "LG에너지솔루션", "2차전지/에너지"), ("051910.KS", "LG화학", "2차전지/에너지"),
    ("006400.KS", "삼성SDI", "2차전지/에너지"), ("096770.KS", "SK이노베이션", "2차전지/에너지"),
    ("003670.KS", "포스코퓨처엠", "2차전지/에너지"), ("247540.KQ", "에코프로비엠", "2차전지/에너지"),
    ("086520.KQ", "에코프로", "2차전지/에너지"), ("005490.KS", "POSCO홀딩스", "2차전지/에너지"),
    ("078590.KQ", "대주전자재료", "2차전지/에너지"), ("322000.KS", "HD현대에너지솔루션", "2차전지/에너지"),
    ("009830.KS", "한화솔루션", "2차전지/에너지"), ("475150.KQ", "SK이터닉스", "2차전지/에너지"),
    ("100090.KS", "SK오션플랜트", "2차전지/에너지"), ("011930.KQ", "신성이엔지", "2차전지/에너지"),
    ("010060.KS", "OCI홀딩스", "2차전지/에너지"), ("229640.KS", "LS에코에너지", "2차전지/에너지"),
    ("015760.KS", "한국전력", "2차전지/에너지"), ("112610.KS", "씨에스윈드", "2차전지/에너지"),
    ("389260.KQ", "대명에너지", "2차전지/에너지"), ("060370.KQ", "LS마린솔루션", "2차전지/에너지"),
    # 바이오
    ("207940.KS", "삼성바이오로직스", "바이오"), ("068270.KS", "셀트리온", "바이오"),
    ("196170.KQ", "알테오젠", "바이오"), ("000100.KS", "유한양행", "바이오"),
    ("028300.KS", "HLB", "바이오"), ("000250.KS", "삼천당제약", "바이오"),
    ("298380.KQ", "에이비엘바이오", "바이오"), ("087010.KQ", "펩트론", "바이오"),
    ("237690.KQ", "에스티팜", "바이오"), ("468530.KQ", "프로티나", "바이오"),
    ("950160.KQ", "코오롱티슈진", "바이오"), ("376900.KQ", "로킷헬스케어", "바이오"),
    ("458870.KQ", "씨어스", "바이오"),
    # 자동차
    ("005380.KS", "현대차", "자동차"), ("000270.KS", "기아", "자동차"),
    ("012330.KS", "현대모비스", "자동차"), ("204320.KS", "HL만도", "자동차"),
    ("086280.KS", "현대글로비스", "자동차"),
    # IT/플랫폼
    ("035420.KS", "NAVER", "IT/플랫폼"), ("035720.KS", "카카오", "IT/플랫폼"),
    ("030200.KS", "KT", "IT/플랫폼"), ("017670.KS", "SK텔레콤", "IT/플랫폼"),
    ("323410.KS", "카카오뱅크", "IT/플랫폼"), ("259960.KS", "크래프톤", "IT/플랫폼"),
    ("124500.KQ", "아이티센글로벌", "IT/플랫폼"),
    # 금융
    ("055550.KS", "신한지주", "금융"), ("105560.KS", "KB금융", "금융"),
    ("086790.KS", "하나금융지주", "금융"), ("316140.KS", "우리금융지주", "금융"),
    ("032830.KS", "삼성생명", "금융"), ("138040.KS", "메리츠금융지주", "금융"),
    ("071050.KS", "한국금융지주", "금융"), ("016360.KS", "삼성증권", "금융"),
    ("001720.KS", "신영증권", "금융"), ("003530.KS", "한화투자증권", "금융"),
    ("001510.KS", "SK증권", "금융"), ("003540.KS", "대신증권", "금융"),
    ("039490.KS", "키움증권", "금융"),
    # 소재/산업재
    ("003550.KS", "LG", "소재/산업재"), ("034730.KS", "SK", "소재/산업재"),
    ("028260.KS", "삼성물산", "소재/산업재"), ("066570.KS", "LG전자", "소재/산업재"),
    ("010130.KS", "고려아연", "소재/산업재"), ("011200.KS", "HMM", "소재/산업재"),
    ("097950.KS", "CJ제일제당", "소재/산업재"), ("047050.KS", "포스코인터내셔널", "소재/산업재"),
    ("267260.KS", "HD현대일렉트릭", "소재/산업재"), ("298040.KS", "효성중공업", "소재/산업재"),
    ("001440.KS", "대한전선", "소재/산업재"), ("062040.KS", "산일전기", "소재/산업재"),
    ("103590.KS", "일진전기", "소재/산업재"), ("010120.KS", "LS ELECTRIC", "소재/산업재"),
    # 조선
    ("009540.KS", "HD한국조선해양", "조선"), ("010140.KS", "삼성중공업", "조선"),
    ("329180.KS", "HD현대중공업", "조선"), ("042660.KS", "한화오션", "조선"),
    ("010620.KQ", "현대미포조선", "조선"), ("460930.KQ", "현대힘스", "조선"),
    ("082740.KS", "한화엔진", "조선"),
    # 방산
    ("012450.KS", "한화에어로스페이스", "방산"), ("079550.KS", "LIG넥스원", "방산"),
    ("064350.KS", "현대로템", "방산"), ("272210.KS", "한화시스템", "방산"),
    ("000880.KS", "한화", "방산"), ("103140.KS", "풍산", "방산"),
    # 원자력
    ("034020.KS", "두산에너빌리티", "원자력"), ("052690.KS", "한전기술", "원자력"),
    ("051600.KS", "한전KPS", "원자력"), ("014620.KS", "성광벤드", "원자력"),
    ("119850.KQ", "지엔씨에너지", "원자력"), ("083650.KQ", "비에이치아이", "원자력"),
    ("105840.KQ", "우진", "원자력"), ("019990.KS", "에너토크", "원자력"),
    ("006910.KQ", "보성파워텍", "원자력"), ("042370.KQ", "비츠로테크", "원자력"),
    # 건설
    ("047040.KS", "대우건설", "건설"), ("006360.KS", "GS건설", "건설"),
    ("000720.KS", "현대건설", "건설"),
    # 우주항공
    ("073490.KQ", "LIG아큐버", "우주항공"), ("047810.KS", "한국항공우주", "우주항공"),
    ("189300.KQ", "인텔리안테크", "우주항공"), ("099320.KQ", "쎄트렉아이", "우주항공"),
    ("462350.KQ", "이노스페이스", "우주항공"),
    # 화장품
    ("257720.KQ", "실리콘투", "화장품"), ("278470.KQ", "에이피알", "화장품"),
    ("192820.KS", "코스맥스", "화장품"), ("090430.KS", "아모레퍼시픽", "화장품"),
    ("161890.KS", "한국콜마", "화장품"),
    # 로봇
    ("267250.KS", "HD현대", "로봇"), ("277810.KQ", "레인보우로보틱스", "로봇"),
    ("454910.KQ", "두산로보틱스", "로봇"), ("056190.KQ", "에스에프에이", "로봇"),
    ("108490.KQ", "로보티즈", "로봇"),
    # 광통신
    ("046970.KQ", "우리로", "광통신"), ("038680.KQ", "에스넷", "광통신"),
    ("100130.KQ", "AP위성", "광통신"),
]


def fetch_prices(ticker: str) -> pd.Series:
    try:
        df = yf.download(ticker, period="400d", auto_adjust=True, progress=False)
        if df.empty:
            return pd.Series(dtype=float)
        closes = df["Close"].squeeze()
        return closes.dropna()
    except Exception as e:
        print(f"  [가격실패] {ticker}: {e}")
        return pd.Series(dtype=float)


def fetch_naver_flow(code: str, days: int = 20) -> dict:
    url = (f"https://m.stock.naver.com/api/stock/{code}/"
           f"investorTradingTrends?timeframe=days&count={days}")
    try:
        req = urllib.request.Request(url, headers=NAVER_HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        lst = data if isinstance(data, list) else data.get("tradingTrendList", [])
        return {
            "foreign_5d":  sum(d.get("foreignNetBuySellVolume", 0) for d in lst[:5]),
            "foreign_20d": sum(d.get("foreignNetBuySellVolume", 0) for d in lst[:20]),
            "inst_5d":     sum(d.get("organNetBuySellVolume", 0) for d in lst[:5]),
            "inst_20d":    sum(d.get("organNetBuySellVolume", 0) for d in lst[:20]),
        }
    except Exception as e:
        print(f"  [수급실패] {code}: {e}")
        return {"foreign_5d": 0, "foreign_20d": 0, "inst_5d": 0, "inst_20d": 0}


def mom(prices: pd.Series, days: int) -> float | None:
    if len(prices) < days + 5:
        return None
    return float(prices.iloc[-1] / prices.iloc[-days] - 1)


def vol(prices: pd.Series, days: int) -> float | None:
    if len(prices) < days + 5:
        return None
    rets = prices.pct_change().dropna()
    return float(rets.iloc[-days:].std() * (252 ** 0.5))


def zscore(s: pd.Series) -> pd.Series:
    std = s.std()
    return (s - s.mean()) / std if std > 0 else pd.Series(0.0, index=s.index)


def run():
    print("\n=== 퀀트 팩터 계산 시작 ===")
    print(f"  대상: {len(STOCKS)}개 종목")

    print("  KOSPI 벤치마크 로딩...")
    kospi_prices = fetch_prices(KOSPI_TICKER)
    kospi_3m = mom(kospi_prices, 65) or 0.0

    raw_rows = []
    for i, (ticker, name, sector) in enumerate(STOCKS):
        code = ticker.split(".")[0]
        print(f"  [{i+1:3d}/{len(STOCKS)}] {name}", end=" ... ", flush=True)

        prices = fetch_prices(ticker)
        if len(prices) < 70:
            print(f"데이터 부족 ({len(prices)}일), 스킵")
            continue

        flow = fetch_naver_flow(code)
        time.sleep(0.25)

        m3  = mom(prices, 65)
        m6  = mom(prices, 130)
        m12 = mom(prices, 252)
        v20 = vol(prices, 20)
        v60 = vol(prices, 60)
        rs3 = (m3 - kospi_3m) if m3 is not None else None

        raw_rows.append({
            "ticker":               ticker,
            "stock_name":           name,
            "sector":               sector,
            "momentum_3m":          m3,
            "momentum_6m":          m6,
            "momentum_12m":         m12,
            "relative_strength_3m": rs3,
            "volatility_20d":       v20,
            "volatility_60d":       v60,
            "foreign_flow_5d":      flow["foreign_5d"],
            "foreign_flow_20d":     flow["foreign_20d"],
            "institution_flow_5d":  flow["inst_5d"],
            "institution_flow_20d": flow["inst_20d"],
        })
        print(f"3M={( m3 or 0)*100:+.1f}%  RS={( rs3 or 0)*100:+.1f}%")

    if not raw_rows:
        print("계산된 종목 없음, 종료")
        return

    df = pd.DataFrame(raw_rows)
    med = lambda col: df[col].median()

    # ── 팩터 z-score ──────────────────────────────────────────────
    mom_raw = (
        df["momentum_3m"].fillna(med("momentum_3m"))  * 0.50 +
        df["momentum_6m"].fillna(med("momentum_6m"))  * 0.30 +
        df["momentum_12m"].fillna(med("momentum_12m")) * 0.20
    )
    df["z_momentum"]   = zscore(mom_raw)
    df["z_rs"]         = zscore(df["relative_strength_3m"].fillna(0))
    df["z_volatility"] = zscore(-df["volatility_20d"].fillna(med("volatility_20d")))

    flow_raw = (
        df["foreign_flow_5d"].fillna(0)  * 0.40 +
        df["foreign_flow_20d"].fillna(0) * 0.15 +
        df["institution_flow_5d"].fillna(0)  * 0.35 +
        df["institution_flow_20d"].fillna(0) * 0.10
    )
    df["z_flow"] = zscore(flow_raw)

    # ── 종합점수 0~100 ────────────────────────────────────────────
    raw = (
        df["z_momentum"]   * 0.40 +
        df["z_rs"]         * 0.25 +
        df["z_volatility"] * 0.15 +
        df["z_flow"]       * 0.20
    )
    mn, mx = raw.min(), raw.max()
    df["composite_score"] = ((raw - mn) / (mx - mn) * 100).round(1) if mx > mn else 50.0
    df = df.sort_values("composite_score", ascending=False).reset_index(drop=True)
    df["rank_total"]    = range(1, len(df) + 1)
    df["calculated_at"] = datetime.now().isoformat()

    # ── Supabase upsert ───────────────────────────────────────────
    print(f"\n  Supabase 저장 중 ({len(df)}개)...")
    for _, row in df.iterrows():
        record = {k: (None if isinstance(v, float) and np.isnan(v) else
                      (int(v) if isinstance(v, (np.integer,)) else
                       (float(v) if isinstance(v, (np.floating,)) else v)))
                  for k, v in row.items()}
        supabase.table("factor_scores").upsert(record, on_conflict="ticker").execute()

    print("\n  상위 15 종목:")
    print(f"  {'순위':>4} {'종목':12} {'섹터':10} {'종합':>6} {'3M':>7} {'RS':>7} {'변동성':>7}")
    print("  " + "-" * 65)
    for _, r in df.head(15).iterrows():
        print(f"  {int(r.rank_total):4d} {r.stock_name:12} {r.sector:10} "
              f"{r.composite_score:6.1f} "
              f"{(r.momentum_3m or 0)*100:+6.1f}% "
              f"{(r.relative_strength_3m or 0)*100:+6.1f}% "
              f"{(r.volatility_20d or 0)*100:5.1f}%")

    print(f"\n=== 팩터 계산 완료: {len(df)}개 종목 ===\n")


if __name__ == "__main__":
    run()
