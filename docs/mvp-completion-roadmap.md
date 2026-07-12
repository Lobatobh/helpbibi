# Help Bibi - Fase 35 MVP Completion Roadmap

> Status: planejamento funcional. Esta fase nao implementa codigo, nao altera Docker, `.env`, banco, volumes, deploy, Supabase, Mercado Pago real ou SMTP real.

## Objetivo

Transformar a demo publica homologada da Help Bibi em um MVP operacional completo para piloto controlado, preservando a demo F32-006B e priorizando fluxo funcional, persistencia, operacao e seguranca basica.

## Baseline ja pronto e homologado

### Demo publica

- Home publica em `https://helpbibi.com`.
- `https://www.helpbibi.com`.
- `/api/health` e `/api/health/db` validados com 200.
- Socket.IO publico em `/socket.io`.
- Entrada demo cliente/prestador.
- Cliente cria solicitacao.
- Prestador fica online, recebe chamada, aceita, recusa e atualiza status.
- Recusa libera novo ciclo de solicitacao.
- Tracking ao vivo atualiza o cliente.
- Chegada, inicio, conclusao, avaliacao e nova solicitacao apos conclusao.
- Layout pos-atendimento do cliente normalizado.
- `.env` fora do Git.
- `db/.gitkeep` como unico arquivo rastreado em `db`.
- Mercado Pago real nao habilitado.
- Supabase nao integrado.

### Base tecnica existente

- Next.js app com painel publico/demo.
- Rescue-service Socket.IO com matching, ofertas, aceite, recusa, status, tracking, chat e avaliacoes.
- Prisma com modelos para usuario, perfis, solicitacoes, timeline, chat, avaliacoes, tracking share, pagamentos e auditoria.
- APIs existentes para auth, historico cliente/prestador, admin, pagamentos, tracking e health.
- Repositorios server-side para historico, pagamentos, prestadores, ratings, solicitacoes, tracking, usuarios e chat.
- Pagamento simulado com `PaymentRecord` e `PaymentEvent`.
- Admin/API com partes de providers, services, payments, audit, pricing, summary e reconcile.
- Documentacao pre-producao F33/F34-A/F34-B.

## Definicao de MVP funcional

O MVP funcional deve permitir um piloto controlado com usuarios reais limitados, usando pagamentos e notificacoes simulados/operacionais internos, sem liberar producao comercial definitiva.

Deve existir um caminho completo e persistido:

1. Cliente cria conta e entra.
2. Prestador cria conta e aguarda aprovacao.
3. Admin aprova/bloqueia prestador.
4. Prestador aprovado fica disponivel.
5. Cliente solicita atendimento.
6. Sistema oferece a chamada a prestador elegivel.
7. Prestador aceita/recusa.
8. Cliente acompanha status e tracking.
9. Atendimento e concluido/cancelado.
10. Pagamento simulado fica registrado.
11. Cliente e prestador veem historico persistido.
12. Admin acompanha operacao, pagamentos simulados, auditoria e prestadores.

## Pendencias por modulo

### Cliente

Pronto:
- painel demo publico;
- formulario de solicitacao;
- acompanhamento de status;
- tracking ao vivo;
- avaliacao do prestador;
- historico visual/local da demo;
- perfil/loyalty visual.

Falta para MVP:
- cadastro/login real do cliente conectado ao fluxo principal;
- perfil minimo editavel: nome, telefone e email;
- solicitacao persistida como fonte canonica no banco;
- recuperacao de atendimento ativo apos refresh/relogin;
- historico carregado das APIs persistentes, nao apenas de estado local;
- cancelamento com regra clara por status;
- tracking publico/compartilhavel com token quando aplicavel;
- mensagens/chat persistidas por atendimento;
- exibicao clara de pagamento simulado e status financeiro;
- telas de erro para sem prestador, timeout, conexao perdida e atendimento expirado.

### Prestador

Pronto:
- entrada demo;
- alternar online/offline;
- receber oferta;
- aceitar/recusar;
- atualizacao de status;
- tracking de posicao;
- avaliacao do cliente;
- historico/ganhos visual da demo.

