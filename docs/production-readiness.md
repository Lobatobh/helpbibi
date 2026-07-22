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

### Bootstrap ADMIN
- O seed legado esta desativado em todos os ambientes e nao cria nem atualiza usuarios.
- Nao existe credencial administrativa hardcoded ou bypass por `NODE_ENV`.
- O primeiro ADMIN deve ser criado exclusivamente por `scripts/bootstrap-admin.ts`, com credenciais por ambiente, confirmacao explicita para eventual promocao e lock transacional.
- O bootstrap real permanece proibido ate a aplicacao e validacao controladas do schema no clone PostgreSQL.

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

## F34-A - Auditoria documental de pre-producao e hardening controlado

### Status: DOCUMENTADA

Em 2026-07-10, a F34-A registrou os planos documentais minimos para pre-producao sem alterar codigo, Docker, Traefik, `.env`, banco, volumes, Supabase, Mercado Pago, SMTP, deploy ou regras de negocio.

Documentos criados:
- `docs/production-hardening-plan.md`;
- `docs/secrets-rotation-plan.md`;
- `docs/backup-restore-plan.md`;
- `docs/rollback-plan.md`;
- `docs/monitoring-observability-plan.md`;
- `docs/legal-lgpd-checklist.md`.

Riscos principais formalizados:
- secrets precisam de rotacao controlada antes de uso real;
- backup automatico e restore isolado ainda precisam ser implantados e testados;
- rollback precisa ser ensaiado antes de janelas sensiveis;
- monitoramento e alertas ainda precisam ser configurados;
- termos, privacidade, retencao e canal LGPD ainda precisam de aprovacao;
- Mercado Pago real, Supabase real e SMTP real continuam fora de escopo e nao habilitados.

Esta fase nao libera producao comercial definitiva. Ela organiza a trilha de hardening necessaria para uma pre-producao controlada.

---

## F34-B - Inventario e runbook de rotacao de secrets

### Status: DOCUMENTADA

Em 2026-07-10, a F34-B criou um inventario seguro de variaveis/secrets e um runbook de rotacao futura, sem ler, expor ou alterar qualquer valor real de `.env`.

Documentos criados/atualizados:
- `docs/secrets-inventory.md`;
- `docs/secret-rotation-runbook.md`;
- `docs/secrets-rotation-plan.md`;
- `docs/pre-production-checklist.md`;
- `worklog.md`.

Categorias inventariadas:
- variaveis publicas `NEXT_PUBLIC_*`;
- app/runtime;
- banco PostgreSQL;
- sessao/admin;
- pagamento simulado e Mercado Pago futuro;
- Socket.IO/CORS;
- Redis/rate limit;
- auditoria/logs;
- Supabase futuro;
- SMTP futuro;
- APIs externas futuras.

Status operacional:
- rotacao real ainda pendente;
- `.env` real deve permanecer local e fora do Git;
- producao comercial continua nao liberada;
- Supabase, Mercado Pago e SMTP reais continuam nao habilitados.

---

## F35-02 - Aplicacao controlada do schema e bootstrap do primeiro ADMIN

### Status: PREPARADA, NAO EXECUTADA

Esta fase prepara a alteracao do PostgreSQL e o primeiro ADMIN, mas nao acessa a VPS, nao executa `db push` em producao e nao cria usuario real. A aplicacao abaixo depende de janela aprovada, backup valido e operador autorizado.

### Diff de schema desde F35-01

| Alteracao | Classificacao | Dados existentes | Acao necessaria |
|---|---|---|---|
| `User.passwordHash String?` | Aditiva segura; nullable temporario | Usuarios existentes ficam com `NULL` e nao autenticam por senha ate definicao controlada | Nenhum backfill global; definir hash apenas no cadastro, recuperacao futura ou bootstrap autorizado |
| `UserStatus` com `ACTIVE` e `SUSPENDED` | Aditiva segura no PostgreSQL | Cria um novo tipo enum, sem converter coluna anterior | Revisar o SQL gerado antes da aplicacao |
| `User.status UserStatus @default(ACTIVE)` | Aditiva com default; requer backfill tecnico | Linhas existentes recebem `ACTIVE` pelo default durante a adicao da coluna | Conferir contagem e distribuicao apos aplicar; nao ha backfill manual esperado |
| `ProviderProfile.city String?` | Aditiva segura; nullable temporario | Perfis existentes ficam com `NULL` | Preencher apenas durante onboarding/edicao futura |
| `ProviderProfile.isDemoProvider Boolean @default(false)` | Aditiva com default; requer backfill tecnico | Perfis existentes recebem `false`, escolha conservadora para nao liberar bypass de verificacao | Revisar perfis demo persistidos; marcar `true` somente por procedimento explicito se realmente forem contas demo |

