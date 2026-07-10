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

## FASE 29 — Mercado Pago Sandbox Readiness

### Status do Adapter MP
- `MercadoPagoGateway.parseWebhookEvent` mapeia corretamente o campo `action` do webhook MP para o evento interno (AUTHORIZED / PAID / FAILED / CANCELED / REFUNDED). Fallback seguro para AUTHORIZED em ações desconhecidas (admin revisa).
- `verifyWebhookSignature` valida HMAC-SHA256 com `timingSafeEqual` (proteção contra timing attacks).
- `sanitize()` remove `card_number`, `card_cvv`, `card_exp_month`, `card_exp_year`, `security_code` do `rawPayload`.

### Operações Financeiras (FASE 29)
- `cancelPayment(paymentRecordId, reason?)` em `payment.repository.ts`: valida PENDING/AUTHORIZED, chama gateway se não-simulated, transita para CANCELED.
- `refundPayment(paymentRecordId, amount?, reason?)`: valida PAID, previne double refund, chama gateway se não-simulated, transita para REFUNDED.
- `reconcilePayments()`: detecta PENDING >1h, PAID sem PAID event, FAILED >24h, REFUNDED sem REFUNDED event. Retorna `{ issues, totalChecked, totalIssues }`.

### Rotas Admin (FASE 29)
- `POST /api/admin/payments/[id]/cancel` — body `{ reason? }`, audit `payment_failed`.
- `POST /api/admin/payments/[id]/refund` — body `{ amount?, reason? }`, audit `payment_invalid_transition`.
- `GET /api/admin/reconcile` — retorna `{ issues, totalChecked, totalIssues }`.
- Todas com rate limiting + admin role guard (prod-only) + audit logging.

### Ambiente
- `.env.example` atualizado com todas as variáveis MP sandbox (`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_WEBHOOK_SECRET`, `PAYMENT_SUCCESS_URL`, `PAYMENT_FAILURE_URL`, `PAYMENT_PENDING_URL`, `PAYMENT_WEBHOOK_URL`).

### Testes (FASE 29)
- `src/server/payments/__tests__/cancel-refund.test.ts` — 12 testes cobrindo cancel/refund + transições inválidas + double refund + reason/amount em messages.
- `src/server/payments/__tests__/reconcile.test.ts` — 10 testes cobrindo shape do resultado, detecção de PENDING >1h / PAID sem evento / FAILED >24h / REFUNDED sem evento, registros limpos.
- `src/server/payments/gateways/__tests__/mercado-pago-webhook-mapping.test.ts` — 19 testes cobrindo action→event mapping (payment_created/approved/paid → PAID, authorized → AUTHORIZED, rejected/failure → FAILED, cancelled/canceled → CANCELED, refunded → REFUNDED, unknown → AUTHORIZED fallback), invalid JSON, missing data.id, webhookId extraction, action in message, rawPayload sanitization.
- `src/server/payments/__tests__/financial-sanitization.test.ts` — 10 testes cobrindo admin view (PaymentRecordWithEvents com platformFee/providerPayout/providerPaymentId/externalReference), client view (sem platformFee/providerPayout/providerPaymentId/externalReference), provider view (com providerPayout mas sem platformFee), tracking público (sanitizeTrackingObject strips tudo).

### Total de Testes (FASE 29)
- Antes da FASE 29: 350 testes (26 arquivos).
- Adicionados pela FASE 29: 51 novos testes em 4 arquivos.
- **Total após FASE 29: 401 testes (30 arquivos)** — atualizado após `bun run test`.

### Não Homologado
- Credenciais sandbox reais do Mercado Pago ainda não configuradas.
- URL pública de webhook ainda não provisionada (ngrok / Cloudflare Tunnel).
- Fluxo end-to-end com MP sandbox precisa ser validado manualmente seguindo `docs/mercado-pago-sandbox.md`.

### Documentação FASE 29
- `docs/mercado-pago-sandbox.md` — guia de homologação sandbox, eventos esperados, validação de assinatura, checklist pré-homologação.
- `docs/payment-operations.md` — visão geral de cancelamento, estorno, reconciliação, sanitização por role.
- `docs/production-readiness.md` — esta seção.
- `docs/manual-regression-checklist.md` — itens FASE 29 adicionados.

## Próxima Fase Recomendada

