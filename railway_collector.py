"""
Railway용 YouTube 주식 인사이트 수집기
- Supabase만 사용 (ChromaDB/로컬파일 의존 없음)
- 1회 실행 후 종료 (Railway cron이 매일 호출)
"""
import os
import json
import re
import time
import sys
import tempfile
import glob
from datetime import datetime, timedelta
import yt_dlp
import anthropic
from supabase import create_client

# ── 환경변수 ──────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── 재생목록 설정 ─────────────────────────────────────────────────
PLAYLISTS = {
    "마켓브리핑": {
        "channel": "한국경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PLh6kUo7pqm_4MJOOlfrrvk8jKhrBlInCT",
        "trading_focus": "both",
        "collect_time": "morning",
    },
    "투자의눈": {
        "channel": "매일경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PL0dOq2-5pHmhvKVKN_1RKn6VqFCGobZO4",
        "trading_focus": "both",
        "collect_time": "morning",
    },
    "성공투자오후증시": {
        "channel": "한국경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PLh6kUo7pqm_6kELAfnVp9Rt-musZazbG1",
        "trading_focus": "swing",
        "collect_time": "afternoon",
    },
    "조선일의K1레이스": {
        "channel": "매일경제TV",
        "playlist_url": "https://www.youtube.com/playlist?list=PL0dOq2-5pHmhdqoiAphTBj6C6PxneZMIR",
        "trading_focus": "both",
        "collect_time": "morning",
    },
}

REQUEST_DELAY = 10  # 영상 간 딜레이 (초)
MAX_VIDEOS_PER_PLAYLIST = 3


# ── 영상 목록 가져오기 ────────────────────────────────────────────
def get_playlist_videos(playlist_url: str, max_days: int = 2, max_videos: int = MAX_VIDEOS_PER_PLAYLIST) -> list:
    """재생목록에서 최근 N일 이내 영상만 가져오기"""
    ydl_opts = {
        "quiet": True,
        "extract_flat": "in_playlist",
        "playlist_items": "1:30",
    }
    cutoff = datetime.now() - timedelta(days=max_days)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(playlist_url, download=False)
        videos = []
        for entry in info.get("entries", []):
            if not entry:
                continue
            upload_date = entry.get("upload_date")
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


# ── 자막 수집 ─────────────────────────────────────────────────────
def get_transcript(video_id: str) -> str:
    """yt-dlp로 자막 추출"""
    url = f"https://www.youtube.com/watch?v={video_id}"
    with tempfile.TemporaryDirectory() as tmpdir:
        ydl_opts = {
            "quiet": True,
            "skip_download": True,
            "writeautomaticsub": True,
            "writesubtitles": True,
            "subtitleslangs": ["ko", "ko-KR"],
            "subtitlesformat": "json3",
            "outtmpl": os.path.join(tmpdir, "%(id)s"),
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

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
            print(f"  [자막실패] {type(e).__name__}: {str(e)[:80]}")
            return None


# ── Supabase 중복 체크 ────────────────────────────────────────────
def is_already_processed(video_id: str) -> bool:
    """Supabase에서 이미 처리된 영상인지 확인"""
    try:
        resp = (supabase.table("youtube_insights")
                .select("video_id")
                .eq("video_id", video_id)
                .limit(1)
                .execute())
        return len(resp.data) > 0
    except Exception:
        return False


# ── Claude 분석 ───────────────────────────────────────────────────
def analyze_with_claude(title: str, transcript: str, channel: str, trading_focus: str = "both") -> dict:
    """Claude API로 투자 인사이트 추출"""
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
9. urgency: 투자 시급성 ("오늘"/"이번주"/"장기" 중 하나)

JSON만 출력하세요."""

    message = claude.messages.create(
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


# ── Supabase 저장 ─────────────────────────────────────────────────
def save_to_supabase(video_id: str, title: str, channel: str, playlist: str,
                     url: str, upload_date: str, trading_focus: str, insight: dict) -> bool:
    try:
        row = {
            "video_id": video_id,
            "title": title,
            "channel": channel,
            "url": url,
            "upload_date": upload_date,
            "processed_at": datetime.now().isoformat(),
            "trading_focus": trading_focus,
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


# ── 수집 로직 ─────────────────────────────────────────────────────
def process_video(video: dict, channel: str, playlist_name: str, trading_focus: str) -> bool:
    """단일 영상 처리"""
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

    insight = analyze_with_claude(title, transcript, channel, trading_focus)

    ok = save_to_supabase(
        video_id, title, channel, playlist_name,
        video["url"], video.get("upload_date"), trading_focus, insight,
    )

    print(f"  완료: {title[:40]}")
    print(f"  시장전망: {insight.get('market_sentiment')} | "
          f"매매유형: {insight.get('trading_type')} | "
          f"시급성: {insight.get('urgency')} | "
          f"Supabase: {'OK' if ok else 'FAIL'}")
    return True


def collect(collect_time: str = None, max_days: int = 2):
    """재생목록 수집. collect_time 지정 시 해당 시간대만."""
    print(f"\n{'='*50}")
    print(f"  YouTube 인사이트 수집 ({collect_time or '전체'})")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    total = 0
    for name, config in PLAYLISTS.items():
        if collect_time and config.get("collect_time") != collect_time:
            continue

        channel = config["channel"]
        trading_focus = config.get("trading_focus", "both")
        print(f"\n[{name}] ({channel}) 수집 중...")

        try:
            videos = get_playlist_videos(config["playlist_url"], max_days=max_days)
        except Exception as e:
            print(f"  재생목록 로딩 실패: {e}")
            continue

        if not videos:
            print(f"  최근 {max_days}일 이내 영상 없음")
            continue

        print(f"  영상 {len(videos)}개 발견")
        for i, video in enumerate(videos):
            if process_video(video, channel, name, trading_focus):
                total += 1
            if i < len(videos) - 1:
                time.sleep(REQUEST_DELAY)

    print(f"\n수집 완료: {total}개 영상 처리")
    return total


# ── 엔트리포인트 ──────────────────────────────────────────────────
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode == "morning":
        collect(collect_time="morning")
    elif mode == "afternoon":
        collect(collect_time="afternoon")
    elif mode == "historical":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        collect(max_days=days)
    else:
        collect()