Nao existem remocoes, renomes, mudancas de tipo ou alteracoes de chave/relacao neste diff. Nenhuma mudanca foi classificada como destrutiva. O risco operacional restante e lock durante `ALTER TABLE`, espaco/tempo de backfill dos defaults e classificacao semantica dos prestadores demo existentes.

### Compatibilidade esperada

- SQLite e PostgreSQL mantem os mesmos campos e defaults desta fase.
- Usuarios existentes sem `passwordHash` permanecem validos para os dados historicos, mas o login por senha deve falhar de forma segura.
- Todos os usuarios existentes passam a `ACTIVE`; antes da janela, confirmar se existe algum usuario que deveria iniciar suspenso.
- Prestadores existentes passam a `isDemoProvider=false`. Isso preserva a seguranca do matching; contas demo persistidas devem ser identificadas e tratadas explicitamente, nunca por backfill amplo.
- O fluxo publico da demo usa registro demo proprio no rescue-service e nao depende de transformar todos os perfis persistidos em demo.

### Plano de aplicacao controlada futura

1. Confirmar commit aprovado, responsavel, janela e criterio de abortar.
2. Colocar o fluxo de escrita em manutencao controlada e registrar contagens de `User`, roles, status de prestadores e ADMINs existentes.
3. Gerar e validar backup PostgreSQL restauravel antes de qualquer DDL.
4. Validar e gerar o Prisma Client PostgreSQL com `prisma/schema.postgres.prisma`.
5. Gerar o SQL de diff contra o banco alvo e revisar se contem apenas criacao do enum e adicao das quatro colunas esperadas.
6. Abortar se o Prisma indicar perda de dados, remocao, rename inesperado ou se ja existir ADMIN nao reconhecido.
7. Aplicar `prisma db push --schema=prisma/schema.postgres.prisma` sem `--accept-data-loss`.
8. Verificar schema, defaults, valores nulos esperados, contagens e `/api/health/db` antes do bootstrap.
9. Executar `scripts/bootstrap-admin.ts` uma unica vez com variaveis injetadas no processo.
10. Validar login em `/admin/login`, sessao, `/api/auth/me`, acesso ADMIN e bloqueio para CLIENT/PROVIDER.
11. Remover as variaveis temporarias do processo e registrar apenas o codigo seguro retornado pelo script.

Comandos de diagnostico e preparacao para a janela futura:

```bash
bunx prisma validate --schema=prisma/schema.postgres.prisma
bunx prisma generate --schema=prisma/schema.postgres.prisma
bunx prisma migrate diff --from-url "$POSTGRES_DATABASE_URL" --to-schema-datamodel prisma/schema.postgres.prisma --script
bunx prisma db push --schema=prisma/schema.postgres.prisma
```

O ultimo comando e operacional e nao foi executado nesta fase. Antes dele, salvar o SQL de diff em area restrita, revisar o plano e produzir backup com a ferramenta PostgreSQL aprovada pelo runbook de backup.

### Bootstrap seguro do primeiro ADMIN

O script `scripts/bootstrap-admin.ts`:

- exige `POSTGRES_DATABASE_URL`, `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD` no ambiente;
- aceita `ADMIN_BOOTSTRAP_NAME` opcional;
- exige no minimo 16 caracteres, maiuscula, minuscula, numero e simbolo;
- normaliza o e-mail e usa `scrypt` com salt aleatorio;
- executa em transacao serializavel e usa advisory lock PostgreSQL;
- retorna `ADMIN_ALREADY_BOOTSTRAPPED` sem alterar dados quando qualquer ADMIN ja existe;
- nao atualiza senha, nome ou status de ADMIN existente;
- exige `ADMIN_BOOTSTRAP_ALLOW_PROMOTION=true` e `ADMIN_BOOTSTRAP_CONFIRM_EMAIL` igual ao e-mail alvo para promover CLIENT/PROVIDER existente;
- retorna somente `ok`, `code` e `changed`, sem e-mail, ID, senha ou hash.

Na janela futura, carregar as variaveis por canal seguro e evitar senha literal no comando ou historico do shell:

```bash
read -r ADMIN_BOOTSTRAP_EMAIL
read -r -s ADMIN_BOOTSTRAP_PASSWORD
export ADMIN_BOOTSTRAP_EMAIL ADMIN_BOOTSTRAP_PASSWORD
bun scripts/bootstrap-admin.ts
unset ADMIN_BOOTSTRAP_EMAIL ADMIN_BOOTSTRAP_PASSWORD ADMIN_BOOTSTRAP_NAME ADMIN_BOOTSTRAP_ALLOW_PROMOTION ADMIN_BOOTSTRAP_CONFIRM_EMAIL
```

