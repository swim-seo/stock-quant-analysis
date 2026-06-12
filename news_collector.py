"""
뉴스/공시/수급 수집기
① 네이버 금융 뉴스 (종목별)
② KRX 외국인/기관 매매 동향
③ Claude로 뉴스 요약 + 호재/악재 판단
"""
import os
import sys
import json
import re
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
import anthropic
from dotenv import load_dotenv
from stock_list import ALL_STOCKS

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv(Path(__file__).parent / ".env")

_anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# Supabase HTTP
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# 종목코드 → 6자리 숫자
def ticker_to_code(ticker: str) -> str:
    """005930.KS → 005930"""
    return ticker.split(".")[0]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ① 네이버 금융 뉴스
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_naver_news(stock_code: str, max_pages: int = 2) -> list:
    """
    네이버 금융 종목 뉴스 수집 (모바일 API)
    stock_code: 6자리 (예: '005930')
    """
    articles = []
    headers = {"User-Agent": "Mozilla/5.0"}

    for page in range(1, max_pages + 1):
        url = (
            f"https://m.stock.naver.com/api/news/stock/{stock_code}"
            f"?pageSize=15&page={page}"
        )
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  네이버 뉴스 수집 실패 (page {page}): {e}")
            continue

        # API 응답: list of clusters, 각 cluster에 items[]
        clusters = data if isinstance(data, list) else [data]
        for cluster in clusters:
            for item in cluster.get("items", []):
                dt = item.get("datetime", "")
                date_fmt = f"{dt[:4]}.{dt[4:6]}.{dt[6:8]}" if len(dt) >= 8 else dt
                office_id = item.get("officeId", "")
                article_id = item.get("articleId", "")
                desc = (
                    item.get("description") or
                    item.get("summary") or
                    item.get("content") or ""
                ).replace("&quot;", '"')[:200]
                article = {
                    "title": item.get("title", "").replace("&quot;", '"'),
                    "url": f"https://n.news.naver.com/mnews/article/{office_id}/{article_id}",
                    "date": date_fmt,
                    "source": item.get("officeName", ""),
                    "description": desc,
                }
                articles.append(article)

        time.sleep(0.5)

    return articles


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ② KRX 외국인/기관 수급
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_investor_trading(stock_code: str, days: int = 10) -> list:
    """
    외국인/기관 매매 동향 수집. KIS API 우선 (Railway 해외 IP에서 Naver 차단 방지),
    실패 시 Naver Mobile API fallback.
    반환: [{"date": "YYYY.MM.DD", "close": int, "foreign_net": int, "institution_net": int}, ...]
    """
    # KIS 우선
    try:
        from kis_fetcher import get_client as _get_kis
        rows = _get_kis().fetch_investor_trading(stock_code, days=days)
        if rows:
            return rows
    except Exception as e:
        print(f"  [KIS 수급 실패 {stock_code}] {e}")

    # Naver Mobile API fallback
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://m.stock.naver.com"}
    url = f"https://m.stock.naver.com/api/stock/{stock_code}/investorTradingTrends?timeframe=days&count={days}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  수급 데이터 수집 실패: {e}")
        return []

    results = []
    trend_list = data if isinstance(data, list) else data.get("tradingTrendList", [])
    for item in trend_list[:days]:
        raw_date = str(item.get("localDate", ""))
        if len(raw_date) == 8:
            date_str = f"{raw_date[:4]}.{raw_date[4:6]}.{raw_date[6:]}"
        else:
            date_str = raw_date
        results.append({
            "date": date_str,
            "close": item.get("closePrice", 0),
            "foreign_net": item.get("foreignNetBuySellVolume", 0),
            "institution_net": item.get("organNetBuySellVolume", 0),
        })
    return results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ③ Claude 뉴스 분석
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_NEWS_SYSTEM_PROMPT = """당신은 한국 주식 시장 전문 애널리스트입니다.
종목 뉴스를 분석해 다음 필드를 포함한 JSON을 마크다운 없이 순수 JSON만 출력하세요:
- summary: 전체 뉴스 흐름 3줄 요약
- sentiment: "호재" | "중립" | "악재"
- key_points: 핵심 포인트 3~5개 리스트 (각 1줄)
- risk_factors: 리스크 요인 1~3개 리스트
- catalysts: 주가 상승 촉매 1~3개 리스트
- trading_signal: "매수관심" | "관망" | "주의"
- news_impact_score: 0~100 숫자 (100이 가장 강한 영향)
- price_direction: "상승" | "중립" | "하락"
- analyst_targets: 뉴스 제목/요약에서 발견된 증권사 목표주가 리스트 (없으면 빈 배열 [])
  패턴 예: "XX증권 목표가 N만원 상향", "TP N원", "목표주가 N원→N원" 등
  각 항목: {"firm": "증권사명", "target_price": 숫자(원 단위 정수), "direction": "상향"|"하향"|"유지"|"신규", "rating": "BUY"|"HOLD"|"SELL"|""} """


