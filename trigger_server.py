"""
수동 파이프라인 트리거 서버 (Railway Web Service)
POST /trigger  {"mode": "morning"|"afternoon"|"all"} → 파이프라인 실행
GET  /status   → 현재 실행 상태
GET  /health   → 헬스체크
"""
import os
import json
import hmac
import time
import threading
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta
from collections import deque

KST = timezone(timedelta(hours=9))
SECRET = os.environ.get("TRIGGER_SECRET", "")
if not SECRET:
    print("[FATAL] TRIGGER_SECRET 환경변수가 비어있습니다 — 서버 시작 거부", file=sys.stderr)
    sys.exit(1)

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://web-beryl-eight-90.vercel.app")

_status = {"running": False, "last_run": None, "last_mode": None, "result": None}
_lock = threading.Lock()

# Naive per-IP rate limiting: 10 POST /trigger per minute
_rate_buckets: dict[str, deque] = {}
_rate_lock = threading.Lock()
RATE_LIMIT = 10
RATE_WINDOW_SEC = 60


def _check_rate(ip: str) -> bool:
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets.setdefault(ip, deque())
        while bucket and bucket[0] < now - RATE_WINDOW_SEC:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return False
        bucket.append(now)
        return True


def run_pipeline(mode: str):
    with _lock:
        if _status["running"]:
            return
        _status["running"] = True
        _status["last_mode"] = mode
        _status["last_run"] = datetime.now(KST).isoformat()
        _status["result"] = None

    try:
        print(f"[trigger] {mode} 파이프라인 시작 ({datetime.now(KST).strftime('%H:%M:%S')})")
        result = subprocess.run(
            [sys.executable, "agent_supervisor.py", "--force", mode],
            capture_output=False,   # stdout/stderr 그대로 Railway 로그에 출력
            timeout=3600,
        )
        _status["result"] = "success" if result.returncode == 0 else f"exit {result.returncode}"
        print(f"[trigger] {mode} 완료 → {_status['result']}")
    except subprocess.TimeoutExpired:
        _status["result"] = "timeout (1h)"
        print("[trigger] 타임아웃")
    except Exception as e:
        _status["result"] = f"error: {e}"
        print(f"[trigger] 오류: {e}")
    finally:
        _status["running"] = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Railway 로그 노이즈 억제

    def _origin_allowed(self) -> str | None:
        origin = self.headers.get("Origin", "")
        if not origin:
            return None
        # 명시 허용된 origin만 echo (allowlist)
        if origin == ALLOWED_ORIGIN or origin.endswith(".vercel.app"):
            return origin
        return None

    def _send_json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        origin = self._origin_allowed()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self._origin_allowed()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Trigger-Secret")
        self.end_headers()

    def _client_ip(self) -> str:
        # Railway sets X-Forwarded-For; fall back to direct addr
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0] if self.client_address else "unknown"

    def do_GET(self):
        if self.path == "/status":
            self._send_json(200, _status)
        elif self.path == "/health":
            self._send_json(200, {"ok": True})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/trigger":
            self._send_json(404, {"error": "not found"})
            return

        # 속도 제한 (IP 기준)
        ip = self._client_ip()
        if not _check_rate(ip):
            self._send_json(429, {"error": "rate limit exceeded"})
            return

        # 시크릿 검증 (constant-time comparison으로 타이밍 공격 방지)
        provided = self.headers.get("X-Trigger-Secret", "")
        if not hmac.compare_digest(provided.encode(), SECRET.encode()):
            self._send_json(401, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if length > 4096:  # /trigger payload는 작은 JSON뿐
            self._send_json(413, {"error": "payload too large"})
            return
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        mode = data.get("mode", "morning")
        if mode not in ("morning", "afternoon", "all"):
            self._send_json(400, {"error": f"mode는 morning/afternoon/all 중 하나"})
            return

        if _status["running"]:
            self._send_json(409, {"error": "이미 실행 중", "status": _status})
            return

        threading.Thread(target=run_pipeline, args=(mode,), daemon=True).start()
        self._send_json(200, {
            "ok": True,
            "mode": mode,
            "message": f"{mode} 파이프라인 시작됨",
        })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"[trigger_server] :{port} 대기 중...")
    server.serve_forever()
