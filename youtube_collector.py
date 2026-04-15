import os
import json
import re
import argparse
import schedule
import time
from datetime import datetime, timedelta
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

# 재생목록 기반 수집 설정
PLAYLISTS = {
    "마켓브리핑": {
        "channel": "한국경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PLh6kUo7pqm_4MJOOlfrrvk8jKhrBlInCT",
        "priority": 1,
        "trading_focus": "both",
        "collect_time": "morning",
    },
    "투자의눈": {
        "channel": "매일경제TV",
        "playlist_url": "https://www.youtube.com/watch?v=Y_202P7yEnQ&list=PL0dOq2-5pHmhvKVKN_1RKn6VqFCGobZO4",
        "priority": 1,
        "trading_focus": "both",
        "collect_time": "morning",
    },
    "성공투자오후증시": {
        "channel": "한국경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PLh6kUo7pqm_6kELAfnVp9Rt-musZazbG1",
        "priority": 1,
        "trading_focus": "swing",
        "collect_time": "afternoon",
    },
    "조선일의K1레이스": {
        "channel": "매일경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PL0dOq2-5pHmhdqoiAphTBj6C6PxneZMIR",
        "priority": 1,
        "trading_focus": "both",
        "collect_time": "morning",
    },
}

# 저장 경로
DATA_DIR = Path("youtube_data")
INSIGHTS_DIR = Path("youtube_insights")
DATA_DIR.mkdir(exist_ok=True)
INSIGHTS_DIR.mkdir(exist_ok=True)

MAX_VIDEOS_PER_PLAYLIST = 3


def get_playlist_videos(playlist_url: str, max_days: int = 2, max_videos: int = MAX_VIDEOS_PER_PLAYLIST) -> list:
    """재생목록에서 최근 N일 이내 영상만 가져오기"""
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "playlist_items": "1:30",  # 최근 30개까지 스캔
    }
    cutoff = datetime.now() - timedelta(days=max_days)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(playlist_url, download=False)
        videos = []
        for entry in info.get("entries", []):
            if not entry:
                continue
            upload_date = entry.get("upload_date")  # YYYYMMDD
            if upload_date:
                try:
                    dt = datetime.strptime(upload_date, "%Y%m%d")
                    if dt < cutoff:
                        continue
                except ValueError:
                    pass

            videos.append({
                "id": entry.get("id"),
                "title": entry.get("title", ""),
                "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
                "upload_date": upload_date,
            })
            if len(videos) >= max_videos:
                break
        return videos


REQUEST_DELAY = 10  # 요청 간 딜레이 (초) - IP 차단 방지


def get_transcript(video_id: str) -> str:
    """yt-dlp로 자막 다운로드 (IP 차단에 강함). 실패 시 youtube_transcript_api 폴백."""
    url = f"https://www.youtube.com/watch?v={video_id}"

    # 1차: yt-dlp로 자막 추출
    transcript = _get_transcript_ytdlp(url)
    if transcript:
        return transcript

    # 2차: youtube_transcript_api 폴백
    transcript = _get_transcript_api(video_id)
    if transcript:
        return transcript

    return None