Falta para MVP:
- cadastro/login real do prestador;
- onboarding minimo com veiculo, placa, cidade/regiao e telefone;
- bloqueio de disponibilidade ate aprovacao admin;
- persistencia de disponibilidade e atendimento atual;
- recuperacao de estado apos refresh/relogin;
- historico e ganhos carregados do banco;
- regra idempotente para aceitar/recusar oferta antiga;
- validacao de prestador ocupado fora da lista de candidatos;
- tela clara de pendencia/rejeicao de verificacao.

### Admin

Pronto:
- base de painel/admin APIs;
- aprovacao de providers;
- listagem de services/payments/audit em APIs;
- pricing, reconcile e summary existentes;
- auditoria persistente opcional via `AUDIT_LOG_BACKEND=database`.

Falta para MVP:
- validar fluxo de login admin real sem seed em producao;
- criar procedimento funcional para primeiro admin;
- revisar RBAC de todas as rotas admin;
- painel para aprovar/rejeitar prestadores com motivo;
- painel para acompanhar atendimentos ativos e historicos;
- detalhe de atendimento com timeline, cliente, prestador e pagamento simulado;
- operacao manual minima: cancelar atendimento, bloquear prestador e consultar auditoria;
- corrigir qualquer divergencia entre schema Prisma e rotas funcionais antes de ligar fluxos reais;
- checklist de regressao admin no navegador.

### Operacao

Pronto:
- runbooks de pre-producao;
- planos de hardening, rollback, backup/restore, observabilidade e rotacao de secrets;
- demo publica validada.

Falta para MVP:
- definir cidade/regiao piloto;
- definir prestadores autorizados para piloto;
- definir processo de suporte cliente/prestador;
- definir estados operacionais e responsaveis por incidentes;
- definir tabela comercial inicial e politica de cancelamento;
- definir procedimento de abertura/fechamento diario;
- definir criterios de go/no-go do piloto.

### Banco e persistencia

Pronto:
- schema SQLite e schema PostgreSQL;
- modelos para usuarios, perfis, service requests, timeline, chat, ratings, tracking shares, payment records/events e audit logs;
- repositorios para historico, pagamentos, providers, ratings, requests, tracking, users e chat;
- PostgreSQL validado na VPS na Fase 31.

Falta para MVP:
- alinhar schema, Prisma Client e rotas antes de ativar contas reais;
- confirmar campos necessarios para auth, provider onboarding e admin;
- transformar o fluxo socket/demo em fluxo persistido end-to-end;
- garantir idempotencia em request, aceite, recusa, cancelamento e conclusao;
- persistir timeline completa de atendimento;
- persistir chat e ratings de forma canonica;
- recuperar atendimentos ativos apos restart/reconnect;
- definir estrategia de migration para a proxima fase sem mexer agora em banco/volumes.

### Pagamentos

Pronto:
- motor de precificacao;
- metodo PIX/cartao/dinheiro na demo;
- gateway simulado;
- `PaymentRecord` e `PaymentEvent`;
- webhook simulado;
- adapter Mercado Pago preparado, mas nao homologado;
- admin cancel/refund/reconcile local.

Falta para MVP:
- pagamento simulado integrado ao fluxo real persistido;
- status financeiro visivel para cliente, prestador e admin conforme permissao;
- regra de criacao de pagamento no momento correto do atendimento;
- tratamento de falha/cancelamento/reembolso simulado;
- reconciliacao administrativa do pagamento simulado;
- manter Mercado Pago real desabilitado.

### Notificacoes

Pronto:
- atualizacoes via Socket.IO;
- centro visual de notificacoes na demo;
- chat visual/socket.

Falta para MVP:
- notificacoes in-app persistidas ou derivadas de eventos do banco;
- indicador de nao lidas;
- fallback quando socket reconectar;
- mensagens/chat persistidas;
- notificacoes administrativas para prestador pendente/aprovado/rejeitado;
- manter SMTP real fora do MVP inicial.

