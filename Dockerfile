FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt && yt-dlp -U

# 모든 Python 파일 복사 (개별 COPY 대신 한 번에)
COPY *.py .

# Level 2 AI Supervisor — 실패 감지 + Claude 진단 + 알림
CMD ["python", "agent_supervisor.py"]
