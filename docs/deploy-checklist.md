# Help Bibi — Deploy Checklist

## Pré-Deploy

### 1. Variáveis de Ambiente Obrigatórias
```env
NODE_ENV=production
DATABASE_URL=file:/app/db/custom.db  # ou postgresql://...
SESSION_SECRET=<64_char_random_string>
PAYMENT_GATEWAY_PROVIDER=simulated    # ou mercado_pago quando homologado
PAYMENT_WEBHOOK_SECRET=<strong_random_string>
NEXT_PUBLIC_APP_URL=https://helpbibi.dominio.com
NEXT_PUBLIC_SOCKET_URL=/
SOCKET_CORS_ORIGIN=https://helpbibi.dominio.com  # comma-separated, sem espaços
```

### 1.1 Validação de Env (src/server/env.ts)
- `SESSION_SECRET` — obrigatório, não pode ser `change_me` em produção
- `DATABASE_URL` — obrigatório
- `PAYMENT_WEBHOOK_SECRET` — obrigatório, não pode ser `dev_webhook_secret_change_me` em produção
- `SOCKET_CORS_ORIGIN` — obrigatório em produção (Socket.IO bloqueia se não configurado)
- `PAYMENT_GATEWAY_PROVIDER=simulated` gera warning em produção (sem pagamentos reais)

### 2. Validações Pré-Deploy
- [ ] `bun run lint` — 0 erros
- [ ] `bunx prisma validate` — schema válido
- [ ] `bunx prisma generate` — Prisma client gerado
- [ ] `bun run build` — build sem erros
- [ ] `.env` configurado com secrets reais (não dev)
- [ ] `SESSION_SECRET` é uma string aleatória de 64+ caracteres
- [ ] `PAYMENT_WEBHOOK_SECRET` é uma string forte

### 3. Docker Build (se aplicável)
```bash
docker compose build
docker compose config  # validar sintaxe
```

## Deploy via Dokploy

### 1. Criar Serviços no Dokploy
- **Serviço 1: App (Next.js)**
  - Source: Dockerfile na raiz
  - Porta interna: 3000
  - Domínio: helpbibi.dominio.com
  - Env: ver lista acima

- **Serviço 2: Rescue Service (Socket.IO)**
  - Source: `mini-services/rescue-service/Dockerfile`
  - Porta interna: 3003
  - Não expor publicamente (interno apenas)
  - Env: `DATABASE_URL`, `NODE_ENV`, `PAYMENT_GATEWAY_PROVIDER`

### 2. Ou usar Docker Compose raw
- Usar `docker-compose.yml` na raiz
- Dokploy roteia porta 3000 via Traefik
- Rescue-service fica na rede interna Docker

### 3. Ordem de Deploy
1. Deploy do rescue-service (porta 3003)
2. Deploy do app (porta 3000)
3. Verificar healthchecks

### 4. Configuração de Rede
- App (3000) → exposto publicamente via Traefik/Dokploy
- Rescue-service (3003) → interno apenas, acessível via Docker network
- Socket.IO: cliente conecta via `/?XTransformPort=3003` (Caddy) ou direto via rede interna (Docker)

### 5. WebSocket / Socket.IO
- Em produção sem Caddy: configurar `NEXT_PUBLIC_SOCKET_URL` para apontar para o rescue-service
- Se usando reverse proxy: garantir que WebSocket upgrade está habilitado
- Traefik: suporta WebSocket nativamente

## Pós-Deploy

### 1. Healthchecks
```bash
curl https://helpbibi.dominio.com/api/health
# Esperado: {"status":"ok","service":"helpbibi-app",...}

curl https://helpbibi.dominio.com/api/health/db
# Esperado: {"status":"ok","db":"connected",...}

# Rescue-service (interno):
curl http://rescue:3003/health
# Esperado: {"ok":true,"name":"Help Bibi",...}
```

### 2. Validações Funcionais
- [ ] Página inicial carrega
- [ ] Login admin funciona com usuário criado exclusivamente por `scripts/bootstrap-admin.ts` (seed legado descontinuado; `[credencial de desenvolvimento removida]`)
- [ ] Cliente pode se registrar
- [ ] Prestador pode se registrar
- [ ] Solicitação de serviço funciona
- [ ] Chat funciona
- [ ] Pagamento simulado funciona
- [ ] Tracking público acessível e seguro (sem dados financeiros)
- [ ] Histórico carrega do banco
- [ ] Notificações aparecem
- [ ] PWA manifest acessível em /manifest.webmanifest
- [ ] GPS/matching funciona (quando permitido)

### 3. Segurança
- [ ] `dbUserId` query param NÃO funciona em produção (NODE_ENV=production)
- [ ] Cookies de sessão são httpOnly + secure
- [ ] Tracking público não expõe: preço, pagamento, taxa, repasse, cupom, providerPaymentId
- [ ] Prestador não vê taxa Help Bibi (platformFee)
- [ ] Admin protegido por role ADMIN
- [ ] Webhook verifica assinatura HMAC

## Rollback

### Se deploy falhar
1. Reverter para imagem anterior no Dokploy
2. Verificar logs: `docker compose logs app`
3. Verificar DB: `docker compose exec app bunx prisma db push`
4. Se DB corrompido: restaurar volume de backup

### Se rescue-service falhar
1. App ainda funciona (sem tempo real)
2. Reiniciar: `docker compose restart rescue`
3. Verificar: `curl http://rescue:3003/health`

## Banco de Dados

### Atual: SQLite
- `DATABASE_URL=file:/app/db/custom.db`
- Volume Docker: `helpbibi-db`
- Adequado para MVP/staging
- **Produção real**: migrar para PostgreSQL

### Migração para PostgreSQL (futuro)
1. Trocar `DATABASE_URL` para `postgresql://user:pass@host:5432/helpbibi`
2. Trocar `provider = "sqlite"` para `provider = "postgresql"` no `prisma/schema.prisma`
3. Rodar `bunx prisma db push`
4. Validar todas as queries

## Pendências

### Mercado Pago
- Adapter criado e blindado (FASE 19.1)
- **Pendente**: homologação real com credenciais sandbox
- Quando pronto: configurar `MERCADO_PAGO_ACCESS_TOKEN` + `MERCADO_PAGO_WEBHOOK_SECRET`
- Trocar `PAYMENT_GATEWAY_PROVIDER=mercado_pago`

### Push Notifications
- Notificações in-app funcionando (FASE 22.3)
- **Pendente**: web push API + service worker
- **Pendente**: push real (Firebase/OneSignal)

### PostgreSQL
- SQLite funciona para MVP
- **Pendente**: migrar para PostgreSQL para produção com múltiplas réplicas

## Portas Internas
| Serviço | Porta | Exposta? |
|---------|-------|----------|
| Next.js app | 3000 | Sim (via Traefik) |
| Rescue-service | 3003 | Não (interno) |
| PostgreSQL (futuro) | 5432 | Não (interno) |
