FROM node:24-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json index.html vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.lock ./backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock && useradd --create-home --uid 10001 srez
COPY backend ./backend
COPY --from=frontend /build/dist ./dist
RUN SREZ_DEBUG=true python backend/manage.py collectstatic --noinput && chown -R srez:srez /app
USER srez
EXPOSE 8000
WORKDIR /app/backend
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-", "--error-logfile", "-"]
