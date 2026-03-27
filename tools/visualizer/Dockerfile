# Build stage for React frontend
FROM node:18-alpine as frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production stage
FROM python:3.11-slim

# Install nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Python requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Create writable data directories for runtime (HF Spaces runs as non-root)
RUN mkdir -p /app/backend/data /app/backend/presets && \
    chmod -R 777 /app/backend/data /app/backend/presets

# Copy built frontend from build stage
COPY --from=frontend-build /app/frontend/dist ./frontend/dist/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# HuggingFace Spaces runs on port 7860
EXPOSE 7860

# Run startup script
CMD ["./start.sh"]
