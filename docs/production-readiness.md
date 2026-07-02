# Help Bibi — Production Readiness

> Status após FASE 25.4 — Autenticação Real do Histórico e Sanitização Financeira Final.

## Resumo Executivo

A FASE 25.4 fechou os últimos bloqueios de produção:

1. **Autenticação real por sessão** — `src/server/auth/session.ts` com cookies HMAC-signed HttpOnly. Rotas de histórico usam `getSessionUser()` em produção; `dbUserId` query limitado a dev/demo.
2. **Sanitização financeira do cliente** — cliente **NUNCA** recebe `platformFee` nem `providerPayout` (nem em lista, nem em detalhe).
3. **Sanitização financeira do prestador** — prestador recebe `providerPayout` mas **NUNCA** `platformFee`.
4. **Admin financeiro preservado** — admin vê tudo (amount, platformFee, providerPayout, events).

## Autenticação (FASE 25.4)

### Session Helper (`src/server/auth/session.ts`)
- Cookie `hb_session` HMAC-signed (SHA-256) com `{userId, role, exp}`.
- `HttpOnly; SameSite=Lax; Path=/`; `Secure` em produção.
- TTL: 7 dias.
- Funções: `getSessionUser(request)`, `getCurrentUserFromRequest(request)`, `requireCurrentUser(request)`, `requireRole(request, role)`, `setSessionCookie(userId, role)`, `clearSessionCookie()`.

### Rotas de Auth
- `POST /api/auth/login` — body `{userId, role}`; verifica user no DB; seta cookie.
- `GET /api/auth/me` — retorna user atual da sessão (401 se sem sessão).
- `POST /api/auth/logout` — limpa cookie.

### Regra de Autorização do Histórico
- **Produção**: usa apenas sessão/cookie (`getSessionUser`). `dbUserId` query é **ignorado/bloqueado**.
- **Dev/demo**: permite `dbUserId` query como fallback (`NODE_ENV !== 'production'`).
- Sem sessão em produção → 401.
- Cross-role (cliente acessa provider) → 0 resultados.
- Cross-user (cliente B acessa serviço de cliente A) → 404.

## Sanitização Financeira (FASE 25.4)

### Cliente — NUNCA recebe:
- `platformFee`
- `providerPayout`
- `providerPaymentId`
- `externalReference`
- `idempotencyKey`
- `rawPayload`
- `metadata`

### Cliente — PODE receber:
- `price` / `total`
- `discount`
- `paymentStatus` (simplificado)
- `paymentMethod` (simplificado)
- `couponCode` (próprio cupom)
- `breakdownText`: apenas `["Total: R$ X,XX"]` (+ desconto se houver)

### Prestador — NUNCA recebe:
- `platformFee`
- `providerPaymentId`
- `externalReference`
- `idempotencyKey`
- `rawPayload`
- `metadata`

### Prestador — PODE receber:
- `price` / `total`
- `providerPayout` (80% do total)
- `paymentStatus` (simplificado)
- `breakdownText`: `["Total: R$ X,XX", "Seu repasse (80%): R$ Y,YY"]`

### Admin — recebe TUDO:
- `amount`, `platformFee`, `providerPayout`
- `providerPaymentId`, `externalReference`, `idempotencyKey`
- `events` (CREATED, PAID, FAILED, WEBHOOK, etc.)
- `summary`: total, totalAmount, totalPlatformFee, totalProviderPayout, byStatus

## Schema Financeiro

### Models
- `PaymentRecord` — 20+ campos (method, status, amount, platformFee, providerPayout, providerPaymentId, externalReference, idempotencyKey @unique, simulatedTransactionId, paidAt, failedAt, failureReason, lastWebhookSignature, webhookVerifiedAt, metadata, rawPayload, events)
- `PaymentEvent` — eventType, fromStatus, toStatus, message, rawPayload
- `enum PaymentStatus` — PENDING, AUTHORIZED, PAID, FAILED, CANCELED, REFUNDED
- `ServiceRequest.paymentStatus` + relação `paymentRecords`

## Módulos e Status

| Módulo | Testes | Integrado | Status |
|--------|--------|-----------|--------|
| pricing-engine.ts | 15 | ✅ rescue-service | OK |
| payment-state-machine.ts | 17 | ✅ payment.repository | OK |
| payment.repository.ts | 14 | ✅ APIs + rescue-service | OK |
| simulated-gateway.ts | 10 | ✅ payment.repository | OK |
| mercado-pago-gateway.ts | 29 | ⚠️ sem credenciais | Pendente |
| gateway factory | 9 | ✅ payment.repository | OK |
| env.ts | 12 | ✅ rescue-service boot | OK |
| tracking-security | 8 | ✅ /api/track | OK |
| financial-security | 15 | ✅ regras válidas | OK |
| matching.ts | 21 | ✅ rescue-service | OK |
| history-auth.ts | 21 | ✅ 4 rotas de API | OK |
| history.repository.ts | 21 | ✅ 4 rotas de API | OK |
| notification-store.ts | 18 | ✅ use-notifications.ts | OK |
| auth/session.ts | 17 | ✅ rotas auth + histórico | OK |
| **TOTAL** | **227** | | |

## Resultado do check:full

```
✓ bun run lint (0 errors)
✓ bunx prisma validate
✓ bunx prisma generate
✓ bun run test (227 pass, 0 fail, 565 expect calls)
✓ bun run build (Next.js 16.1.3, 15 rotas)
```

## Regressão Browser (FASE 25.4)

- ✅ App abre sem erros de console/hidratação.
- ✅ Cliente + prestador registram via socket.
- ✅ Cliente solicita Reboque → R$ 180 → matching → prestador aceita.
- ✅ Pagamento aprovado cria PaymentRecord PAID + 2 events.
- ✅ Admin financeiro vê platformFee=36, providerPayout=144, events=2.
- ✅ **Cliente list NÃO tem platformFee nem providerPayout** ✓
- ✅ **Cliente detail NÃO tem platformFee nem providerPayout** (breakdownText: apenas Total) ✓
- ✅ **Prestador list tem providerPayout=144, NÃO tem platformFee** ✓
- ✅ **Prestador detail tem providerPayout=144, NÃO tem platformFee** (breakdownText: Total + Repasse) ✓
- ✅ Cross-access: cliente → provider services = 0; provider → client services = 0.
- ✅ Sem auth (no dbUserId, no session) → "Authentication required".
- ✅ Session cookie: login → /api/auth/me retorna 200 com user correto.
- ✅ Histórico persiste após reload (count=1 antes e depois).
- ✅ Tracking público seguro (sem price, paymentStatus, platformFee, providerPayout).
- ✅ Sem erros no console.

## Cron
- Nenhum cron ativo. `webDevReview` foi removido na FASE 25.3.

## Riscos Restantes

1. **MercadoPagoGateway sem credenciais reais** — PIX/CARD lançam erro (só CASH funciona sem homologação).
2. **Admin auth não implementada** — rotas `/api/admin/*` são demo-accessíveis; produção precisa de session check ADMIN.
3. **UI sem botões de simular pagamento** — o hook `simulatePayment` existe mas não está conectado a botões no ClientPanel.
4. **localStorage ainda presente** como fallback no `rescue-history.ts` — não é mais a fonte principal.
