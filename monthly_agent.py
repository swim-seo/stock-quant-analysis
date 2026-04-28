"""
월급투자 자동 에이전트
- 매월 22~28일 첫 실행: TOP 종목 분석 → 매수 추천 이메일
- 매일 오전: 수익률 추적 → 목표 도달 / 손절 알림
- 매월 10~13일: 자동 정산 이메일

투자 기준: 200만원 / 목표 +10만원(5%) ~ +50만원(25%) / 손절 -7%
"""
import os, re, json, smtplib, time, urllib.request
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

KST            = timezone(timedelta(hours=9))
SUPABASE_URL   = os.environ["SUPABASE_URL"]
SUPABASE_KEY   = os.environ["SUPABASE_KEY"]
GMAIL_SENDER   = os.environ.get("GMAIL_SENDER", "")
GMAIL_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
REPORT_EMAIL   = os.environ.get("REPORT_EMAIL", GMAIL_SENDER)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

INVEST_AMOUNT  = 2_000_000   # 200만원
TARGET_PCT     = 5.0          # 최소 목표 +5% (+10만원)
STRETCH_PCT    = 25.0         # 이상적 목표 +25% (+50만원)
STOP_LOSS_PCT  = -7.0         # 손절 경고 -7% (-14만원)

# 분석 후보 (monthly_pick.py 와 동일)
CANDIDATES = {
    "삼성전자":      "005930",
    "SK하이닉스":    "000660",
    "한미반도체":    "042700",
    "KB금융":        "105560",
    "메리츠금융지주":"138040",
    "인텔리안테크":  "189300",
    "두산에너빌리티":"034020",
    "한화에어로스페이스": "012450",
    "LIG넥스원":     "079550",
    "HD한국조선해양":"009540",
    "현대차":        "005380",
    "기아":          "000270",
    "NAVER":         "035420",
    "크래프톤":      "259960",
    "셀트리온":      "068270",
    "삼성바이오로직스":"207940",
    "LG에너지솔루션":"373220",
    "에코프로비엠":  "247540",
    "카카오":        "035720",
}


