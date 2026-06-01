"""
kis_fetcher.py — 한국투자증권 Open API 래퍼
책임: 토큰 관리 + API 호출 + 기존 코드베이스 딕셔너리 구조로 정규화

계정:
  실전(real): KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCOUNT_NO
  모의(paper): KIS_PAPER_APP_KEY / KIS_PAPER_APP_SECRET / KIS_PAPER_ACCOUNT_NO

토큰 캐시: Supabase kis_token 테이블 (24h TTL, 만료 1h 전 갱신)
Rate limit: 20 req/sec → 호출 간 MIN_CALL_INTERVAL 준수
"""

import os
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ── 상수 ──────────────────────────────────────────────────────────────────────
KIS_BASE_REAL  = os.environ.get("KIS_BASE_URL", "https://openapi.koreainvestment.com:9443")
KIS_BASE_PAPER = "https://openapivts.koreainvestment.com:9443"

TOKEN_REFRESH_MARGIN_HOURS = 1   # 만료 1시간 전 선제 갱신
MIN_CALL_INTERVAL = 0.06         # 초당 최대 ~16 req (20 hard limit 대비 여유)
MAX_RETRIES = 3

KST = timezone(timedelta(hours=9))

AccountMode = Literal["real", "paper"]

# KRX 섹터 코드 → 이름 매핑 (KIS 업종코드)
SECTOR_CODES: dict[str, str] = {
    "0001": "종합(KOSPI)",
    "0002": "대형주",
    "0003": "중형주",
    "0004": "소형주",
    "0006": "음식료품",
    "0007": "섬유의복",
    "0008": "종이목재",
    "0009": "화학",
    "0010": "의약품",
    "0011": "비금속광물",
    "0012": "철강금속",
    "0013": "기계",
    "0014": "전기전자",
    "0015": "의료정밀",
    "0016": "운수장비",
    "0017": "유통업",
    "0018": "전기가스업",
    "0019": "건설업",
    "0020": "운수창고",
    "0021": "통신업",
    "0022": "금융업",
    "0023": "은행",
    "0024": "증권",
    "0025": "보험",
    "0026": "서비스업",
    "0027": "제조업",
}

# 대시보드에서 실제 사용하는 섹터만 선별
DASHBOARD_SECTORS: dict[str, str] = {
    "0014": "반도체/전기전자",
    "0009": "2차전지/화학",
    "0010": "바이오/의약품",
    "0016": "자동차/운수장비",
    "0026": "IT/서비스",
    "0022": "금융",
    "0019": "건설",
    "0013": "기계/조선",
    "0012": "방산/철강",
    "0027": "제조업",
}


