# Help Bibi - Secrets Rotation Plan

> F34-A documental. Nunca registrar valores reais neste arquivo. Secrets devem existir apenas no ambiente seguro da VPS/Dokploy ou em cofre aprovado.

## Objetivo

Definir um procedimento seguro para rotacionar credenciais antes de pre-producao e antes de qualquer piloto com dados reais.

## Principios

- Nao commitar `.env`.
- Nao copiar secrets para chats, issues, prints ou documentos.
- Versionar somente `.env.example` com placeholders.
- Manter `.env` da VPS com permissao restrita, por exemplo `chmod 600 .env`.
- Nunca usar `git add .` em servidor.
- Registrar apenas nome do secret, responsavel, data e resultado; nunca o valor.

## Inventario por grupo

Inventario detalhado e runbook operacional:
- `docs/secrets-inventory.md` lista nomes, categorias, sensibilidade, origem esperada, impacto e validacao.
- `docs/secret-rotation-runbook.md` descreve a rotacao futura por grupos, sem executar troca real.

| Grupo | Variaveis esperadas | Estado |
| --- | --- | --- |
| Aplicacao | `SESSION_SECRET` | Precisa rotacao antes de pre-producao real |
| Banco | `POSTGRES_PASSWORD`, `DATABASE_URL`, `POSTGRES_DATABASE_URL` | Precisa controle de acesso e backup |
| Pagamento simulado/webhook | `PAYMENT_GATEWAY_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` | Manter provider simulado ate homologacao |
| Socket/CORS | `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_CORS_ORIGIN` | Confirmar dominio publico definitivo |
| Supabase futuro | Chaves Supabase, se adotado | Nao habilitado |
| SMTP futuro | Host, usuario, senha, remetente | Nao habilitado |
| Provedores externos futuros | APIs de mapas, notificacoes ou antifraude | Nao habilitado |

## Procedimento de rotacao

1. Abrir janela de manutencao curta e avisar responsaveis.
2. Confirmar commit implantado e estado dos containers.
3. Gerar novo secret em ferramenta segura ou diretamente na VPS sem registrar em historico compartilhado.
4. Atualizar somente o `.env` local da VPS/Dokploy.
5. Conferir permissao restrita do arquivo `.env`.
6. Reiniciar apenas o servico necessario, se a aplicacao exigir leitura de env em boot.
7. Validar:
   - home publica;
   - `/api/health`;
   - `/api/health/db`;
   - Socket.IO por `/socket.io`;
   - login/fluxo critico aplicavel.
8. Revogar o secret antigo no provedor de origem.
9. Registrar no log operacional: data, responsavel, nome da variavel, ambiente e resultado.

## Ordem recomendada

1. `SESSION_SECRET`.
2. `PAYMENT_WEBHOOK_SECRET`, mantendo Mercado Pago real desabilitado.
3. Senha do PostgreSQL em janela dedicada, com backup validado antes.
4. Secrets de SMTP quando o provedor for escolhido.
5. Secrets de Supabase se a integracao for aprovada.
6. Demais provedores externos.

## Criterios de aceite

- `.env` segue fora do Git.
- `.env.example` contem apenas placeholders.
- Nenhum valor real aparece em commits, docs ou logs compartilhados.
- Rotacao foi validada por health checks.
- Rollback do secret anterior esta documentado para a janela de manutencao.

## F34-B - Status documental

- Inventario seguro criado em `docs/secrets-inventory.md`.
- Runbook de rotacao futura criado em `docs/secret-rotation-runbook.md`.
- Nenhuma secret real foi lida, exposta ou alterada.
- Rotacao real segue pendente para janela propria.
- Producao comercial continua nao liberada.