### Juridico e termos

Pronto:
- checklist LGPD documental;
- riscos principais mapeados em F34-A.

Falta para MVP:
- telas ou links para termos de uso e politica de privacidade;
- aceite minimo de termos no cadastro;
- consentimento claro de localizacao;
- texto de uso de pagamento simulado no piloto;
- politica de cancelamento/reembolso simulada;
- canal de suporte/LGPD documentado;
- revisao juridica antes de producao comercial.

## Ordem recomendada de implementacao

### F35-01 - Fundacao de autenticacao, roles e admin shell

Objetivo: criar a base inicial de autenticacao real sem quebrar a demo publica homologada.

Entregas:
- roles `CLIENT`, `PROVIDER` e `ADMIN` padronizadas;
- login/logout/me com sessao por cookie HMAC;
- hash de senha com `scrypt`, sem senha em texto puro e sem expor `passwordHash`;
- rotas base `/login`, `/cliente`, `/prestador`, `/admin/login` e `/admin`;
- protecao server-side de `/cliente`, `/prestador` e `/admin` por role;
- admin real autenticado por usuario existente, sem cadastro publico de admin;
- seed/bootstrap de admin mantido apenas como etapa controlada futura;
- demo publica preservada sem login obrigatorio.

Nota de banco:
- os schemas Prisma versionados passam a declarar `User.passwordHash`, `User.status`, `ProviderProfile.city` e `ProviderProfile.isDemoProvider`;
- antes de qualquer deploy desta fase, sera obrigatoria uma aplicacao controlada do schema no banco alvo, sem `db push` improvisado em producao.

### F35-02 - Aplicacao controlada do schema e bootstrap do primeiro ADMIN

Objetivo: preparar a atualizacao aditiva do PostgreSQL e a criacao unica do primeiro ADMIN, sem executar qualquer alteracao em banco real nesta etapa.

Entregas:
- diff dos schemas F35-01 classificado por risco e compatibilidade;
- plano controlado com backup, dry-run, janela, verificacao e rollback;
- bootstrap idempotente em `scripts/bootstrap-admin.ts`;
- credenciais recebidas somente por variaveis de ambiente no momento da execucao;
- senha protegida com o mesmo `scrypt` usado pela autenticacao;
- protecao contra segundo ADMIN e contra promocao sem `ADMIN_BOOTSTRAP_ALLOW_PROMOTION=true` e confirmacao explicita;
- testes automatizados sem acesso ao PostgreSQL real.

Gate operacional futuro:
- nenhuma aplicacao na VPS faz parte da F35-02 de preparacao;
- antes do proximo deploy, o plano de `docs/production-readiness.md` deve ser executado em janela aprovada;
- o bootstrap so pode rodar depois da aplicacao e verificacao do schema PostgreSQL.

### F35-03 - Cadastro, analise e aprovacao de prestadores pelo ADM

Objetivo: implementar o fluxo local de prestador pendente, analise administrativa e bloqueio operacional de prestadores nao aprovados, preservando a demo publica homologada.

Entregas:
- cadastro real de prestador cria usuario `PROVIDER` com perfil `PENDING`, sem disponibilidade operacional;
- status operacional do prestador fica separado do `UserStatus` de autenticacao;
- prestador ve no painel protegido seu estado de aprovacao, motivo e bloqueio quando aplicavel;
- ADM lista prestadores, abre detalhes e aprova, rejeita ou suspende com sessao `ADMIN`;
- rejeicao e suspensao exigem motivo;
- alteracoes registram data, administrador responsavel e motivo quando aplicavel;
- APIs administrativas nao aceitam role/status enviados pelo frontend;
- resposta de cadastro e APIs ADM nao expõem `passwordHash`;
- `rescue-service` e matching bloqueiam prestadores pendentes, rejeitados ou suspensos;
- demo publica permanece acessivel e prestadores demo continuam tratados como demo aprovada no runtime publico.

