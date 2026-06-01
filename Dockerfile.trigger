FROM python:3.11-slim

WORKDIR /app

COPY requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt

# 모든 Python 파일 복사
COPY *.py .

CMD ["python", "trigger_server.py"]