# ── Supabase helpers ──────────────────────────────────────────────
def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sb_post(table, data, on_conflict=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    urllib.request.urlopen(req)


def sb_patch(table, id_val, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id_val}"
    headers = {**SB_HEADERS, "Prefer": "return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
    urllib.request.urlopen(req)


# ── 주가 수집 ─────────────────────────────────────────────────────
def fetch_ohlcv(code: str, count: int = 300) -> list:
    url = (f"https://fchart.stock.naver.com/sise.nhn"
           f"?symbol={code}&timeframe=day&count={count}&requestType=0")
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("euc-kr", errors="replace")
        result = []
        for item in re.findall(r'data="([^"]+)"', raw):
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
        print(f"  [주가수집 오류] {code}: {e}")
        return []


def fetch_current_price(code: str) -> float | None:
    data = fetch_ohlcv(code, count=5)
    return data[-1]["close"] if data else None


# ── 25→11 시뮬레이션 (monthly_pick.py 동일 로직) ──────────────────
def simulate_window(ohlcv: list) -> dict:
    if len(ohlcv) < 30:
        return {}
    by_date    = {r["date"]: r for r in ohlcv}
    all_dates  = sorted(by_date.keys())
    today      = datetime.now(KST)
    results    = []

    for months_ago in range(1, 13):
        buy_month = today.month - months_ago
        buy_year  = today.year
        while buy_month <= 0:
            buy_month += 12
            buy_year  -= 1
        sell_month = buy_month + 1
        sell_year  = buy_year
        if sell_month > 12:
            sell_month = 1
            sell_year += 1

        def nearest(year, month, day, direction=1):
            target = date(year, month, min(day, 28))
            for _ in range(10):
                ds = target.strftime("%Y%m%d")
                if ds in by_date:
                    return ds
                target += timedelta(days=direction)
            return None

        bd = nearest(buy_year, buy_month, 25, 1)
        sd = nearest(sell_year, sell_month, 11, 1)
        if not bd or not sd or sd <= bd:
            continue

        bp = by_date[bd]["close"]
        sp = by_date[sd]["close"]
        ret = (sp - bp) / bp * 100
        results.append({"buy_date": bd, "sell_date": sd, "buy_price": bp,
                         "sell_price": sp, "return_pct": round(ret, 2),
                         "win": ret > 0})

    if not results:
        return {}
    win_rate   = sum(1 for r in results if r["win"]) / len(results) * 100
    avg_return = sum(r["return_pct"] for r in results) / len(results)
    max_loss   = min(r["return_pct"] for r in results)
    return {
        "trials":     len(results),
        "win_rate":   round(win_rate, 1),
        "avg_return": round(avg_return, 2),
        "max_loss":   round(max_loss, 2),
        "best":       round(max(r["return_pct"] for r in results), 2),
        "history":    results,
    }


def calc_volatility(ohlcv: list) -> float:
    if len(ohlcv) < 20:
        return 99.0
    recent = ohlcv[-20:]
    ranges = [(r["high"] - r["low"]) / r["close"] * 100 for r in recent if r["close"] > 0]
    return round(sum(ranges) / len(ranges), 2) if ranges else 99.0


# 코스피 종목 코드 목록 (railway_job.py 와 동일)
_KOSPI_CODES = {
    "005930","000660","207940","068270","005380","000270",
    "035420","035720","105560","055550","138040","066570",
    "028260","097950","009540","010140","012450","034020",
    "000720","006400","090430","028300","373220","010620",
    "000100","079550","189300","323410","259960",
}

def _to_ticker(code: str) -> str:
    return f"{code}.KS" if code in _KOSPI_CODES else f"{code}.KQ"


def calc_score(window: dict, vol: float,
               composite: float | None = None,
               foreign_flow: str | None = None) -> float:
    """
    기본 100점 (과거 통계) +
    composite_score 보너스 최대 +20점 +
    외국인 순매수 보너스 +5점
    """
    if not window:
        return 0.0
    score = 0.0

    # ① 승률 (40점)
    score += min(40, window["win_rate"] * 0.5)

    # ② 평균 수익률 (30점)
    avg = window["avg_return"]
    if avg >= 5:   score += 30
    elif avg >= 3: score += 20 + (avg - 3) * 5
    elif avg >= 1: score += 10 + (avg - 1) * 5
    elif avg > 0:  score += 5

    # ③ 최대 손실 (20점)
    loss = abs(window["max_loss"])
    if loss <= 3:    score += 20
    elif loss <= 5:  score += 15
    elif loss <= 10: score += 8
    elif loss <= 15: score += 3

    # ④ 변동성 (10점)
    if vol <= 1.5:   score += 10
    elif vol <= 2.5: score += 7
    elif vol <= 3.5: score += 4
    elif vol <= 5.0: score += 2

    # ⑤ composite_score 보너스 (최대 +20점)
    if composite is not None:
        if composite >= 7.0:   score += 20
        elif composite >= 6.0: score += 14
        elif composite >= 5.5: score += 8
        elif composite >= 4.0: score += 2
        else:                  score -= 5  # 낮은 신호 패널티

    # ⑥ 외국인 순매수 보너스 (+5점)
    if foreign_flow and "순매수" in str(foreign_flow):
        score += 5

    return round(score, 1)


# ── 복합 점수 + 외국인 수급 조회 ─────────────────────────────────
def _get_composite_scores() -> dict:
    """prediction_log에서 오늘치 ticker → composite_score 조회"""
    today = datetime.now(KST).strftime("%Y-%m-%d")
    try:
        rows = sb_get("prediction_log",
            f"date=eq.{today}&select=ticker,composite_score&limit=100")
        return {r["ticker"]: r["composite_score"]
                for r in rows if r.get("composite_score") is not None}
    except Exception:
        return {}


def _get_investor_flows() -> dict:
    """stock_news에서 최근 5일 종목별 외국인/기관 수급 조회 → name → flow_text"""
    try:
        cutoff = (datetime.now(KST) - timedelta(days=5)).strftime("%Y-%m-%d")
        rows = sb_get("stock_news",
            f"date=gte.{cutoff}&select=stock_name,investor_flow&limit=200")
        flows = {}
        for r in rows:
            name = r.get("stock_name")
            flow = r.get("investor_flow") or ""
            if name and flow:
                flows[name] = flow   # 가장 최근이 앞으로 오므로 첫 값 우선
        return flows
    except Exception:
        return {}


# ── Supabase 상태 관리 ──────────────────────────────────────────
def _get_active_pick() -> dict | None:
    try:
        rows = sb_get("monthly_picks",
            "status=eq.active&order=created_at.desc&limit=1")
        return rows[0] if rows else None
    except Exception:
        return None


def _already_picked_this_month(pick_month: str) -> bool:
    try:
        rows = sb_get("monthly_picks",
            f"pick_month=eq.{pick_month}&select=id&limit=1")
        return len(rows) > 0
    except Exception:
        return False


def _save_pick(pick_month, name, code, score, win_rate, avg_return,
               buy_date, buy_price):
    target = round(buy_price * (1 + TARGET_PCT / 100))
    sb_post("monthly_picks", {
        "pick_month":   pick_month,
        "stock_name":   name,
        "stock_code":   code,
        "score":        score,
        "win_rate":     win_rate,
        "avg_return":   avg_return,
        "buy_date":     buy_date,
        "buy_price":    buy_price,
        "target_price": target,
        "status":       "active",
    }, on_conflict="pick_month")


def _close_pick(pick_id, sell_date, sell_price, buy_price):
    ret = round((sell_price - buy_price) / buy_price * 100, 2)
    sb_patch("monthly_picks", pick_id, {
        "sell_date":        sell_date,
        "sell_price":       sell_price,
        "final_return_pct": ret,
        "status":           "closed",
    })
    return ret


# ── 이메일 발송 ──────────────────────────────────────────────────
def _send_email(subject: str, html: str):
    if not GMAIL_SENDER or not GMAIL_PASSWORD:
        print("  [이메일] 환경변수 미설정 (GMAIL_SENDER / GMAIL_APP_PASSWORD)")
        return
    try:
        import email.mime.multipart, email.mime.text
        msg = email.mime.multipart.MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = GMAIL_SENDER
        msg["To"]      = REPORT_EMAIL
        msg.attach(email.mime.text.MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.ehlo(); s.starttls(); s.ehlo()
            s.login(GMAIL_SENDER, GMAIL_PASSWORD)
            s.sendmail(GMAIL_SENDER, REPORT_EMAIL, msg.as_string())
        print(f"  [이메일] 발송 완료 → {REPORT_EMAIL}")
    except Exception as e:
        print(f"  [이메일] 오류: {e}")


# ── 이메일 템플릿 ────────────────────────────────────────────────
def _email_buy_recommendation(name, code, score, win_rate, avg_return,
                               max_loss, best, buy_price, history,
                               composite=None, flow=None):
    profit_min = round(buy_price * TARGET_PCT / 100 / buy_price * INVEST_AMOUNT)
    profit_max = round(INVEST_AMOUNT * STRETCH_PCT / 100)
    target_price = round(buy_price * (1 + TARGET_PCT / 100))
    shares = int(INVEST_AMOUNT / buy_price)
    total_cost = shares * buy_price

    # 최근 이력 HTML
    history_rows = ""
    for h in sorted(history, key=lambda x: x["buy_date"])[-6:]:
        icon = "✅" if h["win"] else "❌"
        color = "#16a34a" if h["win"] else "#dc2626"
        history_rows += f"""
        <tr>
          <td style="padding:6px 12px">{icon} {h['buy_date'][:4]}/{h['buy_date'][4:6]}</td>
          <td style="padding:6px 12px;color:{color};font-weight:bold">{h['return_pct']:+.2f}%</td>
          <td style="padding:6px 12px;color:{color}">
            {round(h['return_pct'] / 100 * INVEST_AMOUNT):+,}원
          </td>
        </tr>"""

    return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:20px">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px;color:white">
    <h1 style="margin:0;font-size:22px">💰 월급투자 매수 추천</h1>
    <p style="margin:8px 0 0;opacity:.9">25일 → 다음달 11일 전략</p>
  </div>
  <div style="padding:28px">

    <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px;border-radius:4px;margin-bottom:24px">
      <h2 style="margin:0 0 4px;color:#1e40af;font-size:20px">#{1} {name}</h2>
      <p style="margin:0;color:#64748b">점수 {score:.0f}/100 &nbsp;|&nbsp; 승률 {win_rate:.1f}% &nbsp;|&nbsp; 12개월 평균 {avg_return:+.2f}%</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f8fafc">
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">매수 기준가</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:bold;font-size:18px">{buy_price:,.0f}원</td>
      </tr>
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">매수 수량 (200만원 기준)</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:bold">{shares}주 ({total_cost:,}원)</td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">목표가 (+{TARGET_PCT:.0f}%)</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#16a34a">{target_price:,.0f}원</td>
      </tr>
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">손절 경고 ({STOP_LOSS_PCT:.0f}%)</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#dc2626">{round(buy_price * (1 + STOP_LOSS_PCT/100)):,.0f}원</td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">역대 최대 손실</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#dc2626">{max_loss:+.2f}% ({round(max_loss/100*INVEST_AMOUNT):+,}원)</td>
      </tr>
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">AI 복합 신호</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0">
          {f'<span style="color:{"#16a34a" if (composite or 0) >= 5.5 else ("#f59e0b" if (composite or 0) >= 4 else "#dc2626")};font-weight:bold">{composite:.1f}/10</span>' if composite is not None else '<span style="color:#94a3b8">데이터 없음 (내일부터 반영)</span>'}
        </td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:12px;color:#64748b">외국인/기관 수급</td>
        <td style="padding:12px">
          {f'<span style="color:{"#16a34a" if "순매수" in str(flow) else "#dc2626"}">{flow[:60] if flow else "-"}</span>' if flow else '<span style="color:#94a3b8">-</span>'}
        </td>
      </tr>
    </table>

    <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center">
      <p style="margin:0 0 8px;color:#64748b;font-size:14px">예상 수익 (200만원 기준)</p>
      <p style="margin:0;font-size:28px;font-weight:bold;color:#16a34a">
        +{profit_min:,}원 ~ +{profit_max:,}원
      </p>
      <p style="margin:8px 0 0;color:#64748b;font-size:13px">
        목표 +5% = +{profit_min:,}원 &nbsp;/&nbsp; 이상적 +25% = +{profit_max:,}원
      </p>
    </div>

    <h3 style="color:#1e293b;margin-bottom:12px">과거 12개월 실적</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f8fafc;color:#64748b">
        <th style="padding:8px 12px;text-align:left">기간</th>
        <th style="padding:8px 12px;text-align:left">수익률</th>
        <th style="padding:8px 12px;text-align:left">수익금 (200만원)</th>
      </tr>
      {history_rows}
    </table>

    <div style="background:#fefce8;border-radius:8px;padding:16px;margin-top:24px">
      <p style="margin:0;color:#92400e;font-size:13px">
        ⚠️ 과거 실적이 미래를 보장하지 않습니다. 매도일(11일)은 절대 기준이 아니며,
        목표가 달성 시 조기 매도도 좋은 전략입니다.
      </p>
    </div>
  </div>
  <div style="background:#f8fafc;padding:16px;text-align:center;color:#94a3b8;font-size:12px">
    자동 생성 by Stock Analysis Agent
  </div>
</div></body></html>"""


def _email_daily_tracking(name, buy_price, cur_price, ret_pct,
                           target_price, buy_date, days_left, alert_type="normal"):
    profit = round((cur_price - buy_price) / buy_price * INVEST_AMOUNT)
    target_profit = round((target_price - buy_price) / buy_price * INVEST_AMOUNT)
    shares = int(INVEST_AMOUNT / buy_price)

    if alert_type == "target":
        header_color = "#16a34a"
        header_bg    = "linear-gradient(135deg,#16a34a,#22c55e)"
        header_title = "🎯 목표가 달성! 매도 검토"
        header_sub   = f"{TARGET_PCT:.0f}% 목표 달성 — 지금 팔면 +{profit:,}원"
    elif alert_type == "stoploss":
        header_color = "#dc2626"
        header_bg    = "linear-gradient(135deg,#dc2626,#ef4444)"
        header_title = "⚠️ 손절 경고"
        header_sub   = f"손실 {ret_pct:.2f}% — 추가 하락 가능성 확인 필요"
    else:
        header_color = "#1e40af"
        header_bg    = "linear-gradient(135deg,#1e40af,#3b82f6)"
        header_title = "📊 월급투자 일일 현황"
        header_sub   = f"{name} 보유 중 | 매도까지 {days_left}일"

    bar_width = max(0, min(100, int((ret_pct / STRETCH_PCT) * 100)))
    bar_color = "#16a34a" if ret_pct >= TARGET_PCT else ("#f59e0b" if ret_pct >= 0 else "#dc2626")

    return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:20px">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <div style="background:{header_bg};padding:24px;color:white">
    <h1 style="margin:0;font-size:20px">{header_title}</h1>
    <p style="margin:6px 0 0;opacity:.9">{header_sub}</p>
  </div>
  <div style="padding:28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="color:#64748b">진행률 (목표 +{TARGET_PCT:.0f}%)</span>
      <span style="font-weight:bold;color:{bar_color}">{ret_pct:+.2f}%</span>
    </div>
    <div style="background:#e2e8f0;border-radius:99px;height:12px;margin-bottom:24px">
      <div style="background:{bar_color};height:12px;border-radius:99px;width:{bar_width}%"></div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="background:#f8fafc">
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">종목</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:bold">{name} ({shares}주)</td>
      </tr>
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">매수가</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0">{buy_price:,.0f}원 ({buy_date[4:6]}/{buy_date[6:]})</td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">현재가</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:bold;font-size:18px">{cur_price:,.0f}원</td>
      </tr>
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b">현재 수익</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:{bar_color}">
          {ret_pct:+.2f}% &nbsp; ({profit:+,}원)
        </td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:12px;color:#64748b">목표가 달성 시</td>
        <td style="padding:12px;color:#16a34a">+{target_price:,.0f}원 → +{target_profit:,}원</td>
      </tr>
    </table>

    <div style="background:#f0f9ff;border-radius:8px;padding:14px;font-size:13px;color:#0369a1">
      매도 예정일: 5/11 (D-{days_left}) &nbsp;|&nbsp;
      목표 +{TARGET_PCT:.0f}% 달성 시 즉시 매도 권장
    </div>
  </div>
</div></body></html>"""


def _email_final_result(name, buy_price, sell_price, ret_pct, buy_date, sell_date,
                        next_pick_name=None, next_score=None):
    profit  = round((sell_price - buy_price) / buy_price * INVEST_AMOUNT)
    shares  = int(INVEST_AMOUNT / buy_price)
    success = ret_pct >= TARGET_PCT

    return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:20px">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <div style="background:{'linear-gradient(135deg,#16a34a,#22c55e)' if success else 'linear-gradient(135deg,#64748b,#94a3b8)'};padding:28px;color:white">
    <h1 style="margin:0;font-size:22px">{'🎉 월급투자 정산 완료!' if success else '📋 월급투자 정산'}</h1>
    <p style="margin:8px 0 0;opacity:.9">{buy_date[4:6]}/25 → {sell_date[4:6]}/11 전략 결과</p>
  </div>
  <div style="padding:28px">
    <div style="text-align:center;padding:24px;background:{'#f0fdf4' if profit >= 0 else '#fef2f2'};border-radius:12px;margin-bottom:24px">
      <p style="margin:0 0 8px;color:#64748b">최종 수익 (200만원 기준)</p>
      <p style="margin:0;font-size:40px;font-weight:bold;color:{'#16a34a' if profit >= 0 else '#dc2626'}">
        {profit:+,}원
      </p>
      <p style="margin:8px 0 0;font-size:18px;color:{'#16a34a' if ret_pct >= 0 else '#dc2626'}">
        {ret_pct:+.2f}%
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f8fafc">
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">종목</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold">{name} ({shares}주)</td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">매수</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0">{buy_price:,.0f}원 ({buy_date[4:6]}/{buy_date[6:]})</td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">매도</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0">{sell_price:,.0f}원 ({sell_date[4:6]}/{sell_date[6:]})</td>
      </tr>
    </table>

    {'<div style="background:#eff6ff;border-radius:8px;padding:16px"><p style="margin:0 0 8px;font-weight:bold;color:#1e40af">다음달 후보</p><p style="margin:0;color:#1e293b">'+next_pick_name+f' (점수 {next_score:.0f}/100) — 25일 이후 정식 추천 발송 예정</p></div>' if next_pick_name else ''}
  </div>
</div></body></html>"""


# ── 핵심 로직 ─────────────────────────────────────────────────────
def _run_analysis() -> list:
    """모든 후보 종목 분석 → 점수 내림차순 반환 (composite + 외국인 수급 포함)"""
    composite_scores = _get_composite_scores()   # ticker→score
    investor_flows   = _get_investor_flows()      # name→flow_text

    has_composite = bool(composite_scores)
    has_flow      = bool(investor_flows)
    print(f"  [분석] composite_score {len(composite_scores)}개, 수급 {len(investor_flows)}개 로드")

    results = []
    for name, code in CANDIDATES.items():
        ohlcv = fetch_ohlcv(code, 300)
        if not ohlcv:
            continue
        window    = simulate_window(ohlcv)
        vol       = calc_volatility(ohlcv)
        ticker    = _to_ticker(code)
        composite = composite_scores.get(ticker)
        flow      = investor_flows.get(name)
        score     = calc_score(window, vol, composite, flow)
        cur       = ohlcv[-1]["close"]
        results.append({
            "name":      name,
            "code":      code,
            "score":     score,
            "window":    window,
            "vol":       vol,
            "cur_price": cur,
            "composite": composite,
            "flow":      flow,
        })
        time.sleep(0.3)
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def _days_until_sell():
    today = datetime.now(KST)
    # 다음 11일 계산
    if today.day <= 11:
        sell_target = date(today.year, today.month, 11)
    else:
        m = today.month + 1
        y = today.year
        if m > 12:
            m = 1; y += 1
        sell_target = date(y, m, 11)
    return (sell_target - today.date()).days


# ── 매수 추천 ─────────────────────────────────────────────────────
def check_buy_window():
    today    = datetime.now(KST)
    day      = today.day
    month_id = today.strftime("%Y-%m")

    if not (22 <= day <= 28):
        return
    if _already_picked_this_month(month_id):
        print("  [월급에이전트] 이번달 매수 추천 이미 완료")
        return

    print("  [월급에이전트] 매수 추천 분석 시작...")
    results = _run_analysis()
    if not results:
        return

    top = results[0]
    w   = top["window"]
    if not w:
        return

    buy_date  = today.strftime("%Y%m%d")
    buy_price = top["cur_price"]

    _save_pick(month_id, top["name"], top["code"], top["score"],
               w["win_rate"], w["avg_return"], buy_date, buy_price)

    html = _email_buy_recommendation(
        top["name"], top["code"], top["score"], w["win_rate"],
        w["avg_return"], w["max_loss"], w["best"],
        buy_price, w["history"],
        composite=top.get("composite"),
        flow=top.get("flow"),
    )
    target_profit = round(buy_price * TARGET_PCT / 100 / buy_price * INVEST_AMOUNT)
    _send_email(
        f"[월급투자] {top['name']} 매수 추천 — 목표 +{target_profit:,}원",
        html
    )
    print(f"  [월급에이전트] 추천: {top['name']} (점수 {top['score']:.0f}, composite {top.get('composite')}, 매수가 {buy_price:,.0f}원)")


# ── 일일 추적 ─────────────────────────────────────────────────────
def check_daily_tracking():
    active = _get_active_pick()
    if not active:
        return

    name      = active["stock_name"]
    code      = active["stock_code"]
    buy_price = active["buy_price"]
    buy_date  = active["buy_date"]
    target    = active["target_price"]

    cur_price = fetch_current_price(code)
    if not cur_price:
        return

    ret_pct   = (cur_price - buy_price) / buy_price * 100
    days_left = _days_until_sell()
    today_str = datetime.now(KST).strftime("%Y-%m-%d")

    print(f"  [월급에이전트] {name} 현재 {ret_pct:+.2f}% (D-{days_left})")

    # 목표 달성 알림
    if ret_pct >= TARGET_PCT:
        _send_email(
            f"[월급투자] {name} 목표 달성! +{round((cur_price-buy_price)/buy_price*INVEST_AMOUNT):,}원 🎯",
            _email_daily_tracking(name, buy_price, cur_price, ret_pct, target,
                                   buy_date, days_left, "target")
        )
    # 손절 경고
    elif ret_pct <= STOP_LOSS_PCT:
        _send_email(
            f"[월급투자] {name} 손절 경고 {ret_pct:.2f}% ⚠️",
            _email_daily_tracking(name, buy_price, cur_price, ret_pct, target,
                                   buy_date, days_left, "stoploss")
        )
    # 주 1회 업데이트 (월요일)
    elif datetime.now(KST).weekday() == 0:
        _send_email(
            f"[월급투자] {name} 주간 현황 {ret_pct:+.2f}% (D-{days_left}일)",
            _email_daily_tracking(name, buy_price, cur_price, ret_pct, target,
                                   buy_date, days_left, "normal")
        )


# ── 매도 정산 ─────────────────────────────────────────────────────
def check_sell_window():
    today = datetime.now(KST)
    day   = today.day

    if not (10 <= day <= 13):
        return

    active = _get_active_pick()
    if not active:
        return

    # 매수가 이번달이면 아직 정산 아님 (25일 매수 → 같은달 11일 X)
    buy_dt = datetime.strptime(active["buy_date"], "%Y%m%d")
    if buy_dt.month == today.month:
        return

    name      = active["stock_name"]
    code      = active["stock_code"]
    buy_price = active["buy_price"]
    buy_date  = active["buy_date"]

    cur_price = fetch_current_price(code)
    if not cur_price:
        return

    sell_date = today.strftime("%Y%m%d")
    ret_pct   = _close_pick(active["id"], sell_date, cur_price, buy_price)

    print(f"  [월급에이전트] 정산: {name} {ret_pct:+.2f}%")

    # 다음달 예고
    results      = _run_analysis()
    next_name    = results[0]["name"] if results else None
    next_score   = results[0]["score"] if results else None

    html = _email_final_result(name, buy_price, cur_price, ret_pct,
                                buy_date, sell_date, next_name, next_score)
    profit = round((cur_price - buy_price) / buy_price * INVEST_AMOUNT)
    _send_email(
        f"[월급투자] {name} 정산 완료 {ret_pct:+.2f}% ({profit:+,}원)",
        html
    )


# ── 진입점 ─────────────────────────────────────────────────────
def run_monthly_agent():
    print("\n  [월급투자 에이전트] 실행 중...")
    try:
        check_sell_window()   # 정산 먼저 (11일 전후)
        check_buy_window()    # 매수 추천 (25일 전후)
        check_daily_tracking() # 일일 추적
    except Exception as e:
        print(f"  [월급투자 에이전트] 오류: {e}")
    print("  [월급투자 에이전트] 완료")


if __name__ == "__main__":
    run_monthly_agent()