Nota de banco:
- os schemas Prisma versionados passam a declarar `ProviderApprovalStatus`, `ProviderProfile.approvalStatus`, `approvalReviewedAt`, `approvalReviewedById` e `approvalReason`;
- a alteracao e aditiva, mas exige aplicacao controlada do schema antes de qualquer deploy desta fase em ambiente com dados reais;
- nenhum `db push` em PostgreSQL real faz parte da F35-03 local.

### F35-04 - Persistir ciclo de atendimento completo

Objetivo: fazer request, oferta, aceite, recusa, status, cancelamento, conclusao e timeline usarem o banco como fonte canonica.

Entregas:
- request persistida no inicio com evento `request_created`;
- ofertas persistidas por prestador em `ServiceOffer`;
- aceite, recusa e expiracao de oferta registrados;
- status operacional centralizado por helper de ciclo de vida;
- cancelamento com ator, motivo e data;
- timeline persistida com `eventType`, ator e referencia ao prestador quando aplicavel;
- painel ADMIN com lista, filtro, busca e detalhe de servicos;
- detalhe ADMIN com timeline, ofertas, cancelamento, cliente, prestador, datas e pagamento simulado;
- resumo administrativo corrigido para somar taxas em `PaymentRecord`.

Status local F35-04:
- implementacao local preparada;
- schemas Prisma versionados receberam campos aditivos em `ServiceRequest`, metadados em `ServiceTimelineEvent` e o novo modelo `ServiceOffer`;
- nenhum `db push` em PostgreSQL real foi executado;
- antes de qualquer deploy, aplicar schema de forma controlada e validar compatibilidade com dados existentes.

Pendencias que ficam para fases seguintes:
- reentrada completa apos refresh/relogin usando estado ativo reconstruido do banco;
- lock transacional mais forte para aceite concorrente em alta carga;
- reconciliacao online/ocupado como fonte canonica em banco;
- acoes manuais futuras do ADMIN para suporte operacional.

### F35-05 - Consolidar matching real persistido

Objetivo: apos persistir o ciclo de atendimento, reconciliar elegibilidade, ocupacao e disponibilidade usando o banco como fonte canonica.

Entregas:
- matching considera apenas prestador aprovado, online, livre e dentro da regiao de operacao;
- estado online/ocupado e reconstruivel apos restart/reconnect;
- aceite e recusa usam locks/idempotencia contra eventos duplicados;
- prestador suspenso durante operacao perde elegibilidade para novas ofertas;
- demo publica preserva comportamento homologado.

### F35-06 - Historico, chat, avaliacoes e perfis autenticados

Objetivo: substituir historico local como fonte principal e conectar comunicacao, avaliacoes e perfis ao fluxo autenticado.

Entregas:
- historico cliente via API;
- historico prestador via API;
- detalhes com timeline persistida;
- chat persistido por atendimento;
- ratings bidirecionais persistidos;
- perfil minimo editavel.

Status local F35-06:
- rotas de historico cliente/prestador usam somente sessao assinada e ignoram IDs enviados por query/body;
- helper central de participante valida CLIENT contra `ServiceRequest.clientId` e PROVIDER contra `ProviderProfile.userId`;
- `/api/services/[id]/chat` lista e cria mensagens persistidas, com autor derivado da sessao;
- `auth:chat:send` no Socket.IO autenticado persiste a mensagem antes de emitir `auth:chat:new`;
- `/api/services/[id]/ratings` permite avaliacao somente apos `COMPLETED`, deriva o alvo pela sessao e controla duplicidade;
- `/api/client/profile` e `/api/provider/profile` editam somente campos permitidos e nao retornam `passwordHash`;
- paineis autenticados de cliente e prestador exibem historico, detalhe/timeline, chat ativo, avaliacao e perfil;
- nao houve alteracao de schema Prisma, Docker, `.env`, Supabase, Mercado Pago, SMTP, deploy, VPS ou PostgreSQL real.

### F35-07 - Pagamento simulado canonico

Objetivo: manter pagamento simulado, mas com trilha financeira consistente.

