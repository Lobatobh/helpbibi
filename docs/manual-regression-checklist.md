# Help Bibi — Manual Regression Checklist

> Última execução: FASE 26.

## Pré-requisitos
- [ ] `bun run check:full` passa (lint + prisma + test + build)
- [ ] Dev server Next.js na porta 3000
- [ ] rescue-service na porta 3003 (`bun --hot index.ts`)
- [ ] Caddy gateway na porta 81
- [ ] Acessar via `http://localhost:81`
- [ ] Nenhum cron ativo
- [ ] `git ls-files db` mostra apenas `db/.gitkeep`

## 1. Landing Page
- [ ] Página abre sem blank screen
- [ ] Sem erros no console
- [ ] Sem erros de hidratação
- [ ] Footer sticky mobile + desktop

## 2. Security Headers (FASE 26)
- [ ] `X-Content-Type-Options: nosniff` presente
- [ ] `X-Frame-Options: DENY` presente
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` presente
- [ ] `Permissions-Policy` presente
- [ ] `Strict-Transport-Security` presente
- [ ] `Content-Security-Policy` com `frame-ancestors 'none'` presente

## 3. Health Endpoints (FASE 26)
- [ ] `GET /api/health` retorna `{ status: "ok", timestamp, environment, uptime, version }`
- [ ] `GET /api/health/db` retorna `{ status: "ok", database: "connected" }`
- [ ] Health não expõe DATABASE_URL, secrets, hostname, stack traces

## 4. Rate Limiting (FASE 26)
- [ ] `/api/auth/login` — 10/min per IP
- [ ] `/api/payments/webhook` — 30/min per IP
- [ ] `/api/track/[id]` — 60/min per IP
- [ ] `/api/admin/*` — 60/min per IP
- [ ] Exceder limite retorna 429 com `Retry-After` header

## 5. Auth
- [ ] `POST /api/auth/login` seta cookie HttpOnly
- [ ] `GET /api/auth/me` retorna user com cookie / 401 sem cookie
- [ ] `POST /api/auth/logout` limpa cookie
- [ ] Cookie: HttpOnly + SameSite=Lax + Secure (prod)

## 6. Demo — Registro + Serviço
- [ ] Cliente + prestador registram via socket
- [ ] Socket rate limiting: registrar 6x em 1min é bloqueado na 6ª
- [ ] Cliente solicita Reboque → R$ 180
- [ ] Matching: prestador recebe chamada
- [ ] Prestador aceita → serviço accepted

## 7. Pagamento
- [ ] `POST /api/payments/simulate` outcome=success → PaymentRecord PAID + 2 events
- [ ] outcome=failure → PaymentRecord FAILED + failedAt + failureReason
- [ ] Transição inválida rejeitada
- [ ] 403 em produção

## 8. Admin Financeiro
- [ ] `GET /api/admin/payments` retorna lista + summary
- [ ] Admin vê: amount, platformFee, providerPayout, events
- [ ] Produção: sem sessão ADMIN → 401

## 9. Histórico + Sanitização
- [ ] Client list: sem platformFee, sem providerPayout
- [ ] Client detail: sem platformFee, sem providerPayout
- [ ] Provider list: com providerPayout, sem platformFee
- [ ] Provider detail: com providerPayout, sem platformFee
- [ ] Cross-access bloqueado
- [ ] Sem auth → 401

## 10. Tracking Público
- [ ] Sem price, paymentStatus, platformFee, providerPayout
- [ ] Sem client name/phone, plate, chat
- [ ] Rate limit: 60/min per IP

## 11. Socket.IO Hardening (FASE 26)
- [ ] `provider:position` rate limited (10/sec)
- [ ] `chat:send` rate limited (10/10s)
- [ ] `service:request` rate limited (5/min)
- [ ] Payload inválido rejeitado (lat/lng inválido, texto vazio, etc.)

## 12. Chat + Notificações
- [ ] Chat bidirecional
- [ ] Notificações: sino + badge + dedup + marcar lida
- [ ] Chat não notifica remetente

## 13. Responsividade
- [ ] Mobile 375px OK
- [ ] Desktop 1280px OK
- [ ] Footer sticky

## 14. Git Hygiene
- [ ] `git status --short` limpo após testes
- [ ] `git ls-files db` mostra apenas `db/.gitkeep`
- [ ] `git log --all -- 'db/*.db'` vazio

## 15. FASE 29 — Cancel / Refund / Reconcile (Admin)

### 15.1 Cancelamento
- [ ] `POST /api/admin/payments/[id]/cancel` com PENDING → 200 + PaymentRecord CANCELED
- [ ] `POST /api/admin/payments/[id]/cancel` com AUTHORIZED → 200 + PaymentRecord CANCELED
- [ ] `POST /api/admin/payments/[id]/cancel` com PAID → 400 (invalid transition)
- [ ] `POST /api/admin/payments/[id]/cancel` com REFUNDED → 400 (invalid transition)
- [ ] Body `{ reason: "..." }` → reason aparece no message do PaymentEvent CANCELED
- [ ] AuditLog registra `payment_failed` (cancel)

### 15.2 Estorno (Refund)
- [ ] `POST /api/admin/payments/[id]/refund` com PAID → 200 + PaymentRecord REFUNDED
- [ ] `POST /api/admin/payments/[id]/refund` com PENDING → 400 (only PAID can be refunded)
- [ ] `POST /api/admin/payments/[id]/refund` com REFUNDED → 400 (double refund blocked)
- [ ] Body `{ amount: 100 }` → "Refund of R$ 100" aparece no message do PaymentEvent REFUNDED
- [ ] AuditLog registra `payment_invalid_transition` (refund attempt)

### 15.3 Reconciliação
- [ ] `GET /api/admin/reconcile` → 200 com `{ issues, totalChecked, totalIssues }`
- [ ] `totalChecked` bate com número de PaymentRecords no banco
- [ ] PENDING >1h detectado como issue (severity: warning)
- [ ] PAID sem PAID event detectado como issue (severity: error)
- [ ] FAILED >24h detectado como issue (severity: warning)
- [ ] REFUNDED sem REFUNDED event detectado como issue (severity: error)
- [ ] Registros limpos (PAID com evento, CANCELED, etc.) não produzem issues
- [ ] Issues têm shape: `{ paymentRecordId, serviceRequestId, issue, severity, currentStatus, amount }`

## 16. FASE 29 — Mercado Pago Webhook Action Mapping

- [ ] Webhook com `action: "payment_created"` → PaymentRecord transita para PAID
- [ ] Webhook com `action: "approved"` → PaymentRecord transita para PAID
- [ ] Webhook com `action: "paid"` → PaymentRecord transita para PAID
- [ ] Webhook com `action: "authorized"` → PaymentRecord transita para AUTHORIZED
- [ ] Webhook com `action: "rejected"` → PaymentRecord transita para FAILED
- [ ] Webhook com `action: "failure"` → PaymentRecord transita para FAILED
- [ ] Webhook com `action: "cancelled"` → PaymentRecord transita para CANCELED
- [ ] Webhook com `action: "canceled"` (American) → PaymentRecord transita para CANCELED
- [ ] Webhook com `action: "refunded"` → PaymentRecord transita para REFUNDED
- [ ] Webhook com `action: "something_strange"` → fallback AUTHORIZED (admin revisa)
- [ ] Webhook com JSON inválido → 400 (Invalid JSON)
- [ ] Webhook sem `data.id` → 400 (Missing data.id)
- [ ] `webhookId` extraído do body para `rawPayload.webhookId`
- [ ] `action` aparece no `message` do evento
- [ ] `rawPayload` sanitizado (sem `card_number`, `cvv`, `security_code`)

## 17. FASE 29 — Financial Sanitization

### 17.1 Admin view (`PaymentRecordWithEvents`)
- [ ] Admin vê `platformFee`, `providerPayout` (valores reais)
- [ ] Admin vê `providerPaymentId`, `externalReference` (com masking na camada de API)
- [ ] Admin vê `idempotencyKey` (mascarado)
- [ ] Admin vê eventos completos (eventType, fromStatus, toStatus, message, createdAt)

### 17.2 Client view (`HistoryListItem`)
- [ ] Cliente vê `price`, `discount`, `paymentStatus` (simplificado), `paymentMethod`
- [ ] Cliente NÃO vê `platformFee`
- [ ] Cliente NÃO vê `providerPayout`
- [ ] Cliente NÃO vê `providerPaymentId`
- [ ] Cliente NÃO vê `externalReference`

### 17.3 Provider view (`HistoryListItem`)
- [ ] Prestador vê `price`
- [ ] Prestador vê `providerPayout` (80% do price)
- [ ] Prestador NÃO vê `platformFee`
- [ ] Prestador NÃO vê `providerPaymentId` / `externalReference`

### 17.4 Tracking público
- [ ] Tracking não expõe `price`, `originalPrice`, `discount`
- [ ] Tracking não expõe `platformFee`, `providerPayout`
- [ ] Tracking não expõe `paymentStatus`, `paymentMethod`, `paymentRecords`
- [ ] Tracking não expõe `providerPaymentId`, `externalReference`, `idempotencyKey`
- [ ] Tracking não expõe `paidAt`, `failedAt`, `failureReason`, `lastWebhookSignature`, `webhookVerifiedAt`
- [ ] Tracking não expõe `couponCode`, `simulatedTransactionId`
- [ ] `sanitizeTrackingObject` strips ALL financial fields

