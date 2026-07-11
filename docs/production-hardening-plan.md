# Help Bibi - Production Hardening Plan

> F34-A documental. Este plano registra riscos e controles para pre-producao. Nao altera codigo, infraestrutura, `.env`, Docker, banco, Supabase, Mercado Pago ou SMTP.

## Objetivo

Preparar a Help Bibi para uma passagem controlada de demo publica homologada para pre-producao, sem ativar servicos reais por acidente e sem confundir a demo tecnica aprovada com producao comercial definitiva.

## Escopo

Inclui:
- riscos de seguranca, operacao e continuidade;
- controles minimos antes de pre-producao;
- criterios de aceite por frente;
- dependencias externas ainda nao habilitadas.

Nao inclui:
- alteracao de regra de negocio;
- mudanca em Docker, Traefik, Dokploy ou `.env`;
- deploy;
- integracao real de Supabase, Mercado Pago ou SMTP;
- alteracao de schema, migrations, volumes ou banco.

## Plano de hardening

| Frente | Risco | Controle recomendado | Prioridade | Criterio de aceite |
| --- | --- | --- | --- | --- |
| Secrets | Secrets antigos, fracos ou reaproveitados | Executar plano de rotacao antes de qualquer dado real | Critica | Secrets rotacionados, registrados sem valor e `.env` com permissao restrita |
| Versionamento | `.env` ou banco local entrar no Git por acidente | Manter `.env` ignorado e validar `git ls-files` antes de commit | Critica | `.env` vazio em `git ls-files .env`; apenas `db/.gitkeep` rastreado |
| Pagamentos | Mercado Pago real ativado sem homologacao sandbox | Manter `PAYMENT_GATEWAY_PROVIDER=simulated` ate fase propria | Critica | Sandbox documentado, webhook testado e go/no-go aprovado |
| Banco | Falha sem backup recuperavel | Criar backup automatico e testar restore isolado | Critica | Restore validado em ambiente separado |
| Rollback | Falha de deploy sem retorno rapido | Documentar rollback por commit, compose e `.env` seguro | Critica | Procedimento testado sem apagar volumes |
| Monitoramento | Incidente sem alerta | Monitorar home, `/api/health`, `/api/health/db`, socket e containers | Alta | Alertas configurados e acionaveis |
| Logs | Falta de evidencia para incidentes | Centralizar logs de app, rescue, Traefik, Postgres e Redis | Alta | Logs acessiveis com retencao definida |
| LGPD | Coleta de dados pessoais sem base formal | Publicar termos, politica de privacidade e canal LGPD | Alta | Checklist juridico aprovado antes de piloto real |
| Admin | Acesso administrativo sem processo operacional | Definir criacao, rotacao e bloqueio de admins | Alta | Procedimento de admin real documentado |
| SMTP | E-mails reais sem DNS/seguranca | Homologar provedor SMTP com SPF, DKIM e DMARC | Media | Envio transacional validado em ambiente controlado |
| Supabase | Integracao futura conflitar com PostgreSQL atual | Planejar decisao de arquitetura antes de integrar | Media | Decisao documentada e rollback definido |
| Performance | Carga real degradar atendimento | Executar teste de carga antes de lancamento comercial | Media | Limites e capacidade minima conhecidos |

## Sequencia sugerida

1. Congelar baseline da demo homologada e registrar commit implantado.
2. Rotacionar secrets de pre-producao sem expor valores no Git.
3. Implantar backup automatico e executar restore em ambiente isolado.
4. Configurar monitoramento e alertas basicos.
5. Revisar LGPD, termos, privacidade e responsabilidades do servico.
6. Homologar SMTP em fase propria.
7. Homologar Mercado Pago sandbox em fase propria.
8. Definir se Supabase sera integrado ou se PostgreSQL atual segue como base principal.
9. Rodar smoke publico e checklist de rollback.
10. Aprovar go/no-go para piloto limitado.

## Bloqueios para producao comercial

- Mercado Pago real ainda nao homologado.
- Supabase ainda nao integrado nem decidido como dependencia definitiva.
- SMTP real ainda nao configurado.
- Backups e restores ainda nao testados.
- Monitoramento e alertas ainda pendentes.
- Termos, politica de privacidade e checklist LGPD ainda pendentes.
- Processo formal de rollback ainda precisa de ensaio.
- Admin real e operacao de suporte ainda precisam de validacao.
