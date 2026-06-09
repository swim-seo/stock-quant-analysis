"""
아침 브리핑 자동 생성
매일 아침 실행 → 전일 시장 요약 + 오늘 주목 종목 + 전문가 의견 종합
"""
import os
import sys
import json
import re
import urllib.request
import anthropic
from datetime import datetime, date, timedelta, timezone

KST = timezone(timedelta(hours=9))
def today_kst() -> date: return datetime.now(KST).date()
def now_kst() -> datetime: return datetime.now(KST)
from pathlib import Path
from dotenv import load_dotenv

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv(Path(__file__).parent / ".env")

# 모듈 레벨 싱글톤 — TCP 연결 재사용, 매 호출마다 재생성 방지
_anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

# 정적 system prompt — 1024 tokens 이상 → cache_control 실제 동작
_BRIEFING_SYSTEM = """당신은 한국 주식 시장 전문 애널리스트입니다.
주어진 데이터를 분석해 아침 브리핑을 작성하세요.

출력 형식: 다음 JSON 구조만 출력하세요 (마크다운 없이, 순수 JSON):
{
  "market_summary": "전일 시장 흐름 + 오늘 전망 (5~8줄, 자연스러운 한국어 문장)",
  "top_stocks": [
    {"name": "종목명", "reason": "주목 이유 1줄", "signal": "매수관심|관망|주의"}
  ],
  "sector_outlook": [
    {"sector": "섹터명", "outlook": "긍정|중립|부정", "reason": "이유 1줄"}
  ],
  "expert_consensus": "유튜브 전문가들의 종합 의견 요약 (3~4줄)",
  "risk_alerts": ["오늘 주의할 리스크 1줄 문자열"]
}

분석 기준 및 가이드라인:
- 코스피 변동률 +1% 이상: 강세, -1% 이하: 약세, 그 외: 중립
- 외국인 5일 누적 순매수 양수: 수급 긍정 신호, 음수: 수급 부정 신호
- 외국인 연속 5일 이상 순매수: 강한 수급 지지 신호로 해석
- 유튜브 전문가 매수관심 비율 60% 이상: 시장 낙관 분위기
- 유튜브 전문가 주의/관망 비율 60% 이상: 시장 신중 분위기
- top_stocks: 3~5개 권장 (뉴스 호재 + 수급 긍정 종목 우선)
- sector_outlook: 3~5개 권장
- risk_alerts: 1~3개 (매크로 리스크, 섹터 리스크, 수급 이탈 위험 등)
- 브리핑 톤: 객관적이고 전문적, 과도한 낙관/비관 지양
- 수급 데이터(foreign5d)가 음수이면서 유튜브도 부정적이면 risk_alerts에 명시"""

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sb_upsert(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    urllib.request.urlopen(req)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 데이터 수집
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_recent_youtube_insights(limit=20):
    """최근 유튜브 인사이트"""
    return sb_get("youtube_insights",
                  f"select=title,channel,summary,market_sentiment,key_stocks,key_sectors,trading_type,urgency"
                  f"&order=processed_at.desc&limit={limit}")


def get_recent_news(limit=10):
    """최근 종목 뉴스 분석"""
    return sb_get("stock_news",
                  f"select=stock_name,stock_code,analysis,investor_data,sentiment"
                  f"&order=collected_at.desc&limit={limit}")


def get_top_trade_signals(limit: int = 5) -> list[dict]:
    """trade_signals 테이블에서 BUY 신호 TOP N 조회"""
    rows = sb_get(
        "trade_signals",
        f"select=ticker,stock_name,sector,composite_score,signal_agreement,yt_score,tech_score"
        f"&signal=eq.BUY&order=composite_score.desc&limit={limit}"
    )
    return rows if isinstance(rows, list) else []


def get_market_data():
    """코스피/코스닥 최근 데이터 (yfinance)"""
    try:
        import yfinance as yf
        kospi = yf.Ticker("^KS11").history(period="5d")
        kosdaq = yf.Ticker("^KQ11").history(period="5d")

        def fmt(df, name):
            if df.empty:
                return {}
            last = df.iloc[-1]
            prev = df.iloc[-2] if len(df) > 1 else last
            change = last["Close"] - prev["Close"]
            pct = (change / prev["Close"]) * 100
            return {
                "name": name,
                "close": round(float(last["Close"]), 2),
                "change": round(float(change), 2),
                "change_pct": round(float(pct), 2),
                "volume": int(last["Volume"]),
            }

        return {
            "kospi": fmt(kospi, "코스피"),
            "kosdaq": fmt(kosdaq, "코스닥"),
        }
    except Exception as e:
        print(f"  시장 데이터 수집 실패: {e}")
        return {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Claude 브리핑 생성
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def generate_briefing(market_data, youtube_insights, stock_news):
    """Claude로 아침 브리핑 생성. 모듈 레벨 클라이언트 + 캐시 가능한 system prompt 사용."""
    # 유튜브 요약
    yt_lines = []
    for item in youtube_insights[:15]:
        stocks = ", ".join(item.get("key_stocks", [])[:3])
        yt_lines.append(
            f"- [{item.get('market_sentiment','중립')}] {item.get('title','')} "
            f"({item.get('channel','')}) → 종목: {stocks}"
        )
    yt_text = "\n".join(yt_lines) if yt_lines else "수집된 인사이트 없음"

    # 뉴스 요약
    news_lines = []
    for item in stock_news[:10]:
        analysis = item.get("analysis", {})
        if isinstance(analysis, str):
            try: analysis = json.loads(analysis)
            except: analysis = {}
        inv = item.get("investor_data", [])
        if isinstance(inv, str):
            try: inv = json.loads(inv)
            except: inv = []
        foreign5 = sum(d.get("foreign_net", 0) for d in inv[:5]) if inv else 0
        news_lines.append(
            f"- {item['stock_name']}: {analysis.get('sentiment','중립')} | "
            f"외국인5일: {foreign5:+,}주 | {analysis.get('summary','')[:60]}"
        )
    news_text = "\n".join(news_lines) if news_lines else "수집된 뉴스 없음"

    # 시장 데이터
    kospi = market_data.get("kospi", {})
    kosdaq = market_data.get("kosdaq", {})
    market_text = (
        f"코스피: {kospi.get('close', '?')} ({kospi.get('change_pct', 0):+.2f}%)\n"
        f"코스닥: {kosdaq.get('close', '?')} ({kosdaq.get('change_pct', 0):+.2f}%)"
    )

    # 동적 데이터만 user message에 — JSON 스키마/기준은 _BRIEFING_SYSTEM(캐시됨)에 있음
    prompt = f"""오늘 날짜: {today_kst().strftime('%Y년 %m월 %d일')}

=== 전일 시장 ===
{market_text}

=== 유튜브 전문가 의견 (최근) ===
{yt_text}

=== 종목별 뉴스 + 수급 ===
{news_text}"""

    try:
        message = _anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=[{"type": "text", "text": _BRIEFING_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": prompt}],
        )
        content = message.content[0].text
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"  Claude 브리핑 생성 실패: {e}")

    return {
        "market_summary": "브리핑 생성 실패",
        "top_stocks": [],
        "sector_outlook": [],
        "expert_consensus": "",
        "risk_alerts": [],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    today = today_kst().isoformat()
    print("=" * 50)
    print(f"  아침 브리핑 생성 - {today}")
    print("=" * 50)

    # 1. 데이터 수집
    print("\n[1] 시장 데이터 수집...")
    market_data = get_market_data()
    kospi = market_data.get("kospi", {})
    print(f"  코스피: {kospi.get('close', '?')} ({kospi.get('change_pct', 0):+.2f}%)")

    print("\n[2] 유튜브 인사이트 로드...")
    youtube = get_recent_youtube_insights(20)
    print(f"  → {len(youtube)}개 인사이트")

    print("\n[3] 종목 뉴스 로드...")
    news = get_recent_news(10)
    print(f"  → {len(news)}개 종목 뉴스")

    print("\n[4] 매매 신호 TOP5 로드...")
    top_signals = get_top_trade_signals(5)
    print(f"  → BUY 신호 {len(top_signals)}개")

    # 2. Claude 브리핑 생성
    print("\n[5] Claude 브리핑 생성 중...")
    briefing = generate_briefing(market_data, youtube, news)

    print(f"\n=== 시장 요약 ===")
    print(briefing.get("market_summary", ""))

    print(f"\n=== 주목 종목 ===")
    for s in briefing.get("top_stocks", []):
        print(f"  • {s.get('name', '')} [{s.get('signal', '')}] - {s.get('reason', '')}")

    print(f"\n=== 섹터 전망 ===")
    for s in briefing.get("sector_outlook", []):
        print(f"  • {s.get('sector', '')} [{s.get('outlook', '')}] - {s.get('reason', '')}")

    print(f"\n=== 전문가 종합 ===")
    print(briefing.get("expert_consensus", ""))

    print(f"\n=== 리스크 ===")
    for r in briefing.get("risk_alerts", []):
        print(f"  ⚠ {r}")

    if top_signals:
        print(f"\n=== 오늘의 매매 신호 TOP5 ===")
        for sig in top_signals:
            print(f"  • {sig.get('stock_name','')} [{sig.get('composite_score',0):.1f}점] "
                  f"일치도 {sig.get('signal_agreement',0):.0f}%")

    # 3. Supabase 저장
    print("\n[6] Supabase 저장...")
    try:
        # 수급 데이터 요약
        investor_flow = {}
        for item in news:
            inv = item.get("investor_data", [])
            if isinstance(inv, str):
                try: inv = json.loads(inv)
                except: inv = []
            if inv:
                foreign5 = sum(d.get("foreign_net", 0) for d in inv[:5])
                inst5 = sum(d.get("institution_net", 0) for d in inv[:5])
                investor_flow[item["stock_name"]] = {
                    "foreign_5d": foreign5,
                    "institution_5d": inst5,
                }

        row = {
            "briefing_date": today,
            "market_summary": briefing.get("market_summary", ""),
            "top_stocks": json.dumps(briefing.get("top_stocks", []), ensure_ascii=False),
            "sector_outlook": json.dumps(briefing.get("sector_outlook", []), ensure_ascii=False),
            "expert_consensus": briefing.get("expert_consensus", ""),
            "risk_alerts": json.dumps(briefing.get("risk_alerts", []), ensure_ascii=False),
            "top_trade_signals": json.dumps(top_signals, ensure_ascii=False),
            "investor_flow": json.dumps(investor_flow, ensure_ascii=False),
            "raw_data": json.dumps({
                "market": market_data,
                "youtube_count": len(youtube),
                "news_count": len(news),
                "generated_at": now_kst().isoformat(),
            }, ensure_ascii=False),
        }
        sb_upsert("morning_briefing", row)
        print("  → 저장 완료")
    except Exception as e:
        print(f"  → 저장 실패: {e}")

    print(f"\n브리핑 생성 완료!")


if __name__ == "__main__":
    main()
