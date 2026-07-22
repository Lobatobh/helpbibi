# Help Bibi — Operational Runbook

> FASE 30 — Guia operacional para dev/local e referência para produção.

## Iniciar o App

### Desenvolvimento Local

```bash
# Terminal 1: Next.js app (porta 3000)
cd /home/z/my-project
bun run dev

# Terminal 2: rescue-service Socket.IO (porta 3003)
cd /home/z/my-project/mini-services/rescue-service
bun --hot index.ts

# Terminal 3: Caddy gateway (porta 81) — geralmente já rodando
# Se necessário, verificar com: ps aux | grep caddy
```

### Acesso
- **Via gateway (recomendado)**: http://localhost:81 — socket funciona
- **Direto (sem socket)**: http://localhost:3000 — apenas landing page
- **Admin**: http://localhost:81/admin

### Credenciais Dev (seed legado descontinuado)
- Admin legado: `admin@helpbibi.local` / `[credencial de desenvolvimento removida]`. Provisionar administradores exclusivamente por `scripts/bootstrap-admin.ts`.
- Cliente/Prestador: registro livre via demo (qualquer nome)

## Iniciar o Rescue-Service

```bash
cd /home/z/my-project/mini-services/rescue-service
bun --hot index.ts
```

O rescue-service roda na porta 3003 e gerencia:
- Registro de clientes e prestadores (socket)
- Matching de serviços
- Chat em tempo real
- Notificações de status
- Pagamento simulado (payment:simulate)

### Verificar se está rodando
```bash
curl http://localhost:3003/health
# Retorna: {"ok":true,"name":"Help Bibi","providers":N,"activeServices":N}
```

## Rodar Testes

```bash
# Suíte completa (408 testes)
bun run test

# Watch mode
bun run test:watch

# Teste específico
bun test src/server/payments/__tests__/payment-persistence.test.ts
```

## Validação Completa

```bash
# Lint + Prisma validate + Prisma generate + Testes + Build
bun run check:full

# Apenas verificação rápida (sem build)
bun run check
```

## Validar Health

```bash
# Health local (app + DB)
bun run health:local
# Ou manualmente:
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/health/db
```

### Respostas esperadas
```json
// /api/health
{"status":"ok","timestamp":"...","environment":"development","uptime":N,"version":"25.4.0"}

// /api/health/db
{"status":"ok","database":"connected","timestamp":"...","environment":"development","uptime":N}
```

## Usar o Admin

### Login
1. Acesse http://localhost:81/admin
2. Use o email do administrador provisionado exclusivamente por `scripts/bootstrap-admin.ts`
3. O seed legado e sua senha `[credencial de desenvolvimento removida]` estão descontinuados
4. Clique "Entrar como Admin"

### Dashboard
- **Resumo Financeiro**: total de pagamentos, taxa Help Bibi, repasse prestadores
- **Pagamentos recentes**: lista com status, valor, provider
- **Audit Trail**: últimos eventos de auditoria (login, webhook, etc.)

## Aprovar Prestador

### Via API
```bash
# Obter provider profile ID (do admin ou DB)
PROVIDER_ID="..."

# Aprovar documentos
curl -X POST http://localhost:3000/api/admin/providers/$PROVIDER_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"documentStatus":"APPROVED","vehicleStatus":"APPROVED","isVerified":true}'
```

### Via DB (dev)
```sql
UPDATE ProviderProfile
SET "isVerified" = true,
    "documentStatus" = 'APPROVED',
    "vehicleStatus" = 'APPROVED'
WHERE id = '...';
```

## Consultar Pagamentos

### Via Admin API
```bash
# Todos pagamentos
curl -s http://localhost:3000/api/admin/payments | jq

# Por status
curl -s "http://localhost:3000/api/admin/payments?status=PAID" | jq

# Summary
curl -s http://localhost:3000/api/admin/payments | jq '.summary'
```

### Via DB (dev)
```sql
SELECT id, status, amount, "platformFee", "providerPayout", provider, "paidAt", "failedAt"
FROM PaymentRecord
ORDER BY "createdAt" DESC
LIMIT 20;
```

## Rodar Reconcile

```bash
curl -s http://localhost:3000/api/admin/reconcile | jq
```

### Resposta
```json
{
  "issues": [
    {
      "paymentRecordId": "...",
      "serviceRequestId": "...",
      "issue": "PENDING for >1 hour",
      "severity": "warning",
      "currentStatus": "PENDING",
      "amount": 180
    }
  ],
  "totalChecked": 5,
  "totalIssues": 1
}
```

### Tipos de issues detectadas
- `PENDING for >1 hour` — webhook pode ter sido perdido
- `PAID status but no PAID event` — inconsistência
- `FAILED for >24h with no retry` — pagamento abandonado
- `REFUNDED status but no REFUNDED event` — inconsistência
- `Webhook received without status` — needs API lookup (MP)

## Verificar Audit Logs

### Via Admin API
```bash
curl -s http://localhost:3000/api/admin/audit | jq
```

