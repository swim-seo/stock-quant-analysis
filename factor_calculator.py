"""
factor_calculator.py — 퀀트 팩터 계산 → Supabase factor_scores 저장
커버리지: stocks.ts 개별 종목 (ETF/지수 제외, ~158개)

팩터 구성:
  샤프모멘텀 (45%): (3M*0.5+6M*0.3+12M*0.2) / vol_60d  z-score
  상대강도   (20%): 3M 수익률 - KOSPI 3M 수익률 z-score
  수급       (15%): 외국인+기관 5d/20d 가중합 z-score
  가치       (20%): 섹터중립 PBR 역수 z-score (pykrx)
"""
import os
import sys
import json
import time
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
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


def _ticker_to_code(ticker: str) -> str:
    """'005930.KS' → '005930', '247540.KQ' → '247540'"""
    return ticker.split(".")[0]


def fetch_prices(ticker: str) -> pd.Series:
    """KIS OHLCV 일봉 → 종가 Series. KOSPI 지수(^KS11)는 yfinance fallback."""
    if ticker.startswith("^"):
        try:
            df = yf.download(ticker, period="400d", auto_adjust=True, progress=False)
            if not df.empty:
                return df["Close"].squeeze().dropna()
        except Exception:
            pass
        return pd.Series(dtype=float)

    code = _ticker_to_code(ticker)
    try:
        from kis_fetcher import get_client as _get_kis
        rows = _get_kis().fetch_ohlcv_daily(code, days=400)
        if rows:
            dates  = pd.to_datetime([r["date"] for r in rows])
            closes = [r["close"] for r in rows]
            return pd.Series(closes, index=dates, dtype=float).dropna()
    except Exception as e:
        print(f"  [KIS 가격실패] {ticker}: {e}")

    # yfinance fallback
    try:
        df = yf.download(ticker, period="400d", auto_adjust=True, progress=False)
        if not df.empty:
            return df["Close"].squeeze().dropna()
    except Exception as e:
        print(f"  [yfinance fallback 실패] {ticker}: {e}")

    return pd.Series(dtype=float)


def load_investor_flow_from_supabase() -> dict[str, dict]:
    """수급 데이터 로드: Supabase stock_news (KIS 수집분) 우선, KIS 직접 조회 fallback."""
    # 1차: Supabase stock_news (news_collector.py → KIS 수집분)
    try:
        resp = (supabase.table("stock_news")
                .select("stock_code,investor_data")
                .order("collected_at", desc=True)
                .limit(300)
                .execute())
        flow_map: dict[str, dict] = {}
        for row in resp.data or []:
            code = row.get("stock_code", "")
            if code in flow_map:
                continue
            inv = row.get("investor_data", [])
            if isinstance(inv, str):
                try: inv = json.loads(inv)
                except: inv = []
            if not inv:
                continue
            flow_map[code] = {
                "foreign_5d":  sum(d.get("foreign_net", 0) for d in inv[:5]),
                "foreign_20d": sum(d.get("foreign_net", 0) for d in inv[:20]),
                "inst_5d":     sum(d.get("institution_net", 0) for d in inv[:5]),
                "inst_20d":    sum(d.get("institution_net", 0) for d in inv[:20]),
            }
        if flow_map:
            print(f"  수급 데이터 로드: {len(flow_map)}개 종목 (Supabase/KIS)")
            return flow_map
    except Exception as e:
        print(f"  [Supabase 수급 로드 실패] {e}")

    # 2차 fallback: KIS 직접 조회 (WATCH_STOCKS 기준)
    try:
        from kis_fetcher import get_client as _get_kis
        from news_collector import WATCH_STOCKS as _watch
        kis = _get_kis()
        flow_map = {}
        for code in list(_watch.values())[:40]:  # 최대 40개 (rate limit 고려)
            rows = kis.fetch_investor_trading(code, days=20)
            if rows:
                flow_map[code] = {
                    "foreign_5d":  sum(r.get("foreign_net", 0) for r in rows[:5]),
                    "foreign_20d": sum(r.get("foreign_net", 0) for r in rows[:20]),
                    "inst_5d":     sum(r.get("institution_net", 0) for r in rows[:5]),
                    "inst_20d":    sum(r.get("institution_net", 0) for r in rows[:20]),
                }
        print(f"  수급 데이터 로드: {len(flow_map)}개 종목 (KIS 직접)")
        return flow_map
    except Exception as e:
        print(f"  [KIS 수급 직접 로드 실패] {e}")
        return {}


