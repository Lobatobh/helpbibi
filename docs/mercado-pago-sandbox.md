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
