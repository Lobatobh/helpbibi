# Help Bibi — Production Readiness

> Status após FASE 27 — PostgreSQL, Redis e Admin Auth UI.

## Resumo Executivo

A FASE 27 removeu limitações estruturais de MVP:

1. **PostgreSQL strategy** — `schema.postgres.prisma` criado com `provider = "postgresql"`. `validateEnv()` bloqueia SQLite em produção.
2. **Redis rate limiting** — backend interface (memory + redis stub). Produção bloqueia `memory`.
3. **Audit persistente** — `AuditLog` model no Prisma. `AUDIT_LOG_BACKEND=database` em produção.
4. **Admin auth UI** — página `/admin` com login, dashboard financeiro, trilha de auditoria. Seed admin bloqueado em produção.
5. **Docker Compose** — `docker-compose.dev.yml` (postgres + redis) + `docker-compose.prod.example.yml` (app + rescue + postgres + redis).

## PostgreSQL (FASE 27)

### Estratégia
- **Dev**: SQLite (`schema.prisma` com `provider = "sqlite"`) — mantém 345 testes funcionando.
- **Produção**: PostgreSQL (`schema.postgres.prisma` com `provider = "postgresql"`) — obrigatório.
- `validateEnv()` bloqueia `DATABASE_URL` começando com `file:` em produção.
- `POSTGRES_DATABASE_URL` env var usada pelo schema postgres.

### Incompatibilidades resolvidas
- `metadata String?` (SQLite) → `metadata Json?` (PostgreSQL)
- `rawPayload String?` (SQLite) → `rawPayload Json?` (PostgreSQL)
- Tipos numéricos: `Float` funciona em ambos; `Decimal` recomendado para dinheiro em PostgreSQL.

### Docker Compose
- `docker-compose.dev.yml`: postgres (5432) + redis (6379) com healthchecks.
- `docker-compose.prod.example.yml`: app + rescue-service + postgres + redis com volumes, networks, envs.

## Redis Rate Limiting (FASE 27)

### Backend Interface
```typescript
interface RateLimitBackend {
  check(key, config): RateLimitResult
  clear(): void
}
```
- `MemoryRateLimitBackend`: in-memory (dev).
- `RedisRateLimitBackend`: stub que fall back to memory (produção precisa implementar com ioredis).
- `getRateLimitBackend()`: factory, lê `RATE_LIMIT_BACKEND`.

### Produção
- `RATE_LIMIT_BACKEND=memory` → BLOCKED por `validateEnv()`.
- `RATE_LIMIT_BACKEND=redis` + `REDIS_URL` → obrigatório.
- Alternativa: proxy/WAF (Cloudflare, NGINX `limit_req`).

## Audit Persistente (FASE 27)

### AuditLog Model
```prisma
model AuditLog {
  id, eventType, actorUserId, actorRole (UserRole?),
  targetType, targetId, severity, message,
  metadata (String? SQLite / Json? PostgreSQL),
  ipHash, userAgent, createdAt
}
```

### Backend
- `AUDIT_LOG_BACKEND=memory` (dev): buffer in-memory.
- `AUDIT_LOG_BACKEND=database` (produção): persiste em `AuditLog` table.
- IP sempre hasheado (SHA-256, 16 chars) antes de armazenar.
- Metadata sanitizada (secrets redactados, email/telefone mascarados).

### Eventos auditados
`admin_login`, `login_success`, `login_failure`, `provider_approved`, `webhook_received`, `webhook_invalid_signature`, `webhook_duplicate`, `payment_failed`, `payment_invalid_transition`, `rate_limit_exceeded`, `unauthorized_access`.

## Admin Auth UI (FASE 27)

### Página `/admin`
- Login form (email + password) quando não autenticado.
- Dashboard quando autenticado: resumo financeiro + trilha de auditoria.
- Logout button.
- Proteção: `requireRole(ADMIN)` em produção nas rotas `/api/admin/*`.

### Seed Admin (dev only)
- `admin@helpbibi.local` / `Admin123!`
- `ADMIN_SEED_ENABLED=true` em dev.
- **BLOCKED** em produção (403).
- Produção: criar admin user via script/SQL.

## Cobertura de Testes

| Categoria | Arquivos | Testes |
|-----------|----------|--------|
| Existentes (FASE 25-26) | 22 | 296 |
| **Postgres compat (NEW)** | 1 | 13 |
| **Rate limiter backend (NEW)** | 1 | 16 |
| **Audit persistence (NEW)** | 1 | 10 |
| **Admin auth (NEW)** | 1 | 10 |
| **TOTAL** | **26** | **345** |

## Resultado do check:full

```
✓ bun run lint (0 errors)
✓ bunx prisma validate
✓ bunx prisma generate
✓ bun run test (345 pass, 0 fail, 939 expect calls)
✓ bun run build (Next.js 16.1.3, 20 rotas)
```

## Regressão Browser (FASE 27)

- ✅ App abre sem erros de console/hidratação.
- ✅ `/admin` carrega com login form.
- ✅ Login admin com seed credentials funciona (dev).
- ✅ Dashboard admin mostra resumo financeiro + auditoria.
- ✅ `/api/health` e `/api/health/db` funcionam.
- ✅ `/api/admin/payments` retorna dados financeiros.
- ✅ `/api/admin/audit` retorna eventos de auditoria.
- ✅ Sem erros no console.

## Riscos Restantes

1. **Redis não implementado** — `RedisRateLimitBackend` é stub. Produção precisa `bun add ioredis` + implementar `INCR/PEXPIRE`.
2. **PostgreSQL não testado localmente** — Docker não disponível neste ambiente. Schema validado mas `db push` contra PostgreSQL não executado.
3. **MercadoPago** — sem credenciais reais.
4. **CSP unsafe-inline** — necessário para Next.js.
5. **Audit backend memory** — perde em restart (produção usa database).

## Próxima Fase Recomendada

- FASE 28: Implementar Redis real (ioredis), testar PostgreSQL via Docker, homologação MercadoPago.
