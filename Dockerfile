# CrimeMap / Cloud Run: build React once, serve it through the same FastAPI origin.
# The production image contains no Vite development server or local SQLite DB.
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CRIMEMAP_DEPLOYMENT=cloud-run \
    CRIMEMAP_STATIC_DIR=/srv/frontend/dist
WORKDIR /srv/backend
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && \
    useradd --create-home --uid 10001 crimemap
COPY backend/ /srv/backend/
COPY data/ /srv/data/
COPY --from=frontend /build/frontend/dist/ /srv/frontend/dist/
RUN chown -R crimemap:crimemap /srv
USER crimemap
EXPOSE 8080
# Cloud Run supplies PORT. HTTPS terminates at Cloud Run's managed proxy;
# the app explicitly requires HTTPS origins and sets Secure cookies.
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