### Via DB (dev)
```sql
SELECT "eventType", "actorUserId", "actorRole", severity, message, "ipHash", "createdAt"
FROM AuditLog
ORDER BY "createdAt" DESC
LIMIT 50;
```

### Eventos auditados
- `admin_login` — login admin bem-sucedido
- `login_failure` — falha de login
- `provider_approved` — prestador aprovado/rejeitado
- `webhook_received` — webhook recebido
- `webhook_invalid_signature` — assinatura inválida
- `webhook_duplicate` — webhook duplicado (idempotente)
- `payment_failed` — pagamento falhou
- `payment_invalid_transition` — transição financeira inválida
- `rate_limit_exceeded` — rate limit excedido
- `unauthorized_access` — acesso não autorizado

## Limpar Banco Local em Dev

### Reset completo (CUIDADO: apaga todos os dados)
```bash
# Backup primeiro!
cp db/custom.db "db/backups/custom-$(date +%Y%m%d-%H%M%S).db"

# Reset via Prisma
bunx prisma migrate reset
# Ou
rm db/custom.db
bunx prisma db push
```

### Limpar apenas dados de teste
```sql
-- Cuidado: ajuste as condições conforme necessário
DELETE FROM PaymentEvent;
DELETE FROM PaymentRecord;
DELETE FROM ServiceRating;
DELETE FROM ServiceChatMessage;
DELETE FROM ServiceTimelineEvent;
DELETE FROM TrackingShare;
DELETE FROM AuditLog;
DELETE FROM ServiceRequest;
DELETE FROM LoyaltyAccount;
DELETE FROM Vehicle;
DELETE FROM ProviderProfile;
DELETE FROM ClientProfile;
DELETE FROM "User" WHERE role != 'ADMIN'; -- mantém admin seed
```

## Não Versionar Banco

### Verificar
```bash
git ls-files db
# Deve retornar apenas: db/.gitkeep
```

### Se banco aparecer no git
```bash
git rm --cached db/custom.db
git commit -m "chore: remove accidentally tracked sqlite db"
```

### .gitignore já contém
```gitignore
db/*.db
db/*.db-journal
db/*.sqlite
db/*.sqlite3
db/*.sqlite-wal
db/*.sqlite-shm
db/*.bak*
!db/.gitkeep
```

## Verificar Git Limpo

```bash
bun run git:hygiene
# Ou manualmente:
git status --short
git ls-files db
git log --all --oneline -- 'db/*.db' 'db/*.sqlite' 'db/*.bak*'
```

### Esperado
- `git status --short`: vazio (working tree limpo)
- `git ls-files db`: apenas `db/.gitkeep`
- `git log --all -- 'db/*.db'`: vazio (sem SQLite no histórico)

## Cancelar/Reembolsar Pagamento (Admin)

### Cancelar (PENDING/AUTHORIZED → CANCELED)
```bash
PAYMENT_ID="..."
curl -X POST http://localhost:3000/api/admin/payments/$PAYMENT_ID/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason":"Cliente cancelou serviço"}'
```

### Reembolsar (PAID → REFUNDED)
```bash
PAYMENT_ID="..."
curl -X POST http://localhost:3000/api/admin/payments/$PAYMENT_ID/refund \
  -H "Content-Type: application/json" \
  -d '{"amount":180,"reason":"Serviço não concluído"}'
```

## Segurança Operacional

### Nunca fazer
- Commitar `.env` com secrets reais
- Rastrear `.env` no Git
- Rodar `git add .` em ambiente de servidor
- Commitar `db/custom.db` (banco runtime)
- Usar a `[credencial de desenvolvimento removida]` ou qualquer seed legado em produção
- Usar SQLite em produção
- Usar `RATE_LIMIT_BACKEND=memory` em produção
- Expor `MERCADO_PAGO_ACCESS_TOKEN` em logs
- Logar payload completo de webhook

### Sempre fazer
- Rodar `bun run check:full` antes de commitar
- Verificar `git status` antes de push
- Usar `.env.example` apenas como modelo seguro
- Manter secrets reais apenas no `.env` local da VPS/Dokploy
- Aplicar `chmod 600 .env` na VPS
- Backup do banco antes de migrations
- Usar secrets fortes (32+ chars) em produção
- Revisar audit logs periodicamente
- Rodar reconcile diariamente em produção

## Troubleshooting

### App não abre
1. Verificar se `bun run dev` está rodando: `ps aux | grep next`
2. Verificar porta 3000: `curl http://localhost:3000/api/health`
3. Verificar logs: `tail -20 dev.log`

### Socket não conecta
1. Verificar rescue-service: `curl http://localhost:3003/health`
2. Acessar via gateway (porta 81), não direto (porta 3000)
3. Verificar CORS: `SOCKET_CORS_ORIGIN` deve estar vazio em dev (permite *)

### Admin login falha
1. Verificar se o admin foi provisionado exclusivamente por `scripts/bootstrap-admin.ts`
2. Não reativar `ADMIN_SEED_ENABLED`: o seed legado está descontinuado
3. Verificar se admin user existe no DB