- FASE 30: Obter credenciais sandbox reais MP, validar fluxo end-to-end via ngrok, homologar adapter MP, configurar cron diário de reconciliação.

---

## FASE 30 — Release Candidate Local + Critérios de Bloqueio Honestos

### Status: RELEASE CANDIDATE LOCAL ✅ (NÃO é produção real)

A Help Bibi está pronta como Release Candidate local. Produção real está bloqueada pelos itens abaixo.

### Bloqueios Formais para Produção Real

| # | Bloqueio | Status | Ação Necessária |
|---|----------|--------|-----------------|
| 1 | PostgreSQL runtime não validado | ⛔ Bloqueado | Instalar Docker, testar schema.postgres.prisma com `db push` |
| 2 | Redis runtime não validado | ⛔ Bloqueado | Instalar Docker, testar RedisRateLimitBackend com servidor real |
| 3 | Mercado Pago não homologado | ⛔ Bloqueado | Obter credenciais sandbox, configurar webhook URL pública, testar PIX/CARD |
| 4 | Deploy VPS/Dokploy não realizado | ⛔ Adiado | Provisionar VPS, configurar domínio/HTTPS |
| 5 | Domínio/HTTPS/webhook real pendente | ⛔ Bloqueado | Provisionar domínio, SSL/TLS, URL pública para webhook MP |
| 6 | Backup real não configurado | ⛔ Bloqueado | Configurar pg_dump automatizado + WAL archiving |
| 7 | Monitoramento real pendente | ⛔ Bloqueado | Configurar log aggregation, alertas, uptime monitoring |

### O Que Está Pronto para Produção (quando bloqueios forem resolvidos)

- ✅ Schema PostgreSQL validado (`schema.postgres.prisma`)
- ✅ Redis rate limiter implementado (ioredis, interface async, fake client testes)
- ✅ Mercado Pago adapter seguro (webhook não aprova sem status real)
- ✅ Docker Compose dev + prod example prontos
- ✅ Env validation bloqueia SQLite/memory/seed em produção
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ Rate limiting (memory dev / redis prod)
- ✅ AuditLog persistente (database backend)
- ✅ Admin auth (sessão HMAC, requireRole ADMIN)
- ✅ PaymentRecord/PaymentEvent com cancel/refund/reconcile
- ✅ Histórico sanitizado (cliente sem platformFee, prestador sem platformFee)
- ✅ Tracking público sem dados financeiros
- ✅ 408 testes automatizados

### Total de Testes (FASE 30)
- **408 testes, 0 falhas, 1147 expect() calls, 30 arquivos**
- `bun run check:full` passa: lint ✓, prisma ✓, testes ✓, build ✓

### Documentação FASE 30
- `docs/release-candidate.md` — status RC local, módulos, critérios de aceite
- `docs/operational-runbook.md` — guia operacional completo
- `docs/production-readiness.md` — este documento (bloqueios honestos)
- `docs/manual-regression-checklist.md` — checklist de regressão

### Próximos Passos (quando ambiente disponível)
1. FASE 31: Docker disponível → validar PostgreSQL + Redis em container
2. FASE 32: Credenciais MP sandbox → homologação MP
3. FASE 33: VPS provisionado → deploy VPS/Dokploy
# FASE 31.1 - Docker/Dokploy Build Stabilization

## Status
- App Dockerfile corrigido para build/runtime com Node.js 22.
- Bun permanece apenas para instalar dependencias a partir de `bun.lock`.
- Build Docker usa `npm run build:docker`, que chama `next build --webpack`.
- Runtime do app usa `node server.js`.
- Prisma client do app e do rescue-service e gerado com `schema.postgres.prisma` no Docker.
- Rescue-service continua com Bun, mas tambem usa Prisma/PostgreSQL em producao.

## Causa Raiz
O deploy no Dokploy falhou em `RUN bun run build` dentro do Dockerfile do app:

```txt
Error [ChunkLoadError]: Failed to load chunk server/chunks/ssr/[root-of-the-server]__*.js
[cause]: SyntaxError: Unexpected token ','
```

O build do Next.js 16/Turbopack com Bun dentro do Docker estava instavel. A correcao estabiliza o build do app com Node e forca Webpack apenas no build Docker.