# ── Supabase HTTP 헬퍼 ─────────────────────────────────────────────────────────
_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
_SB_HEADERS = {
    "apikey": _SUPABASE_KEY,
    "Authorization": f"Bearer {_SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def _sb_get(table: str, params: str = "") -> list:
    url = f"{_SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=_SB_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []


def _sb_upsert(table: str, data: dict, on_conflict: str) -> None:
    url = f"{_SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = {**_SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"  [kis_fetcher] Supabase upsert 실패: {e}")


# ── 토큰 관리 ──────────────────────────────────────────────────────────────────
class KISTokenManager:
    """KIS 액세스 토큰 24h TTL 관리. Supabase kis_token 테이블에 캐시."""

    def __init__(self, mode: AccountMode) -> None:
        self.mode = mode
        if mode == "real":
            self._app_key    = os.environ.get("KIS_APP_KEY", "")
            self._app_secret = os.environ.get("KIS_APP_SECRET", "")
            self._base_url   = KIS_BASE_REAL
        else:
            self._app_key    = os.environ.get("KIS_PAPER_APP_KEY", "")
            self._app_secret = os.environ.get("KIS_PAPER_APP_SECRET", "")
            self._base_url   = KIS_BASE_PAPER

        if not self._app_key or not self._app_secret:
            raise ValueError(
                f"KIS {'PAPER_' if mode == 'paper' else ''}APP_KEY / APP_SECRET "
                f"환경변수가 설정되지 않았습니다."
            )

    def get_token(self) -> str:
        """유효한 토큰 반환. 만료 1시간 이내면 갱신."""
        cached = self._load_from_supabase()
        if cached:
            return cached
        return self._issue_and_cache()

    def _load_from_supabase(self) -> str | None:
        now_utc = datetime.now(timezone.utc)
        # isoformat()의 '+00:00'은 URL 쿼리에서 공백으로 해석됨 → Z 형식 사용
        cutoff = (now_utc + timedelta(hours=TOKEN_REFRESH_MARGIN_HOURS)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        rows = _sb_get(
            "kis_token",
            f"mode=eq.{self.mode}&expires_at=gt.{cutoff}&select=token&limit=1",
        )
        return rows[0]["token"] if rows else None

    def _issue_and_cache(self) -> str:
        url  = f"{self._base_url}/oauth2/tokenP"
        body = json.dumps({
            "grant_type": "client_credentials",
            "appkey":    self._app_key,
            "appsecret": self._app_secret,
        }).encode("utf-8")
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        token      = data["access_token"]
        expires_in = int(data.get("expires_in", 86400))
        now_utc    = datetime.now(timezone.utc)
        expires_at = now_utc + timedelta(seconds=expires_in)

        _sb_upsert("kis_token", {
            "mode":       self.mode,
            "token":      token,
            "token_type": data.get("token_type", "Bearer"),
            "issued_at":  now_utc.isoformat(),
            "expires_at": expires_at.isoformat(),
        }, on_conflict="mode")

        print(f"  [KIS] 새 토큰 발급 완료 (mode={self.mode}, 만료={expires_at.strftime('%Y-%m-%d %H:%M')} UTC)")
        return token


# ── KIS API 클라이언트 ─────────────────────────────────────────────────────────
class KISClient:
    """
    단일 진입점. mode에 따라 base_url과 계정 정보 자동 선택.
    모든 공개 메서드는 기존 코드베이스 딕셔너리 구조를 반환.
    """

    def __init__(self, mode: AccountMode = "real") -> None:
        self.mode      = mode
        self._base_url = KIS_BASE_REAL if mode == "real" else KIS_BASE_PAPER
        self._app_key  = os.environ.get("KIS_APP_KEY" if mode == "real" else "KIS_PAPER_APP_KEY", "")
        self._app_secret = os.environ.get("KIS_APP_SECRET" if mode == "real" else "KIS_PAPER_APP_SECRET", "")
        self._token_mgr  = KISTokenManager(mode)
        self._last_call_time: float = 0.0

    def _headers(self, tr_id: str) -> dict:
        return {
            "Content-Type":  "application/json; charset=utf-8",
            "authorization": f"Bearer {self._token_mgr.get_token()}",
            "appkey":        self._app_key,
            "appsecret":     self._app_secret,
            "tr_id":         tr_id,
            "custtype":      "P",
        }

    def _get(self, path: str, tr_id: str, params: dict) -> dict:
        """Rate-limited GET with retry."""
        # Rate limit: MIN_CALL_INTERVAL 준수
        elapsed = time.monotonic() - self._last_call_time
        if elapsed < MIN_CALL_INTERVAL:
            time.sleep(MIN_CALL_INTERVAL - elapsed)

        query = "&".join(f"{k}={v}" for k, v in params.items())
        url   = f"{self._base_url}{path}?{query}"

        for attempt in range(MAX_RETRIES):
            try:
                req = urllib.request.Request(url, headers=self._headers(tr_id))
                with urllib.request.urlopen(req, timeout=15) as resp:
                    self._last_call_time = time.monotonic()
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                if e.code == 500 and attempt < MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"KIS API {tr_id} 오류 {e.code}: {body}") from e
        return {}

    # ── 수급 데이터 (investor trading) ────────────────────────────────────────
    def fetch_investor_trading(self, stock_code: str, days: int = 10) -> list[dict]:
        """
        종목별 일별 외국인/기관 순매수 데이터 (단일 API 호출로 다일치 반환).
        반환: [{"date": "2026.06.01", "close": 75000,
                "foreign_net": 12345, "institution_net": -6789}, ...]
        """
        try:
            data = self._get(
                "/uapi/domestic-stock/v1/quotations/inquire-investor",
                "FHKST01010900",
                {
                    "FID_COND_MRKT_DIV_CODE": "J",
                    "FID_INPUT_ISCD":         stock_code,
                    "FID_INPUT_DATE_1":        "",
                    "FID_INPUT_DATE_2":        "",
                    "FID_PERIOD_DIV_CODE":     "D",
                    "FID_ORG_ADJ_PRC":        "0",
                },
            )
            output = data.get("output2", []) or data.get("output", [])
            results = []
            for row in (output if isinstance(output, list) else [])[:days]:
                date_raw = row.get("stck_bsop_date", "")
                date_fmt = (
                    f"{date_raw[:4]}.{date_raw[4:6]}.{date_raw[6:]}"
                    if len(date_raw) == 8 else date_raw
                )
                results.append({
                    "date":            date_fmt,
                    "close":           int(row.get("stck_clpr", 0) or 0),
                    "foreign_net":     int(row.get("frgn_ntby_qty", 0) or 0),
                    "institution_net": int(row.get("orgn_ntby_qty", 0) or 0),
                })
            return results
        except Exception as e:
            print(f"  [KIS] fetch_investor_trading({stock_code}) 실패: {e}")
            return []

    # ── 거래량 상위 (시장 전체 외국인/기관 순매수 랭킹) ───────────────────────
    def fetch_market_investor_ranking(self, top_n: int = 20) -> list[dict]:
        """
        시장 전체 외국인+기관 순매수 상위 종목 랭킹.
        반환: [{"ticker": "005930", "stock_name": "삼성전자",
                "foreign_net_amount": 123456789, "institution_net_amount": -456789,
                "change_pct": 1.23}, ...]
        """
        try:
            data = self._get(
                "/uapi/domestic-stock/v1/quotations/foreign-institution-total",
                "FHPTJ04400000",
                {
                    "FID_COND_MRKT_DIV_CODE": "J",
                    "FID_COND_SCR_DIV_CODE":  "20174",
                    "FID_INPUT_ISCD":         "0000",
                    "FID_DIV_CLS_CODE":       "0",
                    "FID_RANK_SORT_CLS_CODE": "0",
                    "FID_ETC_CLS_CODE":       "0",
                },
            )
            output = data.get("output", []) or []
            results = []
            for row in output[:top_n]:
                results.append({
                    "ticker":                row.get("mksc_shrn_iscd", ""),
                    "stock_name":            row.get("hts_kor_isnm", ""),
                    "foreign_net_amount":    int(row.get("frgn_ntby_tr_pbmn", 0) or 0),
                    "institution_net_amount": int(row.get("orgn_ntby_tr_pbmn", 0) or 0),
                    "change_pct":            float(row.get("prdy_ctrt", 0) or 0),
                    "volume":                int(row.get("acml_vol", 0) or 0),
                })
            return results
        except Exception as e:
            print(f"  [KIS] fetch_market_investor_ranking 실패: {e}")
            return []

    # ── 섹터 현재 지수 ─────────────────────────────────────────────────────────
    def fetch_sector_index(self, sector_codes: dict[str, str] | None = None) -> list[dict]:
        """
        업종별 현재 지수 조회.
        반환: [{"sector_code": "0014", "sector_name": "반도체/전기전자",
                "current_index": 1234.5, "change_pct": 1.23, "volume": 9876543}, ...]
        """
        codes = sector_codes or DASHBOARD_SECTORS
        results = []
        for code, name in codes.items():
            try:
                data = self._get(
                    "/uapi/domestic-stock/v1/quotations/inquire-index-price",
                    "FHPUP02100000",
                    {"FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": code},
                )
                out = data.get("output", {}) or {}
                results.append({
                    "sector_code":    code,
                    "sector_name":    name,
                    "current_index":  float(out.get("bstp_nmix_prpr", 0) or 0),
                    "change_pct":     float(out.get("bstp_nmix_prdy_ctrt", 0) or 0),
                    "volume":         int(out.get("acml_vol", 0) or 0),
                })
            except Exception as e:
                print(f"  [KIS] fetch_sector_index({code}) 실패: {e}")
        return results

    # ── 섹터 지수 히스토리 (5주 트렌드용) ─────────────────────────────────────
    def fetch_sector_index_history(
        self, sector_code: str, weeks: int = 5
    ) -> list[dict]:
        """
        업종 지수 주간 히스토리.
        반환: [{"trade_date": "2026-05-01", "close_index": 1234.5, ...}, ...]
        """
        try:
            data = self._get(
                "/uapi/domestic-stock/v1/quotations/inquire-index-chartprice",
                "FHPUP02200000",
                {
                    "FID_COND_MRKT_DIV_CODE": "U",
                    "FID_INPUT_ISCD":         sector_code,
                    "FID_INPUT_DATE_1":        "",
                    "FID_INPUT_DATE_2":        "",
                    "FID_PERIOD_DIV_CODE":    "W",
                    "FID_ORG_ADJ_PRC":        "0",
                },
            )
            output = data.get("output2", []) or data.get("output", []) or []
            results = []
            for row in (output if isinstance(output, list) else [])[:weeks]:
                date_raw = row.get("stck_bsop_date", "")
                date_fmt = (
                    f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:]}"
                    if len(date_raw) == 8 else date_raw
                )
                results.append({
                    "trade_date":   date_fmt,
                    "open_index":   float(row.get("bstp_nmix_oprc", 0) or 0),
                    "high_index":   float(row.get("bstp_nmix_hgpr", 0) or 0),
                    "low_index":    float(row.get("bstp_nmix_lwpr", 0) or 0),
                    "close_index":  float(row.get("bstp_nmix_prpr", 0) or 0),
                    "volume":       int(row.get("acml_vol", 0) or 0),
                })
            return list(reversed(results))  # 오래된 순 정렬
        except Exception as e:
            print(f"  [KIS] fetch_sector_index_history({sector_code}) 실패: {e}")
            return []

    # ── 일봉 OHLCV (factor_calculator용) ──────────────────────────────────────
    def fetch_ohlcv_daily(self, stock_code: str, days: int = 120) -> list[dict]:
        """
        종목 일봉 데이터. KIS 1회 최대 100건 → 자동 페이지네이션.
        반환: [{"date": "2026-06-01", "open": 75000, "high": 76000,
                "low": 74500, "close": 75500, "volume": 12345678}, ...]
        오래된 순으로 정렬. days 개 제한.
        """
        PAGE_SIZE   = 100
        MAX_PAGES   = (days // PAGE_SIZE) + 2   # 여유 있게
        all_rows:   list[dict] = []
        end_date    = datetime.now(KST)

        for _ in range(MAX_PAGES):
            if len(all_rows) >= days:
                break
            start_date = end_date - timedelta(days=PAGE_SIZE + 30)
            try:
                data = self._get(
                    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
                    "FHKST03010100",
                    {
                        "FID_COND_MRKT_DIV_CODE": "J",
                        "FID_INPUT_ISCD":         stock_code,
                        "FID_INPUT_DATE_1":        start_date.strftime("%Y%m%d"),
                        "FID_INPUT_DATE_2":        end_date.strftime("%Y%m%d"),
                        "FID_PERIOD_DIV_CODE":    "D",
                        "FID_ORG_ADJ_PRC":        "1",
                    },
                )
            except Exception as e:
                print(f"  [KIS] fetch_ohlcv_daily({stock_code}) 실패: {e}")
                break

            output = data.get("output2", []) or []
            if not output:
                break

            page_rows = []
            for row in (output if isinstance(output, list) else []):
                date_raw = row.get("stck_bsop_date", "")
                if not date_raw:
                    continue
                date_fmt = (
                    f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:]}"
                    if len(date_raw) == 8 else date_raw
                )
                page_rows.append({
                    "date":   date_fmt,
                    "open":   int(row.get("stck_oprc", 0) or 0),
                    "high":   int(row.get("stck_hgpr", 0) or 0),
                    "low":    int(row.get("stck_lwpr", 0) or 0),
                    "close":  int(row.get("stck_clpr", 0) or 0),
                    "volume": int(row.get("acml_vol", 0) or 0),
                })

            # 페이지 데이터를 앞에 prepend (오래된 것부터)
            all_rows = page_rows + all_rows

            # 다음 페이지: 현재 배치의 가장 오래된 날짜 이전으로 이동
            if page_rows:
                oldest = page_rows[0]["date"]  # 이미 내림차순 → 마지막이 가장 오래됨
                # output은 최신→오래된 순이므로 마지막 row가 oldest
                oldest = page_rows[-1]["date"]
                try:
                    end_date = datetime.strptime(oldest, "%Y-%m-%d").replace(
                        tzinfo=KST
                    ) - timedelta(days=1)
                except ValueError:
                    break
            else:
                break

        # 중복 제거 (날짜 기준) 후 오래된 순 정렬
        seen: set[str] = set()
        unique_rows: list[dict] = []
        for r in sorted(all_rows, key=lambda x: x["date"]):
            if r["date"] not in seen:
                seen.add(r["date"])
                unique_rows.append(r)

        return unique_rows[-days:]  # 최근 days 개만 반환

    # ── 현재가 + 기초 팩터 ────────────────────────────────────────────────────
    def fetch_current_price(self, stock_code: str) -> dict:
        """
        현재가, 등락률, PER, PBR, 시가총액.
        반환: {"close": 75000, "change_pct": 1.23, "per": 12.3,
               "pbr": 1.2, "market_cap": 447600000000000}
        """
        try:
            data = self._get(
                "/uapi/domestic-stock/v1/quotations/inquire-price",
                "FHKST01010100",
                {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock_code},
            )
            out = data.get("output", {}) or {}
            return {
                "close":      int(out.get("stck_prpr", 0) or 0),
                "change_pct": float(out.get("prdy_ctrt", 0) or 0),
                "per":        float(out.get("per", 0) or 0),
                "pbr":        float(out.get("pbr", 0) or 0),
                "market_cap": int(out.get("hts_avls", 0) or 0),
                "volume":     int(out.get("acml_vol", 0) or 0),
            }
        except Exception as e:
            print(f"  [KIS] fetch_current_price({stock_code}) 실패: {e}")
            return {}


# ── 싱글턴 클라이언트 ──────────────────────────────────────────────────────────
_clients: dict[AccountMode, KISClient] = {}


def get_client(mode: AccountMode = "real") -> KISClient:
    """프로세스당 KISClient 싱글턴 반환."""
    if mode not in _clients:
        _clients[mode] = KISClient(mode)
    return _clients[mode]
