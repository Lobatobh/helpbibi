# ============================================================
# Help Bibi — Next.js App Dockerfile
# ============================================================
# Uses Bun for install + build, Node for production runtime.
# Next.js standalone output mode.

FROM oven/bun:1.1 AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client
RUN bunx prisma generate
# Build Next.js (standalone output)
RUN bun run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files for runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create DB directory
RUN mkdir -p /app/db && chown nextjs:nodejs /app/db

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["bun", "server.js"]
