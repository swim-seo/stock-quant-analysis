"""
dart_collector.py — OpenDART 공시 수집기

매일 아침 파이프라인에서 호출. 전날 공시를 수집해 stock_disclosures에 저장.
공시는 뉴스(stock_news)와 별도 테이블로 관리한다.

필요 환경변수:
  DART_API_KEY  — https://opendart.fss.or.kr 에서 발급 (무료)

사용:
  python dart_collector.py           # 전날 공시 수집
  python dart_collector.py --days 7  # 최근 7일 수집
"""
from __future__ import annotations

import io
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent / ".env")

DART_API_KEY = os.environ.get("DART_API_KEY", "")
DART_BASE    = "https://opendart.fss.or.kr/api"

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase     = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------------------------
# Corp code mapping: DART corp_code ↔ ticker (종목코드)
# ---------------------------------------------------------------------------
_corp_map: dict[str, str] = {}   # stock_code → corp_code
_name_map: dict[str, str] = {}   # corp_name  → stock_code


def _load_corp_map() -> None:
    """Download DART corp code ZIP, parse XML, build ticker mapping."""
    global _corp_map, _name_map
    if _corp_map:
        return
    if not DART_API_KEY:
        print("  [DART] DART_API_KEY 미설정 — corp code 매핑 스킵", file=sys.stderr)
        return

    try:
        resp = httpx.get(
            f"{DART_BASE}/corpCode.xml",
            params={"crtfc_key": DART_API_KEY},
            timeout=30,
            follow_redirects=True,
        )
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            xml_name = next(n for n in zf.namelist() if n.endswith(".xml"))
            xml_bytes = zf.read(xml_name)
        root = ET.fromstring(xml_bytes)
        for item in root.findall(".//list"):
            stock_code = (item.findtext("stock_code") or "").strip()
            corp_code  = (item.findtext("corp_code")  or "").strip()
            corp_name  = (item.findtext("corp_name")  or "").strip()
            if stock_code and corp_code:
                _corp_map[stock_code] = corp_code
                _name_map[corp_name]  = stock_code
        print(f"  [DART] corp 매핑 로드: {len(_corp_map)}개 종목")
    except Exception as e:
        print(f"  [DART] corp code 로드 실패: {e}", file=sys.stderr)


def _ticker_from_corp(corp_code: str, stock_code_raw: str) -> str | None:
    """Return ticker string (e.g. '005930.KS') from DART stock_code."""
    code = stock_code_raw.strip()
    if not code:
        return None
    return f"{code}.KS"


# ---------------------------------------------------------------------------
# Disclosure classification
# ---------------------------------------------------------------------------
BLOCKER_PATTERNS = [
    "거래정지", "매매거래정지", "관리종목", "불성실공시",
    "의견거절", "부적정", "횡령", "배임",
    "기업회생", "파산",
]

STRONG_RISK_PATTERNS = [
    "유상증자", "전환사채", "신주인수권부사채", "교환사채",
    "무상감자", "워크아웃",
]

WARNING_PATTERNS = [
    "최대주주 변경", "최대주주변경", "주요주주 변경",
    "임원 변경", "대표이사 변경",
]

POSITIVE_PATTERNS = [
    "단일판매", "공급계약", "수주", "수주계약",
    "자기주식 취득", "자기주식취득",
    "현금배당", "특별배당", "배당결정",
    "특허", "인허가", "상장",
]


def _classify_disclosure(report_nm: str) -> dict:
    """Rule-based classification of disclosure by report name."""
    nm = report_nm or ""

    risk_flags: list[str] = []
    catalyst_tags: list[str] = []
    impact_score = 0.0
    sentiment = "중립"
    action_hint = "WATCH"

    # Blocker check first
    for pat in BLOCKER_PATTERNS:
        if pat in nm:
            risk_flags.append(pat.replace(" ", "_"))
            impact_score = -50.0
            sentiment = "차단"
            action_hint = "BLOCKED"

    if sentiment == "차단":
        return {
            "sentiment": sentiment,
            "impact_score": impact_score,
            "action_hint": action_hint,
            "risk_flags": list(set(risk_flags)),
            "catalyst_tags": [],
        }

    # Strong risk
    for pat in STRONG_RISK_PATTERNS:
        if pat in nm:
            risk_flags.append(pat)
            impact_score -= 20.0
            sentiment = "악재"
            action_hint = "WATCH"

    # Warning
    for pat in WARNING_PATTERNS:
        if pat in nm:
            risk_flags.append(pat.replace(" ", "_"))
            impact_score -= 5.0
            if sentiment == "중립":
                sentiment = "경고"

    # Positive
    for pat in POSITIVE_PATTERNS:
        if pat in nm:
            catalyst_tags.append(pat)
            impact_score += 20.0
            sentiment = "호재"
            action_hint = "BUY_OK"

    impact_score = max(-50.0, min(50.0, impact_score))

    return {
        "sentiment": sentiment,
        "impact_score": round(impact_score, 1),
        "action_hint": action_hint,
        "risk_flags": list(set(risk_flags)),
        "catalyst_tags": list(set(catalyst_tags)),
    }


# ---------------------------------------------------------------------------
# Fetch disclosures from DART list API
# ---------------------------------------------------------------------------

