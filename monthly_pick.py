"""
월급투자 픽 분석기
  - 매월 25일 매수 → 다음달 11일 매도 전략
  - 과거 12개월 시뮬레이션 + 애널리스트 목표가

실행: python monthly_pick.py
"""
import os, json, re, time, urllib.request
from pathlib import Path
from datetime import datetime, date, timedelta
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SB_HEADERS   = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

INVEST_AMOUNT = 1_500_000  # 분석 기준 투자금 (150만원)

# ── 분석 대상 종목 ────────────────────────────────────────────────
CANDIDATES = {
    "삼성전자":     "005930",
    "SK하이닉스":   "000660",
    "한미반도체":   "042700",
    "NAVER":       "035420",
    "카카오":       "035720",
    "현대차":       "005380",
    "기아":         "000270",
    "셀트리온":     "068270",
    "삼성바이오로직스": "207940",
    "LG에너지솔루션": "373220",
    "에코프로비엠":  "247540",
    "크래프톤":     "259960",
    "한화에어로스페이스": "012450",
    "LIG넥스원":   "079550",
    "HD한국조선해양": "009540",
    "KB금융":       "105560",
    "메리츠금융지주": "138040",
    "두산에너빌리티": "034020",
    "인텔리안테크":  "189300",
}


# ── 네이버 OHLCV (날짜 포함) ──────────────────────────────────────
def fetch_ohlcv(code: str, count: int = 300) -> list:
    """[{"date":"YYYYMMDD", "close":float, "volume":int}, ...]  오래된순"""
    url = (f"https://fchart.stock.naver.com/sise.nhn"
           f"?symbol={code}&timeframe=day&count={count}&requestType=0")
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("euc-kr", errors="replace")
        items = re.findall(r'data="([^"]+)"', raw)
        result = []
        for item in items:
            p = item.split("|")
            if len(p) >= 6 and p[4]:
                try:
                    result.append({
                        "date":   p[0],
                        "open":   float(p[1]) if p[1] else 0,
                        "high":   float(p[2]) if p[2] else 0,
                        "low":    float(p[3]) if p[3] else 0,
                        "close":  float(p[4]),
                        "volume": int(p[5]) if p[5] else 0,
                    })
                except ValueError:
                    pass
        return result
    except Exception as e:
        print(f"    데이터 수집 실패({code}): {e}")
        return []


# ── 25일→11일 창문 시뮬레이션 ──────────────────────────────────────
def simulate_window(ohlcv: list) -> dict:
    """과거 12개월간 매월 25일 매수 → 다음달 11일 매도 시뮬레이션"""
    if len(ohlcv) < 30:
        return {}

    by_date = {r["date"]: r for r in ohlcv}
    all_dates = sorted(by_date.keys())

    results = []
    today = datetime.now()

    for months_ago in range(1, 13):
        # 매수 기준일: N개월 전 25일
        buy_month  = today.month - months_ago
        buy_year   = today.year
        while buy_month <= 0:
            buy_month += 12
            buy_year  -= 1

        # 매도 기준일: buy_month + 1의 11일
        sell_month = buy_month + 1
        sell_year  = buy_year
        if sell_month > 12:
            sell_month = 1
            sell_year += 1

        # 가장 가까운 거래일 찾기
        def nearest_trading_day(year, month, day, direction=1):
            """지정 날짜에서 가장 가까운 거래일 (direction: 1=이후, -1=이전)"""
            target = date(year, month, min(day, 28))
            for _ in range(10):
                ds = target.strftime("%Y%m%d")
                if ds in by_date:
                    return ds
                target += timedelta(days=direction)
            return None

        buy_date  = nearest_trading_day(buy_year,  buy_month,  25,  1)
        sell_date = nearest_trading_day(sell_year, sell_month, 11,  1)

        if not buy_date or not sell_date or sell_date <= buy_date:
            continue
        if buy_date not in by_date or sell_date not in by_date:
            continue

        buy_price  = by_date[buy_date]["close"]
        sell_price = by_date[sell_date]["close"]
        ret_pct    = (sell_price - buy_price) / buy_price * 100
        profit     = round((sell_price - buy_price) / buy_price * INVEST_AMOUNT)
        hold_days  = len([d for d in all_dates if buy_date <= d <= sell_date]) - 1

        results.append({
            "buy_date":   buy_date,
            "sell_date":  sell_date,
            "buy_price":  buy_price,
            "sell_price": sell_price,
            "return_pct": round(ret_pct, 2),
            "profit":     profit,
            "hold_days":  hold_days,
            "win":        ret_pct > 0,
        })

    if not results:
        return {}

    win_rate    = sum(1 for r in results if r["win"]) / len(results) * 100
    avg_return  = sum(r["return_pct"] for r in results) / len(results)
    avg_profit  = sum(r["profit"] for r in results) / len(results)
    max_loss    = min(r["return_pct"] for r in results)
    best        = max(r["return_pct"] for r in results)

    return {
        "trials":     len(results),
        "win_rate":   round(win_rate, 1),
        "avg_return": round(avg_return, 2),
        "avg_profit": round(avg_profit),
        "max_loss":   round(max_loss, 2),
        "best":       round(best, 2),
        "history":    results[-6:],  # 최근 6개월만
    }


