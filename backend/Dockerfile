# ==============================================================================
# SecureChat AI - Backend Dockerfile
# ==============================================================================
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Install security updates and utilities for healthcheck
RUN apk update && apk add --no-cache wget

# Copy package manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source files
COPY server.js ./
COPY config/ ./config/
COPY controllers/ ./controllers/
COPY middleware/ ./middleware/
COPY models/ ./models/
COPY routes/ ./routes/
COPY services/ ./services/

# Create and use non-root user for security
USER node

# Expose internal API port
EXPOSE 5000

# Environment variables defaults
ENV PORT=5000 \
    NODE_ENV=production

# Health check probe against Express /api/health
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Start server
CMD ["node", "server.js"]
