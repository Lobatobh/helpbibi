# Help Bibi — Manual Regression Checklist

> Última execução: FASE 25.4.

## Pré-requisitos
- [ ] `bun run check:full` passa (lint + prisma + test + build)
- [ ] `bunx prisma db push` aplicou o schema (PaymentRecord, PaymentEvent, PaymentStatus)
- [ ] Dev server Next.js na porta 3000 (reiniciado após `prisma generate`)
- [ ] rescue-service na porta 3003 (`bun --hot index.ts`)
- [ ] Caddy gateway na porta 81
- [ ] Acessar via `http://localhost:81`
- [ ] Nenhum cron ativo

## 1. Landing Page
- [ ] Página abre sem blank screen
- [ ] Sem erros no console
- [ ] Sem erros de hidratação
- [ ] Footer sticky mobile + desktop

## 2. Auth (FASE 25.4)
- [ ] `POST /api/auth/login {userId, role}` → seta cookie, retorna user
- [ ] `GET /api/auth/me` → 200 com user (com cookie) / 401 (sem cookie)
- [ ] `POST /api/auth/logout` → limpa cookie
- [ ] Session cookie é HttpOnly + SameSite=Lax
- [ ] Cookie tampering rejeitado (HMAC verificado)

## 3. Demo — Registro + Serviço
- [ ] Cliente + prestador registram via socket
- [ ] Cliente solicita Reboque → R$ 180
- [ ] Matching: prestador recebe chamada
- [ ] Prestador aceita → serviço accepted

## 4. Pagamento (PaymentRecord + PaymentEvent)
- [ ] `POST /api/payments/simulate` outcome=success → PaymentRecord PAID + 2 events
- [ ] `POST /api/payments/simulate` outcome=failure → PaymentRecord FAILED + failedAt + failureReason
- [ ] Transição inválida (PAID→FAILED) rejeitada
- [ ] `/api/payments/simulate` retorna 403 em produção

## 5. Admin Financeiro
- [ ] `GET /api/admin/payments` retorna lista + summary
- [ ] Admin vê: amount, platformFee, providerPayout, events
- [ ] Summary: total, totalAmount, totalPlatformFee, totalProviderPayout, byStatus
- [ ] `POST /api/admin/providers/[id]/approve` atualiza verificação

## 6. Histórico Real no Banco + Sanitização (FASE 25.4 CRÍTICO)
- [ ] `GET /api/client/services` retorna serviços do cliente
- [ ] **Cliente list NÃO tem platformFee** ✓
- [ ] **Cliente list NÃO tem providerPayout** ✓
- [ ] `GET /api/client/services/[id]` retorna detalhe
- [ ] **Cliente detail NÃO tem platformFee** ✓
- [ ] **Cliente detail NÃO tem providerPayout** ✓
- [ ] Cliente detail breakdownText: apenas "Total: R$ X" (sem taxa/repasse)
- [ ] `GET /api/provider/services` retorna atendimentos
- [ ] **Prestador list tem providerPayout** ✓
- [ ] **Prestador list NÃO tem platformFee** ✓
- [ ] `GET /api/provider/services/[id]` retorna detalhe
- [ ] **Prestador detail tem providerPayout** ✓
- [ ] **Prestador detail NÃO tem platformFee** ✓
- [ ] Prestador detail breakdownText: "Total" + "Seu repasse (80%)" (sem taxa)

## 7. Autorização do Histórico (FASE 25.4)
- [ ] Sem sessão + sem dbUserId → 401 "Authentication required"
- [ ] Produção: dbUserId query bloqueado (401)
- [ ] Dev: dbUserId query permitido
- [ ] Cross-access: cliente → provider services = 0
- [ ] Cross-access: provider → client services = 0
- [ ] Cross-user: cliente B → serviço de cliente A = 404
- [ ] Cross-user: prestador B → atendimento de prestador A = 404
- [ ] Histórico persiste após reload

## 8. Tracking Público
- [ ] `GET /api/track/[id]` sem price, paymentStatus, platformFee, providerPayout
- [ ] Sem client name/phone, plate, chat

## 9. Chat + Notificações
- [ ] Chat bidirecional
- [ ] Notificações: sino + badge + dedup + marcar lida
- [ ] Chat não notifica remetente

## 10. Responsividade
- [ ] Mobile 375px OK
- [ ] Desktop 1280px OK
- [ ] Footer sticky