## Compose VPS/Dokploy
- `docker-compose.yml` agora usa PostgreSQL e Redis proprios da Help Bibi.
- `DATABASE_URL` e `POSTGRES_DATABASE_URL` em producao usam `postgresql://...`; SQLite nao e usado no compose VPS.
- `RATE_LIMIT_BACKEND=redis` e `AUDIT_LOG_BACKEND=database`.
- `SESSION_SECRET` e `AUDIT_LOG_BACKEND=database` tambem sao definidos no `rescue`, porque a validacao de env em producao roda nesse servico.
- Portas 3000/3003 nao sao publicadas no host; Dokploy/Traefik deve rotear para a porta interna 3000 do `app`.
- Rede externa: `dokploy-network`.
- `PAYMENT_GATEWAY_PROVIDER=simulated` permanece ate homologacao real.

## Validacao VPS/Dokploy - FASE 31
- Docker build do `app` passou na VPS.
- Docker build do `rescue` passou na VPS.
- Containers `app`, `postgres`, `redis` e `rescue` subiram `Up healthy`.
- PostgreSQL staging inicial aplicado com `prisma db push --schema=prisma/schema.postgres.prisma`.
- `/api/health` respondeu 200 ok.
- `/api/health/db` respondeu 200 connected.
- Logs recentes sem erros apos incluir `SESSION_SECRET` e `AUDIT_LOG_BACKEND=database` no `rescue`.
- Runtime Node.js instala `openssl` para remover o warning do Prisma em `node:22-bookworm-slim`.

## Roteamento Publico Traefik/Dokploy
- Diagnostico VPS: o Traefik retornava 404 para `helpbibi.com` porque o container do `app` nao tinha labels Traefik de roteamento.
- Correcao permanente: `docker-compose.yml` usa apenas o padrao de labels numeradas geradas pelo Dokploy no servico `app`, sem routers manuais duplicados para o mesmo dominio.
- Labels mantidas no compose principal: `helpbibi-helpbibi-k7sn7j-20-*` para `helpbibi.com` e `helpbibi-helpbibi-k7sn7j-21-*` para `www.helpbibi.com`.
- O trafego publico HTTP/HTTPS entra pelo Traefik/Dokploy e aponta para a porta interna `3000` do servico `app`.
- O `rescue-service` permanece interno na porta `3003`; nao existe dominio publico nem publicacao direta `3003:3003`.
- Nao mexer em banco, Redis, Supabase ou Mercado Pago para essa correcao de roteamento.
- Mercado Pago real continua nao homologado e deve permanecer com `PAYMENT_GATEWAY_PROVIDER=simulated`.

## Validacao Publica FASE 31
- `https://helpbibi.com`: HTTP/2 200.
- `https://www.helpbibi.com`: HTTP/2 200.
- `https://helpbibi.com/api/health`: 200.
- `https://helpbibi.com/api/health/db`: 200.
- Containers `app`, `rescue`, `postgres` e `redis` permaneceram saudaveis.
- Pendencias futuras: propagacao/cache DNS normal, homologacao navegador, Supabase ainda nao integrado, Mercado Pago real ainda nao habilitado, backups e monitoramento ainda pendentes.

## FASE 32.1 - Homologacao publica no navegador
- Bug F32-001: os botoes da demo publica nao avancavam porque os paineis cliente/prestador dependiam do estado `connected` do hook de socket, enquanto o hook usava o fallback local `/?XTransformPort=3003` e ignorava `NEXT_PUBLIC_SOCKET_URL`.
- Correcao: sockets publicos da demo agora resolvem URL por `NEXT_PUBLIC_SOCKET_URL`; em producao, env ausente ou placeholder cai para a origem publica atual; o fallback `/?XTransformPort=3003` fica restrito ao uso fora de producao.
- UX: erro de socket fica visivel em `connect_error`, e a tela nao afirma conexao ativa sem estado real do hook.
- Sem mudancas de infraestrutura: nao publicar `3003:3003`, nao alterar Traefik, nao alterar `.env`, nao habilitar Supabase e nao habilitar Mercado Pago real.
- Validacao manual esperada na Fase 32: abrir `https://helpbibi.com`, iniciar demo, preencher cliente/prestador e confirmar que ambos avancam quando o WebSocket conecta.

