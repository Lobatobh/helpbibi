# ============================================================
# Help Bibi — Next.js App Dockerfile
# ============================================================
# Installs dependencies with Bun lock support, then builds and
# runs the Next.js standalone server with Node.js.

FROM oven/bun:1.3.13 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://helpbibi:helpbibi@postgres:5432/helpbibi?schema=public
ENV POSTGRES_DATABASE_URL=postgresql://helpbibi:helpbibi@postgres:5432/helpbibi?schema=public
ENV REDIS_URL=redis://redis:6379
ENV RATE_LIMIT_BACKEND=redis
ENV AUDIT_LOG_BACKEND=database
ENV PAYMENT_GATEWAY_PROVIDER=simulated
ENV SESSION_SECRET=build-time-session-secret-change-at-runtime
ENV PAYMENT_WEBHOOK_SECRET=build-time-payment-webhook-secret-change-at-runtime
ENV SOCKET_CORS_ORIGIN=http://localhost:3000

ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SOCKET_URL=/
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN ./node_modules/.bin/prisma generate --schema=prisma/schema.postgres.prisma
RUN npm run build:docker

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/db \
  && chown nextjs:nodejs /app/db

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
