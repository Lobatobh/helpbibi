# Help Bibi - Rollback Plan

> F34-A documental. Este plano nao executa rollback nem altera deploy. Ele define a sequencia segura para retornar a um estado conhecido.

## Objetivo

Reduzir tempo de recuperacao em caso de falha de deploy, configuracao ou release, preservando dados, volumes e secrets.

## Baseline necessario

Antes de qualquer deploy de pre-producao:
- commit aprovado registrado;
- `docker-compose.yml` aprovado no Git;
- `.env` seguro da VPS com backup criptografado;
- backup recente do PostgreSQL;
- health checks publicos conhecidos;
- responsavel pela janela de manutencao definido.

## Tipos de rollback

| Tipo | Quando usar | Acao preferida |
| --- | --- | --- |
| Codigo | Regressao funcional apos deploy | Reimplantar commit anterior aprovado ou usar `git revert` |
| Compose | Erro de roteamento/servico | Restaurar compose aprovado sem tocar em volumes |
| Secret | Secret novo invalido | Reverter valor via cofre seguro durante janela |
| Banco | Migracao ou dados corrompidos | Restaurar backup em ambiente controlado antes de substituir |
| Infra | Traefik/Dokploy instavel | Seguir runbook da VPS, evitando reinicios amplos sem necessidade |

## Procedimento geral

1. Declarar incidente e congelar novas mudancas.
2. Registrar sintomas, horario, commit e servicos afetados.
3. Confirmar se o problema e codigo, compose, secret, banco ou infraestrutura.
4. Executar a menor reversao possivel.
5. Evitar comandos destrutivos.
6. Validar:
   - `https://helpbibi.com`;
   - `/api/health`;
   - `/api/health/db`;
   - `/socket.io/?EIO=4&transport=polling`;
   - containers `app`, `rescue`, `postgres`, `redis`;
   - logs recentes.
7. Registrar resultado e decidir se a janela pode ser encerrada.

## Comandos proibidos sem aprovacao explicita

- `docker compose down` em ambiente com volumes reais.
- `docker system prune`.
- remocao de volumes.
- remocao de banco.
- `git reset --hard`.
- `git clean -fd`.
- qualquer comando que apague `.env`.

## Criterios de aceite

- Rollback retorna a home publica e health checks para estado saudavel.
- Dados e volumes foram preservados.
- Secrets nao foram expostos.
- A causa provavel foi registrada.
- A correcao definitiva foi separada do rollback emergencial.
