"""
theme_scanner.py — RSS 뉴스 + YouTube 전문가 분석 하이브리드 테마 추출

Pipeline:
1. RSS 헤드라인 수집 (네이버/연합/한경/매경)
2. youtube_insights 최근 48h 데이터 로드 (key_sectors, key_stocks, summary, signals)
3. Claude에 labeled sections로 동시 전달 → 테마 추출
4. related_stocks를 ticker_aliases와 매칭하여 검증·필터
5. source_types(news/youtube), confidence_score 산정 후 Supabase 저장

RSS 실패 시 YouTube 단독 fallback (source_types=["youtube"] 만 포함).
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET
from pathlib import Path
from dotenv import load_dotenv
import anthropic

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

SB_HEADERS = {
    "apikey": SUPABASE_KEY or "",
    "Authorization": f"Bearer {SUPABASE_KEY or ''}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

RSS_SOURCES = [
    ("네이버경제", "https://news.naver.com/rss/section/101.xml"),
    ("연합뉴스", "https://www.yna.co.kr/rss/economy.xml"),
    ("한국경제", "https://www.hankyung.com/feed/all-news"),
    ("매일경제", "https://www.mk.co.kr/rss/30000001/"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

YT_LOOKBACK_HOURS = 48
MAX_THEMES = 7


# ─────────────────────────────────────────────────────────────
# RSS 수집
# ─────────────────────────────────────────────────────────────

def fetch_rss_headlines(name: str, url: str, max_items: int = 25) -> list[str]:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml = resp.read()
        root = ET.fromstring(xml)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        headlines = []
        for item in root.findall(".//item"):
            title = item.findtext("title", "").strip()
            if title:
                headlines.append(title)
        if not headlines:
            for entry in root.findall(".//atom:entry", ns):
                title = entry.findtext("atom:title", "", ns).strip()
                if title:
                    headlines.append(title)

        headlines = headlines[:max_items]
        print(f"  [{name}] {len(headlines)}개 헤드라인")
        return headlines
    except Exception as e:
        print(f"  [{name}] 수집 실패: {e}", file=sys.stderr)
        return []


def collect_rss_headlines() -> list[str]:
    all_headlines: list[str] = []
    seen: set[str] = set()
    for name, url in RSS_SOURCES:
        for h in fetch_rss_headlines(name, url):
            if h not in seen:
                seen.add(h)
                all_headlines.append(h)
    return all_headlines


# ─────────────────────────────────────────────────────────────
# YouTube 인사이트 수집
# ─────────────────────────────────────────────────────────────

def fetch_youtube_insights() -> list[dict]:
    """youtube_insights 테이블에서 최근 48시간 데이터 로드"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=YT_LOOKBACK_HOURS)).isoformat()
        params = (
            "select=title,channel,summary,market_sentiment,key_stocks,key_sectors,investment_signals,urgency,trading_type,upload_date,processed_at"
            f"&processed_at=gte.{cutoff}"
            "&order=processed_at.desc&limit=80"
        )
        url = f"{SUPABASE_URL}/rest/v1/youtube_insights?{params}"
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        print(f"  [YouTube] {len(data)}개 인사이트 로드")
        return data
    except Exception as e:
        print(f"  [YouTube 로드 실패] {e}", file=sys.stderr)
        return []


# ─────────────────────────────────────────────────────────────
# ticker_aliases 룩업 (related_stocks 검증)
# ─────────────────────────────────────────────────────────────

