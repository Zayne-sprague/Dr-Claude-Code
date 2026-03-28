FROM python:3.11-slim

# Install nginx
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps (cached unless requirements.txt changes)
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend + pre-built frontend (built locally by install.sh, no Node needed)
COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

# Writable dirs for runtime
RUN mkdir -p /app/backend/data /app/backend/presets && \
    chmod -R 777 /app/backend/data /app/backend/presets

COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 7860
CMD ["./start.sh"]