def _get_transcript_ytdlp(url: str) -> str:
    """yt-dlp로 자막 추출 (자동생성 포함)"""
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        ydl_opts = {
            "quiet": True,
            "skip_download": True,
            "writeautomaticsub": True,  # 자동생성 자막
            "writesubtitles": True,     # 수동 자막
            "subtitleslangs": ["ko", "ko-KR"],
            "subtitlesformat": "json3",
            "outtmpl": os.path.join(tmpdir, "%(id)s"),
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # json3 자막 파일 찾기
            import glob
            sub_files = glob.glob(os.path.join(tmpdir, "*.json3"))
            if not sub_files:
                return None

            with open(sub_files[0], "r", encoding="utf-8") as f:
                data = json.load(f)

            lines = []
            for event in data.get("events", []):
                start_ms = event.get("tStartMs", 0)
                seconds = int(start_ms / 1000)
                timestamp = f"[{seconds // 60:02d}:{seconds % 60:02d}]"
                segs = event.get("segs", [])
                text = "".join(s.get("utf8", "") for s in segs).strip()
                if text and text != "\n":
                    lines.append(f"{timestamp} {text}")

            return "\n".join(lines) if lines else None
        except Exception as e:
            print(f"  [yt-dlp 자막] {type(e).__name__}: {str(e)[:80]}")
            return None


def _get_transcript_api(video_id: str) -> str:
    """youtube_transcript_api 폴백"""
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
    except Exception as e:
        print(f"  [API 자막] {type(e).__name__}: {str(e)[:80]}")
        return None


def is_already_processed(video_id: str) -> bool:
    insight_file = INSIGHTS_DIR / f"{video_id}.json"
    return insight_file.exists()


def analyze_with_claude(title: str, transcript: str, channel: str, trading_focus: str = "both") -> dict:
    """Claude API로 투자 인사이트 추출. trading_focus에 따라 분석 관점 조정."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    if trading_focus == "swing":
        focus_instruction = """분석 관점: 스윙 트레이딩 위주로 분석해주세요.
- 1~4주 단위 추세, 기술적 분석 포인트, 지지/저항선, 추세 전환 시그널에 집중
- 단타 시그널보다는 중기 관점의 매매 타이밍에 초점"""
    elif trading_focus == "short":
        focus_instruction = """분석 관점: 단타/데이트레이딩 위주로 분석해주세요.
- 당일/익일 매매 기회, 거래량 급증, 급등/급락 패턴에 집중
- 즉각적인 진입/청산 포인트에 초점"""
    else:
        focus_instruction = """분석 관점: 단타와 스윙 모두 포함해서 분석해주세요.
- 단기 매매 기회와 중기 추세 관점 모두 제시"""

    prompt = f"""당신은 주식/투자 전문 분석가입니다.
아래는 '{channel}' 채널의 '{title}' 영상 스크립트입니다.

{focus_instruction}

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
    """키워드 기반 검색"""
    if supabase:
        try:
            results = []
            seen = set()

            resp1 = (supabase.table("youtube_insights")
                     .select("*")
                     .contains("key_stocks", [stock_name])
                     .limit(n_results)
                     .execute())
            for row in resp1.data:
                if row["video_id"] not in seen:
                    seen.add(row["video_id"])
                    results.append(row)

            resp2 = (supabase.table("youtube_insights")
                     .select("*")
                     .or_(f"title.ilike.%{stock_name}%,summary.ilike.%{stock_name}%")
                     .limit(n_results)
                     .execute())
            for row in resp2.data:
                if row["video_id"] not in seen:
                    seen.add(row["video_id"])
                    results.append(row)

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
    """RRF 알고리즘으로 두 검색 결과 합산"""
    scores: dict[str, float] = {}
    data: dict[str, dict] = {}

    for rank, item in enumerate(vector_results):
        vid = item.get("video_id", "")
        if not vid:
            continue
        scores[vid] = scores.get(vid, 0) + 1 / (k + rank + 1)
        data[vid] = item

    for rank, item in enumerate(keyword_results):
        vid = item.get("video_id", "")
        if not vid:
            continue
        scores[vid] = scores.get(vid, 0) + 1 / (k + rank + 1)
        if vid not in data:
            data[vid] = item

    sorted_vids = sorted(scores.keys(), key=lambda v: scores[v], reverse=True)
    results = []
    for vid in sorted_vids:
        item = data[vid].copy()
        item["rrf_score"] = round(scores[vid], 4)
        results.append(item)

    return results


def search_insights_by_stock(stock_name: str, n_results: int = 5,
                              trading_type: str = None) -> list:
    """Hybrid RAG: 벡터 검색 + 키워드 검색 + RRF 합산"""
    vector_results = []
    keyword_results = []

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

    keyword_results = keyword_search(stock_name, n_results=n_results * 3)

    if not vector_results and not keyword_results:
        return keyword_search(stock_name, n_results)[:n_results]

    merged = reciprocal_rank_fusion(vector_results, keyword_results)

    if trading_type:
        merged = [r for r in merged if r.get("trading_type") == trading_type]

    return merged[:n_results]


def process_video(video: dict, channel: str, playlist_name: str, trading_focus: str = "both"):
    """단일 영상 처리: 트랜스크립트 수집 → Claude 분석 → 저장"""
    video_id = video["id"]
    title = video["title"]

    if is_already_processed(video_id):
        print(f"  [스킵] 이미 처리됨: {title[:30]}...")
        return False

    print(f"  [처리] {title[:40]}...")

    transcript = get_transcript(video_id)
    if not transcript:
        print(f"  자막 없음, 스킵")
        return False

    transcript_file = DATA_DIR / f"{video_id}.txt"
    transcript_file.write_text(transcript, encoding="utf-8")

    if os.environ.get("ANTHROPIC_API_KEY"):
        insight = analyze_with_claude(title, transcript, channel, trading_focus)
    else:
        insight = {"summary": "API 키 없음", "market_sentiment": "중립",
                   "trading_type": "스윙", "urgency": "이번주"}

    result = {
        "video_id": video_id,
        "title": title,
        "channel": channel,
        "playlist": playlist_name,
        "url": video["url"],
        "upload_date": video.get("upload_date"),
        "processed_at": datetime.now().isoformat(),
        "transcript_length": len(transcript),
        "trading_focus": trading_focus,
        "insight": insight,
    }
    insight_file = INSIGHTS_DIR / f"{video_id}.json"
    insight_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    sb_ok = save_to_supabase(video_id, title, channel, video["url"],
                              video.get("upload_date"), insight)
    ch_ok = save_to_chroma(video_id, title, channel, video["url"],
                            video.get("upload_date"), insight)

    print(f"  완료: {title[:40]}")
    print(f"  시장전망: {insight.get('market_sentiment')} | "
          f"매매유형: {insight.get('trading_type')} | "
          f"시급성: {insight.get('urgency')}")
    print(f"  Supabase: {'OK' if sb_ok else 'FAIL'} | ChromaDB: {'OK' if ch_ok else 'FAIL'}")
    return True


def process_playlist(playlist_name: str, config: dict, max_days: int = 2, max_videos: int = MAX_VIDEOS_PER_PLAYLIST):
    """재생목록 수집 + 분석"""
    channel = config["channel"]
    playlist_url = config["playlist_url"]
    trading_focus = config.get("trading_focus", "both")

    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] [{playlist_name}] ({channel}) 수집 중...")

    try:
        videos = get_playlist_videos(playlist_url, max_days=max_days, max_videos=max_videos)
    except Exception as e:
        print(f"  재생목록 로딩 실패: {e}")
        return 0

    if not videos:
        print(f"  최근 {max_days}일 이내 영상 없음")
        return 0

    print(f"  최근 {max_days}일 이내 영상 {len(videos)}개 발견")
    processed = 0
    for i, video in enumerate(videos):
        if process_video(video, channel, playlist_name, trading_focus):
            processed += 1
        # 영상 간 딜레이 (IP 차단 방지)
        if i < len(videos) - 1:
            time.sleep(REQUEST_DELAY)
    return processed


