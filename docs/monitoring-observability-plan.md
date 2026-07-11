# Help Bibi - Monitoring and Observability Plan

> F34-A documental. Este plano nao instala ferramentas nem altera infraestrutura.

## Objetivo

Definir o minimo de observabilidade necessario para pre-producao, permitindo detectar indisponibilidade, falhas de banco, problemas de socket e regressao de fluxo publico.

## Sinais essenciais

| Sinal | Fonte | Alerta minimo |
| --- | --- | --- |
| Home publica | `https://helpbibi.com` | HTTP diferente de 200 |
| Health app | `/api/health` | HTTP diferente de 200 |
| Health banco | `/api/health/db` | HTTP diferente de 200 ou status desconectado |
| Socket.IO | `/socket.io/?EIO=4&transport=polling` | HTTP diferente de 200 |
| App logs | Container `app` | Erros repetidos ou crash |
| Rescue logs | Container `rescue` | Erros de socket, matching ou tracking |
| PostgreSQL | Container/banco | Falha de conexao, disco, restart |
| Redis | Container/cache | Falha de conexao ou restart |
| Traefik | Proxy | 4xx/5xx anormais e falha TLS |
| VPS | Host | CPU, memoria, disco e rede |

## Logs minimos

- App Next.js: erros de rota, health e autenticacao.
- Rescue-service: conexao socket, matching, aceite, recusa, tracking e encerramento.
- Traefik: roteamento, TLS, status HTTP e erros.
- PostgreSQL: conexoes, erros e restart.
- Redis: restart, memoria e erros.

## Alertas recomendados

- Home indisponivel por mais de 2 minutos.
- `/api/health/db` falhando por mais de 1 minuto.
- Socket.IO polling falhando por mais de 1 minuto.
- Container reiniciando repetidamente.
- Disco da VPS acima de 80%.
- Falha no job de backup.
- Erros 5xx acima do baseline.

## Evidencias operacionais

Para cada incidente, registrar:
- data e hora;
- endpoint ou servico afetado;
- commit implantado;
- logs relevantes sem secrets;
- acao tomada;
- resultado dos health checks;
- necessidade de follow-up.

## Criterios de aceite

- Existe monitor externo para home e health checks.
- Existe alerta acionavel para app, banco e socket.
- Logs podem ser consultados sem expor secrets.
- Falhas de backup geram notificacao.
- Existe responsavel por responder alertas em pre-producao.

## Pendencias

- Escolher ferramenta de uptime monitoring.
- Definir retencao de logs.
- Definir canal de alerta.
- Configurar dashboard de recursos da VPS.
- Definir processo de revisao semanal de incidentes.
