# Help Bibi — Mercado Pago Sandbox Homologation

> FASE 29 — Guia de preparação para homologação sandbox do Mercado Pago.

## Status

**NÃO HOMOLOGADO** — o adapter está implementado e testado, mas sem credenciais sandbox reais.

## Pré-requisitos

1. Conta no [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel)
2. Credenciais sandbox (não produção)
3. URL pública para webhook (ngrok / Cloudflare Tunnel para teste local)

## Variáveis de Ambiente

```env
PAYMENT_GATEWAY_PROVIDER=mercado_pago
MERCADO_PAGO_ACCESS_TOKEN=sandbox_access_token_here
MERCADO_PAGO_PUBLIC_KEY=sandbox_public_key_here
MERCADO_PAGO_WEBHOOK_SECRET=webhook_signing_secret
PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
PAYMENT_FAILURE_URL=http://localhost:3000/payment/failure
PAYMENT_PENDING_URL=http://localhost:3000/payment/pending
PAYMENT_WEBHOOK_URL=https://your-ngrok-url.com/api/payments/webhook
```

## Como Obter Credenciais Sandbox

1. Acesse https://www.mercadopago.com.br/developers/panel/sandbox
2. Crie uma aplicação
3. Copie `ACCESS_TOKEN` e `PUBLIC_KEY` (sandbox)
4. Configure webhook URL em "Webhooks" → adicione sua URL pública
5. Copie o secret de assinatura do webhook

## Sequência de Teste Sandbox

1. **Configurar envs** com credenciais sandbox
2. **Iniciar app** com `PAYMENT_GATEWAY_PROVIDER=mercado_pago`
3. **Criar serviço** via demo (cliente solicita Reboque)
4. **Criar PaymentRecord** — verifica `provider: 'mercado_pago'` no banco
5. **Simular pagamento PIX** via sandbox MP
6. **Webhook received** — MP envia webhook para sua URL pública
7. **Verificar PaymentRecord** — status deve transitar PENDING→PAID
8. **Verificar PaymentEvent** — deve ter CREATED + PAID events
9. **Testar pagamento recusado** — simular rejeição no sandbox
10. **Verificar PaymentRecord** — status FAILED + failureReason
11. **Testar cancelamento** — admin cancela PENDING
12. **Testar refund** — admin faz refund de PAID
13. **Verificar reconciliação** — `/api/admin/reconcile`

## Eventos Esperados

| Ação MP | Webhook action | Event interno | Status interno |
|---------|---------------|---------------|----------------|
| Pagamento criado | payment_created | PAID | PAID |
| Autorizado | authorized | AUTHORIZED | AUTHORIZED |
| Aprovado | approved | PAID | PAID |
| Rejeitado | rejected | FAILED | FAILED |
| Cancelado | cancelled | CANCELED | CANCELED |
| Estornado | refunded | REFUNDED | REFUNDED |

## Validação de Assinatura

O webhook MP usa assinatura HMAC no formato:
```
id:[data.id];request-id:[x-request-id];ts:[ts];
```

Header: `x-signature: ts=...,v1=...`

O adapter `MercadoPagoGateway.verifyWebhookSignature` valida:
1. Parse do header `x-signature` (ts + v1)
2. Construção do manifest: `id:[dataId];request-id:[reqId];ts:[ts];`
3. HMAC-SHA256 do manifest com `MERCADO_PAGO_WEBHOOK_SECRET`
4. `timingSafeEqual` para comparar (proteção contra timing attacks)

## Verificação de PaymentRecord/PaymentEvent

Após cada webhook:
```sql
SELECT id, status, provider, "providerPaymentId", "externalReference", "paidAt"
FROM "PaymentRecord" WHERE "serviceRequestId" = '...';

SELECT "eventType", "fromStatus", "toStatus", message, "createdAt"
FROM "PaymentEvent" WHERE "paymentRecordId" = '...' ORDER BY "createdAt";
```

## Checklist Antes de Marcar Homologado

