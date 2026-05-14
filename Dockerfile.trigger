FROM python:3.11-slim

WORKDIR /app

COPY requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt

COPY trigger_server.py .
COPY railway_job.py .
COPY railway_collector.py .
COPY theme_scanner.py .
COPY agent_supervisor.py .

CMD ["python", "trigger_server.py"]
