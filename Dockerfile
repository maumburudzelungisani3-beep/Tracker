# Multi-stage Docker build for Registry Office File Tracker
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

# Copy built dependencies and app files
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY database.js ./
COPY server.js ./
COPY public ./public
COPY data ./data

# Ensure data directory exists
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