def analyze_news_with_claude(stock_name: str, articles: list) -> dict:
    """뉴스 목록을 Claude로 분석: 요약 + 호재/악재 판단 + 방향성"""
    _empty = {
        "summary": "분석 불가", "sentiment": "중립", "key_points": [],
        "risk_factors": [], "catalysts": [], "trading_signal": "관망",
        "news_impact_score": 0, "price_direction": "중립",
    }
    if not articles:
        return _empty

    lines = []
    for a in articles[:15]:
        line = f"- [{a['date']}] {a['title']} ({a['source']})"
        if a.get("description"):
            line += f"\n  요약: {a['description']}"
        lines.append(line)
    news_text = "\n".join(lines)

    try:
        message = _anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=[{"type": "text", "text": _NEWS_SYSTEM_PROMPT,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content":
                       f"'{stock_name}' 관련 최근 뉴스 제목 목록입니다:\n\n{news_text}"}],
        )
        content = message.content[0].text
        content = re.sub(r'```(?:json)?\s*', '', content).strip()
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"  Claude 분석 실패: {e}")

    return {**_empty, "summary": "분석 실패"}


BATCH_SIZE = 5

_ANALYSIS_EMPTY: dict = {
    "summary": "분석 불가", "sentiment": "중립", "key_points": [],
    "risk_factors": [], "catalysts": [], "trading_signal": "관망",
    "news_impact_score": 0, "price_direction": "중립",
}

_BATCH_SYSTEM_PROMPT = """당신은 한국 주식 시장 전문 애널리스트입니다.
여러 종목의 뉴스를 분석해 각 종목별로 다음 필드를 포함한 JSON 객체를 마크다운 없이 순수 JSON만 출력하세요.
종목명을 키로 하며, 각 값에는 아래 필드를 포함하세요:
- summary: 2~3줄 요약
- sentiment: "호재" | "중립" | "악재"
- key_points: 핵심 포인트 2~3개 리스트
- risk_factors: 리스크 요인 1~3개 리스트
- catalysts: 주가 상승 촉매 1~3개 리스트
- trading_signal: "매수관심" | "관망" | "주의"
- news_impact_score: 0~100 숫자
- price_direction: "상승" | "중립" | "하락"
- analyst_targets: 뉴스 제목/요약에서 발견된 증권사 목표주가 리스트 (없으면 빈 배열 [])
  패턴 예: "XX증권 목표가 N만원 상향", "TP N원", "목표주가 N원→N원" 등
  각 항목: {"firm": "증권사명", "target_price": 숫자(원 단위 정수), "direction": "상향"|"하향"|"유지"|"신규", "rating": "BUY"|"HOLD"|"SELL"|""} """


def _normalize_key(s: str) -> str:
    return s.strip().replace(" ", "").lower()


def analyze_news_batch(stock_articles: list[tuple[str, list]]) -> dict[str, dict]:
    """여러 종목 뉴스를 단일 Claude 호출로 일괄 분석.

    Args:
        stock_articles: [(stock_name, articles), ...] (최대 BATCH_SIZE개)
    Returns:
        {stock_name: analysis_dict}
    """
    if not stock_articles:
        return {}

    sections = []
    for stock_name, articles in stock_articles:
        item_lines = []
        for a in articles[:10]:
            line = f"- [{a['date']}] {a['title']} ({a['source']})"
            if a.get("description"):
                line += f"\n  요약: {a['description']}"
            item_lines.append(line)
        body = "\n".join(item_lines) if item_lines else "- 뉴스 없음"
        sections.append(f"[{stock_name}]\n{body}")

    user_content = "아래 각 종목의 최근 뉴스를 분석해주세요.\n\n" + "\n\n".join(sections)

    try:
        message = _anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            system=[{"type": "text", "text": _BATCH_SYSTEM_PROMPT,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_content}],
        )
        content = message.content[0].text
        content = re.sub(r'```(?:json)?\s*', '', content).strip()
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            if isinstance(parsed, dict):
                normalized = {_normalize_key(k): v for k, v in parsed.items()}
                return {
                    name: normalized.get(_normalize_key(name), {**_ANALYSIS_EMPTY})
                    for name, _ in stock_articles
                }
    except Exception as e:
        print(f"  Claude 배치 분석 실패: {e}")

    return {name: {**_ANALYSIS_EMPTY, "summary": "분석 실패"} for name, _ in stock_articles}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Supabase 저장
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def save_analyst_targets_to_supabase(
    stock_code: str,
    targets: list[dict],
    current_price: int | None,
) -> None:
    """analyst_targets 테이블에 증권사 목표주가 upsert."""
    if not targets or not SUPABASE_URL or not SUPABASE_KEY:
        return

    today = datetime.now().strftime("%Y-%m-%d")
    rows = []
    for t in targets:
        try:
            tp = int(t.get("target_price") or 0)
        except (TypeError, ValueError):
            continue
        if tp <= 0:
            continue
        upside = None
        if current_price and current_price > 0:
            upside = round((tp - current_price) / current_price * 100, 2)
        rows.append({
            "stock_code":    stock_code,
            "firm_name":     str(t.get("firm") or "")[:50],
            "target_price":  tp,
            "current_price": current_price,
            "upside_pct":    upside,
            "direction":     str(t.get("direction") or "유지")[:10],
            "rating":        str(t.get("rating") or "")[:10],
            "report_date":   today,
        })

    if not rows:
        return

    url = f"{SUPABASE_URL}/rest/v1/analyst_targets?on_conflict=stock_code,firm_name,report_date"
    body = json.dumps(rows).encode("utf-8")
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    try:
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        urllib.request.urlopen(req)
        print(f"  → 목표가 {len(rows)}건 저장")
    except Exception as e:
        print(f"  analyst_targets 저장 실패: {e}")


