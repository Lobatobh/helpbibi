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

### F35-01 - Congelar baseline e criar testes de guarda

Objetivo: garantir que a demo homologada continue funcionando durante a transformacao para MVP.

Entregas:
- checklist de regressao F32 como teste manual obrigatorio;
- testes automatizados focados em entrada cliente/prestador, socket, matching, recusa, aceite, tracking e pos-atendimento;
- criterio de bloqueio: nenhuma mudanca funcional pode quebrar a demo publica.

### F35-02 - Alinhar schema, auth e contas reais

Objetivo: deixar cadastro/login cliente, prestador e admin coerentes com Prisma e sessoes.

Entregas:
- fluxo real de cadastro/login cliente;
- fluxo real de cadastro/login prestador;
- primeiro admin real documentado;
- sessao/RBAC consistentes;
- provider criado como pendente ate aprovacao.

### F35-03 - Persistir ciclo de atendimento completo

Objetivo: fazer request, oferta, aceite, recusa, status, cancelamento, conclusao e timeline usarem o banco como fonte canonica.

Entregas:
- request persistida no inicio;
- timeline persistida em cada transicao;
- provider atual/ocupado persistido ou reconstruivel;
- reentrada apos refresh/relogin;
- idempotencia para eventos duplicados.

### F35-04 - Aprovar prestadores e travar matching real

Objetivo: impedir que prestador nao aprovado receba chamadas reais.

Entregas:
- admin aprova/rejeita prestador;
- provider pendente ve mensagem clara;
- matching considera apenas prestador aprovado, online e livre;
- demo publica preserva comportamento homologado.

### F35-05 - Historico, perfil e avaliacoes persistidos

Objetivo: substituir historico local como fonte principal.

Entregas:
- historico cliente via API;
- historico prestador via API;
- ratings bidirecionais persistidos;
- loyalty basico persistido;
- perfil minimo editavel.

### F35-06 - Pagamento simulado canonico

Objetivo: manter pagamento simulado, mas com trilha financeira consistente.

Entregas:
- criar `PaymentRecord` no ponto correto;
- status financeiro aparece por perfil;
- admin consulta eventos financeiros;
- cancel/refund/reconcile simulados funcionam;
- Mercado Pago real permanece desabilitado.

### F35-07 - Admin operacional minimo

Objetivo: dar ao operador capacidade de acompanhar e destravar o piloto.

Entregas:
- dashboard de ativos, concluidos, pendentes e falhas;
- detalhe de atendimento;
- detalhe de prestador;
- aprovacao/bloqueio;
- auditoria consultavel;
- acoes manuais minimas com registro.

### F35-08 - Notificacoes e chat MVP

Objetivo: tornar comunicacao e avisos confiaveis sem SMTP real.

Entregas:
- chat persistido por service request;
- notificacoes in-app por eventos principais;
- estado de lida/nao lida se necessario;
- reconexao socket refaz estado pelo banco.

### F35-09 - Termos, consentimento e fechamento MVP

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

1. Iniciar F35-01 com testes de guarda da demo homologada.
2. Em seguida, executar F35-02 para alinhar schema/auth/contas reais antes de ampliar fluxo.
3. So depois persistir o ciclo completo de atendimento em F35-03.
4. Manter commits pequenos por modulo.
5. Rodar checklist manual da demo a cada mudanca de fluxo socket ou painel.