# ── 변동성 (ATR 기반) ─────────────────────────────────────────────
def calc_volatility(ohlcv: list) -> float:
    """일간 변동폭 / 가격 (낮을수록 안전)"""
    if len(ohlcv) < 20:
        return 99.0
    recent = ohlcv[-20:]
    daily_ranges = [(r["high"] - r["low"]) / r["close"] * 100 for r in recent if r["close"] > 0]
    return round(sum(daily_ranges) / len(daily_ranges), 2) if daily_ranges else 99.0


# ── Supabase에서 애널리스트 목표가 수집 ────────────────────────────
def fetch_analyst_targets() -> dict:
    """최근 YouTube 분석에서 종목별 price_target 수집"""
    targets = {}
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/youtube_insights"
            f"?select=key_stocks_analysis&order=processed_at.desc&limit=50",
            headers=SB_HEADERS
        )
        with urllib.request.urlopen(req) as resp:
            rows = json.loads(resp.read())

        for row in rows:
            raw = row.get("key_stocks_analysis")
            if not raw:
                continue
            try:
                analyses = json.loads(raw) if isinstance(raw, str) else raw
                for a in (analyses or []):
                    name = a.get("name")
                    target = a.get("price_target")
                    if name and target:
                        targets[name] = target
            except Exception:
                pass
    except Exception:
        pass
    return targets


# ── 종합 점수 계산 ─────────────────────────────────────────────────
def calc_pick_score(window: dict, vol: float) -> float:
    """월급투자 적합도 점수 (0~100)"""
    if not window:
        return 0.0
    score = 0.0

    # 1. 승률 (40점 만점)
    score += min(40, window["win_rate"] * 0.5)  # 80%면 40점

    # 2. 평균 수익률 (30점 만점) — 목표 3~5%
    avg = window["avg_return"]
    if avg >= 5: score += 30
    elif avg >= 3: score += 20 + (avg - 3) * 5
    elif avg >= 1: score += 10 + (avg - 1) * 5
    elif avg > 0: score += 5

    # 3. 최대 손실 작을수록 (20점 만점)
    loss = abs(window["max_loss"])
    if loss <= 3: score += 20
    elif loss <= 5: score += 15
    elif loss <= 10: score += 8
    elif loss <= 15: score += 3

    # 4. 변동성 낮을수록 (10점 만점)
    if vol <= 1.5: score += 10
    elif vol <= 2.5: score += 7
    elif vol <= 3.5: score += 4
    elif vol <= 5.0: score += 2

    return round(score, 1)


