# Help Bibi - Secrets Inventory

> F34-B documental. Este inventario lista nomes e referencias seguras. Nenhum valor real de `.env` foi lido, copiado, exibido ou alterado.

## Regras deste inventario

- Nunca registrar valores reais neste arquivo.
- Usar placeholders como `<redacted>`, `<generate-new-secret>`, `<provider-generated-value>` e `<not-enabled-yet>`.
- Tratar `.env` real como arquivo local da VPS/Dokploy, fora do Git.
- Usar `.env.example` apenas como modelo seguro.
- Atualizar este inventario quando novas variaveis forem introduzidas no projeto.

## Categorias

- Publica: pode ser exposta no cliente ou em documentacao, mas ainda deve ser revisada.
- Sensivel: influencia operacao/configuracao e nao deve ser exposta sem necessidade.
- Secreta critica: credencial, token, segredo de assinatura ou senha.

## Inventario

| Nome | Categoria | Finalidade | Sensibilidade | Ambientes | Origem esperada | Placeholder seguro | Quando rotacionar | Impacto da rotacao | Validacao pos-rotacao |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `APP_NAME` | App | Nome operacional do projeto. | Publica | Local, staging/demo, producao futura | `.env.example`, Dokploy env opcional | `helpbibi` | Quando renomear o stack | Baixo; afeta identificacao operacional | Conferir logs e documentacao |
| `COMPOSE_PROJECT_NAME` | Docker/Compose | Nome do projeto Compose. | Sensivel | Staging/demo, producao futura | `.env`, Dokploy env | `helpbibi` | Raramente; somente em migracao de stack | Alto; pode criar novo namespace de containers/volumes | Conferir nomes de containers e volumes antes de qualquer deploy |
| `DOCKER_CONFIG` | Docker/Dokploy | Caminho de configuracao Docker em servidor. | Sensivel | VPS/Dokploy | `.env`, ambiente do servidor | `/root/.docker` | Raramente; mudanca de usuario/host | Medio; pode afetar pull/build | Validar acesso Docker/Dokploy sem expor config |
| `NODE_ENV` | App runtime | Define comportamento production/development. | Publica | Local, staging/demo, producao futura | Docker/Compose/Dokploy env | `production` | Nao rotaciona; revisar por ambiente | Critico se incorreto; altera validacoes e seguranca | `/api/health`, logs e validacao de env |
| `PORT` | App runtime | Porta interna do app quando usada pelo servidor Node. | Publica | Local, staging/demo | Ambiente runtime | `3000` | Nao rotaciona | Baixo/medio; pode quebrar roteamento interno | Home e `/api/health` |
| `RESCUE_SERVICE_PORT` | Socket.IO | Porta interna do rescue-service. | Publica | Local, staging/demo, producao futura | Docker/Compose/Dokploy env | `3003` | Nao rotaciona; alterar apenas com roteamento revisado | Alto; pode quebrar Socket.IO | `/socket.io/?EIO=4&transport=polling` |
| `RESCUE_SERVICE_URL` | Socket interno | URL interna usada pelo app para o rescue-service. | Sensivel | Staging/demo, producao futura | Compose/Dokploy env | `http://rescue:3003` | Quando mudar topologia interna | Medio; pode afetar comunicacao app-rescue | Fluxo cliente/prestador e logs |
| `NEXT_PUBLIC_APP_URL` | Publica frontend | URL publica principal da aplicacao. | Publica | Local, staging/demo, producao futura | `.env`, Dokploy env | `https://your-domain.example.com` | Ao trocar dominio | Medio; links publicos podem quebrar | Abrir home e validar links |
| `NEXT_PUBLIC_SOCKET_URL` | Publica frontend | Origem publica usada pelo frontend para Socket.IO. | Publica | Local, staging/demo, producao futura | `.env`, Dokploy env | `https://your-domain.example.com` | Ao trocar dominio ou path publico | Alto; demo pode perder tempo real | `/socket.io` e fluxo de chamada |
| `SOCKET_CORS_ORIGIN` | Socket/CORS | Lista/origem permitida para Socket.IO. | Sensivel | Staging/demo, producao futura | `.env`, Dokploy env | `https://your-domain.example.com` | Ao trocar dominio | Alto; pode bloquear ou abrir CORS indevidamente | Browser demo, logs `connect_error` e polling 200 |
| `DATABASE_URL` | Banco | URL runtime do Prisma/app. | Secreta critica | Local, staging/demo, producao futura | `.env`, Dokploy env, compose derivado | `<redacted>` | Ao trocar senha, host, usuario ou banco | Critico; app pode ficar indisponivel | `/api/health/db`, logs Prisma e smoke app |
| `POSTGRES_DATABASE_URL` | Banco | URL usada pelo schema PostgreSQL/Prisma. | Secreta critica | Local, staging/demo, producao futura | `.env`, Dokploy env, compose derivado | `<redacted>` | Junto de `DATABASE_URL` | Critico; migrations/db push podem falhar | `prisma validate` em fase propria e `/api/health/db` |
| `POSTGRES_PASSWORD` | Banco | Senha do usuario PostgreSQL do stack. | Secreta critica | Staging/demo, producao futura | `.env`, Dokploy env | `<generate-new-secret>` | Antes de dados reais e apos suspeita de exposicao | Critico; exige janela e backup/restore validado | App/rescue healthy e login DB |
| `POSTGRES_USER` | Banco | Usuario PostgreSQL do container. | Sensivel | Local, staging/demo, producao futura | Compose/Dokploy env | `helpbibi` | Raramente; migracao de banco | Alto; altera credenciais e ownership | Health do Postgres e Prisma |
| `POSTGRES_DB` | Banco | Nome do banco PostgreSQL. | Sensivel | Local, staging/demo, producao futura | Compose/Dokploy env | `helpbibi` | Raramente; migracao de banco | Alto; pode apontar para banco vazio | `/api/health/db` e contagem basica controlada |
| `REDIS_URL` | Redis | URL do Redis para rate limit/cache operacional. | Sensivel | Local, staging/demo, producao futura | Compose/Dokploy env | `redis://redis:6379` | Ao trocar host/senha/topologia | Alto se `RATE_LIMIT_BACKEND=redis` | Health app, logs rate-limit e smoke admin/login |
| `RATE_LIMIT_BACKEND` | Seguranca | Backend de rate limiting. | Publica | Local, staging/demo, producao futura | `.env`, Dokploy env | `redis` | Nao rotaciona; revisar por ambiente | Alto se voltar para `memory` em producao | Logs de validacao de env |
| `AUDIT_LOG_BACKEND` | Auditoria | Define persistencia de auditoria. | Publica | Local, staging/demo, producao futura | `.env`, Dokploy env | `database` | Nao rotaciona; revisar por ambiente | Medio/alto; auditoria pode ser perdida se `memory` | Gerar evento admin e consultar auditoria |
| `SESSION_SECRET` | Sessao/app | Assinatura de cookie/sessao. | Secreta critica | Local, staging/demo, producao futura | `.env`, Dokploy env | `<generate-new-secret>` | Antes de pre-producao real, incidente, troca de operador | Alto; invalida sessoes existentes | Login/logout, cookie e `/api/auth/me` |
| `ADMIN_SEED_ENABLED` | Admin | Habilita seed admin apenas em dev. | Sensivel | Local/dev | `.env` local | `false` em producao | Nao rotaciona; garantir falso em producao | Critico se ligado em producao | Login admin seed deve ser bloqueado em production |
| `ADMIN_EMAIL` | Admin futuro | E-mail para criacao manual/script de admin real. | Sensivel | Producao futura | Shell seguro ou cofre, nao persistir em Git | `<redacted>` | Quando admin responsavel mudar | Baixo/medio; afeta criacao de usuario admin | Usuario admin criado e auditable |
| `PAYMENT_GATEWAY_PROVIDER` | Pagamento | Seleciona gateway (`simulated`, futuro `mercado_pago`). | Publica | Local, staging/demo, producao futura | `.env`, Dokploy env | `simulated` | Nao rotaciona; alterar so em fase de homologacao | Critico; pode ativar gateway real | Testes sandbox e logs de pagamento |
| `PAYMENT_WEBHOOK_SECRET` | Pagamento simulado/webhook | Segredo de assinatura para webhook simulado. | Secreta critica | Local, staging/demo, producao futura | `.env`, Dokploy env | `<generate-new-secret>` | Antes de pre-producao real e apos suspeita de exposicao | Alto; webhooks simulados podem falhar | Webhook simulado e assinatura HMAC |
| `MERCADO_PAGO_ACCESS_TOKEN` | Mercado Pago futuro | Token privado da API Mercado Pago. | Secreta critica | Sandbox futuro, producao comercial futura | Dashboard Mercado Pago/cofre/Dokploy env | `<provider-generated-value>` | Conforme politica do provedor, incidente ou troca de ambiente | Critico; pagamentos/reconciliacao falham | Sandbox: criar pagamento e reconciliar |
| `MERCADO_PAGO_PUBLIC_KEY` | Mercado Pago futuro | Chave publica do Mercado Pago para frontend/checkout futuro. | Publica | Sandbox futuro, producao comercial futura | Dashboard Mercado Pago/Dokploy env | `<provider-generated-value>` | Ao trocar aplicacao/ambiente MP | Medio; checkout pode falhar | Fluxo sandbox de checkout |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Mercado Pago futuro | Segredo de assinatura de webhook Mercado Pago. | Secreta critica | Sandbox futuro, producao comercial futura | Dashboard Mercado Pago/cofre/Dokploy env | `<provider-generated-value>` | Ao recriar webhook, incidente ou troca de ambiente | Critico; webhooks podem ser rejeitados | Webhook sandbox com assinatura valida |
| `PAYMENT_SUCCESS_URL` | Mercado Pago futuro | URL de retorno para pagamento aprovado. | Publica | Sandbox futuro, producao comercial futura | `.env`, provedor/Dokploy env | `<provider-generated-value>` | Ao trocar dominio/checkout | Medio; retorno de usuario falha | Checkout sandbox aprovado |
| `PAYMENT_FAILURE_URL` | Mercado Pago futuro | URL de retorno para falha de pagamento. | Publica | Sandbox futuro, producao comercial futura | `.env`, provedor/Dokploy env | `<provider-generated-value>` | Ao trocar dominio/checkout | Medio; retorno de usuario falha | Checkout sandbox recusado |
| `PAYMENT_PENDING_URL` | Mercado Pago futuro | URL de retorno para pagamento pendente. | Publica | Sandbox futuro, producao comercial futura | `.env`, provedor/Dokploy env | `<provider-generated-value>` | Ao trocar dominio/checkout | Medio; retorno de usuario falha | Checkout sandbox pendente |
| `PAYMENT_WEBHOOK_URL` | Mercado Pago futuro | URL publica cadastrada no provedor para webhooks. | Publica | Sandbox futuro, producao comercial futura | Dashboard Mercado Pago | `<provider-generated-value>` | Ao trocar dominio/rota publica | Alto; eventos deixam de chegar | Webhook sandbox recebido |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase futuro | URL publica do projeto Supabase se adotado. | Publica | Futuro | Dashboard Supabase/Dokploy env | `<not-enabled-yet>` | Ao trocar projeto Supabase | Alto se Supabase virar dependencia | Health/auth Supabase em fase propria |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase futuro | Chave anon publica para cliente Supabase. | Publica | Futuro | Dashboard Supabase/Dokploy env | `<not-enabled-yet>` | Rotacao conforme politica Supabase | Alto se auth/storage depender disso | Login/queries permitidas em sandbox |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase futuro | Chave privilegiada servidor. | Secreta critica | Futuro servidor apenas | Dashboard Supabase/cofre/Dokploy env | `<not-enabled-yet>` | Incidente, troca de projeto ou politica | Critico; acesso total ao projeto | Rotas server-side Supabase e logs |
| `SUPABASE_JWT_SECRET` | Supabase futuro | Segredo de JWT, se precisar validar tokens diretamente. | Secreta critica | Futuro servidor apenas | Dashboard Supabase/cofre | `<not-enabled-yet>` | Apenas com plano de migracao de auth | Critico; invalida tokens | Login, refresh e validacao JWT |
| `SMTP_HOST` | SMTP futuro | Host do provedor de e-mail. | Sensivel | Futuro | Provedor SMTP/Dokploy env | `<not-enabled-yet>` | Troca de provedor | Medio; e-mails falham | Envio transacional sandbox |
| `SMTP_PORT` | SMTP futuro | Porta SMTP. | Publica | Futuro | Provedor SMTP/Dokploy env | `<not-enabled-yet>` | Troca de provedor | Baixo/medio | Envio transacional sandbox |
| `SMTP_USER` | SMTP futuro | Usuario SMTP. | Sensivel | Futuro | Provedor SMTP/cofre/Dokploy env | `<not-enabled-yet>` | Troca de credencial | Medio/alto | Envio transacional sandbox |
| `SMTP_PASSWORD` | SMTP futuro | Senha/token SMTP. | Secreta critica | Futuro | Provedor SMTP/cofre/Dokploy env | `<not-enabled-yet>` | Incidente, troca de provedor ou politica | Alto; e-mails falham | Envio transacional sandbox |
| `SMTP_FROM` | SMTP futuro | Remetente transacional. | Publica | Futuro | Provedor SMTP/Dokploy env | `<not-enabled-yet>` | Troca de dominio/remetente | Medio; deliverability falha | Recebimento e SPF/DKIM/DMARC |
| `SMTP_SECURE` | SMTP futuro | Define TLS/SSL do envio SMTP. | Publica | Futuro | Provedor SMTP/Dokploy env | `<not-enabled-yet>` | Troca de provedor | Medio; envio pode falhar | Envio transacional com TLS |
| `MAPS_API_KEY` | API externa futura | API de mapas/geocoding se adotada. | Secreta critica | Futuro | Provedor/cofre/Dokploy env | `<not-enabled-yet>` | Incidente, abuso, troca de provedor | Alto; tracking/rotas podem falhar | Fluxo de localizacao em sandbox |
| `NOTIFICATION_PROVIDER_API_KEY` | API externa futura | Push/SMS/WhatsApp se adotado. | Secreta critica | Futuro | Provedor/cofre/Dokploy env | `<not-enabled-yet>` | Incidente, abuso, troca de provedor | Alto; notificacoes falham | Envio sandbox e logs |

## Observacoes F34-B

- `DATABASE_URL`, `POSTGRES_DATABASE_URL`, `REDIS_URL`, `RESCUE_SERVICE_URL`, `POSTGRES_USER` e `POSTGRES_DB` podem ser derivados pelo Compose em staging/demo; ainda assim devem ser tratados como inventario operacional.
- `PAYMENT_GATEWAY_PROVIDER` deve permanecer `simulated` ate homologacao sandbox autorizada.
- Variaveis Supabase, SMTP e APIs externas estao documentadas como futuras e nao habilitadas.
- Nenhum valor real foi verificado. A conferencia de valores deve acontecer apenas na VPS/Dokploy, em janela propria, sem imprimir secrets.
