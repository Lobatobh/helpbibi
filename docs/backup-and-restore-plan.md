# Help Bibi — Backup and Restore Plan

> FASE 26 — Plano de backup e restauração para dev/staging/produção.

## Princípios

1. **Nunca versionar bancos de dados no Git** — `db/*.db`, `db/*.sqlite*`, `db/*.bak*` estão no `.gitignore`.
2. **Backups fora do repositório** — armazenar em local seguro, não no Git.
3. **Backup antes de migrations** — sempre fazer backup antes de `prisma migrate` ou `db push` com mudanças de schema.
4. **Testar restore** — um backup não testado não é um backup.
5. **Retenção definida** — não manter backups infinitamente.

## Backup — Dev/Staging (SQLite)

### Backup manual
```bash
# Criar backup timestampado
cp db/custom.db "db/backups/custom-$(date +%Y%m%d-%H%M%S).db"

# Verificar integridade
sqlite3 db/custom.db "PRAGMA integrity_check;"
```

### Backup antes de migration
```bash
# SEMPRE fazer backup antes de mudar o schema
cp db/custom.db "db/backups/custom-pre-migration-$(date +%Y%m%d-%H%M%S).db"
bunx prisma db push
```

### Script de backup automatizado (opcional)
```bash
#!/bin/bash
# scripts/backup-sqlite.sh
BACKUP_DIR="db/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/custom-$TIMESTAMP.db"

# Backup com integrity check
sqlite3 db/custom.db ".backup '$BACKUP_FILE'"
if [ $? -eq 0 ]; then
  echo "✓ Backup criado: $BACKUP_FILE"
  # Manter apenas os últimos 10 backups
  ls -t "$BACKUP_DIR"/custom-*.db | tail -n +11 | xargs rm -f 2>/dev/null
else
  echo "✗ Backup falhou"
  exit 1
fi
```

### Restauração (SQLite)
```bash
# Parar o app
# Restaurar do backup
cp db/backups/custom-20260702-150000.db db/custom.db
# Reiniciar o app
bun run dev
```

## Backup — Produção (PostgreSQL)

### Estratégia recomendada
- **Frequência**: pg_dump diário (full) + WAL archiving contínuo.
- **Retenção**: 30 dias de backups diários + 12 backups mensais.
- **Armazenamento**: fora do servidor (S3, GCS, ou storage dedicado).
- **Criptografia**: backups criptografados em repouso.

### Comando pg_dump
```bash
# Backup full
pg_dump "$DATABASE_URL" | gzip > "backup-$(date +%Y%m%d).sql.gz"

# Backup com dados apenas (sem schema)
pg_dump --data-only "$DATABASE_URL" | gzip > "backup-data-$(date +%Y%m%d).sql.gz"

# Backup schema apenas
pg_dump --schema-only "$DATABASE_URL" > "backup-schema-$(date +%Y%m%d).sql"
```

### Restauração (PostgreSQL)
```bash
# Restaurar do dump
gunzip -c backup-20260702.sql.gz | psql "$DATABASE_URL"

# Restaurar em nova base (para teste)
createdb helpbibi_restore
gunzip -c backup-20260702.sql.gz | psql "postgresql://user:pass@host/helpbibi_restore"
```

## Teste de Restore

### Frequência: mensal
1. Restaurar backup em base de teste.
2. Rodar `bunx prisma db push` para validar schema.
3. Rodar `bun run test` (testes de integração).
4. Verificar contagem de registros principais:
   ```sql
   SELECT 'users' as t, count(*) FROM "User"
   UNION ALL SELECT 'services', count(*) FROM "ServiceRequest"
   UNION ALL SELECT 'payments', count(*) FROM "PaymentRecord";
   ```
5. Documentar resultado do teste.

## Backup antes de Migrations (CRÍTICO)

```bash
# 1. SEMPRE fazer backup
./scripts/backup-sqlite.sh  # ou pg_dump em produção

# 2. Aplicar migration
bunx prisma migrate deploy  # produção
# ou
bunx prisma db push         # dev

# 3. Verificar
bunx prisma validate
bun run test

# 4. Se algo quebrar, restaurar
cp db/backups/custom-pre-migration-*.db db/custom.db
```

## Onde guardar backups (NÃO no Git)

- **Dev**: `db/backups/` (já no `.gitignore` via `db/*.bak*` pattern).
- **Staging/Produção**: storage externo (S3, GCS, Azure Blob) com criptografia.
- **Nunca**: commitar no Git, enviar para remote, ou deixar em diretório público.

## Verificação de integridade

```bash
# SQLite
sqlite3 db/custom.db "PRAGMA integrity_check;"
# Deve retornar: ok

# PostgreSQL
psql "$DATABASE_URL" -c "SELECT pg_is_in_recovery();"
psql "$DATABASE_URL" -c "VACUUM (VERBOSE, ANALYZE);" --dry-run
```

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Backup corrompido | Testar restore mensalmente |
| Backup não testado | Restore em base de teste a cada backup crítico |
| Retenção insuficiente | Manter 30 dias + 12 mensais |
| Backup no Git | `.gitignore` bloqueia `db/*.db`, `db/*.bak*` |
| Backup acessível | Criptografar backups de produção |
| Migration sem backup | Script de backup obrigatório antes de migrate |