`ADMIN_BOOTSTRAP_ALLOW_PROMOTION=true` e `ADMIN_BOOTSTRAP_CONFIRM_EMAIL` devem ser definidos somente quando o diagnostico aprovar explicitamente a promocao de uma conta existente. Sem essa flag, o script aborta sem modificar CLIENT/PROVIDER mesmo que o e-mail coincida. O script nao substitui rotacao de senha e nao deve ser reutilizado para criar ADMINs adicionais.

### Verificacao e rollback

- Sucesso de schema: quatro colunas presentes, enum `UserStatus` presente, contagens preservadas e nenhum aviso de perda de dados.
- Sucesso de bootstrap: exatamente um ADMIN ativo, login e RBAC validados, nenhum dado sensivel em logs.
- Falha antes do DDL: abortar sem mudanca.
- Falha durante/depois do DDL: interromper deploy e restaurar o backup conforme runbook; nao remover colunas manualmente sem plano revisado.
- Falha depois do bootstrap: suspender a conta criada/promovida por procedimento administrativo e investigar; nao apagar historico relacionado nem repetir o bootstrap cegamente.

Pendencias: executar o dry-run contra o PostgreSQL real, validar backup/restore, aplicar o schema e rodar o bootstrap em janela futura. Supabase, Mercado Pago real, SMTP, Docker e deploy permanecem fora desta fase.

---

## F35-06 - Historico, chat, avaliacoes e perfis autenticados

### Status: IMPLEMENTADA LOCALMENTE, NAO IMPLANTADA

Em 2026-07-12, a F35-06 conectou historico, chat, avaliacoes e perfis aos fluxos autenticados, sem alterar schemas Prisma, Docker, `.env`, VPS, PostgreSQL real, Supabase, Mercado Pago real ou SMTP.

Pontos de readiness:
- identidade de cliente/prestador deriva apenas da sessao assinada;
- rotas de historico ignoram IDs enviados por query/body;
- chat autenticado persiste mensagens antes de emitir eventos de Socket.IO;
- avaliacoes sao permitidas somente apos `COMPLETED` e com alvo derivado da sessao;
- perfis usam allowlist de campos editaveis e nao expõem `passwordHash`;
- servicos sem `PaymentRecord` continuam funcionais com `latestPayment=null`;
- demo publica permanece separada dos fluxos autenticados.

Pendencias antes de implantacao futura:
- aplicar de forma controlada os schemas pendentes das fases anteriores antes de qualquer deploy que dependa deles;
- validar o fluxo autenticado completo no navegador apos deploy controlado;
- manter Mercado Pago real, Supabase real e SMTP real desabilitados ate fases proprias.

---

## F35-09A - Termos, privacidade e consentimentos versionados

### Status: IMPLEMENTADA LOCALMENTE, MVP PERMANECE NO-GO

- `ConsentType` e `ConsentRecord` foram adicionados de forma aditiva aos schemas SQLite e PostgreSQL.
- Nao existe backfill automatico: usuarios existentes precisam aceitar as versoes atuais antes de operar.
- Versoes canonicas ficam exclusivamente no servidor; frontend envia apenas flags/tipos permitidos.
- Cadastro de cliente persiste `TERMS` e `PRIVACY_NOTICE` na mesma transacao do usuario/perfil.
- Cadastro de prestador persiste tambem `PROVIDER_OPERATIONAL` e continua criando perfil `PENDING`.
- `LOCATION` nao e aceito no cadastro e fica reservado para F35-09B.
- Criacao de servico, disponibilidade, aceite/status, chat, avaliacao e pagamento exigem consentimentos atuais; login, perfil, historico, documentos e logout permanecem acessiveis.
- Cadastros usam e-mail normalizado e o backend de rate limit existente.
- `/termos` e `/privacidade` registram explicitamente que razao social, CNPJ, endereco, controlador, encarregado e canal institucional ainda dependem de validacao.

Riscos e pre-deploy:

1. Consultar duplicidades case-insensitive de e-mail antes de aplicar o schema real.
2. Revisar o SQL aditivo e realizar backup restauravel antes do DDL.
3. Aplicar `ConsentRecord` em janela controlada, sem fabricar aceites para contas existentes.
4. Comunicar e testar o reconsentimento de CLIENT e PROVIDER existentes.
5. Manter status NO-GO ate F35-09B corrigir localizacao/tracking/demo e Produto/Legal aprovar dados institucionais e textos.