def save_news_to_supabase(stock_code: str, stock_name: str,
                          articles: list, analysis: dict,
                          investor_data: list) -> bool:
    """뉴스 분석 결과를 Supabase에 저장"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False

    row = {
        "stock_code": stock_code,
        "stock_name": stock_name,
        "collected_at": datetime.now().isoformat(),
        "articles": json.dumps(articles[:10], ensure_ascii=False),
        "analysis": json.dumps(analysis, ensure_ascii=False),
        "investor_data": json.dumps(investor_data[:10], ensure_ascii=False),
        "sentiment": analysis.get("sentiment", "중립"),
    }

    try:
        # stock_code UNIQUE constraint 기준 upsert → 종목당 항상 최신 1행만 유지
        url = f"{SUPABASE_URL}/rest/v1/stock_news?on_conflict=stock_code"
        body = json.dumps(row).encode("utf-8")
        headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        print(f"  Supabase 저장 실패: {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WATCH_STOCKS = ALL_STOCKS


def collect_stock_news(stock_name: str, stock_code: str):
    """단일 종목 뉴스 + 수급 수집"""
    print(f"\n[{stock_name}] ({stock_code})")

    # 뉴스 수집
    print("  뉴스 수집 중...")
    articles = fetch_naver_news(stock_code, max_pages=2)
    print(f"  → {len(articles)}개 기사")

    # 수급 데이터
    print("  수급 데이터 수집 중...")
    investor = fetch_investor_trading(stock_code, days=10)
    if investor:
        foreign_sum = sum(d["foreign_net"] for d in investor[:5])
        inst_sum = sum(d["institution_net"] for d in investor[:5])
        print(f"  → 외국인 5일 순매수: {foreign_sum:+,}주 | 기관 5일 순매수: {inst_sum:+,}주")
    else:
        print("  → 수급 데이터 없음")

    # Claude 분석
    if articles:
        print("  Claude 분석 중...")
        analysis = analyze_news_with_claude(stock_name, articles)
        print(f"  → 감성: {analysis.get('sentiment', '?')}")
        print(f"  → 요약: {analysis.get('summary', '-')[:80]}")
    else:
        analysis = {"summary": "뉴스 없음", "sentiment": "중립", "key_points": []}

    # 저장
    sb_ok = save_news_to_supabase(stock_code, stock_name, articles, analysis, investor)
    print(f"  Supabase: {'OK' if sb_ok else 'SKIP'}")
    targets = analysis.get("analyst_targets") or []
    if targets:
        save_analyst_targets_to_supabase(stock_code, targets, current_price=None)

    return {
        "stock_name": stock_name,
        "stock_code": stock_code,
        "articles": articles,
        "analysis": analysis,
        "investor_data": investor,
    }


def collect_all():
    """전체 관심 종목 수집"""
    print("=" * 50)
    print(f"  뉴스/수급 수집 시작")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    results = []
    for name, code in WATCH_STOCKS.items():
        result = collect_stock_news(name, code)
        results.append(result)
        time.sleep(1)

    print(f"\n수집 완료: {len(results)}개 종목")
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="뉴스/수급 수집기")
    parser.add_argument("stock", nargs="?", help="종목명 (예: 삼성전자)")
    args = parser.parse_args()

    if args.stock:
        code = WATCH_STOCKS.get(args.stock)
        if code:
            collect_stock_news(args.stock, code)
        else:
            print(f"'{args.stock}'를 WATCH_STOCKS에서 찾을 수 없습니다.")
            print(f"등록된 종목: {', '.join(WATCH_STOCKS.keys())}")
    else:
        collect_all()
