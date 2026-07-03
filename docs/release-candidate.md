# Help Bibi — Release Candidate Local

> FASE 30 — Status do Release Candidate local da Help Bibi.

## Status: RELEASE CANDIDATE LOCAL ✅

A Help Bibi está pronta como Release Candidate local. Todos os fluxos críticos funcionam, testes passam, e os bloqueios para produção real estão claramente documentados.

## Módulos Prontos ✅

| Módulo | Status | Testes |
|--------|--------|--------|
| Landing page + demo ao vivo | ✅ Pronto | Browser |
| Cadastro/login cliente | ✅ Pronto | Browser |
| Cadastro/login prestador | ✅ Pronto | Browser |
| Login admin (seed dev) | ✅ Pronto | Browser |
| Aprovação/bloqueio de prestadores | ✅ Pronto | API |
| Matching seguro (isEligibleForMatching) | ✅ Pronto | 21 testes |
| Pricing engine (6 tipos, surcharges, cupom) | ✅ Pronto | 15 testes |
| Pagamento simulado (PIX/CARD/CASH) | ✅ Pronto | 14 testes |
| PaymentRecord + PaymentEvent persistência | ✅ Pronto | 14 testes |
| Cancelamento + estorno (simulated) | ✅ Pronto | 12 testes |
| Reconciliação financeira | ✅ Pronto | 10 testes |
| Webhook simulado (assinatura HMAC) | ✅ Pronto | 4 testes |
| Histórico cliente (banco, sanitizado) | ✅ Pronto | 21 testes |
| Histórico prestador (banco, sanitizado) | ✅ Pronto | 21 testes |
| Tracking público (sem dados financeiros) | ✅ Pronto | 8+6 testes |
| Notificações operacionais (dedup, som) | ✅ Pronto | 18 testes |
| Chat bidirecional | ✅ Pronto | Browser |
| GPS real/mockado (dev) | ✅ Pronto | Browser |
| Admin auth (sessão HMAC, requireRole) | ✅ Pronto | 25 testes |
| Admin financeiro (dashboard, audit) | ✅ Pronto | Browser |
| AuditLog persistente (IP hash, sanitize) | ✅ Pronto | 10 testes |
| Rate limiting (memory + redis interface) | ✅ Pronto | 21 testes |
| Security headers (CSP, HSTS, X-Frame) | ✅ Pronto | 8 testes |
| Logger seguro (redact secrets, mask) | ✅ Pronto | 13 testes |
| Health endpoints (/api/health, /api/health/db) | ✅ Pronto | Browser |
| Env validation (bloqueia SQLite em prod) | ✅ Pronto | 12 testes |
| Socket.IO hardening (rate limit, payload validation) | ✅ Pronto | 12 testes |
| Mercado Pago adapter (seguro, não homologado) | ✅ Pronto | 26 testes |

**Total: 408 testes automatizados, 0 falhas**

## Módulos Bloqueados (ambiente externo) ⚠️

| Módulo | Bloqueio | Ação Necessária |
|--------|----------|-----------------|
| PostgreSQL runtime | Docker indisponível | Instalar Docker, rodar `docker compose -f docker-compose.dev.yml up -d postgres` |
| Redis runtime | Docker indisponível | Instalar Docker, rodar `docker compose -f docker-compose.dev.yml up -d redis` |
| Mercado Pago sandbox | Sem credenciais reais | Obter credenciais sandbox, configurar webhook URL pública |
| Deploy VPS/Dokploy | Adiado | Provisionar VPS, configurar domínio/HTTPS |

## Como Rodar Localmente

### Pré-requisitos
- Node.js 20+ / Bun
- SQLite (incluído no projeto para dev)

### Iniciar
```bash
# 1. Instalar dependências
bun install

# 2. Configurar banco
bunx prisma generate
bunx prisma db push

# 3. Iniciar app Next.js (porta 3000)
bun run dev

# 4. Em outro terminal, iniciar rescue-service (porta 3003)
cd mini-services/rescue-service
bun --hot index.ts
```

### Acessar
- **App**: http://localhost:81 (via Caddy gateway) ou http://localhost:3000 (direto, sem socket)
- **Admin**: http://localhost:81/admin
  - Email: `admin@helpbibi.local`
  - Senha: `Admin123!`
  - (Apenas em dev com `ADMIN_SEED_ENABLED=true`)

## Comandos de Validação

```bash
# Lint + Prisma + Testes + Build (tudo em um)
bun run check:full

# Apenas lint
bun run lint

# Apenas testes
bun run test

# Validar schema Prisma
bunx prisma validate

# Health check local
bun run health:local

# Git hygiene check
bun run git:hygiene
```

## Credenciais Dev/Admin