# ── 메인 분석 ─────────────────────────────────────────────────────
def main():
    print("\n" + "="*60)
    print(f"  [월급투자] 월급투자 픽 분석기")
    print(f"  전략: 매월 25일 매수 → 다음달 11일 매도")
    print(f"  투자금 기준: {INVEST_AMOUNT:,}원")
    print(f"  분석일: {datetime.now().strftime('%Y-%m-%d')}")
    print("="*60)

    print("\n  데이터 수집 중...")
    analyst_targets = fetch_analyst_targets()

    results = []
    for name, code in CANDIDATES.items():
        print(f"  분석 중: {name}...", end=" ", flush=True)
        ohlcv = fetch_ohlcv(code, count=300)
        if not ohlcv:
            print("스킵")
            continue

        window   = simulate_window(ohlcv)
        vol      = calc_volatility(ohlcv)
        score    = calc_pick_score(window, vol)
        cur_price = ohlcv[-1]["close"]
        target    = analyst_targets.get(name)

        results.append({
            "name":    name,
            "code":    code,
            "score":   score,
            "window":  window,
            "vol":     vol,
            "cur_price": cur_price,
            "target":  target,
        })
        print(f"점수 {score:.0f}")
        time.sleep(0.5)

    # 정렬
    results.sort(key=lambda x: x["score"], reverse=True)

    # ── 결과 출력 ────────────────────────────────────────────────────
    print("\n\n" + "="*60)
    print("  [결과] 월급투자 추천 종목 TOP 5")
    print("="*60)

    for i, r in enumerate(results[:5], 1):
        w = r["window"]
        if not w:
            continue

        # 등급
        grade = "[강력추천]" if r["score"] >= 65 else \
                "[추천]" if r["score"] >= 50 else \
                "[보통]" if r["score"] >= 35 else "[비추천]"

        print(f"\n{'─'*55}")
        print(f"  #{i}  {r['name']}  |  점수 {r['score']:.0f}/100  |  {grade}")
        print(f"{'─'*55}")

        # 과거 시뮬레이션 결과
        print(f"  [전략] 25일→11일 전략  (과거 {w['trials']}회 시뮬레이션)")
        print(f"     승률:      {w['win_rate']:>5.1f}%")
        print(f"     평균 수익: {w['avg_return']:>+6.2f}%  →  약 {w['avg_profit']:>+,}원 (150만원 기준)")
        print(f"     최고:      {w['best']:>+6.2f}%  |  최대손실: {w['max_loss']:>+6.2f}%")
        print(f"     변동성:    {r['vol']:.2f}% (일간 평균 변동폭 / 현재가)")

        # 현재가 + 목표가
        print(f"\n  [가격] 현재가:  {r['cur_price']:>10,.0f}원")
        if r["target"]:
            try:
                target_val = float(str(r["target"]).replace(",", "").replace("원", "").replace("만", "0000"))
                upside = (target_val - r["cur_price"]) / r["cur_price"] * 100
                print(f"     목표가:  {target_val:>10,.0f}원  (상승여력 {upside:+.1f}%)")
            except Exception:
                print(f"     목표가:  {r['target']}")

        # 최근 6개월 이력
        if w.get("history"):
            print(f"\n  [이력] 최근 6개월 실적:")
            for h in w["history"][-4:]:
                icon = "O" if h["win"] else "X"
                print(f"     {icon}  {h['buy_date'][:4]}/{h['buy_date'][4:6]}/25 → "
                      f"{h['sell_date'][4:6]}/11  "
                      f"{h['return_pct']:>+6.2f}%  ({h['profit']:>+,}원)")

    # ── 하단 요약 ─────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  [가이드] 전략 실행 가이드")
    print(f"{'='*60}")
    if results:
        top = results[0]
        w   = top["window"]
        print(f"\n  1순위 추천: {top['name']}")
        print(f"  → 이번달 25일에 매수")
        print(f"  → 다음달 11일에 매도")
        if w:
            print(f"  → 과거 기준 예상 수익: 평균 {w['avg_profit']:+,}원 / 승률 {w['win_rate']:.0f}%")

    print(f"\n  [주의]  유의사항")
    print(f"  - 과거 데이터 기반 분석 (미래 보장 아님)")
    print(f"  - 이슈·공시·급등락 시 수익률 크게 달라질 수 있음")
    print(f"  - 종목 분산 권장: 150만원→1종목보다 75만원×2종목")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
