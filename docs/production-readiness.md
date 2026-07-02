# Help Bibi — Production Readiness

> Status após FASE 26 — Hardening Final de Segurança e Observabilidade.

## Resumo Executivo

A FASE 26 adicionou camadas de proteção para produção real:

1. **Rate limiting** em todas as APIs (in-memory, 8 presets).
2. **Headers de segurança** no next.config (CSP, X-Frame-Options, HSTS, etc.).
3. **Logger seguro** que mascara email/telefone/cartão e redacta secrets.
4. **Auditoria operacional** com buffer in-memory + logs estruturados.
5. **Socket.IO hardening** com rate limiting (provider:position, chat, service:request) + validação de payload.
6. **Health endpoints** (/api/health, /api/health/db).
7. **Admin hardening** com `requireRole(ADMIN)` em produção.
8. **Plano de backup/restore** documentado.
9. **Plano PostgreSQL** documentado.

## Proteções Adicionadas (FASE 26)

### Rate Limiting (`src/server/rate-limit.ts`)
| Preset | Limite | Janela | Rotas |
|--------|--------|--------|-------|
| login | 10 | 60s | /api/auth/login |
| me | 60 | 60s | /api/auth/me |
| webhook | 30 | 60s | /api/payments/webhook |
| simulate | 20 | 60s | /api/payments/simulate |
| track | 60 | 60s | /api/track/[id] |
| admin | 60 | 60s | /api/admin/* |
| history | 30 | 60s | /api/client/services, /api/provider/services |
| health | 120 | 60s | /api/health, /api/health/db |

In-memory para MVP. **Produção real deve usar Redis ou proxy/WAF.**

### Security Headers (next.config.ts)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), interest-cohort=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy` com `frame-ancestors 'none'`, `default-src 'self'`

### Secure Logger (`src/server/logger.ts`)
- Redacta keys: password, secret, token, cookie, authorization, cvv, cardNumber, security_code.
- Mascara: email (jo***@domain), telefone (11 ****-1234), cartão (123456******1234).
- Trunca strings >500 chars.
- Nunca loga payload completo de webhook.

### Audit (`src/server/audit.ts`)
Eventos auditados: login_success, login_failure, provider_approved, webhook_received, webhook_invalid_signature, webhook_duplicate, payment_failed, payment_invalid_transition, rate_limit_exceeded, unauthorized_access.

### Socket.IO Hardening
- `provider:position`: max 10/sec por socket + validação lat/lng.
- `chat:send`: max 10 msg/10s + validação texto (max 500 chars).
- `service:request`: max 5/min + validação payload completo.
- `client:register`/`provider:register`: max 5/min + validação campos.
- `promo:validate`: validação code + distanceKm.
- `service:rate`: validação stars (1-5).
- Cleanup de rate limit buckets no disconnect.

### Health Endpoints
- `GET /api/health` — liveness: status, timestamp, env, uptime, version.
- `GET /api/health/db` — readiness: status, database connected, timestamp.
- Sem expor: DATABASE_URL, secrets, hostname, stack traces.

### Admin Hardening
- `/api/admin/payments` e `/api/admin/providers/[id]/approve`: `requireRole(req, 'ADMIN')` em produção.
- Dev: mantém NODE_ENV guard + audit logging.
- Produção: 401 se sem sessão ADMIN.

## Cobertura de Testes

| Categoria | Arquivos | Testes |
|-----------|----------|--------|
| Pricing | 1 | 15 |
| Payment state machine | 1 | 17 |
| Financial security | 1 | 15 |
| Simulated gateway | 1 | 10 |
| Gateway factory | 1 | 9 |
| MercadoPago contract | 1 | 29 |
| Env validation | 1 | 12 |
| Tracking security | 1 | 8 |
| Matching | 1 | 21 |
| History auth | 1 | 21 |
| Notification store | 1 | 18 |
| Session auth | 2 | 25 |
| Payment persistence (DB) | 1 | 14 |
| History integration (DB) | 1 | 21 |
| **Rate limiter (NEW)** | 1 | 12 |
| **Logger sanitize (NEW)** | 1 | 13 |
| **Audit (NEW)** | 1 | 6 |
| **Session hardening (NEW)** | 1 | 8 |
| **Security headers (NEW)** | 1 | 8 |
| **Tracking hardening (NEW)** | 1 | 6 |
| **Webhook hardening (NEW)** | 1 | 4 |
| **Socket hardening (NEW)** | 1 | 12 |
| **TOTAL** | **22** | **296** |

## Resultado do check:full

```
✓ bun run lint (0 errors)
✓ bunx prisma validate
✓ bunx prisma generate
✓ bun run test (296 pass, 0 fail, 847 expect calls)
✓ bun run build (Next.js 16.1.3, 17 rotas)
```

## Regressão Browser (FASE 26)

- ✅ App abre sem erros de console/hidratação.
- ✅ Security headers presentes (X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.).
- ✅ `/api/health` retorna status ok + version + uptime.
- ✅ `/api/health/db` retorna database connected.
- ✅ Cliente + prestador registram (com rate limiting de socket).
- ✅ Cliente solicita Reboque → R$ 180 → matching → prestador aceita.
- ✅ Pagamento aprovado cria PaymentRecord PAID + 2 events.
- ✅ Cliente history sanitizado (sem platformFee, sem providerPayout).
- ✅ Provider history sanitizado (com providerPayout, sem platformFee).
- ✅ Tracking público seguro (sem price, sem platformFee).
- ✅ Rate limiting funciona (3 requests track passam, sob 60/min).
- ✅ Sem erros no console.

## Riscos Restantes

1. **Rate limiting in-memory** — não funciona em multi-instância. Produção precisa Redis ou proxy/WAF.
2. **Admin auth** — rotas admin usam requireRole em produção, mas não há UI de login admin ainda.
3. **MercadoPago** — sem credenciais reais (PIX/CARD lançam erro).
4. **SQLite em produção** — adequado para dev, mas produção precisa PostgreSQL (ver `docs/database-production-plan.md`).
5. **CSP unsafe-inline/unsafe-eval** — necessário para Next.js dev; pode ser refinado em produção com nonces.
6. **Audit buffer in-memory** — perdido em restart. Produção precisa persistir em DB ou log aggregator.

## Próxima Fase Recomendada

- FASE 27: PostgreSQL migration + Redis rate limiting + admin auth UI + log aggregation.