Entregas:
- criar `PaymentRecord` no ponto correto;
- status financeiro aparece por perfil;
- admin consulta eventos financeiros;
- cancel/refund/reconcile simulados funcionam;
- Mercado Pago real permanece desabilitado.

### F35-08 - Admin operacional minimo

Objetivo: dar ao operador capacidade de acompanhar e destravar o piloto.

Entregas:
- dashboard de ativos, concluidos, pendentes e falhas;
- detalhe de atendimento;
- detalhe de prestador;
- aprovacao/bloqueio;
- auditoria consultavel;
- acoes manuais minimas com registro.

### F35-09 - Notificacoes MVP

Objetivo: tornar avisos operacionais confiaveis sem SMTP real.

Entregas:
- notificacoes in-app por eventos principais;
- estado de lida/nao lida se necessario;
- reconexao socket refaz estado pelo banco.

### F35-10 - Termos, consentimento e fechamento MVP

Objetivo: preparar piloto com minimo juridico e operacional.

Entregas:
- termos e privacidade publicados como paginas simples;
- aceite de termos no cadastro;
- consentimento de localizacao;
- checklist manual completo;
- registro de go/no-go do MVP.

## Itens que devem continuar simulados por enquanto

- Mercado Pago real.
- Captura real de pagamento PIX/cartao.
- SMTP/e-mail transacional.
- Supabase.
- Verificacao automatica de documentos/KYC.
- APIs externas de mapas/geocoding pagas.
- SMS/WhatsApp/push externo.
- Split/payout real para prestador.
- Backoffice financeiro real.

## Itens para depois, em producao real

- Homologacao Mercado Pago sandbox e depois credenciais reais.
- Politica financeira real: captura, estorno, chargeback, repasse e nota/recibo.
- SMTP real com SPF, DKIM e DMARC.
- Supabase real, somente se a decisao arquitetural for aprovada.
- Backup automatico e restore testado em rotina.
- Monitoramento/alertas produtivos.
- Observabilidade centralizada.
- Testes de carga.
- Suporte operacional formal.
- Revisao juridica completa e termos aprovados.
- App mobile nativo, se entrar no produto.

## Criterios de aceite do MVP funcional

- Demo publica F32-006B continua funcionando.
- Cliente real consegue cadastrar, entrar, solicitar, acompanhar, cancelar/concluir quando permitido, avaliar e consultar historico persistido.
- Prestador real consegue cadastrar, aguardar aprovacao, entrar, ficar online, receber chamada, aceitar/recusar, atualizar status, concluir, avaliar cliente e consultar historico/ganhos persistidos.
- Admin real consegue entrar sem seed de producao, aprovar/rejeitar prestador, acompanhar atendimentos, consultar pagamentos simulados e consultar auditoria.
- Fluxo de atendimento sobrevive a refresh/relogin dos usuarios.
- Banco e APIs persistem request, timeline, chat, ratings e pagamento simulado.
- Pagamento real continua desabilitado, mas pagamento simulado tem trilha de eventos.
- Socket.IO reconecta e reconstrui estado a partir da fonte canonica.
- `.env` permanece fora do Git.
- Nenhum banco local e versionado.
- Supabase, Mercado Pago real e SMTP real continuam fora de escopo.
- Testes automatizados e checklist manual do fluxo MVP passam.
- Documentacao operacional registra que MVP funcional nao equivale a producao comercial definitiva.

## Proximos passos sugeridos

1. Manter F35-01 como baseline de auth/RBAC/admin shell sem quebrar a demo homologada.
2. Concluir a preparacao F35-02 e executar a aplicacao controlada somente em janela aprovada.
3. Em seguida, aplicar o schema da F35-03 em ambiente controlado antes de qualquer deploy com dados reais.
4. Aplicar schema F35-04 em ambiente controlado antes de qualquer deploy com esta fase.
5. Consolidar matching real persistido em F35-05.
6. Manter commits pequenos por modulo.
7. Rodar checklist manual da demo a cada mudanca de fluxo socket ou painel.