def collect_morning():
    """오전 수집: collect_time == 'morning' 재생목록"""
    print(f"\n{'='*50}")
    print(f"  오전 수집 시작 (마켓브리핑 + 투자의눈)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    total = 0
    for name, config in PLAYLISTS.items():
        if config.get("collect_time") == "morning":
            total += process_playlist(name, config)

    print(f"\n오전 수집 완료: {total}개 영상 처리")
    _print_sentiment()


def collect_afternoon():
    """오후 수집: collect_time == 'afternoon' 재생목록"""
    print(f"\n{'='*50}")
    print(f"  오후 수집 시작 (성공투자오후증시)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    total = 0
    for name, config in PLAYLISTS.items():
        if config.get("collect_time") == "afternoon":
            total += process_playlist(name, config)

    print(f"\n오후 수집 완료: {total}개 영상 처리")
    _print_sentiment()


def collect_all():
    """전체 재생목록 수집 (수동 실행용)"""
    print(f"\n{'='*50}")
    print(f"  전체 재생목록 수집 시작")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    total = 0
    for name, config in PLAYLISTS.items():
        total += process_playlist(name, config)

    print(f"\n전체 수집 완료: {total}개 영상 처리")
    _print_sentiment()


def collect_historical(days: int = 7):
    """과거 N일치 영상 일괄 수집"""
    print(f"\n{'='*50}")
    print(f"  과거 {days}일치 영상 일괄 수집")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    total = 0
    for name, config in PLAYLISTS.items():
        # 과거 수집은 max_videos 제한 없이 (최대 30개까지 스캔)
        processed = process_playlist(name, config, max_days=days, max_videos=30)
        total += processed

    print(f"\n과거 수집 완료: 총 {total}개 영상 처리")
    _print_sentiment()


def retry_failed():
    """자막 수집 실패했던 영상 재수집 (IP 차단 해제 후 사용)"""
    print(f"\n{'='*50}")
    print(f"  실패 영상 재수집")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    # 모든 재생목록에서 영상 목록을 가져와서, 처리 안 된 것만 재시도
    total = 0
    for name, config in PLAYLISTS.items():
        channel = config["channel"]
        playlist_url = config["playlist_url"]
        trading_focus = config.get("trading_focus", "both")

        print(f"\n[{name}] ({channel}) 미처리 영상 확인 중...")
        try:
            videos = get_playlist_videos(playlist_url, max_days=30, max_videos=30)
        except Exception as e:
            print(f"  재생목록 로딩 실패: {e}")
            continue

        failed = [v for v in videos if not is_already_processed(v["id"])]
        if not failed:
            print(f"  미처리 영상 없음")
            continue

        print(f"  미처리 영상 {len(failed)}개 발견, 재시도...")
        for i, video in enumerate(failed):
            if process_video(video, channel, name, trading_focus):
                total += 1
            if i < len(failed) - 1:
                time.sleep(REQUEST_DELAY)

    print(f"\n재수집 완료: {total}개 영상 처리")
    _print_sentiment()


def _print_sentiment():
    """시장 심리 점수 출력"""
    sentiment = get_market_sentiment_score()
    print(f"\n시장 심리 점수: {sentiment['score']} ({sentiment['label']})")
    print(f"분석 영상 수: {sentiment['count']}개")


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


def start_scheduler():
    """스케줄러: 오전 8시 + 오후 4시"""
    print("스케줄러 시작: 08:00 오전 수집 / 16:00 오후 수집")
    schedule.every().day.at("08:00").do(collect_morning)
    schedule.every().day.at("16:00").do(collect_afternoon)

    # 시작 시 즉시 1회 실행
    collect_all()

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="YouTube 재생목록 기반 주식 인사이트 수집기")
    subparsers = parser.add_subparsers(dest="command")

    # schedule
    subparsers.add_parser("schedule", help="스케줄러 실행 (08:00 오전 / 16:00 오후)")

    # historical
    hist_parser = subparsers.add_parser("historical", help="과거 N일치 영상 일괄 수집")
    hist_parser.add_argument("--days", type=int, default=7, help="수집할 과거 일수 (기본: 7)")

    # search
    search_parser = subparsers.add_parser("search", help="종목 검색")
    search_parser.add_argument("stock", nargs="?", default="삼성전자", help="검색할 종목명")

    # retry
    subparsers.add_parser("retry", help="자막 실패 영상 재수집")

    # morning / afternoon
    subparsers.add_parser("morning", help="오전 수집만 실행")
    subparsers.add_parser("afternoon", help="오후 수집만 실행")

    args = parser.parse_args()

    if args.command == "schedule":
        start_scheduler()
    elif args.command == "historical":
        collect_historical(days=args.days)
    elif args.command == "retry":
        retry_failed()
    elif args.command == "morning":
        collect_morning()
    elif args.command == "afternoon":
        collect_afternoon()
    elif args.command == "search":
        stock = args.stock
        print(f"\n'{stock}' 관련 인사이트 검색:")
        results = search_insights_by_stock(stock)
        for r in results:
            print(f"\n제목: {r.get('title', '')[:50]}")
            print(f"채널: {r.get('channel')} | 시장전망: {r.get('market_sentiment')} | 매매유형: {r.get('trading_type')}")
            print(f"요약: {r.get('summary', '')[:100]}")
    else:
        # 기본: 전체 수집 1회 실행
        collect_all()

        print("\n\n=== 최근 인사이트 요약 ===")
        for item in get_latest_insights(3):
            insight = item.get("insight", {})
            print(f"\n제목: {item['title'][:50]}")
            print(f"채널: {item['channel']} | 시장전망: {insight.get('market_sentiment')} | "
                  f"매매유형: {insight.get('trading_type')} | 시급성: {insight.get('urgency')}")
            print(f"요약: {insight.get('summary', '')[:100]}")
