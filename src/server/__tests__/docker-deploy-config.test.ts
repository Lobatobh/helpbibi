import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function serviceBlock(compose: string, service: 'app' | 'rescue') {
  const match = compose.match(new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:\\n|\\nvolumes:|\\nnetworks:|$)`))
  return match?.[1] ?? ''
}

function expectHelpBibiTraefikLabels(app: string) {
  const expectedLabels = [
    'traefik.enable=true',
    'traefik.docker.network=dokploy-network',
    'traefik.http.routers.helpbibi-web.entrypoints=web',
    'traefik.http.routers.helpbibi-web.rule=Host(`helpbibi.com`) || Host(`www.helpbibi.com`)',
    'traefik.http.routers.helpbibi-web.middlewares=redirect-to-https@file',
    'traefik.http.routers.helpbibi-web.service=helpbibi-web',
    'traefik.http.services.helpbibi-web.loadbalancer.server.port=3000',
    'traefik.http.routers.helpbibi-websecure.entrypoints=websecure',
    'traefik.http.routers.helpbibi-websecure.rule=Host(`helpbibi.com`) || Host(`www.helpbibi.com`)',
    'traefik.http.routers.helpbibi-websecure.service=helpbibi-websecure',
    'traefik.http.routers.helpbibi-websecure.tls.certresolver=letsencrypt',
    'traefik.http.services.helpbibi-websecure.loadbalancer.server.port=3000',
  ]

  for (const label of expectedLabels) {
    expect(app).toContain(label)
  }
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
    expectHelpBibiTraefikLabels(app)

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
    expect(rescue).not.toContain('traefik.http.routers')
    expect(rescue).not.toContain('Host(`helpbibi.com`)')
    expect(rescue).not.toContain('Host(`www.helpbibi.com`)')
    expect(rescue).not.toContain('loadbalancer.server.port=3003')
  })

  test('production compose example keeps the same Dokploy runtime guarantees', () => {
    const compose = read('docker-compose.prod.example.yml')
    const app = serviceBlock(compose, 'app')
    const rescue = serviceBlock(compose, 'rescue')

    expect(compose).toContain('dokploy-network')
    expect(compose).toContain('external: true')
    expectHelpBibiTraefikLabels(app)

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
    expect(rescue).not.toContain('traefik.http.routers')
    expect(rescue).not.toContain('Host(`helpbibi.com`)')
    expect(rescue).not.toContain('Host(`www.helpbibi.com`)')
    expect(rescue).not.toContain('loadbalancer.server.port=3003')
  })

  test('Docker context excludes local env database git metadata and transfer archives', () => {
    expect(existsSync(join(root, '.dockerignore'))).toBe(true)
    const dockerignore = read('.dockerignore')

    expect(dockerignore).toContain('.env')
    expect(dockerignore).toContain('db/*.db')
    expect(dockerignore).toContain('.git')
    expect(dockerignore).toContain('*.tar')
  })

  test('git ignores local env files and never tracks real .env', () => {
    const gitignore = read('.gitignore')
    const trackedEnv = execFileSync('git', ['ls-files', '.env'], { cwd: root, encoding: 'utf8' }).trim()

    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/^\.env\.\*$/m)
    expect(gitignore).toMatch(/^!\.env\.example$/m)
    expect(trackedEnv).toBe('')
  })

  test('env example documents required Dokploy variables with safe placeholders only', () => {
    const envExample = read('.env.example')
    const requiredKeys = [
      'APP_NAME=helpbibi',
      'COMPOSE_PROJECT_NAME=helpbibi',
      'DOCKER_CONFIG=/root/.docker',
      'POSTGRES_PASSWORD=change_me_strong_password',
      'PAYMENT_GATEWAY_PROVIDER=simulated',
      'PAYMENT_WEBHOOK_SECRET=change_me_webhook_secret',
      'SESSION_SECRET=change_me_session_secret_64_chars_min',
      'NEXT_PUBLIC_APP_URL=https://your-domain.example.com',
      'NEXT_PUBLIC_SOCKET_URL=https://your-domain.example.com',
      'SOCKET_CORS_ORIGIN=https://your-domain.example.com',
      'RATE_LIMIT_BACKEND=redis',
      'AUDIT_LOG_BACKEND=database',
    ]

    for (const key of requiredKeys) {
      expect(envExample).toContain(key)
    }

    expect(envExample).not.toContain('MERCADO_PAGO_ACCESS_TOKEN=')
    expect(envExample).not.toContain('MERCADO_PAGO_WEBHOOK_SECRET=')
  })
})