def load_ticker_alias_map() -> dict[str, str]:
    """한글 종목명/별칭 → 정식 stock_name 매핑"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {}
    try:
        url = f"{SUPABASE_URL}/rest/v1/ticker_aliases?select=stock_name,aliases"
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        mapping: dict[str, str] = {}
        for row in rows:
            stock_name = row.get("stock_name", "")
            if stock_name:
                mapping[stock_name] = stock_name
            for alias in (row.get("aliases") or []):
                if alias:
                    mapping[alias] = stock_name
        print(f"  [ticker_aliases] {len(mapping)}개 매핑 로드")
        return mapping
    except Exception as e:
        print(f"  [ticker_aliases 로드 실패] {e}", file=sys.stderr)
        return {}


def filter_known_stocks(stocks: list[str], alias_map: dict[str, str]) -> list[str]:
    """ticker_aliases에 존재하는 종목만 정식명으로 변환해서 반환"""
    if not alias_map:
        return stocks  # alias map 없으면 검증 스킵
    seen: set[str] = set()
    result: list[str] = []
    for s in stocks:
        s_clean = (s or "").strip()
        canonical = alias_map.get(s_clean)
        if canonical and canonical not in seen:
            seen.add(canonical)
            result.append(canonical)
    return result


# ─────────────────────────────────────────────────────────────
# Claude 프롬프트 생성
# ─────────────────────────────────────────────────────────────

def _format_youtube_section(yt_items: list[dict]) -> str:
    """YouTube 인사이트를 Claude가 읽기 좋은 형태로 직렬화"""
    lines: list[str] = []
    for item in yt_items[:30]:
        title = (item.get("title") or "").strip()
        channel = (item.get("channel") or "").strip()
        summary = (item.get("summary") or "").strip()[:120]
        sentiment = item.get("market_sentiment") or "중립"
        sectors = item.get("key_sectors") or []
        stocks = item.get("key_stocks") or []
        urgency = item.get("urgency") or ""
        signals = item.get("investment_signals")

        if isinstance(sectors, str):
            try: sectors = json.loads(sectors)
            except: sectors = []
        if isinstance(stocks, str):
            try: stocks = json.loads(stocks)
            except: stocks = []
        if isinstance(signals, str):
            try: signals = json.loads(signals)
            except: signals = None

        sig_text = ""
        if isinstance(signals, list) and signals:
            first = signals[0]
            sig_text = first if isinstance(first, str) else (first.get("signal") or first.get("action") or "")
        elif isinstance(signals, dict):
            sig_text = signals.get("signal") or signals.get("action") or ""

        meta = f"[{sentiment}]"
        if urgency:
            meta += f"[{urgency}]"

        line = f"- {meta} ({channel}) {title}"
        if sectors:
            line += f" | 섹터: {', '.join(sectors[:3])}"
        if stocks:
            line += f" | 종목: {', '.join(stocks[:5])}"
        if summary:
            line += f"\n   요약: {summary}"
        if sig_text:
            line += f"\n   신호: {str(sig_text)[:120]}"
        lines.append(line)
    return "\n".join(lines)


def _build_prompt(headlines: list[str], yt_items: list[dict], today_str: str) -> str:
    sections: list[str] = []

    if headlines:
        sections.append("### NEWS_HEADLINES")
        sections.append("(공식 경제 뉴스 매체 헤드라인)")
        sections.append("\n".join(f"- {h}" for h in headlines[:80]))

    if yt_items:
        sections.append("\n### YOUTUBE_INSIGHTS")
        sections.append("(최근 48시간 유튜브 전문가 분석 — sentiment/섹터/종목/신호 사전 추출됨)")
        sections.append(_format_youtube_section(yt_items))

    sources_present = []
    if headlines: sources_present.append("뉴스")
    if yt_items:  sources_present.append("유튜브")
    coverage_note = " + ".join(sources_present) if sources_present else "(없음)"

    instructions = f"""오늘 날짜: {today_str}
사용 가능한 데이터 소스: {coverage_note}

위 두 출처(NEWS_HEADLINES, YOUTUBE_INSIGHTS)를 종합해 오늘 한국 주식 시장에서 주목할 투자 테마를 최대 {MAX_THEMES}개 추출하세요.

**중요 규칙**:
1. **출처 인용 필수**: 각 테마는 반드시 NEWS_HEADLINES 또는 YOUTUBE_INSIGHTS에서 직접 근거가 되는 문장을 인용해야 합니다. 인용 없는 추정 금지.
2. **양쪽 모두 언급된 테마 우선**: 뉴스와 유튜브 양쪽에서 모두 언급된 테마는 confidence_score를 높게 부여하고 우선 노출합니다.
3. **한국 상장사만**: related_stocks는 한국 상장사 정식 종목명만 사용. 추측 금지. 확실하지 않으면 빈 배열.
4. **반복 테마 회피**: "반도체", "2차전지"처럼 항상 있는 테마보다 오늘 새롭게 부각된 이슈 우선.

