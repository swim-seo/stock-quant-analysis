FROM python:3.11-slim

WORKDIR /app

# yt-dlp에 필요한 시스템 패키지
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt

COPY railway_collector.py .

CMD ["python", "railway_collector.py"]