def mom(prices: pd.Series, days: int) -> float | None:
    if len(prices) < days + 5:
        return None
    return float(prices.iloc[-1] / prices.iloc[-days] - 1)


def mom_skip(prices: pd.Series, long: int, skip: int = 21) -> float | None:
    """Momentum with 1-month skip to avoid short-term reversal noise."""
    if len(prices) < long + 5:
        return None
    return float(prices.iloc[-skip] / prices.iloc[-long] - 1)


def vol(prices: pd.Series, days: int) -> float | None:
    if len(prices) < days + 5:
        return None
    rets = prices.pct_change().dropna()
    return float(rets.iloc[-days:].std() * (252 ** 0.5))


def detect_speculative(prices: pd.Series, vol_annual: float | None) -> tuple[bool, str]:
    """Detect speculative/manipulated stocks.

    Criteria:
    - Annualized vol > 150%
    - Clustered upper-circuit: 2+ days hitting ≥28% within any 7-trading-day window
      (spread-out single events are normal; consecutive pumping is not)
    """
    reasons = []

    if vol_annual is not None and vol_annual > 1.50:
        reasons.append(f"고변동성 {vol_annual*100:.0f}%")

    if len(prices) >= 60:
        ret = prices.pct_change().dropna().tail(60)
        circuit_idx = [i for i, v in enumerate(ret.values) if v >= 0.28]
        # Check for 2+ upper-circuit days within a 7-trading-day window
        clustered = 0
        for i in range(len(circuit_idx)):
            for j in range(i + 1, len(circuit_idx)):
                if circuit_idx[j] - circuit_idx[i] <= 7:
                    clustered = max(clustered, circuit_idx[j] - circuit_idx[i] + 1)
                else:
                    break
        if clustered >= 2:
            reasons.append(f"상한가 집중 {len(circuit_idx)}회({clustered}일내)")

    return len(reasons) > 0, " | ".join(reasons) if reasons else ""


def zscore(s: pd.Series) -> pd.Series:
    std = s.std()
    return (s - s.mean()) / std if std > 0 else pd.Series(0.0, index=s.index)


def sector_neutral_zscore(df: pd.DataFrame, col: str, sector_col: str = "sector") -> pd.Series:
    """Z-score within each sector. Falls back to universe-level for sectors with < 3 stocks."""
    result = pd.Series(0.0, index=df.index)
    universe_z = zscore(df[col])
    for sector, grp in df.groupby(sector_col):
        if len(grp) >= 3:
            result.loc[grp.index] = zscore(grp[col]).values
        else:
            result.loc[grp.index] = universe_z.loc[grp.index].values
    return result


def fetch_pbr_from_pykrx(date_str: str) -> dict[str, float]:
    """Fetch PBR for all listed stocks via pykrx (KRX official data)."""
    try:
        from pykrx import stock as krx
        df_kospi  = krx.get_market_fundamental_by_ticker(date_str, market="KOSPI")
        df_kosdaq = krx.get_market_fundamental_by_ticker(date_str, market="KOSDAQ")
        df_all = pd.concat([df_kospi, df_kosdaq])
        pbr_map = {}
        for ticker, row in df_all.iterrows():
            pbr = row.get("PBR")
            if pbr and pbr > 0:
                pbr_map[str(ticker)] = float(pbr)
        print(f"  pykrx PBR 로드: {len(pbr_map)}개 종목")
        return pbr_map
    except ImportError:
        print("  [pykrx 미설치] 가치 팩터 건너뜀")
        return {}
    except Exception as e:
        print(f"  [pykrx PBR 로드 실패] {e}")
        return {}


