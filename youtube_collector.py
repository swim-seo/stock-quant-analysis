import os
import json
import re
import schedule
import time
from datetime import datetime
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp
import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# Supabase
try:
    from supabase import create_client
    _supabase_url = os.environ.get("SUPABASE_URL")
    _supabase_key = os.environ.get("SUPABASE_KEY")
    supabase = create_client(_supabase_url, _supabase_key) if _supabase_url and _supabase_key else None
except Exception:
    supabase = None

# ChromaDB
try:
    import chromadb
    from sentence_transformers import SentenceTransformer
    _chroma_client = chromadb.PersistentClient(path="./chroma_db")
    _collection = _chroma_client.get_or_create_collection("youtube_insights")
    _embedder = SentenceTransformer("snunlp/KR-SBERT-V40K-klueNLI-augSTS")
    CHROMA_AVAILABLE = True
except Exception as e:
    print(f"ChromaDB 초기화 실패: {e}")
    CHROMA_AVAILABLE = False

# 채널 목록
CHANNELS = {
    "한국경제TV": "@hkwowtv",
    "매일경제TV": "@MKeconomy_TV",
}

# 저장 경로
DATA_DIR = Path("youtube_data")
INSIGHTS_DIR = Path("youtube_insights")
DATA_DIR.mkdir(exist_ok=True)
INSIGHTS_DIR.mkdir(exist_ok=True)

STOCK_KEYWORDS = [
    "주식", "코스피", "코스닥", "증시", "주가", "투자", "매수", "매도",
    "반도체", "배당", "ETF", "펀드", "금리", "환율", "경제", "시장",
    "상승", "하락", "급등", "급락", "포트폴리오", "종목", "실적",
    "증권", "자산", "채권", "선물", "옵션", "리밸런싱", "수익률",
    "stock", "KOSPI", "market", "invest", "ETF", "semiconductor",
    "bull", "bear", "rally", "rebound", "FOMC", "rate",
]

SHORT_TERM_KEYWORDS = ["급등", "급락", "단기", "모멘텀", "거래량 급증", "단타", "스캘핑", "오늘", "내일", "즉시"]


def is_stock_related(title: str) -> bool:
    title_lower = title.lower()
    return any(kw.lower() in title_lower for kw in STOCK_KEYWORDS)


def get_channel_videos(channel_id: str, max_videos: int = 50, stock_only: bool = True) -> list:
    if channel_id.startswith("@"):
        url = f"https://www.youtube.com/{channel_id}/videos"
    else:
        url = f"https://www.youtube.com/channel/{channel_id}/videos"
    ydl_opts = {"quiet": True, "extract_flat": True, "playlist_items": f"1:{max_videos}"}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        videos = []
        for entry in info.get("entries", []):
            title = entry.get("title", "")
            if stock_only and not is_stock_related(title):
                continue
            videos.append({
                "id": entry.get("id"),
                "title": title,
                "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
                "upload_date": entry.get("upload_date"),
            })
        return videos


def get_transcript(video_id: str) -> str:
    """
    영상 스크립트 가져오기 (타임스탬프 + 텍스트)
    자막 없는 영상은 None 반환
    """
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        try:
            transcript = transcript_list.find_transcript(["ko", "ko-KR"])
        except Exception:
            transcript = list(transcript_list)[0]
        fetched = transcript.fetch()
        lines = []
        for t in fetched:
            seconds = int(t.start)
            timestamp = f"[{seconds // 60:02d}:{seconds % 60:02d}]"
            lines.append(f"{timestamp} {t.text}")
        return "\n".join(lines)
    except Exception:
        return None


def is_already_processed(video_id: str) -> bool:
    insight_file = INSIGHTS_DIR / f"{video_id}.json"
    return insight_file.exists()