## FASE 32.2 - Socket publico da demo
- Bug F32-002: o frontend passou a usar `https://helpbibi.com`, mas o Traefik ainda roteava todo o host apenas para o `app:3000`; o `rescue-service` seguia interno sem router publico para Socket.IO.
- Correcao: `docker-compose.yml` adiciona routers Traefik no servico `rescue` apenas para `PathPrefix(/socket.io)`, com prioridade `100`, HTTPS via `letsencrypt` e load balancer para a porta interna `3003`.
- Dominios cobertos no compose principal: `helpbibi.com` pelo padrao `helpbibi-helpbibi-k7sn7j-socket-20-*` e `www.helpbibi.com` pelo padrao `helpbibi-helpbibi-k7sn7j-socket-21-*`.
- O app continua recebendo o restante do trafego de `helpbibi.com` e `www.helpbibi.com` na porta interna `3000`.
- O Socket.IO agora usa o path publico `/socket.io` no frontend e no `rescue-service`, permitindo `https://helpbibi.com/socket.io` e `wss://helpbibi.com/socket.io`.
- A porta `3003` continua apenas em `expose`, sem publicacao host `3003:3003`.
- Nao alterar `.env` real, volumes, banco, Supabase ou Mercado Pago para esta correcao.

## FASE 32.3 - Oferta para prestador online na demo publica
- Bug F32-003: cliente e prestador entravam na demo publica, e `providers:nearby` mostrava prestador online, mas o matching descartava prestadores demo em producao porque `demoMode` ficava falso no runtime do `rescue-service`.
- Correcao: o runtime da demo publica passa a usar `createPublicDemoMatchingOptions(IS_PROD)`, mantendo a regra geral que rejeita demo provider quando `demoMode` esta desabilitado, mas permitindo o fluxo publico da demo em producao.
- Resultado esperado: uma solicitacao `Reboque / Guincho` encontra prestador demo online como `Guincho Plataforma`, emite `service:offer`, atualiza o cliente para `offered` e mostra o card de chamada no painel do prestador.
- Eventos Socket.IO envolvidos: `provider:register`, `provider:toggle-online`, `service:request`, `service:offer`, `service:offer-received`, `service:accept` e `service:update`.
- Logs seguros adicionados ao `rescue-service`: provider registrado, online/offline, service request criada, contagem de candidatos, motivo de descarte, oferta emitida, oferta recebida e oferta aceita. Os logs usam ids/status e nao registram secrets.
- Sem mudancas de Docker/Traefik, `.env`, banco/volumes, Supabase ou Mercado Pago real.

## FASE 32.4 - Recusa libera nova solicitacao
- Bug F32-004: apos o prestador recusar a chamada, o cliente podia ficar preso em um ciclo antigo com timeline de recusa/timeout e o painel do prestador podia manter card antigo.
- Causa raiz: a recusa removia o prestador apenas de `notifiedProviderIds`, mas a reoferta podia selecionar novamente o mesmo provider porque nao havia lista de `rejectedProviderIds`; o timer antigo tambem podia continuar produzindo timeout depois da recusa.
- Correcao no `rescue-service`: cada request guarda `rejectedProviderIds`, limpa o timer de oferta ao recusar, libera o provider para `online/currentServiceId=null`, reoferta somente para candidatos que ainda nao recusaram e encerra em `expired` quando nao houver candidato.
- Correcao no hook do prestador: `service:offer`, `service:update`, `service:offer-taken` e `service:reject` passam pelos reducers `reduceProviderServiceUpdate`/`reduceProviderReject`, removendo ofertas pendentes de `offer/currentService/offerTaken` quando a chamada nao esta mais ativa.
- Eventos Socket.IO preservados: `service:request`, `service:offer`, `service:offer-received`, `service:reject`, `provider:state` e `service:update`.
- Logs seguros adicionados: oferta recusada, provider liberado, request encerrado por ausencia de candidatos e cliente notificado de encerramento.
- Sem mudancas de Docker/Traefik, `.env`, banco/volumes, Supabase ou Mercado Pago real.