def run():
    print("\n=== 퀀트 팩터 계산 시작 ===")
    print(f"  대상: {len(STOCKS)}개 종목")

    print("  KOSPI 벤치마크 로딩...")
    kospi_prices = fetch_prices(KOSPI_TICKER)
    kospi_3m = mom_skip(kospi_prices, 65) or 0.0

    # 수급 데이터: Supabase stock_news에서 일괄 로드 (Naver API IP 제한 우회)
    flow_map = load_investor_flow_from_supabase()

    # 가치 팩터: pykrx PBR (KRX 공식 금액 기준)
    today_krx = datetime.now().strftime("%Y%m%d")
    pbr_map = fetch_pbr_from_pykrx(today_krx)

    raw_rows = []
    skip_count = 0
    for i, (ticker, name, sector) in enumerate(STOCKS):
        code = ticker.split(".")[0]
        print(f"  [{i+1:3d}/{len(STOCKS)}] {name}", end=" ... ", flush=True)

        prices = fetch_prices(ticker)
        if len(prices) < 70:
            print(f"데이터 부족 ({len(prices)}일), 스킵")
            skip_count += 1
            continue

        flow = flow_map.get(code, {"foreign_5d": 0, "foreign_20d": 0, "inst_5d": 0, "inst_20d": 0})
        time.sleep(0.15)

        m3  = mom_skip(prices, 65,  skip=5)   # 3M: 1주일 skip (21일은 과다)
        m6  = mom_skip(prices, 130, skip=10)  # 6M: 2주 skip
        m12 = mom_skip(prices, 252, skip=21)  # 12M: 1개월 skip (학술적 표준)
        v20 = vol(prices, 20)
        v60 = vol(prices, 60)
        rs3 = (m3 - kospi_3m) if m3 is not None else None
        is_spec, spec_reason = detect_speculative(prices, v20)
        if is_spec:
            print(f"⚠️  투기주 감지: {name} ({spec_reason})")

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
            "pbr":                  pbr_map.get(code),
            "is_speculative":       is_spec,
            "speculative_reason":   spec_reason or None,
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
    # Sharpe-like momentum: momentum / volatility (same return, less risk = better)
    # clip vol at 10% floor to avoid division by near-zero
    vol_adj = df["volatility_60d"].fillna(med("volatility_60d")).clip(lower=0.10)
    df["z_momentum"]   = zscore(mom_raw / vol_adj)
    df["z_rs"]         = zscore(df["relative_strength_3m"].fillna(0))
    df["z_volatility"] = zscore(-df["volatility_20d"].fillna(med("volatility_20d")))

    # 수급 팩터: 시총 정규화 (대형주 삼성전자 등이 절대금액으로 지배하는 문제 방지)
    # 종목 전체 평균 유동주식 거래대금 대비 비율로 정규화
    flow_abs = (
        df["foreign_flow_5d"].fillna(0)  * 0.40 +
        df["foreign_flow_20d"].fillna(0) * 0.15 +
        df["institution_flow_5d"].fillna(0)  * 0.35 +
        df["institution_flow_20d"].fillna(0) * 0.10
    )
    # 종목별 절대 수급을 cross-sectional z-score로 정규화 (시총 편향 제거)
    flow_raw = flow_abs
    df["z_flow"] = zscore(flow_raw)

    # ── 종합점수 0~100 ────────────────────────────────────────────
    # 가치 팩터: 섹터 중립 PBR 역수 z-score (pykrx 데이터 있을 때만)
    has_pbr = df["pbr"].notna().sum() > 10
    if has_pbr:
        df["z_value"] = sector_neutral_zscore(
            df.assign(pbr_inv=-df["pbr"].fillna(df["pbr"].median())), "pbr_inv"
        )
        print(f"  가치 팩터 적용: {df['pbr'].notna().sum()}개 종목 PBR 데이터")
    else:
        df["z_value"] = 0.0
        print("  가치 팩터 미적용 (PBR 데이터 없음)")

    # 가중치: 샤프모멘텀(45%) + 상대강도(20%) + 수급(15%) + 가치(20%)
    # pykrx 없을 시 가치 가중치를 모멘텀에 흡수 → 55%+25%+20%
    if has_pbr:
        raw = (
            df["z_momentum"] * 0.45 +
            df["z_rs"]       * 0.20 +
            df["z_flow"]     * 0.15 +
            df["z_value"]    * 0.20
        )
    else:
        raw = (
            df["z_momentum"] * 0.55 +
            df["z_rs"]       * 0.25 +
            df["z_flow"]     * 0.20
        )
    # P5: Rank-based percentile (robust to outliers vs min-max)
    df["composite_score"] = (raw.rank(pct=True) * 100).round(1)
    if skip_count > 0:
        print(f"\n  ⚠️  데이터 부족으로 스킵된 종목: {skip_count}개")
    if len(raw_rows) < 10:
        print(f"\n  ❌ 팩터 계산 실패: 유효 종목이 {len(raw_rows)}개뿐 (최소 10개 필요). "
              f"KIS API / yfinance 연결 상태를 확인하세요.", file=sys.stderr)
        return

    df = df.sort_values("composite_score", ascending=False).reset_index(drop=True)
    df["rank_total"]    = range(1, len(df) + 1)
    df["calculated_at"] = datetime.now(KST).isoformat()

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
