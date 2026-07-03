# Help Bibi — Payment Operations

> FASE 29 — Operações financeiras: cancelamento, estorno, reconciliação.

## Visão Geral

O sistema financeiro da Help Bibi suporta:
- Criação de PaymentRecord (PENDING) na solicitação de serviço
- Transições de status via state machine (PENDING→AUTHORIZED→PAID, etc.)
- Webhooks idempotentes com verificação de assinatura
- Cancelamento (PENDING/AUTHORIZED → CANCELED)
- Estorno (PAID → REFUNDED)
- Reconciliação automática para detectar divergências
- Auditoria completa via PaymentEvent + AuditLog

## State Machine

```
PENDING → AUTHORIZED → PAID → REFUNDED
PENDING → PAID (PIX aprovado direto)
PENDING → FAILED → PENDING (retry)
PENDING → CANCELED
AUTHORIZED → FAILED
AUTHORIZED → CANCELED
FAILED → AUTHORIZED (retry)
FAILED → CANCELED
```

Terminais: CANCELED, REFUNDED

## Cancelamento

### Quando
- Cliente cancela serviço antes do pagamento
- Admin bloqueia pagamento suspeito
- Prestador não comparece e cliente cancela

### Fluxo
1. Admin/cliente solicita cancelamento
2. `cancelPayment(paymentRecordId, reason)` valida status (PENDING/AUTHORIZED)
3. Se provider não-simulated: chama `gateway.cancelPayment(providerPaymentId)`
4. Transição local: PENDING/AUTHORIZED → CANCELED
5. PaymentEvent CANCELED criado com reason
6. AuditLog registra `payment_failed` (action: cancel)

### Rota
```
POST /api/admin/payments/[id]/cancel
Body: { reason?: string }
```

## Estorno (Refund)

### Quando
- Cliente solicita reembolso após pagamento
- Serviço não concluído mas já pago
- Disputa resolvida a favor do cliente

### Fluxo
1. Admin solicita refund
2. `refundPayment(paymentRecordId, amount?, reason?)` valida status (PAID only)
3. Previne double refund (REFUNDED → throws)
4. Se provider não-simulated: chama `gateway.refundPayment(providerPaymentId, amount, reason)`
5. Transição local: PAID → REFUNDED
6. PaymentEvent REFUNDED criado

### Rota
```
POST /api/admin/payments/[id]/refund
Body: { amount?: number, reason?: string }
```

## Reconciliação

### Quando
- Diariamente (recomendado)
- Após incidentes de webhook
- Antes de fechamento financeiro

### O que detecta
- PENDING >1 hora (provável webhook perdido)
- PAID sem evento PAID (inconsistência)
- FAILED >24h sem retry (pagamento abandonado)
- REFUNDED sem evento REFUNDED (inconsistência)

### Rota
```
GET /api/admin/reconcile
Returns: { issues: ReconciliationIssue[], totalChecked, totalIssues }
```

### Ação
- PENDING >1h: verificar status no gateway, reenviar webhook se necessário
- PAID sem evento: criar evento manualmente ou contactar gateway
- FAILED >24h: decidir retry ou cancel
- REFUNDED sem evento: criar evento de auditoria

## Admin Financeiro

### Dados visíveis (admin)
- status, provider, amount, platformFee, providerPayout
- providerPaymentId (mascarado), externalReference
- idempotencyKey (mascarado)
- eventos completos (eventType, fromStatus, toStatus, message, createdAt)
- paidAt, failedAt, failureReason
- lastWebhookSignature, webhookVerifiedAt

### Dados NUNCA visíveis
- access_token, webhook_secret
- payload cru de webhook (apenas sanitized)
- card_number, cvv, security_code (sanitize removido)

### Sanitização por role
- **Admin**: vê tudo (com masking de IDs sensíveis)
- **Cliente**: vê price, discount, paymentStatus (simplificado) — NUNCA platformFee, providerPayout
- **Prestador**: vê price, providerPayout — NUNCA platformFee
- **Tracking público**: NENHUM dado financeiro
