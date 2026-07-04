import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function serviceBlock(compose: string, service: 'app' | 'rescue') {
  const match = compose.match(new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:\\n|\\nvolumes:|\\nnetworks:|$)`))
  return match?.[1] ?? ''
}

describe('docker deploy config', () => {
  test('app Dockerfile builds and runs Next.js with Node, not Bun', () => {
    const dockerfile = read('Dockerfile')

    expect(dockerfile).toContain('FROM node:22-')
    expect(dockerfile).toContain('apt-get install -y --no-install-recommends openssl')
    expect(dockerfile).toContain('npm run build:docker')
    expect(dockerfile).toContain('prisma generate --schema=prisma/schema.postgres.prisma')
    expect(dockerfile).toContain('POSTGRES_DATABASE_URL')
    expect(dockerfile).toContain('CMD ["node", "server.js"]')
    expect(dockerfile).not.toContain('RUN bun run build')
    expect(dockerfile).not.toContain('CMD ["bun", "server.js"]')
  })

  test('rescue Dockerfile keeps Bun runtime but generates Prisma for Postgres', () => {
    const dockerfile = read('mini-services/rescue-service/Dockerfile')

    expect(dockerfile).toContain('FROM oven/bun:1.3.13')
    expect(dockerfile).toContain('COPY package.json bun.lock ./')
    expect(dockerfile).toContain('bunx prisma generate --schema=prisma/schema.postgres.prisma')
    expect(dockerfile).toContain('CMD ["bun", "run", "mini-services/rescue-service/index.ts"]')
  })

  test('package exposes a webpack-based Docker build script without changing local build', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    expect(pkg.scripts.build).toContain('next build')
    expect(pkg.scripts['build:docker']).toContain('next build --webpack')
    expect(pkg.scripts.build).toContain('node scripts/copy-standalone-assets.mjs')
    expect(pkg.scripts['build:docker']).toContain('node scripts/copy-standalone-assets.mjs')
  })

  test('VPS compose uses Postgres Redis and Dokploy network without host port publishing', () => {
    const compose = read('docker-compose.yml')
    const app = serviceBlock(compose, 'app')
    const rescue = serviceBlock(compose, 'rescue')

    expect(compose).toContain('postgres:')
    expect(compose).toContain('redis:')
    expect(compose).toContain('dokploy-network')
    expect(compose).toContain('external: true')

    for (const service of [app, rescue]) {
      expect(service).toContain('NODE_ENV: production')
      expect(service).toContain('DATABASE_URL: postgresql://helpbibi:${POSTGRES_PASSWORD}@postgres:5432/helpbibi')
      expect(service).toContain('POSTGRES_DATABASE_URL: postgresql://helpbibi:${POSTGRES_PASSWORD}@postgres:5432/helpbibi')
      expect(service).toContain('REDIS_URL: redis://redis:6379')
      expect(service).toContain('RATE_LIMIT_BACKEND: redis')
      expect(service).toContain('SESSION_SECRET: ${SESSION_SECRET}')
      expect(service).toContain('AUDIT_LOG_BACKEND: database')
      expect(service).not.toMatch(/DATABASE_URL:\s*file:/)
    }

    expect(compose).not.toContain('"3000:3000"')
    expect(compose).not.toContain('"3003:3003"')
  })

  test('production compose example keeps the same Dokploy runtime guarantees', () => {
    const compose = read('docker-compose.prod.example.yml')
    const app = serviceBlock(compose, 'app')
    const rescue = serviceBlock(compose, 'rescue')

    expect(compose).toContain('dokploy-network')
    expect(compose).toContain('external: true')

    for (const service of [app, rescue]) {
      expect(service).toContain('NODE_ENV: production')
      expect(service).toContain('DATABASE_URL: postgresql://helpbibi:${POSTGRES_PASSWORD}@postgres:5432/helpbibi')
      expect(service).toContain('POSTGRES_DATABASE_URL: postgresql://helpbibi:${POSTGRES_PASSWORD}@postgres:5432/helpbibi')
      expect(service).toContain('SESSION_SECRET: ${SESSION_SECRET}')
      expect(service).toContain('AUDIT_LOG_BACKEND: database')
      expect(service).not.toMatch(/DATABASE_URL:\s*file:/)
    }

    expect(compose).not.toContain('"3000:3000"')
    expect(compose).not.toContain('"3003:3003"')
  })

  test('Docker context excludes local env database git metadata and transfer archives', () => {
    expect(existsSync(join(root, '.dockerignore'))).toBe(true)
    const dockerignore = read('.dockerignore')

    expect(dockerignore).toContain('.env')
    expect(dockerignore).toContain('db/*.db')
    expect(dockerignore).toContain('.git')
    expect(dockerignore).toContain('*.tar')
  })

  test('env example documents required Dokploy variables without real secrets', () => {
    const envExample = read('.env.example')
    const requiredKeys = [
      'POSTGRES_PASSWORD=',
      'DATABASE_URL=',
      'POSTGRES_DATABASE_URL=',
      'REDIS_URL=',
      'RATE_LIMIT_BACKEND=redis',
      'AUDIT_LOG_BACKEND=database',
      'SESSION_SECRET=',
      'PAYMENT_WEBHOOK_SECRET=',
      'PAYMENT_GATEWAY_PROVIDER=simulated',
      'NEXT_PUBLIC_APP_URL=',
      'NEXT_PUBLIC_SOCKET_URL=',
      'SOCKET_CORS_ORIGIN=',
      'RESCUE_SERVICE_URL=http://rescue:3003',
    ]

    for (const key of requiredKeys) {
      expect(envExample).toContain(key)
    }
  })
})
