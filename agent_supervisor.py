"""
Level 2 AI Supervisor
- railway_job.py 각 단계를 감싸서 실패 감지
- 실패 시 자동 재시도 (최대 2회)
- 모든 재시도 실패 시 Claude 진단 → Supabase pipeline_alerts 저장 + 이메일 알림
"""
import os
import sys
import json
import time
import traceback
import smtplib
import urllib.request
from datetime import datetime, date, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from dotenv import load_dotenv
import anthropic

load_dotenv(Path(__file__).parent / ".env")

KST = timezone(timedelta(hours=9))
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

_mode = "morning"  # 전역 모드 (알림 저장용)


# ── Supabase 알림 저장 ──────────────────────────────────────────
def _sb_save_alert(step, error_log, diagnosis):
    data = {
        "created_at": datetime.now(KST).isoformat(),
        "mode": _mode,
        "step": step,
        "error_log": error_log[-3000:],
        "diagnosis": diagnosis,
        "resolved": False,
    }
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/pipeline_alerts",
        data=body, method="POST", headers={**SB_HEADERS, "Prefer": "return=minimal"}
    )
    try:
        urllib.request.urlopen(req)
        print("  [알림] Supabase pipeline_alerts 저장 완료")
    except Exception as e:
        print(f"  [알림] Supabase 저장 실패: {e}")


# ── 이메일 알림 ─────────────────────────────────────────────────
def _send_alert_email(step, diagnosis):
    gmail_user = os.environ.get("GMAIL_USER", "")
    gmail_pw   = os.environ.get("GMAIL_APP_PASSWORD", "")
    to_email   = os.environ.get("REPORT_EMAIL", "")
    if not all([gmail_user, gmail_pw, to_email]):
        return

    now_str = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    html = f"""<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
  <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:10px;padding:20px">
    <h2 style="color:#856404;margin:0 0 12px">⚠️ 파이프라인 오류 감지</h2>
    <p><b>단계:</b> {step} &nbsp;|&nbsp; <b>모드:</b> {_mode} &nbsp;|&nbsp; <b>시각:</b> {now_str}</p>
    <hr style="border:none;border-top:1px solid #ffc107;margin:16px 0">
    <h3 style="font-size:14px;color:#333">Claude 진단</h3>
    <div style="background:#fffdf0;border-radius:8px;padding:12px;font-size:14px;color:#333;white-space:pre-wrap">{diagnosis}</div>
    <p style="font-size:12px;color:#aaa;margin-top:16px">Supabase › pipeline_alerts 에도 저장됨</p>
  </div>
</body></html>"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"⚠️ 주식AI 파이프라인 오류: {step} ({_mode})"
        msg["From"]    = gmail_user
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(gmail_user, gmail_pw)
            server.sendmail(gmail_user, to_email, msg.as_string())
        print(f"  [알림] 이메일 발송 → {to_email}")
    except Exception as e:
        print(f"  [알림] 이메일 발송 실패: {e}")


# ── Claude 진단 ─────────────────────────────────────────────────
def _claude_diagnose(step, errors):
    try:
        client = anthropic.Anthropic()
        error_text = "\n\n---\n\n".join(
            f"시도 {i+1}:\n{e[-2000:]}" for i, e in enumerate(errors)
        )
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            messages=[{"role": "user", "content": f"""
주식 데이터 수집 파이프라인 '{step}' 단계가 {len(errors)}번 연속 실패했습니다.

오류:
{error_text}

