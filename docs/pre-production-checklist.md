# Help Bibi - Pre-production Checklist

> Status inicial: Fase 33 aberta em 2026-07-10. Este checklist prepara pre-producao; nao autoriza producao comercial definitiva nem ativacao de servicos reais.

## Infraestrutura
- [ ] Confirmar VPS/Dokploy/Traefik saudaveis antes de qualquer corte.
- [ ] Validar dominios `helpbibi.com` e `www.helpbibi.com`.
- [ ] Validar HTTPS e renovacao Lets Encrypt.
- [ ] Manter `app` em porta interna `3000`.
- [ ] Manter `rescue-service` interno, sem publicacao host `3003:3003`.
- [ ] Documentar plano de rollback de deploy.

## Seguranca
- [ ] Rotacionar `SESSION_SECRET`, `PAYMENT_WEBHOOK_SECRET` e demais secrets antes de uso comercial.
- [ ] Manter `.env` real fora do Git e com permissao restrita na VPS.
- [ ] Revisar CSP, HSTS, X-Frame-Options e demais headers.
- [ ] Revisar rate limits por rota publica, admin e webhook.
- [ ] Confirmar que seed admin fica bloqueado em producao.
- [ ] Executar hardening de acesso SSH/VPS/Dokploy.

## Banco de dados
- [ ] Confirmar PostgreSQL como runtime de pre-producao.
- [ ] Validar migrations ou `prisma db push` conforme estrategia aprovada.
- [ ] Configurar backup automatizado.
- [ ] Testar restore em ambiente separado.
- [ ] Definir retencao de backups.
- [ ] Confirmar que nenhum `.db`, `.sqlite` ou `.bak*` e versionado.

## Autenticacao
- [ ] Validar login/logout de admin real.
- [ ] Criar procedimento seguro de criacao de administradores.
- [ ] Revisar RBAC de admin, cliente e prestador.
- [ ] Validar cookies HttpOnly, SameSite e Secure.
- [ ] Revisar fluxos de recuperacao/rotacao de credenciais.

## Pagamentos
- [ ] Manter `PAYMENT_GATEWAY_PROVIDER=simulated` ate homologacao autorizada.
- [ ] Obter credenciais sandbox do Mercado Pago em fase propria.
- [ ] Validar webhook publico em sandbox antes de qualquer pagamento real.
- [ ] Testar PIX/cartao/cancelamento/estorno/reconciliacao em sandbox.
- [ ] Revisar exposicao de dados financeiros por role.

## Notificacoes/e-mail
- [ ] Definir provedor SMTP definitivo.
- [ ] Configurar DNS de e-mail (SPF, DKIM, DMARC) se aplicavel.
- [ ] Validar templates transacionais.
- [ ] Validar logs e retry de envio.
- [ ] Definir politica para e-mails sensiveis.

## Operacao
- [ ] Atualizar runbook operacional.
- [ ] Definir responsaveis por incidentes.
- [ ] Definir processo de atendimento/suporte.
- [ ] Definir janelas de manutencao.
- [ ] Treinar operadores no painel administrativo real.

## Monitoramento
- [ ] Configurar uptime monitoring para home, `/api/health` e `/api/health/db`.
- [ ] Centralizar logs de app, rescue-service, postgres, redis e Traefik.
- [ ] Configurar alertas de erro, latencia e indisponibilidade.
- [ ] Monitorar uso de CPU, memoria, disco e conexoes.
- [ ] Validar trilhas de auditoria.

## Juridico/LGPD
- [ ] Publicar termos de uso.
- [ ] Publicar politica de privacidade.
- [ ] Mapear dados pessoais coletados.
- [ ] Definir base legal e retencao.
- [ ] Definir canal de solicitacao LGPD.
- [ ] Revisar logs para evitar dados sensiveis desnecessarios.

## Comercial/lance inicial
- [ ] Definir cidade/regiao piloto.
- [ ] Definir prestadores autorizados para piloto.
- [ ] Definir tabela comercial real.
- [ ] Definir processo de onboarding de prestadores.
- [ ] Definir suporte ao cliente final.
- [ ] Definir criterios de go/no-go para producao comercial.