def _fetch_disclosures(bgn_de: str, end_de: str, corp_cls: str = "Y,K") -> list[dict]:
    """Fetch disclosure list from DART API. corp_cls: Y=유가 K=코스닥."""
    if not DART_API_KEY:
        print("  [DART] DART_API_KEY 미설정 — 수집 스킵", file=sys.stderr)
        return []

    all_items: list[dict] = []
    for cls in corp_cls.split(","):
        page = 1
        while True:
            try:
                resp = httpx.get(
                    f"{DART_BASE}/list.json",
                    params={
                        "crtfc_key": DART_API_KEY,
                        "bgn_de":    bgn_de,
                        "end_de":    end_de,
                        "corp_cls":  cls.strip(),
                        "pblntf_ty": "B",   # 주요사항보고 (유상증자, CB, 최대주주변경 등)
                        "page_no":   page,
                        "page_count": 100,
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                if data.get("status") != "000":
                    break
                items = data.get("list", [])
                all_items.extend(items)
                total = int(data.get("total_count", 0))
                if page * 100 >= total:
                    break
                page += 1
            except Exception as e:
                print(f"  [DART] list 조회 실패 (cls={cls}, page={page}): {e}", file=sys.stderr)
                break

    return all_items


def _fetch_regular_disclosures(bgn_de: str, end_de: str) -> list[dict]:
    """Also fetch A-type (정기공시: 사업보고서, 감사보고서)."""
    if not DART_API_KEY:
        return []
    all_items: list[dict] = []
    for cls in ("Y", "K"):
        try:
            resp = httpx.get(
                f"{DART_BASE}/list.json",
                params={
                    "crtfc_key":  DART_API_KEY,
                    "bgn_de":     bgn_de,
                    "end_de":     end_de,
                    "corp_cls":   cls,
                    "pblntf_ty":  "A",   # 정기공시
                    "page_count": 100,
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "000":
                all_items.extend(data.get("list", []))
        except Exception as e:
            print(f"  [DART] 정기공시 조회 실패 (cls={cls}): {e}", file=sys.stderr)
    return all_items


# ---------------------------------------------------------------------------
# Save to Supabase
# ---------------------------------------------------------------------------

def _save_disclosures(items: list[dict]) -> int:
    """Upsert disclosures into stock_disclosures. Returns saved count."""
    saved = 0
    for item in items:
        rcept_no   = item.get("rcept_no", "")
        stock_code = item.get("stock_code", "").strip()
        corp_code  = item.get("corp_code", "")
        corp_name  = item.get("corp_name", "")
        corp_cls   = item.get("corp_cls", "")
        report_nm  = item.get("report_nm", "")
        rcept_dt_raw = item.get("rcept_dt", "")

        if not rcept_no:
            continue

        ticker = _ticker_from_corp(corp_code, stock_code)
        cls_result = _classify_disclosure(report_nm)

        # Parse rcept_dt: YYYYMMDDHHMMSS
        rcept_dt: str | None = None
        try:
            if rcept_dt_raw and len(rcept_dt_raw) >= 8:
                dt = datetime.strptime(rcept_dt_raw[:14].ljust(14, "0"), "%Y%m%d%H%M%S")
                rcept_dt = dt.replace(tzinfo=timezone(timedelta(hours=9))).isoformat()
        except Exception:
            rcept_dt = None

        row = {
            "rcept_no":        rcept_no,
            "ticker":          ticker,
            "corp_code":       corp_code,
            "corp_name":       corp_name,
            "corp_cls":        corp_cls,
            "report_nm":       report_nm,
            "rcept_dt":        rcept_dt,
            "disclosure_type": item.get("pblntf_ty"),
            "url":             f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}",
            "raw":             item,
            "sentiment":       cls_result["sentiment"],
            "impact_score":    cls_result["impact_score"],
            "action_hint":     cls_result["action_hint"],
            "risk_flags":      cls_result["risk_flags"] or None,
            "catalyst_tags":   cls_result["catalyst_tags"] or None,
        }

        try:
            supabase.table("stock_disclosures").upsert(row, on_conflict="rcept_no").execute()
            saved += 1
        except Exception as e:
            print(f"  [DART] 저장 실패 {rcept_no}: {e}", file=sys.stderr)

    return saved


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(days: int = 1) -> None:
    if not DART_API_KEY:
        print("[DART] DART_API_KEY 없음 — 수집 스킵. env에 DART_API_KEY 추가 필요.")
        return

    now_kst = datetime.now(timezone(timedelta(hours=9)))
    end_de  = now_kst.strftime("%Y%m%d")
    bgn_de  = (now_kst - timedelta(days=days)).strftime("%Y%m%d")

    print(f"[DART] 공시 수집 시작: {bgn_de} ~ {end_de}")
    _load_corp_map()

    items_b = _fetch_disclosures(bgn_de, end_de)
    items_a = _fetch_regular_disclosures(bgn_de, end_de)
    all_items = items_b + items_a

    print(f"  주요사항: {len(items_b)}건, 정기공시: {len(items_a)}건")

    saved = _save_disclosures(all_items)
    print(f"[DART] 완료: {saved}건 저장")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenDART 공시 수집기")
    parser.add_argument("--days", type=int, default=1, help="수집 기간 (기본: 전날 1일)")
    args = parser.parse_args()
    run(days=args.days)
