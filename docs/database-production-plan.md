# Help Bibi — Database Production Plan (PostgreSQL)

> FASE 26 — Plano de migração SQLite → PostgreSQL para produção.

## Decisão

**Produção real só com PostgreSQL.** SQLite é adequado para dev/staging mas não
para produção multi-instância porque:
- SQLite é um arquivo único — não suporta múltiplos containers simultâneos.
- Sem replicação nativa.
- Sem connection pooling.
- Locking granular (database-level para writes).
- Sem PITR (Point-in-Time Recovery) nativo.

## Estado Atual

- **Dev**: SQLite (`db/custom.db`) via `DATABASE_URL=file:/home/z/my-project/db/custom.db`.
- **Schema**: `prisma/schema.prisma` com `provider = "sqlite"`.
- **Models**: 17 (User, ClientProfile, ProviderProfile, Vehicle, ServiceRequest, ServiceTimelineEvent, ServiceChatMessage, ServiceRating, PromoCode, LoyaltyAccount, TrackingShare, PaymentRecord, PaymentEvent + 4 enums).
- **Migrations**: usando `prisma db push` (sem migration history formal).

## Riscos do SQLite em Produção

| Risco | Impacto |
|-------|---------|
| Múltiplos containers | Corrupção de dados (SQLite não suporta escrita concorrente multi-processo) |
| Sem replicação | Sem alta disponibilidade |
| Locking database-level | Performance degrada com concorrência |
| Sem PITR | Não é possível restaurar para um momento específico |
| Backup manual | Sem automação nativa |

## Plano de Migração

### Passo 1: Preparar PostgreSQL
```bash
# Criar database
createdb helpbibi_prod

# Configurar connection string
export DATABASE_URL="postgresql://user:pass@host:5432/helpbibi_prod?schema=public"
```

### Passo 2: Atualizar schema.prisma
```prisma
datasource db {
  provider = "postgresql"  // mudar de "sqlite"
  url      = env("DATABASE_URL")
}
```

### Passo 3: Adaptar tipos (SQLite → PostgreSQL)
- `String` (JSON) → `Json` onde apropriado (metadata, rawPayload, pickup, destination).
- `Float` → `Decimal` para valores monetários (amount, platformFee, providerPayout).
- Adicionar `@db.Text` para textos longos se necessário.

### Passo 4: Criar migration formal
```bash
# Backup do SQLite atual
cp db/custom.db db/backups/custom-pre-pg-migration.db

# Gerar migration inicial
bunx prisma migrate dev --name init-postgresql

# Aplicar ao PostgreSQL
bunx prisma migrate deploy
```

### Passo 5: Migrar dados
```bash
# Exportar do SQLite
sqlite3 db/custom.db ".dump" > data-sqlite.sql

# Transformar SQL compatível (manual ou script)
# Importar no PostgreSQL
psql "$DATABASE_URL" < data-postgres.sql

# Verificar contagens
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"User\";"
```

### Passo 6: Validar
```bash
bunx prisma validate
bunx prisma generate
bun run test
bun run build
bun run check:full
```

### Passo 7: Deploy
```bash
# Configurar DATABASE_URL no ambiente de produção
# Iniciar app com NODE_ENV=production
NODE_ENV=production bun .next/standalone/server.js
```

## Checklist de Migração

- [ ] PostgreSQL provisionado (produção)
- [ ] DATABASE_URL configurado (produção)
- [ ] Backup do SQLite feito
- [ ] schema.prisma atualizado para postgresql
- [ ] Migration inicial criada
- [ ] Dados migrados e verificados
- [ ] `bunx prisma validate` passa
- [ ] `bun run test` passa
- [ ] `bun run build` passa
- [ ] `bun run check:full` passa
- [ ] Connection pooling configurado (PgBouncer)
- [ ] Backup automático configurado (pg_dump + WAL)
- [ ] Monitoring de DB configurado
- [ ] Rollback plan documentado

## Rollback Plan

Se a migração falhar:
1. Manter SQLite backup intacto.
2. Reverter schema.prisma para `provider = "sqlite"`.
3. Reverter DATABASE_URL para SQLite.
4. Reiniciar app.
5. Documentar falha e corrigir antes de tentar novamente.

## Considerações

- **Connection pooling**: usar PgBouncer em produção.
- **Indexing**: revisar índices após migração (já temos @@index em campos críticos).
- **Enums**: PostgreSQL suporta enums nativamente (mais seguro que SQLite strings).
- **JSON**: PostgreSQL tem tipo Json nativo (melhor que strings JSON).
- **Decimais**: usar Decimal para dinheiro (Float pode ter erros de arredondamento).

## FASE 28 Update — Runtime Validation Status

### Docker Availability
- **Docker is NOT available** in the current development environment.
- PostgreSQL runtime could NOT be tested locally.
- `schema.postgres.prisma` is validated via `prisma validate` but `db push` against a real PostgreSQL was not executed.

### What Was Validated
- `schema.postgres.prisma` passes `prisma validate` with a placeholder `POSTGRES_DATABASE_URL`.
- `validateEnv()` blocks SQLite (`file:`) in production.
- Model parity between `schema.prisma` and `schema.postgres.prisma` verified via tests.
- All 8 critical models exist in both schemas: User, ProviderProfile, ServiceRequest, PaymentRecord, PaymentEvent, AuditLog, TrackingShare, ServiceTimelineEvent.

### Commands to Run When Docker is Available
```bash
# Start PostgreSQL + Redis
docker compose -f docker-compose.dev.yml up -d postgres redis

# Validate + generate + push schema to PostgreSQL
POSTGRES_DATABASE_URL=postgresql://helpbibi:helpbibi_dev_password@localhost:5432/helpbibi \
  bunx prisma validate --schema prisma/schema.postgres.prisma

POSTGRES_DATABASE_URL=postgresql://helpbibi:helpbibi_dev_password@localhost:5432/helpbibi \
  bunx prisma generate --schema prisma/schema.postgres.prisma

POSTGRES_DATABASE_URL=postgresql://helpbibi:helpbibi_dev_password@localhost:5432/helpbibi \
  bunx prisma db push --schema prisma/schema.postgres.prisma

# Test app with PostgreSQL
DATABASE_URL=postgresql://helpbibi:helpbibi_dev_password@localhost:5432/helpbibi \
  RATE_LIMIT_BACKEND=redis \
  REDIS_URL=redis://localhost:6379 \
  bun run dev
```

### Blocker
PostgreSQL runtime validation is **FORMALLY BLOCKED** by Docker unavailability. The schema, env validation, and Docker Compose files are ready — only runtime execution is pending.