한국어로 간결하게:
1. 오류 원인
2. 예상 해결 방법
"""}]
        )
        return resp.content[0].text
    except Exception as e:
        return f"Claude 진단 실패: {e}"


# ── 재시도 래퍼 (핵심) ───────────────────────────────────────────
def run_step(step_name, fn, max_retry=2, retry_delay=30):
    """
    fn을 실행. 실패 시 max_retry회 재시도.
    모두 실패하면 Claude 진단 → Supabase 저장 + 이메일.
    반환값: True(성공) / False(최종 실패)
    """
    errors = []
    for attempt in range(max_retry):
        try:
            print(f"\n  [{step_name}] 시도 {attempt+1}/{max_retry} ...")
            fn()
            print(f"  [{step_name}] ✓ 완료")
            return True
        except Exception:
            err = traceback.format_exc()
            errors.append(err)
            print(f"  [{step_name}] ✗ 실패")
            print(f"  {err.strip().splitlines()[-1]}")  # 마지막 줄만 출력
            if attempt < max_retry - 1:
                print(f"    {retry_delay}초 후 재시도...")
                time.sleep(retry_delay)

    # 모든 재시도 실패
    print(f"\n  [{step_name}] {max_retry}회 모두 실패 → Claude 진단 중...")
    diagnosis = _claude_diagnose(step_name, errors)
    print(f"\n  진단 결과:\n{diagnosis}\n")
    _sb_save_alert(step_name, errors[-1], diagnosis)
    _send_alert_email(step_name, diagnosis)
    return False


# ── 메인 ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import railway_job as rj

    args = sys.argv[1:]

    # --date YYYY-MM-DD 파싱
    if "--date" in args:
        idx = args.index("--date")
        rj._DATE_OVERRIDE = date.fromisoformat(args[idx + 1])
        args = [a for i, a in enumerate(args) if i not in (idx, idx + 1)]

    mode = args[0] if args else rj.auto_detect_mode()
    _mode = mode

    print(f"{'='*50}")
    print(f"  AI Supervisor [{mode}] {datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    if mode == "morning":
        run_step("뉴스 수집",            rj.collect_news)
        run_step("유튜브 수집(아침)",     lambda: rj.collect_youtube(collect_time="morning"))
        run_step("브리핑 생성",           rj.generate_briefing)

        state = {"stock_data": {}}
        run_step("주가 수집",             lambda: state.update(stock_data=rj._collect_stock_data()))
        run_step("예측 저장",             lambda: rj.save_predictions(state["stock_data"]))
        run_step("포트폴리오 신호",       lambda: rj.save_portfolio_signals(state["stock_data"]))
        run_step("수익률 업데이트",       rj.update_portfolio_returns)
        run_step("테마 스캐너",           rj._run_theme_scanner)
        run_step("일일 리포트",           rj.send_daily_report)

    elif mode == "afternoon":
        run_step("뉴스 수집(오후)",       rj.collect_news)
        run_step("유튜브 수집(오후)",     lambda: rj.collect_youtube(collect_time="afternoon"))
        run_step("브리핑 생성",           rj.generate_briefing)
        run_step("수익률 업데이트",       rj.update_portfolio_returns)

    elif mode == "backfill":
        if not rj._DATE_OVERRIDE:
            print("  backfill 모드는 --date YYYY-MM-DD 필요")
            sys.exit(1)
        state = {"stock_data": {}}
        run_step("주가 수집(백필)",       lambda: state.update(stock_data=rj._collect_stock_data()))
        run_step("예측 저장(백필)",       lambda: rj.save_predictions(state["stock_data"]))
        run_step("포트폴리오 신호(백필)", lambda: rj.save_portfolio_signals(state["stock_data"]))

    else:  # all
        run_step("뉴스 수집",             rj.collect_news)
        run_step("유튜브 수집",           rj.collect_youtube)
        run_step("브리핑 생성",           rj.generate_briefing)
        state = {"stock_data": {}}
        run_step("주가 수집",             lambda: state.update(stock_data=rj._collect_stock_data()))
        run_step("예측 저장",             lambda: rj.save_predictions(state["stock_data"]))
        run_step("포트폴리오 신호",       lambda: rj.save_portfolio_signals(state["stock_data"]))
        run_step("수익률 업데이트",       rj.update_portfolio_returns)
        run_step("테마 스캐너",           rj._run_theme_scanner)

    print(f"\n{'='*50}")
    print(f"  AI Supervisor 완료 {datetime.now(KST).strftime('%H:%M:%S')}")
    print(f"{'='*50}")
