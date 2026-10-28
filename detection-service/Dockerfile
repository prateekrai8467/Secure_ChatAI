# ==============================================================================
# SecureChat AI - Detection Microservice Dockerfile
# ==============================================================================
FROM python:3.11-slim AS production

# Set working directory
WORKDIR /app

# Ensure unbuffered logs and bytecode suppression
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install python packages
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code and trained models
COPY app.py detector.py ./
COPY models/ ./models/

# Create and switch to non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose internal microservice port
EXPOSE 8000

# Health check probe against FastAPI /health
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/health || exit 1

# Start uvicorn server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

