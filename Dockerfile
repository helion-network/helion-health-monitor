FROM node:20.19-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/health-ui/package*.json ./
RUN npm install

COPY frontend/health-ui/ ./
RUN npm run build

FROM python:3.10-slim-bullseye

ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=app.py

RUN apt update && \
    apt install -y --no-install-recommends libopenblas-dev ninja-build build-essential wget git telnet && \
    rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel cmake scikit-build pytest

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt --upgrade pip

COPY . .
COPY --from=frontend-builder /app/frontend/dist ./frontend/health-ui/dist

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--worker-class", "gthread", "--threads", "10", "--timeout", "120"]