각 테마를 다음 JSON 형식으로 출력:
[
  {{
    "theme_name": "테마명 (짧게, 10자 이내 권장)",
    "keywords": ["키워드1", "키워드2"],
    "related_stocks": ["삼성전자", "SK하이닉스"],
    "reason": "왜 오늘 주목받는지 1~2줄",
    "urgency": "오늘|이번주|중장기",
    "source_types": ["news", "youtube"],
    "confidence_score": 0~100 정수,
    "source_headlines": ["근거가 된 뉴스 헤드라인 또는 유튜브 인용문 1~3개"],
    "source_youtube": ["근거가 된 유튜브 채널명 1~3개"]
  }}
]

confidence_score 기준:
- 90~100: 뉴스+유튜브 둘 다, 3개 이상 인용 가능
- 70~89: 한쪽 출처에 강하게 등장 (3개 이상 인용)
- 50~69: 한쪽 출처에 1~2번 등장
- 50 미만: 약한 근거 (제외 권장)

JSON 배열만 출력하세요. 다른 텍스트 금지."""

    return "\n".join(sections) + "\n\n" + instructions


def extract_themes_with_claude(
    headlines: list[str],
    yt_items: list[dict],
    today_str: str,
) -> list[dict]:
    if not headlines and not yt_items:
        return []

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt = _build_prompt(headlines, yt_items, today_str)

    _SYSTEM = "당신은 한국 주식 시장 테마 분석 전문가입니다. 뉴스와 유튜브 데이터를 분석해 JSON 배열만 출력하세요."
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{"type": "text", "text": _SYSTEM,
                 "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        content = message.content[0].text
        start = content.find("[")
        end = content.rfind("]")
        if start == -1 or end == -1 or end <= start:
            return []
        themes = json.loads(content[start : end + 1])
        return themes if isinstance(themes, list) else []
    except Exception as e:
        print(f"  [WARN] 테마 파싱 실패: {e}", file=sys.stderr)
    return []


# ─────────────────────────────────────────────────────────────
# 후처리 (validation + dedup)
# ─────────────────────────────────────────────────────────────

VALID_URGENCY = {"오늘", "이번주", "중장기"}
VALID_SOURCE_TYPES = {"news", "youtube"}


def validate_and_clean_themes(
    themes: list[dict],
    alias_map: dict[str, str],
    available_sources: set[str],
) -> list[dict]:
    cleaned: list[dict] = []
    seen_names: set[str] = set()

    for t in themes:
        name = (t.get("theme_name") or "").strip()
        if not name or name in seen_names:
            continue
        seen_names.add(name)

        related = t.get("related_stocks") or []
        if isinstance(related, str):
            try: related = json.loads(related)
            except: related = []
        validated_stocks = filter_known_stocks([str(s) for s in related], alias_map)

        # source_types 검증: 실제로 데이터가 있던 소스만 인정
        src_types_raw = t.get("source_types") or []
        if isinstance(src_types_raw, str):
            try: src_types_raw = json.loads(src_types_raw)
            except: src_types_raw = []
        src_types = [s for s in src_types_raw if s in VALID_SOURCE_TYPES and s in available_sources]
        if not src_types:
            # Claude가 source_types를 안 채웠지만 데이터 있을 수 있음 → 기본값
            src_types = list(available_sources)

        urgency = t.get("urgency") if t.get("urgency") in VALID_URGENCY else "이번주"

        try:
            confidence = float(t.get("confidence_score", 50))
            confidence = max(0.0, min(100.0, confidence))
        except (TypeError, ValueError):
            confidence = 50.0

        # 양쪽 출처 모두 있으면 confidence 부스트
        if len(src_types) == 2:
            confidence = min(100.0, confidence + 10)

        keywords = t.get("keywords") or []
        if isinstance(keywords, str):
            try: keywords = json.loads(keywords)
            except: keywords = []

        source_headlines = t.get("source_headlines") or []
        if isinstance(source_headlines, str):
            try: source_headlines = json.loads(source_headlines)
            except: source_headlines = []

        source_youtube = t.get("source_youtube") or []
        if isinstance(source_youtube, str):
            try: source_youtube = json.loads(source_youtube)
            except: source_youtube = []

        cleaned.append({
            "theme_name": name,
            "keywords": [str(k) for k in keywords][:6],
            "related_stocks": validated_stocks[:8],
            "reason": (t.get("reason") or "")[:500],
            "urgency": urgency,
            "source_types": src_types,
            "confidence_score": round(confidence, 2),
            "source_headlines": [str(s)[:200] for s in source_headlines][:5],
            "source_youtube": [str(s)[:80] for s in source_youtube][:5],
        })

    # confidence 기준 정렬
    cleaned.sort(key=lambda x: x["confidence_score"], reverse=True)
    return cleaned[:MAX_THEMES]


# ─────────────────────────────────────────────────────────────
# Supabase 저장
# ─────────────────────────────────────────────────────────────

def save_themes_to_supabase(themes: list[dict], scanned_at: str) -> bool:
    if not SUPABASE_URL or not SUPABASE_KEY or not themes:
        return False
    rows = [{
        "scanned_at": scanned_at,
        "theme_name": t["theme_name"],
        "keywords": t["keywords"],
        "related_stocks": t["related_stocks"],
        "reason": t["reason"],
        "urgency": t["urgency"],
        "source_headlines": t["source_headlines"],
        "source_types": t["source_types"],
        "confidence_score": t["confidence_score"],
        "source_youtube": t["source_youtube"],
    } for t in themes]
    try:
        url = f"{SUPABASE_URL}/rest/v1/theme_signals"
        body = json.dumps(rows).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=SB_HEADERS, method="POST")
        urllib.request.urlopen(req)
        print(f"  Supabase 저장 완료: {len(rows)}개 테마")
        return True
    except Exception as e:
        print(f"  Supabase 저장 실패: {e}", file=sys.stderr)
        return False


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def run():
    print("\n=== 하이브리드 테마 스캐너 시작 (뉴스 + YouTube) ===")
    scanned_at = datetime.now(timezone.utc).isoformat()
    today_str = datetime.now(timezone.utc).strftime("%Y년 %m월 %d일")

    print("\n[1] RSS 헤드라인 수집...")
    headlines = collect_rss_headlines()
    print(f"  → 총 {len(headlines)}개 헤드라인")

    print("\n[2] YouTube 인사이트 로드 (최근 48h)...")
    yt_items = fetch_youtube_insights()
    print(f"  → 총 {len(yt_items)}개 인사이트")

    if not headlines and not yt_items:
        print("\n뉴스/유튜브 양쪽 모두 데이터 없음, 종료")
        return

    available_sources: set[str] = set()
    if headlines: available_sources.add("news")
    if yt_items:  available_sources.add("youtube")
    print(f"\n[3] 사용 가능 소스: {sorted(available_sources)}")

    print("\n[4] ticker_aliases 로드...")
    alias_map = load_ticker_alias_map()

    print("\n[5] Claude 하이브리드 테마 추출...")
    raw_themes = extract_themes_with_claude(headlines, yt_items, today_str)
    print(f"  → Claude 응답 {len(raw_themes)}개 테마")

    print("\n[6] 검증·정제 (ticker_aliases 필터링)...")
    themes = validate_and_clean_themes(raw_themes, alias_map, available_sources)
    print(f"  → 최종 {len(themes)}개 테마")

    for i, t in enumerate(themes, 1):
        srcs = "+".join(t["source_types"]) if t["source_types"] else "?"
        ug = t["urgency"]
        stocks = ", ".join(t["related_stocks"][:3]) if t["related_stocks"] else "(종목매핑실패)"
        print(f"  {i}. [{srcs}][{ug}][conf={t['confidence_score']:.0f}] "
              f"{t['theme_name']} — {stocks}")

    print("\n[7] Supabase 저장...")
    save_themes_to_supabase(themes, scanned_at)
    print("=== 하이브리드 테마 스캐너 완료 ===\n")


if __name__ == "__main__":
    run()
