# Help Bibi - Secret Rotation Runbook

> F34-B documental. Este runbook descreve rotacao futura. Nao executar estes passos sem janela aprovada, backup validado e responsavel definido.

## Escopo

Inclui:
- preparacao segura;
- backup seguro do `.env` fora do Git;
- geracao de novos valores;
- aplicacao controlada por grupo;
- validacoes;
- rollback;
- registro operacional.

Nao inclui:
- rotacao real nesta fase;
- leitura ou exposicao do `.env` real;
- troca de senha de banco;
- habilitacao de Supabase, Mercado Pago ou SMTP real;
- alteracao de Docker, Traefik, banco, volumes, deploy ou codigo.

## Preparacao obrigatoria

1. Confirmar o commit implantado e o commit alvo.
2. Confirmar que a janela de manutencao foi aprovada.
3. Confirmar backup recente do PostgreSQL.
4. Confirmar que existe restore testado ou plano de restore aprovado.
5. Confirmar acesso ao Dokploy/VPS e ao provedor externo aplicavel.
6. Criar backup criptografado do `.env` fora do Git.
7. Registrar responsavel, horario de inicio e variaveis que serao rotacionadas.
8. Garantir que nenhum comando exibira valores de `.env` em terminal compartilhado, logs ou prints.

## Comandos perigosos proibidos sem autorizacao explicita

- `docker compose down`;
- remocao de volumes;
- `docker system prune`;
- `git reset --hard`;
- `git clean`;
- remocao ou recriacao de banco;
- copia, print, cat ou upload do `.env` real;
- exposicao de secrets em logs, tickets, chats ou prints.

## Validacoes base antes da rotacao

- Home publica responde 200.
- `/api/health` responde 200.
- `/api/health/db` responde 200.
- `/socket.io/?EIO=4&transport=polling` responde 200.
- Containers `app`, `rescue`, `postgres` e `redis` estao saudaveis.
- Logs recentes nao mostram erros novos.
- `git status --short` nao contem `.env` staged.

## Grupo A - Secrets de sessao/app

Variaveis:
- `SESSION_SECRET`;
- `PAYMENT_WEBHOOK_SECRET`, quando usado pelo gateway simulado;
- `ADMIN_SEED_ENABLED`, apenas para garantir `false` em producao;
- `NODE_ENV`, apenas para confirmar `production`.

Procedimento futuro:
1. Gerar novo `SESSION_SECRET` com pelo menos 64 caracteres aleatorios.
2. Gerar novo `PAYMENT_WEBHOOK_SECRET` se a janela incluir webhooks simulados.
3. Atualizar somente o `.env` da VPS/Dokploy.
4. Reiniciar/recriar o minimo necessario para `app` e `rescue` lerem as novas envs.
5. Validar login/logout e que sessoes antigas foram invalidadas conforme esperado.
6. Validar `/api/health`, `/api/health/db` e fluxo demo cliente/prestador.

Impacto esperado:
- usuarios autenticados podem precisar fazer login novamente;
- webhooks assinados com segredo antigo podem falhar apos o corte.

Rollback:
- restaurar o backup criptografado do `.env` da janela;
- reiniciar somente os servicos afetados;
- validar health checks novamente.

## Grupo B - Banco Postgres

Variaveis:
- `POSTGRES_PASSWORD`;
- `DATABASE_URL`;
- `POSTGRES_DATABASE_URL`;
- `POSTGRES_USER`;
- `POSTGRES_DB`.

Procedimento futuro:
1. Confirmar backup e restore testado antes da janela.
2. Gerar nova senha do usuario PostgreSQL.
3. Alterar senha no banco de forma controlada.
4. Atualizar `POSTGRES_PASSWORD` e URLs derivadas no `.env`/Dokploy.
5. Reiniciar o minimo necessario para `app` e `rescue`.
6. Validar conexao do app, rescue e health DB.

Impacto esperado:
- erro de autenticacao no banco se app/rescue e Postgres ficarem fora de sincronia;
- janela deve ser curta e com rollback preparado.

Rollback:
- restaurar senha anterior no banco e `.env` seguro;
- reiniciar servicos afetados;
- validar `/api/health/db`.

## Grupo C - Webhook de pagamento