---

## F35-09B - Geolocalizacao real, tracking por token e isolamento da demo

### Status: IMPLEMENTADA LOCALMENTE, MVP PERMANECE NO-GO

- `TrackingShare` recebeu apenas campos aditivos nullable: `revokedAt`, `activeKey @unique` e indice de `expiresAt` nos schemas SQLite/PostgreSQL.
- Links novos usam token aleatorio de 256 bits, `expiresAt` obrigatorio e `activeKey=serviceId`; links legados sem expiracao/chave ativa sao recusados.
- Criacao/reuso e revogacao usam transacao; conflito de unicidade retorna o link canonico concorrente.
- Validade normal e 24 horas. `COMPLETED`, `CANCELED` e `FAILED` ocultam a posicao imediatamente e limitam o link a duas horas.
- A consulta publica e rate limited, usa somente token e retorna status, tipo, ETA, primeiro nome/veiculo/nota do prestador, posicao reduzida e timeline sem labels.
- Enderecos, IDs internos, telefone, e-mail, dados financeiros, chat, auditoria e token nao entram na resposta, logs ou timeline.
- Cliente e prestador precisam registrar `LOCATION` e depois autorizar o navegador; falha do GPS nunca gera posicao ficticia.
- Presenca e posicao do prestador sao efemeras. `isAvailable` continua sendo intencao persistida e nao e alterado apenas por falha de leitura GPS.
- Posicao autenticada expira para matching apos dois minutos e a identidade sempre deriva da sessao Socket.IO.
- Demo permanece funcional em memoria, com colecoes e matching separados, sem acesso operacional a contas ou prestadores reais.
- A demo nao oferece link publico por `ServiceRequest.id`; compartilhamento seguro existe somente no fluxo autenticado por token.

Limitacoes e pre-deploy:

1. Aplicar os campos aditivos de `TrackingShare` em janela controlada antes de disponibilizar links.
2. Nao fabricar `activeKey` ou `expiresAt` para links legados; eles devem ser regenerados por participante autenticado.
3. Homologar permissao, negacao, timeout e precisao de GPS em navegadores Android/iOS e desktop sob HTTPS.
4. Validar tracking por token, revogacao e expiracao apos deploy controlado.
5. Nao existe geocodificacao: destino textual fica sem coordenada e o preco usa a regra canonica sem distancia de destino.
6. Produto/Legal ainda precisa aprovar textos e dados institucionais; producao comercial continua bloqueada.

---

## F36-01 - Remediacao tecnica anterior a pre-producao

### Status: IMPLEMENTADA LOCALMENTE, PRODUTO PERMANECE NO-GO

- Seed e login ADMIN legados foram neutralizados. O tombstone aponta somente para `scripts/bootstrap-admin.ts` e nao possui acesso a banco.
- A rota generica `/api/payments/webhook` retorna `410 Gone`, sem ler payload ou alterar pagamento; o piloto usa apenas `/api/payments/webhook/simulated`, com provider e secret explicitos, assinatura e workflow canonico.
- Configuracao ausente ou desconhecida de `PAYMENT_GATEWAY_PROVIDER` agora falha; nao existe fallback automatico para `simulated`.
- `PaymentRecord.serviceRequestId` recebeu `@@unique` nos dois schemas. A constraint ainda nao foi aplicada em banco real.
- Criacao de solicitacao ativa usa transacao `Serializable`, retry limitado e releitura do registro canonico; a timeline inicial pertence a mesma transacao.
- Novas contas usam e-mail `trim().toLowerCase()` e senha entre 10 e 128 caracteres. Hashes existentes continuam validos e nao sofrem troca automatica.
- `scripts/preflight-data-audit.ts` realiza somente leituras agregadas, mascara e-mails e identifica colisoes de e-mail, usuarios sem hash, pagamentos duplicados, aprovacao de prestadores, consentimentos ausentes e tracking legado.

### Gate obrigatorio antes de SQL ou deploy

1. Restaurar backup recente em clone PostgreSQL isolado e usar credencial somente leitura para o preflight.
2. Executar o preflight e resolver todos os bloqueadores, especialmente duplicidades de e-mail e `PaymentRecord.serviceRequestId`.
3. Revisar o SQL aditivo acumulado e o comportamento de enums, defaults, indices e constraints com evidencias do clone.
4. Aplicar o SQL somente no clone, repetir preflight/testes e preparar rollback antes de qualquer janela real.
5. Manter o produto NO-GO ate aprovacao juridica/institucional, homologacao manual HTTPS/GPS e autorizacao operacional.
