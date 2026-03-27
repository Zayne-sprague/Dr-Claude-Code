#!/bin/bash
set -e

echo "===== Application Startup at $(date -u +%Y-%m-%dT%H:%M:%S) ====="

# Start Flask backend in background
echo "Starting Flask backend..."
cd /app
gunicorn --bind 127.0.0.1:5000 --workers 1 --timeout 120 backend.app:app &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to start..."
for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:5000/api/health > /dev/null 2>&1; then
        echo "Backend is ready (attempt $i)"
        break
    fi
    sleep 1
done

# Start nginx in foreground
echo "Starting nginx on port 7860..."
exec nginx -g 'daemon off;'