### Pagamento não persiste
1. Verificar PaymentRecord no DB: `SELECT * FROM PaymentRecord`
2. Verificar PaymentEvent: `SELECT * FROM PaymentEvent`
3. Verificar logs do rescue-service: `tail -50 /tmp/rescue.log`

### Testes falham
1. Rodar teste isolado: `bun test path/to/test.ts`
2. Verificar se DB está acessível: `bunx prisma db push`
3. Limpar cache: `rm -rf .next node_modules/.cache`
# Deploy VPS/Dokploy - FASE 31.1

## Arquivos de deploy
- `Dockerfile`: app Next.js builda e roda com Node.js 22.
- `mini-services/rescue-service/Dockerfile`: rescue-service continua com Bun.
- `docker-compose.yml`: compose principal para Dokploy/VPS.
- `.env.example`: template de variaveis para Dokploy.

## Variaveis obrigatorias no Dokploy
```env
APP_NAME=helpbibi
COMPOSE_PROJECT_NAME=helpbibi
DOCKER_CONFIG=/root/.docker
POSTGRES_PASSWORD=change_me_strong_password
PAYMENT_GATEWAY_PROVIDER=simulated
PAYMENT_WEBHOOK_SECRET=change_me_webhook_secret
SESSION_SECRET=change_me_session_secret_64_chars_min
NEXT_PUBLIC_APP_URL=https://your-domain.example.com
NEXT_PUBLIC_SOCKET_URL=https://your-domain.example.com
SOCKET_CORS_ORIGIN=https://your-domain.example.com
RATE_LIMIT_BACKEND=redis
AUDIT_LOG_BACKEND=database
```

Observacoes:
- `.env.example` e o modelo seguro; o `.env` real da VPS nao deve ser rastreado.
- `SESSION_SECRET` deve existir para `app` e `rescue`; sem isso o `rescue` falha na validacao de env em producao.
- `AUDIT_LOG_BACKEND=database` deve existir para `app` e `rescue`.
- `NEXT_PUBLIC_APP_URL` e `SOCKET_CORS_ORIGIN` devem apontar para o dominio real quando sair de placeholder.
- Mercado Pago real continua nao homologado; manter `PAYMENT_GATEWAY_PROVIDER=simulated`.

## Roteamento publico Traefik
- O dominio oficial e `helpbibi.com`; tambem rotear `www.helpbibi.com`.
- Se `curl -k -I --resolve helpbibi.com:443:187.77.32.53 https://helpbibi.com` retornar 404 pelo Traefik, verificar as labels do container `app`.
- O `app` deve ter `traefik.enable=true`, `traefik.docker.network=dokploy-network` e load balancer na porta interna `3000`.
- O `docker-compose.yml` normalizado deve manter apenas o padrao numerado gerado pelo Dokploy: `helpbibi-helpbibi-k7sn7j-20-*` para `helpbibi.com` e `helpbibi-helpbibi-k7sn7j-21-*` para `www.helpbibi.com`.
- Nao manter routers manuais `helpbibi-web`/`helpbibi-websecure` junto com os routers numerados, para evitar duplicidade de dominio.
- O router HTTP usa `entrypoints=web` com `redirect-to-https@file`; o router HTTPS usa `entrypoints=websecure` e `tls.certresolver=letsencrypt`.
- O `rescue-service` fica interno em `rescue:3003`; nao publicar `3003:3003` e nao criar dominio publico para ele.
- Esta correcao de rota nao exige mudanca em PostgreSQL, Redis, Supabase ou Mercado Pago.

## Comandos seguros na VPS
```bash
cd /etc/dokploy/compose/helpbibi-helpbibi-k7sn7j/code
git pull
docker compose config
docker compose build app --no-cache
docker compose build rescue --no-cache
```

Para staging inicial com PostgreSQL novo, aplicar schema explicitamente:

```bash
docker compose exec app npx prisma db push --schema=prisma/schema.postgres.prisma
```

Se os builds passarem, subir pelo fluxo do Dokploy UI ou por:

```bash
docker compose up -d
docker compose ps
docker compose logs app --tail=200
docker compose logs rescue --tail=200
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/health/db
```

## Validacao FASE 31 na VPS
- `docker compose build app --no-cache`: passou na VPS.
- `docker compose build rescue --no-cache`: passou na VPS.
- `app`, `postgres`, `redis` e `rescue`: `Up healthy`.
- `/api/health`: 200 ok.
- `/api/health/db`: 200 connected.
- `https://helpbibi.com`: HTTP/2 200.
- `https://www.helpbibi.com`: HTTP/2 200.
- `https://helpbibi.com/api/health`: 200.
- `https://helpbibi.com/api/health/db`: 200.
- Logs recentes: sem erros apos `SESSION_SECRET` e `AUDIT_LOG_BACKEND=database` no `rescue`.

## Regras de seguranca
- Nao usar `select-a-container`; listar containers reais com `docker ps -a`.
- Nao publicar `3000:3000` nem `3003:3003` direto no host.
- Nao usar SQLite com `NODE_ENV=production`.
- Nao rodar prune.
- Nao apagar volumes sem backup.
- Nao mexer em containers de outros servicos.

---
