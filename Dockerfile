# Production Docker container for Registry Office File Tracker
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

# Install build dependencies for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev && npm rebuild better-sqlite3 --build-from-source

COPY database.js ./
COPY server.js ./
COPY public ./public
COPY data ./data

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