Variaveis:
- `PAYMENT_GATEWAY_PROVIDER`;
- `PAYMENT_WEBHOOK_SECRET`;
- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_PUBLIC_KEY`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `PAYMENT_SUCCESS_URL`;
- `PAYMENT_FAILURE_URL`;
- `PAYMENT_PENDING_URL`;
- `PAYMENT_WEBHOOK_URL`.

Procedimento futuro:
1. Manter `PAYMENT_GATEWAY_PROVIDER=simulated` ate fase sandbox aprovada.
2. Para sandbox Mercado Pago, obter credenciais no dashboard do provedor.
3. Registrar somente nomes das credenciais, nunca valores.
4. Atualizar envs no ambiente sandbox/pre-producao autorizado.
5. Cadastrar `PAYMENT_WEBHOOK_URL` no dashboard.
6. Validar pagamento sandbox, webhook assinado, cancelamento, refund e reconciliacao.

Impacto esperado:
- webhooks antigos podem falhar apos troca de secret;
- trocar provider pode alterar fluxo financeiro.

Rollback:
- voltar `PAYMENT_GATEWAY_PROVIDER=simulated`;
- restaurar secrets anteriores do ambiente sandbox;
- desativar webhook novo no provedor se necessario.

## Grupo D - Supabase futuro

Variaveis propostas:
- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_JWT_SECRET`.

Procedimento futuro:
1. Criar plano de integracao Supabase antes de configurar secrets.
2. Separar projeto sandbox/staging de producao.
3. Inserir chaves apenas em Dokploy/cofre, nunca no Git.
4. Validar auth/RLS/storage/realtime em fase propria.

Impacto esperado:
- service role exposto compromete o projeto inteiro;
- rotacao de JWT pode invalidar sessoes/tokens.

Rollback:
- desabilitar dependencia Supabase no ambiente de teste;
- restaurar secrets anteriores pelo cofre;
- validar que a aplicacao volta ao PostgreSQL atual, se aplicavel.

## Grupo E - SMTP futuro

Variaveis propostas:
- `SMTP_HOST`;
- `SMTP_PORT`;
- `SMTP_USER`;
- `SMTP_PASSWORD`;
- `SMTP_FROM`;
- `SMTP_SECURE`.

Procedimento futuro:
1. Escolher provedor SMTP.
2. Configurar SPF, DKIM e DMARC antes de envio real.
3. Gerar credencial SMTP dedicada ao ambiente.
4. Atualizar Dokploy/env sem registrar valores.
5. Enviar e-mail transacional de teste em sandbox.
6. Monitorar bounce, spam e logs sem dados sensiveis.

Impacto esperado:
- troca de senha pode interromper e-mails;
- remetente sem DNS correto prejudica entrega.

Rollback:
- restaurar credencial anterior no provedor;
- retornar envs anteriores;
- pausar envio real ate nova validacao.

## Grupo F - APIs externas futuras

Variaveis propostas:
- `MAPS_API_KEY`;
- `NOTIFICATION_PROVIDER_API_KEY`;
- outras chaves criadas por provedores futuros.

Procedimento futuro:
1. Definir provedor e escopo minimo da chave.
2. Criar chave por ambiente, com limites de uso e dominios/IPs permitidos.
3. Inserir chave apenas em cofre/Dokploy.
4. Validar fluxo sandbox.
5. Configurar alerta de uso anormal.

Impacto esperado:
- rotacao pode interromper mapas, geocoding, push, SMS ou WhatsApp;
- abuso de chave pode gerar custo.

Rollback:
- restaurar chave anterior se ainda segura;
- bloquear chave comprometida no provedor;
- reduzir escopo/limites antes de reativar.

## Registro no worklog operacional

Registrar apenas:
- data e hora;
- responsavel;
- ambiente;
- grupo rotacionado;
- nomes das variaveis;
- servicos reiniciados;
- validacoes executadas;
- resultado e pendencias.

Nunca registrar:
- valores antigos;
- valores novos;
- prints de `.env`;
- tokens parciais;
- URLs contendo usuario/senha.

## Criterios de aceite

- Nenhuma secret foi impressa.
- `.env` continuou fora do Git.
- Health checks passaram depois da janela.
- Fluxo critico da demo/pre-producao foi validado.
- Rollback ficou disponivel ate a janela ser encerrada.
- Worklog operacional registrou nomes de variaveis, sem valores.