def analyze_with_claude(title: str, transcript: str, channel: str) -> dict:
    """Claude API로 투자 인사이트 + 단타/스윙/장기 구분 추출"""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    prompt = f"""당신은 주식/투자 전문 분석가입니다.
아래는 '{channel}' 채널의 '{title}' 영상 스크립트입니다.

스크립트:
{transcript[:8000]}

다음 항목을 JSON 형식으로 추출해주세요:

1. summary: 영상 핵심 내용 3줄 요약
2. market_sentiment: 시장 전망 ("긍정"/"중립"/"부정" 중 하나)
3. key_stocks: 언급된 주요 종목 리스트 (예: ["삼성전자", "SK하이닉스"])
4. key_sectors: 언급된 주요 섹터/업종 리스트 (예: ["반도체", "바이오"])
5. investment_signals: 매수/매도/관망 관련 핵심 언급 내용 리스트
6. risk_factors: 언급된 리스크 요인 리스트
7. keywords: 핵심 키워드 5개 리스트
8. trading_type: 투자 성격 ("단타"/"스윙"/"장기" 중 하나)
   - 단타: 급등/급락/단기모멘텀/거래량 급증/오늘내일 매매 언급 시
   - 스윙: 1~4주 단위 추세/기술적 분석 중심 언급 시
   - 장기: 펀더멘털/실적/배당/장기보유 중심 언급 시
9. urgency: 투자 시급성 ("오늘"/"이번주"/"장기" 중 하나)
   - 오늘: 즉각적인 매매 기회/오늘 중요한 이벤트 언급 시
   - 이번주: 이번주 내 주목할 이슈/종목 언급 시
   - 장기: 중장기 관점의 종목/섹터 언급 시

JSON만 출력하세요."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        content = message.content[0].text
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass

    return {"summary": "파싱 실패", "market_sentiment": "중립", "trading_type": "스윙", "urgency": "이번주"}


def save_to_supabase(video_id: str, title: str, channel: str, url: str,
                     upload_date: str, insight: dict) -> bool:
    """Supabase youtube_insights 테이블에 upsert"""
    if not supabase:
        return False
    try:
        row = {
            "video_id": video_id,
            "title": title,
            "channel": channel,
            "url": url,
            "upload_date": upload_date,
            "processed_at": datetime.now().isoformat(),
            "summary": insight.get("summary", ""),
            "market_sentiment": insight.get("market_sentiment", "중립"),
            "key_stocks": insight.get("key_stocks", []),
            "key_sectors": insight.get("key_sectors", []),
            "keywords": insight.get("keywords", []),
            "investment_signals": json.dumps(insight.get("investment_signals", []), ensure_ascii=False),
            "risk_factors": json.dumps(insight.get("risk_factors", []), ensure_ascii=False),
            "trading_type": insight.get("trading_type", "스윙"),
            "urgency": insight.get("urgency", "이번주"),
        }
        supabase.table("youtube_insights").upsert(row, on_conflict="video_id").execute()
        return True
    except Exception as e:
        print(f"  Supabase 저장 실패: {e}")
        return False


def save_to_chroma(video_id: str, title: str, channel: str, url: str,
                   upload_date: str, insight: dict) -> bool:
    """ChromaDB에 벡터 저장"""
    if not CHROMA_AVAILABLE:
        return False
    try:
        # 검색용 텍스트: summary + investment_signals + keywords 결합
        signals = insight.get("investment_signals", [])
        keywords = insight.get("keywords", [])
        text = " ".join([
            insight.get("summary", ""),
            " ".join(signals if isinstance(signals, list) else [signals]),
            " ".join(keywords if isinstance(keywords, list) else [keywords]),
        ])

        embedding = _embedder.encode(text).tolist()

        key_stocks = insight.get("key_stocks", [])
        key_sectors = insight.get("key_sectors", [])

        _collection.upsert(
            ids=[video_id],
            embeddings=[embedding],
            documents=[text],
            metadatas=[{
                "video_id": video_id,
                "title": title,
                "channel": channel,
                "url": url,
                "upload_date": upload_date or "",
                "market_sentiment": insight.get("market_sentiment", "중립"),
                "trading_type": insight.get("trading_type", "스윙"),
                "urgency": insight.get("urgency", "이번주"),
                "key_stocks": json.dumps(key_stocks, ensure_ascii=False),
                "key_sectors": json.dumps(key_sectors, ensure_ascii=False),
            }],
        )
        return True
    except Exception as e:
        print(f"  ChromaDB 저장 실패: {e}")
        return False


def _meta_to_item(meta: dict, summary: str, rrf_score: float = 0.0) -> dict:
    """ChromaDB 메타데이터 → 통일된 반환 형식 변환"""
    return {
        "video_id": meta.get("video_id", ""),
        "title": meta.get("title", ""),
        "channel": meta.get("channel", ""),
        "url": meta.get("url", ""),
        "upload_date": meta.get("upload_date", ""),
        "summary": summary[:300],
        "market_sentiment": meta.get("market_sentiment", "중립"),
        "key_stocks": json.loads(meta.get("key_stocks", "[]")),
        "key_sectors": json.loads(meta.get("key_sectors", "[]")),
        "trading_type": meta.get("trading_type", "스윙"),
        "urgency": meta.get("urgency", "이번주"),
        "rrf_score": round(rrf_score, 4),
    }


def _json_to_item(item: dict, rrf_score: float = 0.0) -> dict:
    """JSON 파일 데이터 → 통일된 반환 형식 변환"""
    insight = item.get("insight", {})
    return {
        "video_id": item.get("video_id", ""),
        "title": item.get("title", ""),
        "channel": item.get("channel", ""),
        "url": item.get("url", ""),
        "upload_date": item.get("upload_date", ""),
        "summary": insight.get("summary", "")[:300],
        "market_sentiment": insight.get("market_sentiment", "중립"),
        "key_stocks": insight.get("key_stocks", []),
        "key_sectors": insight.get("key_sectors", []),
        "trading_type": insight.get("trading_type", "스윙"),
        "urgency": insight.get("urgency", "이번주"),
        "rrf_score": round(rrf_score, 4),
    }


def keyword_search(stock_name: str, n_results: int = 10) -> list:
    """
    키워드 기반 검색
    - Supabase 있으면 key_stocks 배열 + title/summary 텍스트 검색
    - 없으면 JSON 파일에서 키워드 매칭
    """
    # Supabase 검색
    if supabase:
        try:
            results = []
            seen = set()

            # key_stocks 배열에 포함된 것 검색
            resp1 = (supabase.table("youtube_insights")
                     .select("*")
                     .contains("key_stocks", [stock_name])
                     .limit(n_results)
                     .execute())
            for row in resp1.data:
                if row["video_id"] not in seen:
                    seen.add(row["video_id"])
                    results.append(row)

            # title, summary 텍스트 검색
            resp2 = (supabase.table("youtube_insights")
                     .select("*")
                     .or_(f"title.ilike.%{stock_name}%,summary.ilike.%{stock_name}%")
                     .limit(n_results)
                     .execute())
            for row in resp2.data:
                if row["video_id"] not in seen:
                    seen.add(row["video_id"])
                    results.append(row)

            # Supabase row → 통일 형식
            items = []
            for row in results:
                items.append({
                    "video_id": row.get("video_id", ""),
                    "title": row.get("title", ""),
                    "channel": row.get("channel", ""),
                    "url": row.get("url", ""),
                    "upload_date": row.get("upload_date", ""),
                    "summary": row.get("summary", "")[:300],
                    "market_sentiment": row.get("market_sentiment", "중립"),
                    "key_stocks": row.get("key_stocks", []),
                    "key_sectors": row.get("key_sectors", []),
                    "trading_type": row.get("trading_type", "스윙"),
                    "urgency": row.get("urgency", "이번주"),
                    "rrf_score": 0.0,
                })
            return items
        except Exception as e:
            print(f"  Supabase 키워드 검색 실패: {e}")

    # JSON 파일 폴백
    insights = get_latest_insights(100)
    results = []
    for item in insights:
        insight = item.get("insight", {})
        stocks = insight.get("key_stocks", [])
        title = item.get("title", "")
        summary = insight.get("summary", "")
        if (any(stock_name in s for s in stocks)
                or stock_name in title
                or stock_name in summary):
            results.append(_json_to_item(item))
    return results[:n_results]


def reciprocal_rank_fusion(vector_results: list, keyword_results: list, k: int = 60) -> list:
    """
    RRF (Reciprocal Rank Fusion) 알고리즘으로 두 검색 결과 합산
    점수: 1 / (k + rank)  → 상위 랭크일수록 높은 점수
    """
    scores: dict[str, float] = {}
    data: dict[str, dict] = {}

    # 벡터 검색 결과 점수 계산
    for rank, item in enumerate(vector_results):
        vid = item.get("video_id", "")
        if not vid:
            continue
        scores[vid] = scores.get(vid, 0) + 1 / (k + rank + 1)
        data[vid] = item

    # 키워드 검색 결과 점수 계산
    for rank, item in enumerate(keyword_results):
        vid = item.get("video_id", "")
        if not vid:
            continue
        scores[vid] = scores.get(vid, 0) + 1 / (k + rank + 1)
        if vid not in data:
            data[vid] = item

    # 점수 기준 내림차순 정렬
    sorted_vids = sorted(scores.keys(), key=lambda v: scores[v], reverse=True)
    results = []
    for vid in sorted_vids:
        item = data[vid].copy()
        item["rrf_score"] = round(scores[vid], 4)
        results.append(item)

    return results


def search_insights_by_stock(stock_name: str, n_results: int = 5,
                              trading_type: str = None) -> list:
    """
    Hybrid RAG: 벡터 검색 + 키워드 검색 + RRF 합산

    Args:
        stock_name: 검색할 종목명 (예: "삼성전자")
        n_results: 반환할 결과 수
        trading_type: 필터링할 매매 유형 ("단타"/"스윙"/"장기", None이면 전체)
    """
    vector_results = []
    keyword_results = []

    # 1. ChromaDB 벡터 검색
    if CHROMA_AVAILABLE:
        try:
            embedding = _embedder.encode(stock_name).tolist()
            raw = _collection.query(
                query_embeddings=[embedding],
                n_results=min(n_results * 3, 20),
            )
            for i, doc in enumerate(raw["documents"][0]):
                meta = raw["metadatas"][0][i]
                vector_results.append(_meta_to_item(meta, doc))
        except Exception as e:
            print(f"  벡터 검색 실패: {e}")

    # 2. 키워드 검색
    keyword_results = keyword_search(stock_name, n_results=n_results * 3)

    # 3. 둘 다 없으면 JSON 폴백
    if not vector_results and not keyword_results:
        return keyword_search(stock_name, n_results)[:n_results]

    # 4. RRF 합산
    merged = reciprocal_rank_fusion(vector_results, keyword_results)

    # 5. trading_type 필터링
    if trading_type:
        merged = [r for r in merged if r.get("trading_type") == trading_type]

    return merged[:n_results]


def process_channel(channel_name: str, channel_id: str):
    """채널 최신 영상 수집 + 분석 + 저장"""
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] {channel_name} 채널 수집 중...")

    videos = get_channel_videos(channel_id, max_videos=50)
    if not videos:
        print(f"  주식 관련 영상 없음")
        return

    print(f"  주식 관련 영상 {len(videos)}개 발견")
    for video in videos[:5]:
        video_id = video["id"]
        title = video["title"]

        if is_already_processed(video_id):
            print(f"  이미 처리됨: {title[:30]}...")
            continue

        print(f"  처리 중: {title[:40]}...")

        transcript = get_transcript(video_id)
        if not transcript:
            print(f"  자막 없음, 스킵")
            continue

        transcript_file = DATA_DIR / f"{video_id}.txt"
        transcript_file.write_text(transcript, encoding="utf-8")

        if os.environ.get("ANTHROPIC_API_KEY"):
            insight = analyze_with_claude(title, transcript, channel_name)
        else:
            insight = {"summary": "API 키 없음", "market_sentiment": "중립",
                       "trading_type": "스윙", "urgency": "이번주"}

        # JSON 저장
        result = {
            "video_id": video_id,
            "title": title,
            "channel": channel_name,
            "url": video["url"],
            "upload_date": video.get("upload_date"),
            "processed_at": datetime.now().isoformat(),
            "transcript_length": len(transcript),
            "insight": insight,
        }
        insight_file = INSIGHTS_DIR / f"{video_id}.json"
        insight_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

        # Supabase 저장
        sb_ok = save_to_supabase(video_id, title, channel_name, video["url"],
                                  video.get("upload_date"), insight)

        # ChromaDB 저장
        ch_ok = save_to_chroma(video_id, title, channel_name, video["url"],
                                video.get("upload_date"), insight)

        print(f"  완료: {title[:40]}")
        print(f"  시장전망: {insight.get('market_sentiment')} | "
              f"매매유형: {insight.get('trading_type')} | "
              f"시급성: {insight.get('urgency')}")
        print(f"  Supabase: {'✅' if sb_ok else '❌'} | ChromaDB: {'✅' if ch_ok else '❌'}")


def get_latest_insights(n: int = 10) -> list:
    files = sorted(INSIGHTS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    return [json.loads(f.read_text(encoding="utf-8")) for f in files[:n]]


def get_market_sentiment_score() -> dict:
    insights = get_latest_insights(20)
    if not insights:
        return {"score": 0, "label": "중립", "count": 0, "details": {"긍정": 0, "중립": 0, "부정": 0}}

    sentiment_map = {"긍정": 1, "중립": 0, "부정": -1}
    scores = [sentiment_map.get(i.get("insight", {}).get("market_sentiment", "중립"), 0) for i in insights]

    avg = sum(scores) / len(scores)
    label = "긍정" if avg > 0.2 else "부정" if avg < -0.2 else "중립"

    return {
        "score": round(avg, 2),
        "label": label,
        "count": len(scores),
        "details": {"긍정": scores.count(1), "중립": scores.count(0), "부정": scores.count(-1)},
    }


def run_collection():
    print(f"\n{'='*50}")
    print(f"  유튜브 인사이트 수집 시작")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    for channel_name, channel_id in CHANNELS.items():
        try:
            process_channel(channel_name, channel_id)
        except Exception as e:
            print(f"  {channel_name} 오류: {e}")

    sentiment = get_market_sentiment_score()
    print(f"\n시장 심리 점수: {sentiment['score']} ({sentiment['label']})")
    print(f"분석 영상 수: {sentiment['count']}개")


def start_scheduler(interval_hours: int = 6):
    print(f"스케줄러 시작: {interval_hours}시간마다 수집")
    run_collection()
    schedule.every(interval_hours).hours.do(run_collection)
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "schedule":
        start_scheduler(interval_hours=6)
    elif len(sys.argv) > 1 and sys.argv[1] == "search":
        # 종목 검색 테스트: python youtube_collector.py search 삼성전자
        stock = sys.argv[2] if len(sys.argv) > 2 else "삼성전자"
        print(f"\n'{stock}' 관련 인사이트 검색:")
        results = search_insights_by_stock(stock)
        for r in results:
            print(f"\n제목: {r.get('title', '')[:50]}")
            print(f"채널: {r.get('channel')} | 시장전망: {r.get('market_sentiment')} | 매매유형: {r.get('trading_type')}")
            print(f"요약: {r.get('summary', '')[:100]}")
    else:
        run_collection()

        print("\n\n=== 최근 인사이트 요약 ===")
        for item in get_latest_insights(3):
            insight = item.get("insight", {})
            print(f"\n제목: {item['title'][:50]}")
            print(f"채널: {item['channel']} | 시장전망: {insight.get('market_sentiment')} | "
                  f"매매유형: {insight.get('trading_type')} | 시급성: {insight.get('urgency')}")
            print(f"요약: {insight.get('summary', '')[:100]}")