| Tipo | Email | Senha | Ambiente |
|------|-------|-------|----------|
| Admin (seed) | admin@helpbibi.local | Admin123! | Dev apenas (ADMIN_SEED_ENABLED=true) |
| Cliente demo | Qualquer nome | — | Socket register (demo) |
| Prestador demo | Qualquer nome + veículo + placa | — | Socket register (demo) |

**Produção**: seed admin é BLOQUEADO. Criar admin via script/SQL.

## Fluxos de Teste (Regressão Manual)

### Cliente
1. Registrar como cliente (nome)
2. Solicitar socorro (Reboque, pickup, destino, PIX)
3. Aguardar matching (prestador recebe chamada)
4. Prestador aceita → acompanhar chegada
5. Chat com prestador
6. Serviço concluído
7. Avaliar prestador
8. Ver histórico

### Prestador
1. Registrar como prestador (nome, veículo, placa)
2. Toggle online/offline
3. Receber chamada
4. Aceitar
5. Atualizar status (chegou → iniciar → concluir)
6. Chat com cliente
7. Ver repasse (80% do total)
8. Ver histórico de atendimentos

### Admin
1. Login em /admin
2. Ver dashboard financeiro
3. Ver audit trail
4. Aprovar/rejeitar prestador
5. Cancelar pagamento (simulated)
6. Reembolsar pagamento (simulated)
7. Rodar reconcile
8. Logout

### Tracking Público
1. Obter serviceId de um serviço ativo
2. Acessar /api/track/[serviceId]
3. Verificar: sem price, sem paymentStatus, sem platformFee, sem providerPayout
4. Apenas: status, type, provider name/vehicle/rating, timeline, ETA

## Critérios de Aceite RC Local

- [x] `bun run check:full` passa (lint + prisma + 408 testes + build)
- [x] App abre sem erros de console/hidratação
- [x] Login admin funciona (dev seed)
- [x] Demo cliente+prestador funciona (registro, serviço, matching, aceite)
- [x] Pagamento simulado aprovado cria PaymentRecord PAID + eventos
- [x] Pagamento simulado recusado cria PaymentRecord FAILED + failureReason
- [x] Cancelamento simulated funciona (PENDING→CANCELED)
- [x] Refund simulated funciona (PAID→REFUNDED)
- [x] Reconcile admin detecta divergências
- [x] Histórico cliente vem do banco (sem platformFee)
- [x] Histórico prestador vem do banco (com providerPayout, sem platformFee)
- [x] Tracking público sem dados financeiros
- [x] Health endpoints funcionam
- [x] Security headers presentes
- [x] Rate limiting ativo
- [x] Git limpo (sem SQLite no histórico)
- [x] 408 testes automatizados passando

## Riscos Conhecidos

1. **PostgreSQL não testado em runtime** — schema validado, bloqueio por Docker
2. **Redis não testado contra servidor** — ioredis instalado, fake client nos testes
3. **Mercado Pago não homologado** — adapter seguro, precisa credenciais sandbox
4. **CSP unsafe-inline** — necessário para Next.js (pode refinar com nonces)
5. **AuditLog memory backend** — dev usa memory (perde em restart), prod usa database
6. **Rate limiting memory** — dev usa memory, prod DEVE usar redis (bloqueado por validateEnv)

## O Que Falta Antes de Produção Real

1. **PostgreSQL runtime**: instalar Docker, testar `schema.postgres.prisma` com `db push`
2. **Redis runtime**: instalar Docker, testar `RedisRateLimitBackend` com servidor real
3. **Mercado Pago sandbox**: obter credenciais, configurar webhook URL pública, testar PIX/CARD
4. **Domínio + HTTPS**: provisionar domínio, configurar SSL/TLS
5. **Backup automatizado**: configurar pg_dump + WAL archiving
6. **Monitoramento**: configurar logs aggregation, alertas, uptime monitoring
7. **Admin auth produção**: criar admin user real (não seed), configurar 2FA se possível

## O Que Falta Antes de Deploy VPS/Dokploy

1. Todos os itens acima (produção real)
2. Provisionar VPS (recomendado 2GB RAM mínimo)
3. Configurar Dokploy ou Docker Swarm
4. Configurar Caddy/nginx como reverse proxy
5. Configurar variáveis de ambiente de produção
6. Configurar volumes persistentes para PostgreSQL + Redis
7. Configurar healthchecks
8. Configurar restart policies
9. Testar deploy completo
10. Configurar CDN para assets estáticos (opcional)

## Próximos Passos

1. Quando Docker disponível: FASE 31 — validar PostgreSQL + Redis em container
2. Quando credenciais MP sandbox disponíveis: FASE 32 — homologação MP sandbox
3. Quando VPS provisionado: FASE 33 — deploy VPS/Dokploy
