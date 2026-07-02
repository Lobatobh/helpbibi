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