## FASE 32.5 - Tracking ao vivo do prestador aceito
- Bug F32-005: apos `service:accept`, o prestador se movia na simulacao interna, mas o cliente nao recebia `service:update` durante cada movimento; a posicao em `svc.provider.position` ficava congelada ate uma troca de status.
- Causa raiz adicional: o aceite marcava `winner.online=false`, entao o painel do prestador exibia `Offline` mesmo com `currentServiceId` ativo.
- Correcao no `rescue-service`: o aceite mantem o prestador operacional (`online=true`, `currentServiceId` preenchido), e o loop de movimento chama `emitLiveTrackingUpdate(svc, p)` para reenviar `service:update` ao cliente e ao prestador com a posicao atualizada.
- `providers:nearby` agora lista apenas prestadores realmente disponiveis (`online && !currentServiceId`), mantendo prestador em atendimento fora da lista de candidatos sem mostrar offline.
- Correcao na UI do prestador: estado ativo com `currentServiceId` aparece como `Em atendimento`, com switch marcado e desabilitado.
- Correcao da barra de progresso: o progresso passa a ser calculado pela distancia real entre `provider.position` e `tripTarget`, limitando abaixo de 100% enquanto ainda houver km restantes.
- Eventos Socket.IO envolvidos: `service:accept`, `provider:state`, `service:update`, `provider:position`, `service:arrived`, `service:start` e `service:complete`.
- Logs seguros adicionados: tracking iniciado, localizacao recebida, update emitido ao cliente, chegada marcada, rota atualizada e tracking encerrado.
- Sem mudancas de Docker/Traefik, `.env`, banco/volumes, Supabase ou Mercado Pago real.

## FASE 32 - Fechamento da homologacao publica

### Status: APROVADA

Em 2026-07-10, a Help Bibi foi registrada como demo publica operacional homologada em `https://helpbibi.com`.

Escopo aprovado:
- VPS/Dokploy/Traefik/Postgres/Redis da Fase 31;
- home publica em `helpbibi.com` e `www.helpbibi.com`;
- `/api/health` e `/api/health/db`;
- Socket.IO publico por `/socket.io` roteado ao `rescue-service`;
- entrada cliente/prestador;
- prestador online recebendo chamada;
- recusa liberando novo ciclo;
- aceite, tracking ao vivo, chegada, inicio e conclusao;
- layout pos-atendimento do cliente;
- avaliacao, historico e nova solicitacao apos conclusao.

Commits principais homologados:
- `c2c9561 fix: deliver service offers to online providers`;
- `1ac3369 fix: unlock new requests after provider decline`;
- `883f583 fix: update live provider location during service`;
- `155d2fc fix: normalize client panel layout after service completion`.

Importante: esta aprovacao fecha a homologacao publica da demo operacional. Ela nao autoriza producao comercial definitiva nem ativacao de servicos reais.

## FASE 33 - Preparacao pre-producao

### Status: ABERTA

A Fase 33 existe para preparar a Help Bibi para um corte de pre-producao controlado, sem alterar a demo homologada e sem ativar servicos reais por acidente.

Pendencias futuras antes de producao comercial definitiva:
- rotacao de secrets;
- configuracao definitiva de SMTP;
- Supabase real, se for usado;
- Mercado Pago real e homologacao sandbox;
- monitoramento, logs e alertas;
- backup e restore testados;
- LGPD, politicas e termos de uso;
- painel administrativo real;
- seguranca e hardening;
- observabilidade;
- testes de carga;
- plano de rollback.

Fora de escopo desta tarefa:
- habilitar Supabase;
- habilitar Mercado Pago real;
- alterar `.env`;
- alterar Docker/Traefik;
- alterar banco/volumes;
- alterar fluxo da demo homologada;
- publicar porta `3003`.

## Seguranca de Secrets e Versionamento
- `.env` real nao deve ser rastreado pelo Git.
- `.env.example` e o unico modelo seguro versionado e contem apenas placeholders.
- Na VPS/Dokploy, manter `.env` local com permissao restrita: `chmod 600 .env`.
- Nunca usar `git add .` em ambiente de servidor.
- Secrets reais devem existir apenas no `.env` local da VPS/Dokploy.

## Riscos Restantes
- Validacao Docker local em 2026-07-04 ficou bloqueada porque o Docker Desktop daemon nao estava disponivel, mas a validacao Docker real passou na VPS/Dokploy:
  - `docker compose build app --no-cache`: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
  - `docker compose build rescue --no-cache`: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
- Secrets reais devem ser preenchidos somente no Dokploy/.env da VPS.
- Mercado Pago segue nao homologado.
- Dominio real ainda precisa estar configurado no `.env` da VPS/Dokploy se `NEXT_PUBLIC_APP_URL` ou `SOCKET_CORS_ORIGIN` ainda estiverem como placeholder.

---
