# ============================================================
# Help Bibi — Rescue Service (Socket.IO) Dockerfile
# ============================================================
# Separate container for the real-time rescue orchestration service.

FROM oven/bun:1.3.13 AS base
WORKDIR /app

# Copy root package.json for shared deps (prisma, etc.)
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY tsconfig.json ./tsconfig.json

# Install all dependencies (rescue-service imports from src/)
RUN bun install --frozen-lockfile

# Generate Prisma client
ENV POSTGRES_DATABASE_URL=postgresql://helpbibi:helpbibi@postgres:5432/helpbibi?schema=public
RUN bunx prisma generate --schema=prisma/schema.postgres.prisma

# Copy rescue-service source
COPY mini-services/rescue-service ./mini-services/rescue-service
COPY src/server ./src/server
COPY src/lib ./src/lib

# Production
ENV NODE_ENV=production
ENV RESCUE_SERVICE_PORT=3003

EXPOSE 3003

# FASE 23.1: Healthcheck via TCP port check (Socket.IO intercepts HTTP /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "const s = require('net').connect(3003, 'localhost'); s.on('connect', () => { s.end(); process.exit(0) }); s.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 3000)"

CMD ["bun", "run", "mini-services/rescue-service/index.ts"]
