FROM python:3.11-slim

WORKDIR /app

# 시스템 패키지
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt && yt-dlp -U

COPY railway_collector.py .
COPY railway_job.py .
COPY theme_scanner.py .
COPY agent_supervisor.py .
COPY trigger_server.py .

# Level 2 AI Supervisor — 실패 감지 + Claude 진단 + 알림
CMD ["python", "agent_supervisor.py"]