- [ ] Credenciais sandbox configuradas e funcionando
- [ ] Webhook URL pública acessível (ngrok/tunnel)
- [ ] Pagamento PIX sandbox aprovado → PaymentRecord PAID + PaymentEvent PAID
- [ ] Pagamento PIX sandbox rejeitado → PaymentRecord FAILED + failureReason
- [ ] Webhook assinatura validada (não aceita assinatura inválida)
- [ ] Webhook duplicado não duplica evento (idempotência via lastWebhookSignature)
- [ ] Cancelamento admin funciona (PENDING→CANCELED)
- [ ] Refund admin funciona (PAID→REFUNDED)
- [ ] Reconciliação não detecta divergências em fluxo normal
- [ ] Admin financeiro mostra dados completos (masking de providerPaymentId)
- [ ] Cliente/prestador/tracking não vazam dados financeiros
- [ ] Logs não contêm access_token nem payload cru

## Riscos de Pagamento Real

1. **Credenciais de produção** — nunca usar sandbox em produção nem vice-versa
2. **Webhook URL** — deve ser HTTPS e acessível publicamente
3. **Idempotência** — webhooks duplicados devem ser idempotentes (já implementado)
4. **Reconciliação** — executar diariamente para detectar divergências
5. **Estorno** — refunds são irreversíveis; validar antes de executar
6. **Disputas** — chargebacks devem ser tratados (status charged_back → REFUNDED)

## FASE 29.1 — Webhook Security Fix

### Problema Corrigido
O `parseWebhookEvent` anterior mapeava `payment_created` → `PAID` e unknown → `AUTHORIZED`, o que era inseguro: webhooks do MP não contêm o status do pagamento, apenas a `action` (evento). Aprovar pagamento baseado apenas em `action` poderia aprovar pagamentos indevidamente.

### Nova Regra (Segura)
**TODOS** os webhooks do MP agora retornam `WEBHOOK_RECEIVED` — nenhum estado é alterado automaticamente.

```typescript
parseWebhookEvent → { event: 'WEBHOOK_RECEIVED', ... }
```

O `processWebhook` no `payment.repository.ts` trata `WEBHOOK_RECEIVED`:
1. Cria um `PaymentEvent` (eventType: WEBHOOK, fromStatus = toStatus = current)
2. Atualiza `lastWebhookSignature` + `webhookVerifiedAt`
3. **NÃO altera o status do PaymentRecord**
4. Marca como "needs reconciliation"

### Como o Status Real é Obtido
O status real do pagamento deve ser obtido via API do MP: `GET /v1/payments/{id}`

O método `getPaymentStatus(providerPaymentId)` foi adicionado ao `MercadoPagoGateway`:
- Sem credenciais reais: retorna `null` (needs reconciliation)
- Com credenciais sandbox: TODO implementar `fetch` real (quando disponível)

### Reconciliação
`reconcilePayments()` agora detecta:
- Webhook recebido sem mudança de status (needs API lookup)
- PENDING >1h
- PAID sem evento PAID
- FAILED >24h
- REFUNDED sem evento REFUNDED

### Cancel/Refund MP — Status
- `cancelPayment()` — **STUB** (throw "Requires MP API")
- `refundPayment()` — **STUB** (throw "Requires MP API")
- `authorizePayment()` — **STUB** (throw "Requires MP API")
- `capturePayment()` — **STUB** (throw "Requires MP API")

Estes métodos precisam de credenciais sandbox reais para implementação. O `SimulatedGateway` tem cancel/refund totalmente implementado e funcional.

### Checklist Atualizado
- [x] Webhook não aprova por `payment.created`
- [x] Webhook desconhecido não altera estado
- [x] `WEBHOOK_RECEIVED` evento registra sem mudar status
- [x] Reconciliação detecta webhook sem status
- [ ] `getPaymentStatus` implementado com API real (pendente sandbox)
- [ ] `cancelPayment` implementado com API real (pendente sandbox)
- [ ] `refundPayment` implementado com API real (pendente sandbox)
