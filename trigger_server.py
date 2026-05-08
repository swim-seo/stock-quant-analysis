"""
수동 파이프라인 트리거 서버 (Railway Web Service)
POST /trigger  {"mode": "morning"|"afternoon"|"all"} → 파이프라인 실행
GET  /status   → 현재 실행 상태
GET  /health   → 헬스체크
"""
import os
import json
import threading
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
SECRET = os.environ.get("TRIGGER_SECRET", "")

_status = {"running": False, "last_run": None, "last_mode": None, "result": None}
_lock = threading.Lock()


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

    def _send_json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Trigger-Secret")
        self.end_headers()

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

        # 시크릿 검증
        if SECRET and self.headers.get("X-Trigger-Secret", "") != SECRET:
            self._send_json(401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0))
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
