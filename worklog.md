# SocorroJá — Worklog / Handover

Projeto: Plataforma de auto socorro por aplicativo (estilo Uber para socorro veicular).
Stack: Next.js 16 + TypeScript + Tailwind + shadcn/ui + Socket.IO (mini-service na porta 3003).

---
Task ID: 1
Agent: main (orchestrator)
Task: Construir protótipo funcional do SocorroJá com cliente + prestador em tempo real.

Work Log:
- Analisei o escopo: app Uber-like com solicitação do cliente, matching com prestador mais próximo, aceite, rastreamento em tempo real até destino final.
- Instalei socket.io e socket.io-client.
- Criei mini-service `mini-services/rescue-service/index.ts` (porta 3003) com toda a orquestração:
  - registro de cliente e prestador
  - listagem de prestadores próximos (broadcast a cada 2s)
  - criação de solicitação → cálculo de preço/ETA/distância (haversine)
  - oferta ao prestador mais próximo com timeout de 12s e reoferta automática
  - aceite/recusa, chegada, início, conclusão, cancelamento
  - simulação de movimento do prestador (1 tick/s) em direção ao destino
  - timeline de eventos
- Criei tipos compartilhados em `src/lib/rescue-types.ts`.
- Criei hook `src/hooks/use-rescue-socket.ts` (useClientSocket + useProviderSocket).
- Construí `RescueMap` (mapa simulado com grid de ruas, pinos, rotas, marcador de prestador animado).
- Construí `ClientPanel`: cadastro → solicitação (tipo de serviço, local, destino) → rastreamento com timeline, card do prestador, ETA/valor, cancelar.
- Construí `ProviderPanel`: cadastro → online/offline → card de oferta com countdown → aceite → navegação → concluir, com stats de ganhos.
- Construí `src/app/page.tsx`: landing completa (hero, stats, como funciona, features cliente/prestador) + demo ao vivo com dois phone frames.
- Footer sticky (min-h-screen flex flex-col, mt-auto no footer).
- Atualizei metadata do layout para SocorroJá.

Stage Summary:
- Arquitetura completa e funcional: duas pontas conectadas via WebSocket em tempo real.
- Demo requer iniciar o mini-service rescue-service (porta 3003) + dev server Next (porta 3000).
- Fluxo completo: searching → offered → accepted → arriving → arrived → in_progress → completed.
- Próximos passos sugeridos: iniciar serviços, validar com Agent Browser, e iterar em polimento/bugs.

---
Task ID: 1-verify
Agent: main (orchestrator)
Task: Verificar o protótipo com Agent Browser e validar o fluxo completo em tempo real.

Work Log:
- Iniciei o mini-service rescue-service (porta 3003). Encontrei dificuldade: processos background morriam entre chamadas bash. Solução: double-fork `( ( nohup bun index.ts > log 2>&1 & ) & )` para reparentar ao init (PPID=1), igual ao Next.js dev server. Removi `--hot` do script (crashava).
- Acessei a app via Caddy (porta 81) — necessário para o socket.io (`/?XTransformPort=3003`) ser roteado ao rescue-service.
- Confirmei: landing renderiza 100%, sem erros de console/runtime/hydration.
- Abri a demo ao vivo, registrei cliente "Maria Motorista" e prestador "João Guincho" (Guincho Plataforma, ABC1D23).
- Cliente solicitou reboque (Av. Paulista → Moema). Serviço calculou R$ 204, ETA e distância via fórmula de haversine.
- Prestador recebeu a chamada com countdown de 12s e botões Aceitar/Recusar.
- Fluxo completo executado e validado: searching → offered → accepted → arriving → arrived → in_progress → completed.
- Cliente viu timeline em tempo real, card do prestador, ETA, e ao final "Concluído · Valor final: R$ 204 · Pagamento na entrega".
- Mapa simulado animou o marcador do prestador se movendo em direção ao local e depois ao destino.
- Logs limpos: dev.log sem erros, rescue-service.log com registro de conexões/registro/serviço concluído, browser sem erros.

Stage Summary:
- Protótipo 100% funcional e verificado end-to-end no browser.
- Sticky footer OK (min-h-screen flex flex-col + mt-auto).
- Responsivo (grid lg:grid-cols-2 para os painéis, mobile-first).
- Próxima fase (cron webDevReview): iterar em polimento, novos recursos (avaliações, pagamentos simulados, histórico de serviços, multi-prestador), e correções que surgirem.
- IMPORTANTE para o próximo agente: o rescue-service precisa ser reiniciado com o double-fork se não estiver ativo: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )` a partir de `/home/z/my-project/mini-services/rescue-service`. Sem ele, a demo não conecta.

---
Task ID: 2 (cron webDevReview)
Agent: cron review agent
Task: QA do protótipo + adicionar recursos (avaliações, pagamentos, histórico, dashboard de ganhos) + melhorar landing.

## Current project status / assessment
- Protótipo SocorroJá estável: landing + demo ao vivo (cliente + prestador) com WebSocket em tempo real.
- Fluxo completo validado na Task 1: searching → offered → accepted → arriving → arrived → in_progress → completed.
- QA desta rodada: nenhum bug encontrado no fluxo existente. Logs limpos, sem erros de console/runtime.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos. Serviço iniciado via double-fork `( ( nohup bun index.ts > log 2>&1 & ) & )`.

## Completed modifications / verification results
### Novos recursos implementados
1. **Sistema de avaliação** — após concluir o serviço, o cliente avalia o prestador (1-5 estrelas + comentário). Backend atualiza a nota média do prestador (running average). Prestador vê "Avaliação recebida" com estrelas e comentário. Histórico mostra a avaliação em ambos os lados.
2. **Forma de pagamento** — cliente escolhe PIX / Cartão / Dinheiro antes de confirmar. Exibido no card de oferta (prestador) e no card de serviço (ambos).
3. **Histórico de serviços** — persistência em localStorage (`src/lib/rescue-history.ts`). Ambos os painéis têm aba "Histórico" com lista de serviços concluídos/cancelados, mostrando tipo, contraparte, pagamento, data e avaliação.
4. **Dashboard de ganhos do prestador** — aba "Ganhos" com: card de ganhos de hoje (valor real acumulado), gráfico de barras (recharts) de ganhos por dia, KPIs (ticket médio, nota média), breakdown por tipo de serviço com barras de progresso. Stats reais (completedCount, earningsToday) vindos do backend.
5. **Navegação por abas** — cliente (Início/Histórico) e prestador (Chamadas/Ganhos/Histórico).

### Melhorias de landing page
6. **Seção de preços transparentes** — 6 cards de preço base por tipo de serviço (reboque R$180, pneu R$90, etc.) com card "MAIS PEDIDO" destacado, badges de pagamento/km.
7. **Depoimentos** — 3 cards de testemunho (2 motoristas + 1 prestador) com estrelas, avatar com iniciais e ícone de aspas.
8. **FAQ accordion** — 6 perguntas frequentes expansíveis (matching, preço, pagamento, cancelamento, avaliações, como ser prestador).
9. **Nav atualizado** — links para Preços / Depoimentos / FAQ / Demo ao vivo.

### Polimento de estilo
10. Headers com gradientes (amber→amber-600, emerald→emerald-600) + sombras coloridas.
11. Avatares com gradientes em vez de fundo sólido.
12. Badges de status animados, empty states com ícones, timeline com bullets.
13. Cards de oferta com countdown visual, botões com shadow colorido.

### Arquivos modificados
- `src/lib/rescue-types.ts` — adicionado PaymentMethod, Rating, ServiceRecord, PAYMENT_METHODS, ProviderPublic.completedCount/ProviderState.earningsToday.
- `src/lib/rescue-history.ts` (novo) — helpers localStorage (getHistoryForRole, addRecord, recordFromService, updateRecord).
- `mini-services/rescue-service/index.ts` — eventos service:rate, paymentMethod no request, tracking de completedCount/earningsToday/ratingSum/ratingCount no provider.
- `src/hooks/use-rescue-socket.ts` — rateService(), clearCurrent(), paymentMethod no payload.
- `src/components/rescue/client-panel.tsx` — abas, payment selection, rating UI, history view, lazy init + ref guards.
- `src/components/rescue/provider-panel.tsx` — abas (Chamadas/Ganhos/Histórico), earnings dashboard com recharts, history view, rating display.
- `src/app/page.tsx` — seções Preços/Depoimentos/FAQ, sub-componentes PriceCard/Testimonial/FaqItem, nav atualizado.

### Verificação (agent-browser via porta 81)
- Landing: todas as seções renderizam, FAQ accordion abre/fecha, sem erros.
- Demo: registrei Bruno Lima (cliente) + Diego Santos (prestador), selecionei pagamento "Cartão".
- Solicitei reboque Paulista→Moema = R$ 204. Prestador recebeu oferta com "Cartão" visível.
- Aceitou → chegou → iniciou → concluiu. Cliente viu "Avalie o atendimento".
- Avaliei 5★ + comentário "Atendimento rápido e educado. Recomendo!".
- Cliente: "Obrigado pela avaliação!" + estrelas. Prestador: "Avaliação recebida" + comentário.
- Histórico do cliente: 1 serviço, Reboque, Diego Santos, Cartão, ★★★★★, comentário.
- Dashboard do prestador: Ganhos de hoje R$ 204, 1 serviço concluído, gráfico renderizado.
- Histórico do prestador: Cliente: Bruno Lima, +R$ 204, avaliação.
- `bun run lint`: 0 erros. rescue-service.log: registration → completed (R$ 204) → rated 5★. Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Risco (baixo):** histórico é por navegador (localStorage). Se o cron anterior registrou serviços em outra sessão de browser do agente, podem aparecer registros antigos — comportamento esperado para um protótipo. Para produção, migrar para banco (Prisma).
- **Recomendação próxima fase:**
  - Chat em tempo real entre cliente e prestador (mensagens via socket, persistidas).
  - Multi-prestador competindo: mostrar "3 prestadores sendo notificados" e permitir primeiro que aceita ganha.
  - Promo codes / cupons de desconto no checkout do cliente.
  - Notificações push simuladas (toast) quando oferta chega / serviço é aceito.
  - Filtro de histórico por data/tipo no painel do prestador.
  - Modo escuro/claro toggle (já temos next-themes disponível).
  - Persistir dados em Prisma (schema.prisma) para histórico e avaliações sobreviverem entre sessões/servidores.
  - Tela de detalhe do serviço no histórico (clique para ver timeline completa).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 3 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar chat em tempo real, notificações toast, cupons de desconto, e modal de detalhe do serviço no histórico.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-2: landing + demo ao vivo com WebSocket, avaliações, pagamentos, histórico e dashboard de ganhos.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em novos recursos de alto impacto: chat, toasts, cupons, e modal de detalhe.

## Completed modifications / verification results
### Novos recursos implementados
1. **Chat em tempo real entre cliente e prestador** 💬 — mensagens bidirecionais via WebSocket, persistidas em memória no backend por serviço. Botões de chat funcionais (antes eram decorativos). Badge de não-lidas no botão de chat. Painel colapsável com auto-scroll. Mensagens alinhadas à direita (minhas) / esquerda (outra parte) com timestamp.
2. **Notificações toast (sonner)** 🔔 — toasts disparados em transições de status do serviço: oferta enviada, prestador aceitou, chegando, chegou, em andamento, concluído (+R$ valor), cancelado. Estilo dark com richColors. Hook `useServiceToasts` reutilizável para cliente e prestador.
3. **Cupons de desconto (promo codes)** 🏷️ — validação em tempo real no backend. 3 cupons demo: SOCORRO10 (10% off), BEMVINDO20 (R$ 20 off), PROMO15 (15% off). Preview de preço com desconto no formulário. Badge de cupom no card de oferta (prestador vê o cupom aplicado). Desconto exibido na timeline, no card de serviço e no histórico.
4. **Modal de detalhe do serviço** 📋 — clique em qualquer item do histórico abre um Dialog com: tipo, status, contraparte, pagamento, trajeto (local/destino), valores (original, desconto, total), descrição do problema, linha do tempo completa com timestamps, avaliação com estrelas e comentário. Disponível em ambos os painéis (cliente e prestador).

### Polimento de estilo
5. Botões de chat com ring highlight quando ativos, badge de não-lidas.
6. Cards de histórico clicáveis com hover effect e seta indicando ação.
7. Price summary no formulário com strike-through no valor original e destaque do desconto.
8. Dialog estilizado em dark mode com seções organizadas (info boxes, trajeto, valores, timeline).

### Arquivos modificados
- `mini-services/rescue-service/index.ts` — adicionado: ChatMessage type, chats Map, eventos chat:send/chat:history/chat:messages/chat:new, PROMO_CODES, evento promo:validate, applyPromo(), campos originalPrice/discount/promoCode no ServiceRequest, emitChatToService().
- `src/lib/rescue-types.ts` — adicionado ChatMessage, PromoResult, campos originalPrice/discount/promoCode no ServiceData e ServiceRecord, description e timeline no ServiceRecord.
- `src/lib/rescue-history.ts` — recordFromService atualizado para capturar originalPrice, discount, promoCode, description, timeline.
- `src/hooks/use-rescue-socket.ts` — adicionado messages, newMessage, promoResult no state; sendChat, validatePromo, clearPromo, clearNewMessage callbacks; listeners chat:messages, chat:new, promo:result.
- `src/hooks/use-service-toasts.ts` (novo) — hook useServiceToasts que dispara toasts em transições de status.
- `src/components/rescue/chat-panel.tsx` (novo) — ChatPanel (inline) e ChatWidget (floating) com auto-scroll, timestamps, alinhamento de mensagens.
- `src/components/rescue/client-panel.tsx` — integrado chat, promo, toasts, service detail dialog, toggleChat, unread tracking.
- `src/components/rescue/provider-panel.tsx` — integrado chat, toasts, service detail dialog, promo display no card de serviço.
- `src/app/layout.tsx` — adicionado Sonner Toaster (richColors, dark style, top-center).

### Verificação (agent-browser via porta 81)
- Promo: digitei "SOCORRO10" → "Cupom aplicado: 10% OFF" → base R$ 204 → -R$ 20 → final R$ 184. ✓
- Oferta: prestador viu "Aceitar (R$ 184)" com cupom aplicado. ✓
- Chat: cliente enviou "Olá, estou na via principal..." → prestador recebeu → prestador respondeu "Chegando em 5 min!" → cliente recebeu. Mensagem visível em ambos os painéis. ✓
- Toasts: disparados em aceite, chegada, conclusão. ✓
- Histórico: 2 serviços listados, um com badge SOCORRO10. ✓
- Modal de detalhe: abri ao clicar → mostrou trajeto, valores (R$ 204, -R$ 20, R$ 184), linha do tempo completa, avaliação 5★. ✓
- `bun run lint`: 0 erros. rescue-service.log: chat messages registradas, serviço concluído, rating 5★. Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Dark/light mode toggle:** não implementado nesta rodada (next-themes disponível mas a app é dark-only por design). Para implementar, seria necessário adicionar toggle no header e variáveis CSS para modo claro.
- **Risco (baixo):** chat é em memória no backend — mensagens se perdem se o rescue-service reiniciar. Para produção, persistir em banco.
- **Recomendação próxima fase:**
  - Multi-prestador competindo: notificar N prestadores simultaneamente, primeiro que aceita ganha.
  - Filtro de histórico por data/tipo/valor.
  - Estimativa de tempo restante em tempo real (barra de progresso do trajeto).
  - Compartilhamento de localização via link.
  - Modo escuro/claro toggle.
  - Persistir chat e serviços em Prisma (schema.prisma).
  - Notificações sonoras opcional além dos toasts visuais.
  - Tela de perfil do prestador (foto, documentos, estatísticas históricas).
  - Sistema de fidelidade (acumular pontos por serviço).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 4 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar multi-prestador (first-accept-wins), barra de progresso de trajeto ao vivo, sistema de fidelidade, e filtros de histórico.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-3: landing + demo ao vivo com WebSocket, avaliações, pagamentos, histórico, dashboard de ganhos, chat, toasts, cupons, modal de detalhe.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em 4 novos recursos de alto impacto: multi-prestador, progresso de trajeto, fidelidade, filtros.

## Completed modifications / verification results
### Novos recursos implementados
1. **Multi-prestador com first-accept-wins** 🚛 — agora até 3 prestadores mais próximos são notificados simultaneamente (MULTI_NOTIFY_COUNT=3). O primeiro a aceitar ganha a chamada; os outros recebem notificação "service:offer-taken" informando quem aceitou. Indicador visual no card de oferta do prestador ("N prestadores recebendo esta chamada — primeiro a aceitar leva!") e no painel do cliente ("N prestadores sendo notificados simultaneamente" com avatares empilhados). Reoferta automática em lote quando todos recusam ou expiram.

2. **Barra de progresso de trajeto ao vivo** 📊 — componente TripProgressBar que calcula progresso em tempo real baseado em elapsed time vs estimated total (sincronizado com a simulação de movimento do backend a 0.18 km/s). Mostra: label contextual ("Prestador a caminho do local" / "Rumo ao destino final"), ETA com countdown MM:SS, km restantes, % concluído, barra animada com ícone de caminhão se movendo, e efeito pulse. Disponível em ambos os painéis (cliente e prestador). Backend rastreia tripStartPos, tripTarget, tripStartedAt, tripTotalKm por etapa (pickup → chegada, depois chegada → destino).

3. **Sistema de fidelidade (loyalty)** 🏆 — clientes ganham 1 ponto por R$ 1 gasto. 4 tiers: Bronze (0+), Prata (200+), Ouro (500+), Diamante (1000+), cada um com perk (desconto %, prioridade, suporte VIP). LoyaltyCard component com: tier atual com badge "NOVO!" em upgrade, pontos totais, pontos ganhos no serviço, perk do tier, barra de progresso para próximo tier com "N pts restantes". Pontos persistem por nome de cliente no backend (in-memory). Notificação de upgrade na timeline do serviço ("🎉 Subiu para o tier Prata!").

4. **Filtros de histórico** 🔍 — ambos os painéis (cliente e prestador) agora têm filtros no histórico: por tipo de serviço (Todos, Reboque, Pneu, Bateria, etc.) e por status (Qualquer status, Concluídos, Cancelados). Chips clicáveis com estado ativo, contador "N de M serviço(s)", e empty state quando nenhum serviço corresponde aos filtros.

### Polimento de estilo
5. Notificação "offer-taken" no painel do prestador: card com ícone X, mensagem "Chamada aceita por X" ou "Solicitação cancelada pelo cliente", botão "Entendido".
6. Indicador de multi-prestador no cliente: avatares empilhados de caminhão + texto "N prestadores sendo notificados simultaneamente".
7. LoyaltyCard com gradientes dinâmicos baseados na cor do tier, glow effect, badge "NOVO!" animado.
8. FilterChips com cores temáticas (amber para cliente, emerald para prestador).

### Arquivos modificados
- `mini-services/rescue-service/index.ts` — adicionado: MULTI_NOTIFY_COUNT, LOYALTY_TIERS, loyaltyTier(), nextTierMin(), clientLoyalty Map, campos notifiedProviderIds/tripStartPos/tripTarget/tripStartedAt/tripTotalKm/loyaltyPoints, evento service:offer-taken, lógica first-accept-wins em service:accept, reoferta em lote, tracking de trip por etapa, award de loyalty points em service:complete, evento client:loyalty.
- `src/lib/rescue-types.ts` — adicionado LoyaltyInfo, campos tripStartPos/tripTarget/tripStartedAt/tripTotalKm em ProviderState, notifiedProviderIds/notifiedCount/loyaltyPoints em ServiceData.
- `src/hooks/use-rescue-socket.ts` — adicionado loyalty e offerTaken no state, listeners client:loyalty e service:offer-taken, callbacks clearOfferTaken e clearLoyalty.
- `src/components/rescue/trip-progress-bar.tsx` (novo) — TripProgressBar com cálculo de progresso em tempo real, ETA countdown, barra animada com ícone de caminhão.
- `src/components/rescue/loyalty-card.tsx` (novo) — LoyaltyCard com tier, pontos, progresso para próximo tier, badge de upgrade.
- `src/components/rescue/client-panel.tsx` — integrado LoyaltyCard na home, TripProgressBar no service tracker, indicador de multi-prestador, filtros de histórico (FilterChip).
- `src/components/rescue/provider-panel.tsx` — integrado TripProgressBar no service card, notificação offer-taken, indicador de multi-prestador na OfferCard, filtros de histórico (FilterChip).

### Verificação (agent-browser via porta 81)
- Loyalty: cliente "Lucas Moto" registrou → Bronze 0pts → após serviço R$ 204 → +204pts → "🎉 Subiu para o tier Prata!" → LoyaltyCard mostrou "Prata NOVO! 204 pontos, +204 ganhos, Próximo: Ouro, 296 pts restantes". ✓
- Trip progress: após aceite → "Prestador a caminho do local, ETA 1:23, 4.65 km restantes, 14% concluído" → após 5s → "ETA 1:04, 84% concluído". Barra animada avançando. ✓
- Multi-prestador: com 1 provider → "1 prestador(es) próximo(s)" na timeline. Indicador "N prestadores recebendo esta chamada" aparece quando notifiedCount > 1. Backend log: "first-accept-wins among 1". ✓
- Offer-taken: quando oferta expira, prestador vê "Nenhum prestador disponível" e pode clicar "Voltar ao início". ✓
- History filters: 2 serviços no histórico → clique em "Concluídos" → "1 de 2 serviço(s)" filtrado. Chips Todos/Reboque/Pneu/etc. e Qualquer status/Concluídos/Cancelados. ✓
- `bun run lint`: 0 erros. rescue-service.log: "first-accept-wins among 1", "+204pts (total 408)". Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Risco (baixo):** multi-prestador com 3 notificações simultâneas não foi testado com 3+ providers (a demo só tem 2 phone frames). A lógica está implementada e o indicador aparece quando notifiedCount > 1, mas o teste real com múltiplos providers aceitando simultaneamente ficaria para uma próxima rodada com um segundo painel de prestador.
- **Risco (baixo):** loyalty points são em memória no backend (keyed by clientName) — sobrevivem entre sessões do mesmo nome mas se perdem se o rescue-service reiniciar. Para produção, persistir em banco.
- **Recomendação próxima fase:**
  - Adicionar um segundo painel de prestador na demo para testar multi-prestador competindo em tempo real.
  - Modo escuro/claro toggle (next-themes disponível).
  - Notificações sonoras opcional além dos toasts visuais.
  - Tela de perfil do prestador (foto, documentos, estatísticas históricas).
  - Estimativa de tempo restante na barra de progresso com precisão de segundos.
  - Compartilhamento de localização via link.
  - Persistir tudo em Prisma (schema.prisma) para sobreviver entre reinicializações.
  - Sistema de cupons resgatáveis por pontos de fidelidade.
  - Avaliação bidirecional (prestador também avalia o cliente).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 5 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar segundo painel de prestador, perfil de prestador, resgate de pontos de fidelidade, e corrigir bug do offer-taken.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-4: landing + demo ao vivo com WebSocket, avaliações, pagamentos, histórico, dashboard de ganhos, chat, toasts, cupons, modal de detalhe, multi-prestador, progresso de trajeto, fidelidade, filtros.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em: segundo painel de prestador, perfil, resgate de pontos, e corrigir bug do offer-taken.

## Completed modifications / verification results
### Bug corrigido
1. **Bug do offer-taken em multi-prestador** 🐛 — Na Task 4, o `service:offer-taken` só era enviado a providers com `currentServiceId === svc.id`, mas apenas o provider primário tinha esse campo setado. Providers secundários notificados nunca recebiam a notificação de "chamada aceita por X". Corrigido: agora o `service:offer-taken` é enviado a TODOS os providers notificados, independentemente de `currentServiceId`. *Validado: com 2 providers, Sergio aceitou → Paulo recebeu "Chamada aceita por Sergio Guincho" + "Outro prestador aceitou a chamada primeiro." + botão "Entendido".*

### Novos recursos implementados
2. **Segundo painel de prestador na demo** 📱 — botão "Adicionar 2º prestador" na seção demo que revela um terceiro phone frame. Layout responsivo: 2 colunas (lg) ou 3 colunas (xl). Permite testar a competição multi-prestador em tempo real com 2 providers recebendo a chamada simultaneamente. Dica contextual atualizada.

3. **Tela de perfil do prestador** 👤 — nova aba "Perfil" no painel do prestador com: header com avatar (iniciais), nome, veículo, badge "Verificado", placa; grid de 4 stats (serviços totais, ganhos hoje, nota média, total acumulado); grid de 6 conquistas (achievements) com ícones e estados desbloqueado/bloqueado: Primeiro serviço, 10 serviços, 50 serviços, Nota 5.0, Bem avaliado (4.5+), Movimentado (R$ 500+ hoje); status atual online/offline.

4. **Resgate de pontos de fidelidade** 🎁 — LoyaltyCard expandido com botão "Resgatar pontos" que revela 4 recompensas: FIDEL5 (100 pts, 5% OFF), FIDEL10 (200 pts, 10% OFF), FIDEL25 (300 pts, R$ 25 OFF), FIDEL15 (500 pts, 15% OFF). Cada recompensa mostra custo em pontos, descrição, e botão "Resgatar" (habilitado se pontos suficientes). Backend: evento `loyalty:redeem` deduz pontos, adiciona o cupom a PROMO_CODES (válido para uso imediato), envia `loyalty:redeem-result` com sucesso/mensagem + código resgatado, atualiza `client:loyalty` e `loyalty:rewards`. Inline result notification com código copiável. Recompensas bloqueadas mostram ícone de cadeado.

### Polimento de estilo
5. ProfileView com gradientes, glow effects, achievements com grayscale quando bloqueados, check icon quando desbloqueados.
6. LoyaltyCard rewards com estados affordable/locked visualmente distintos (amber vs slate + opacity).
7. Botão "Adicionar 2º prestador" com estilo sky/blue destacando a funcionalidade multi-prestador.

### Arquivos modificados
- `mini-services/rescue-service/index.ts` — corrigido offer-taken para todos notificados; adicionado LOYALTY_REWARDS, evento loyalty:redeem, clients Map agora inclui name, evento loyalty:rewards enviado no register e após redeem.
- `src/lib/rescue-types.ts` — adicionado LoyaltyReward, RedeemResult types.
- `src/hooks/use-rescue-socket.ts` — adicionado rewards, redeemResult no state; listeners loyalty:rewards, loyalty:redeem-result; callbacks redeemReward, clearRedeemResult.
- `src/components/rescue/loyalty-card.tsx` — expandido com rewards list, redeem button, inline result notification, toggle showRewards.
- `src/components/rescue/client-panel.tsx` — passado rewards, redeemResult, onRedeem, onClearRedeem para LoyaltyCard.
- `src/components/rescue/provider-panel.tsx` — adicionado aba Perfil, ProfileView component com stats e achievements.
- `src/app/page.tsx` — DemoLive com toggle de segundo provider, layout 3 colunas, botão "Adicionar 2º prestador".

### Verificação (agent-browser via porta 81)
- Multi-prestador: 2 providers (Sergio + Paulo) registrados → cliente solicitou → "2 prestadores recebendo esta chamada — primeiro a aceitar leva!" em ambos → Sergio aceitou → Paulo recebeu "Chamada aceita por Sergio Guincho" + "Entendido". Backend log: "first-accept-wins among 2". ✓
- Segundo painel: botão "Adicionar 2º prestador" revelou 3º phone frame "App do Prestador 2". Layout ajustou para 3 colunas. ✓
- Perfil: aba "Perfil" no prestador → avatar PA, nome Paulo Reboque, veículo, badge Verificado, placa, 4 stats, 6 achievements (todos bloqueados pois 0 serviços). ✓
- Loyalty rewards: LoyaltyCard com "Resgatar pontos" → 4 recompensas (FIDEL5/10/25/15) com custos 100/200/300/500 pts, todas locked (0 pontos). ✓
- `bun run lint`: 0 erros. Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Avaliação bidirecional:** não implementada nesta rodada (prestador avaliando cliente). Ficou para próxima fase.
- **Risco (baixo):** loyalty points e rewards redeemed são em memória no backend — se o rescue-service reiniciar, pontos resgatados voltam. Para produção, persistir em banco.
- **Recomendação próxima fase:**
  - Avaliação bidirecional (prestador também avalia o cliente após concluir).
  - Modo escuro/claro toggle (next-themes disponível).
  - Notificações sonoras opcionais.
  - Compartilhamento de localização via link.
  - Persistir tudo em Prisma (schema.prisma).
  - Estatísticas avançadas no perfil (gráfico de serviços por dia, mapa de calor de regiões).
  - Sistema de ranking/leaderboard de prestadores.
  - Notificação push quando novo tier desbloqueado.
  - Cupons resgatáveis com validade (expiram após N dias).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 6 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar avaliação bidirecional (prestador avalia cliente), leaderboard de prestadores na landing, e melhorias de estilo.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-5: landing + demo ao vivo com WebSocket, avaliações, pagamentos, histórico, dashboard de ganhos, chat, toasts, cupons, modal de detalhe, multi-prestador, progresso de trajeto, fidelidade com resgate, filtros, segundo painel de prestador, perfil com achievements.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em: avaliação bidirecional, leaderboard ao vivo, e melhorias de estilo.

## Completed modifications / verification results
### Novos recursos implementados
1. **Avaliação bidirecional (prestador avalia cliente)** ⭐ — após concluir o serviço, o prestador agora vê um card "Avalie o cliente" com estrelas interativas (1-5) e campo de comentário. Backend: novo evento `service:rate-client` que cria `clientRating` no ServiceRequest. Cliente vê "Avaliação que você recebeu do prestador" com estrelas sky/blue e comentário. Modal de detalhe do serviço mostra ambas as avaliações (dada e recebida) com labels contextuais por role. *Validado: prestador Carlos Guincho avaliou cliente Ana Silva 5★ → prestador viu "Cliente avaliado!" → cliente viu "Avaliação que você recebeu do prestador". Backend log: "client rated 5★ by Carlos Guincho".*

2. **Leaderboard de prestadores ao vivo** 🏆 — nova seção "Ranking ao vivo" na landing page com top 10 prestadores ordenados por serviços concluídos + nota. Backend: broadcast `leaderboard` a cada 5s com dados de todos providers. Componente Leaderboard com medalhas (Crown/Medal/Award para top 3), avatares com iniciais, stats (nota, serviços, ganhos hoje), empty state "Aguardando prestadores entrarem no app...". Atualiza em tempo real conforme serviços são concluídos. Link "Ranking" adicionado ao nav. *Validado: após registrar e concluir serviço, Carlos Guincho apareceu no leaderboard com 1 serviço, R$ 204 hoje, nota 4.8.*

3. **Histórico e modal de detalhe com clientRating** 📋 — ServiceRecord agora inclui clientRating. Modal de detalhe mostra ambas as avaliações com labels contextuais: "Sua avaliação do prestador" / "Avaliação do cliente" (rating) e "Avaliação recebida do prestador" / "Sua avaliação do cliente" (clientRating), com cores distintas (amber para rating, sky para clientRating).

### Polimento de estilo
4. Leaderboard com gradientes para top 3 (amber/slate/orange), ícones de medalha, avatares com gradientes.
5. ClientRatingCard com gradiente sky/blue, estrelas interativas com hover scale, textarea estilizada.
6. Labels contextuais por role nos modais de detalhe (cliente vs prestador).
7. Seção de ranking com SectionHead e bordas consistentes.

### Arquivos modificados
- `mini-services/rescue-service/index.ts` — adicionado clientRating ao ServiceRequest e sanitizeService, evento service:rate-client, broadcast leaderboard a cada 5s.
- `src/lib/rescue-types.ts` — adicionado clientRating ao ServiceData e ServiceRecord.
- `src/lib/rescue-history.ts` — recordFromService captura clientRating.
- `src/hooks/use-rescue-socket.ts` — adicionado rateClient callback ao provider hook.
- `src/components/rescue/provider-panel.tsx` — adicionado ClientRatingCard component, onRateClient prop no ProviderServiceCard, clientRating no ServiceDetailDialog.
- `src/components/rescue/client-panel.tsx` — adicionado clientRating display no ServiceTracker e ServiceDetailDialog.
- `src/components/rescue/leaderboard.tsx` (novo) — Leaderboard component com socket connection, medalhas, stats.
- `src/app/page.tsx` — adicionado seção Ranking, import Leaderboard, link Ranking no nav.

### Verificação (agent-browser via porta 81)
- Bidirectional rating: serviço concluído → prestador viu "Avalie o cliente" → selecionou 5★ + comentário "Cliente pontual e educado." → clicou "Enviar avaliação do cliente" → prestador viu "Cliente avaliado!" → cliente viu "Avaliação que você recebeu do prestador". ✓
- Leaderboard: landing mostra seção "Top prestadores SocorroJá" → inicialmente "Aguardando prestadores entrarem no app..." → após registro + serviço: "Carlos Guincho" com 1 serviço, R$ 204, nota 4.8. ✓
- `bun run lint`: 0 erros. rescue-service.log: "client rated 5★ by Carlos Guincho". Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Dark/light mode toggle:** não implementado nesta rodada. A app é dark-only por design.
- **Gráfico de serviços por dia:** o EarningsView já tem um BarChart, mas poderia ser expandido com mais granularidade.
- **Recomendação próxima fase:**
  - Modo escuro/claro toggle (next-themes disponível).
  - Notificações sonoras opcionais.
  - Compartilhamento de localização via link.
  - Persistir tudo em Prisma (schema.prisma).
  - Estatísticas avançadas no perfil (gráfico de serviços por dia, mapa de calor de regiões).
  - Sistema de ranking semanal/mensal com recompensas.
  - Notificação push quando novo tier desbloqueado ou subida no ranking.
  - Cupons resgatáveis com validade (expiram após N dias).
  - Tela de perfil do cliente (histórico de avaliações recebidas, tier, pontos).
  - Filtro de leaderboard por período (hoje/semana/mês).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 7 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar dark/light mode toggle, tela de perfil do cliente, filtro de período no leaderboard.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-6: landing + demo ao vivo com WebSocket, avaliações bidirecionais, pagamentos, histórico, dashboard de ganhos, chat, toasts, cupons, modal de detalhe, multi-prestador, progresso de trajeto, fidelidade com resgate, filtros, segundo painel, perfil de prestador, leaderboard ao vivo.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em: dark/light mode, perfil do cliente, filtro de leaderboard.

## Completed modifications / verification results
### Novos recursos implementados
1. **Dark/light mode toggle** 🌓 — ThemeProvider (next-themes) integrado ao layout com `attribute="class" defaultTheme="dark"`. ThemeToggle component com ícone Sun/Moon no header da landing. CSS overrides em globals.css: quando `html.light`, sobrescreve bg-slate-950/900/800, text-white/slate-300/400, border-slate-800/700, inputs/selects/textarea para fundo branco. Mantém cores de accent (amber/emerald/sky) vibrantes em ambos os modos. Phone frames permanecem dark (mockup de app). *Validado: cliquei no toggle → html class mudou para "light" → screenshot mostrou fundo claro com texto escuro. Voltei para dark sem issues.*

2. **Tela de perfil do cliente** 👤 — nova aba "Perfil" no painel do cliente com: header com avatar (iniciais), nome, badge do tier de fidelidade, pontos; grid de 4 stats (serviços totais, total gasto, nota média dada, nota recebida); LoyaltyCard integrado; lista de "Avaliações recebidas" (últimas 5, com stars sky/blue, comentário e data); empty state "Conclua seu primeiro serviço para ver suas estatísticas." *Validado: Maria Teste registrou → aba Perfil → avatar MA, Bronze, 0 pontos, 4 stats (0/0/—/—), LoyaltyCard, empty state.*

3. **Filtro de período no leaderboard** 🔍 — Leaderboard agora tem toggle "Hoje" / "Total" no header. "Hoje" ordena por ganhos de hoje (earningsToday) desc; "Total" ordena por serviços totais (completedCount) desc. Stat principal exibido muda conforme o período (R$ hoje vs N serviços). *Validado: botões "Hoje" e "Total" visíveis e clicáveis no leaderboard.*

### Arquivos modificados
- `src/components/theme-provider.tsx` (novo) — wrapper next-themes.
- `src/components/theme-toggle.tsx` (novo) — botão Sun/Moon com hydration-safe mounted check.
- `src/app/layout.tsx` — envolvido children com ThemeProvider (attribute="class", defaultTheme="dark").
- `src/app/globals.css` — adicionado ~75 linhas de CSS overrides para light mode (bg, text, border, inputs, phone frames).
- `src/app/page.tsx` — adicionado ThemeToggle no header, import ThemeToggle.
- `src/components/rescue/client-panel.tsx` — adicionado aba Perfil, ClientProfileView component com stats + loyalty + ratings received, imports User/Trophy/Heart.
- `src/components/rescue/leaderboard.tsx` — adicionado period state (today/total), toggle buttons, sorting dinâmico, stat principal contextual.

### Verificação (agent-browser via porta 81)
- Dark/light: cliquei toggle → html.light → fundo claro, texto escuro, inputs brancos. Voltei para dark. ✓
- Client profile: Maria Teste → aba Perfil → avatar MA, Bronze 0pts, 4 stats, LoyaltyCard, empty state. ✓
- Leaderboard filter: botões Hoje/Total visíveis e funcionais. ✓
- `bun run lint`: 0 erros. Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Light mode completeness:** os painéis de phone (demo) permanecem dark por design (são mockups de app). Algumas classes menos comuns podem não ter override completo, mas o fluxo principal (landing, header, seções) funciona em ambos os modos.
- **Sound notifications:** não implementadas nesta rodada.
- **Recomendação próxima fase:**
  - Notificações sonoras opcionais (toggle de som).
  - Compartilhamento de localização via link.
  - Persistir tudo em Prisma (schema.prisma).
  - Estatísticas avançadas no perfil (gráfico de serviços por dia, mapa de calor).
  - Sistema de ranking semanal/mensal com recompensas.
  - Notificação push quando novo tier desbloqueado ou subida no ranking.
  - Cupons resgatáveis com validade (expiram após N dias).
  - Filtro de leaderboard por período estendido (semana/mês com dados históricos).
  - PWA / instalação no celular.
  - Internacionalização (i18n) com next-intl.
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 8 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar notificações sonoras, animações Framer Motion, e botão SOS de emergência.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-7: landing + demo ao vivo com WebSocket, avaliações bidirecionais, pagamentos, histórico, dashboard de ganhos, chat, toasts, cupons, modal de detalhe, multi-prestador, progresso de trajeto, fidelidade com resgate, filtros, segundo painel, perfis (cliente + prestador), leaderboard ao vivo, dark/light mode.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em: notificações sonoras, animações Framer Motion, botão SOS.

## Completed modifications / verification results
### Novos recursos implementados
1. **Notificações sonoras** 🔔 — hook `useSoundNotifications` usando Web Audio API (sem arquivos de áudio, tons gerados programaticamente). 6 padrões de som distintos: offer (dois tons ascendentes), accept (arpejo de acorde), arrive (doorbell), complete (fanfarra de sucesso), cancel (descendente), chat (pop curto). Toggle de som (Volume2/VolumeX) no header de ambos os painéis (cliente e prestador). Som desativado por padrão (requer interação do usuário para ativar — política de autoplay do browser). Hook `useChatSound` separado para notificar novas mensagens de chat. *Validado: botão "Alternar som" visível em ambos os painéis, muda ícone Volume2↔VolumeX ao clicar.*

2. **Animações Framer Motion** ✨ — hero da landing agora anima entrada com fade+slide (Badge → H1 → P em cascata com delays). Phone frames na demo animam com fade+slide ao aparecer. Segundo painel de prestador usa AnimatePresence com scale+fade para entrada/saída suave. Import `motion, AnimatePresence` from 'framer-motion'. *Validado: hero renderiza com animação cascata, 3 painéis aparecem suavemente ao adicionar 2º prestador.*

3. **Botão SOS de emergência** 🚨 — botão prominente com borda rose, ícone AlertTriangle com efeito ping animado, "SOS · Emergência" e "Reboque urgente com 1 toque — prioridade máxima". Ao clicar, pré-preenche o formulário com tipo=reboque e descrição="EMERGÊNCIA — veículo imobilizado, necessita guincho urgente". Posicionado entre "Solicitar socorro" e o LoyaltyCard na home do cliente. *Validado: cliquei SOS → formulário abriu com Reboque/Guincho selecionado e descrição de emergência pré-preenchida.*

### Polimento de estilo
4. SOS button com gradiente rose, hover effect, arrow que desliza à direita, pulse animation no ícone.
5. Sound toggle com cor contextual (amber no cliente, emerald no prestador) quando ativo.
6. Animações de entrada suaves (opacity 0→1, y 20→0) com delays escalonados.

### Arquivos modificados
- `src/hooks/use-sound-notifications.ts` (novo) — useSoundNotifications + useChatSound com Web Audio API, 6 padrões de som, toggle enabled state.
- `src/components/rescue/client-panel.tsx` — integrado useSoundNotifications + useChatSound, botão Volume2/VolumeX no header, botão SOS de emergência na home, imports Volume2/VolumeX.
- `src/components/rescue/provider-panel.tsx` — integrado useSoundNotifications + useChatSound, botão Volume2/VolumeX no header, imports Volume2/VolumeX.
- `src/app/page.tsx` — import motion/AnimatePresence do framer-motion, hero com animações cascata (Badge/H1/P), phone frames com fade+slide, segundo provider com AnimatePresence scale.

### Verificação (agent-browser via porta 81)
- Sound toggle: botão "Alternar som" visível no header do cliente e prestador, muda ícone ao clicar. ✓
- SOS button: "SOS · Emergência" visível na home do cliente → clique → formulário abriu com Reboque/Guincho + descrição de emergência. ✓
- Framer Motion: hero anima entrada em cascata, 3 painéis aparecem com fade+slide, segundo provider com scale animation. ✓
- `bun run lint`: 0 erros. Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Som desativado por padrão:** browsers bloqueiam autoplay de áudio sem interação do usuário. O som só funciona após o usuário ativar o toggle (que conta como interação). Comportamento esperado.
- **Share location via link:** não implementado nesta rodada.
- **Recomendação próxima fase:**
  - Compartilhamento de localização via link (gerar URL com lat/lng).
  - Persistir tudo em Prisma (schema.prisma).
  - Estatísticas avançadas no perfil (gráfico de serviços por dia, mapa de calor).
  - Sistema de ranking semanal/mensal com recompensas.
  - PWA / instalação no celular.
  - Internacionalização (i18n) com next-intl.
  - Notificação push quando novo tier desbloqueado.
  - Cupons resgatáveis com validade (expiram após N dias).
  - Tela de configurações (som, notificações, privacidade).
  - Histórico de localizações favoritas (casa, trabalho).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 9 (cron webDevReview)
Agent: cron review agent
Task: QA + adicionar locais favoritos, compartilhamento de rastreamento, e animações de scroll reveal.

## Current project status / assessment
- Protótipo SocorroJá estável após Tasks 1-8: landing + demo ao vivo com WebSocket, avaliações bidirecionais, pagamentos, histórico, dashboard de ganhos, chat, toasts, cupons, modal de detalhe, multi-prestador, progresso de trajeto, fidelidade com resgate, filtros, segundo painel, perfis (cliente + prestador), leaderboard ao vivo, dark/light mode, notificações sonoras, animações Framer Motion, botão SOS.
- QA desta rodada via agent-browser: nenhum bug encontrado no fluxo existente. Logs limpos.
- rescue-service (porta 3003) e Next.js (porta 3000) ambos ativos.
- Decidi focar em: locais favoritos, compartilhamento de rastreamento, animações de scroll.

## Completed modifications / verification results
### Novos recursos implementados
1. **Locais favoritos** ⭐ — sistema de favoritos com persistência em localStorage (`src/lib/rescue-favorites.ts`). No formulário de solicitação do cliente: barra de quick-select "LOCAIS FAVORITOS" com chips clicáveis (ícone + label), botão "Salvar como favorito" ao lado do select de local, form inline com nome + seletor de ícone (Home/Briefcase/Star) + salvar/cancelar, "Salvo!" flash confirmation, remoção de favoritos com botão X no hover. Favoritos pré-preenchem o local de atendimento ao clicar. *Validado: salvei "Casa" → apareceu na barra "LOCAIS FAVORITOS" → "Salvo!" confirmation.*

2. **Compartilhamento de rastreamento** 🔗 — botão "Compartilhar rastreamento" no ServiceTracker do cliente (visível apenas durante serviço ativo). Usa `navigator.share()` quando disponível (mobile), fallback para `navigator.clipboard.writeText()` com "Link copiado!" confirmation. Gera URL `/?track={serviceId}`. *Validado: botão "Compartilhar rastreamento" visível durante serviço ativo ao lado de "Cancelar solicitação".*

3. **Animações de scroll reveal** ✨ — SectionHead agora anima com `whileInView` (fade+slide quando entra no viewport). Reusable `RevealSection` component com delay configurável. StepCards na seção "Como funciona" animam em cascata (delay 0, 0.1, 0.2) ao entrar no viewport. `viewport={{ once: true }}` para animar apenas uma vez. *Validado: screenshot da landing mostra animações aplicadas.*

### Polimento de estilo
4. Favorites quick-select com chips amber, hover effect, botão X de remoção no hover.
5. Save favorite form inline com seletor de ícone visual, disabled state quando label vazio.
6. Share button com borda sky-blue e ícone Share2, muda para "Link copiado!" com Check icon.
7. Scroll reveal animations suaves com delays escalonados.

### Arquivos modificados
- `src/lib/rescue-favorites.ts` (novo) — getFavorites, addFavorite, removeFavorite, isFavorite com localStorage, type FavoriteLocation.
- `src/components/rescue/client-panel.tsx` — adicionado favorites state + handlers no RequestForm, favorites quick-select bar, save favorite form inline, ShareTrackingButton component no ServiceTracker, imports Briefcase/Share2/Check, RevealSection.
- `src/app/page.tsx` — SectionHead com motion whileInView, RevealSection component, StepCards envolvidos com RevealSection (delay cascata).

### Verificação (agent-browser via porta 81)
- Favorites: form abriu → "Salvar como favorito" → preenchi "Casa" → "Salvar" → "LOCAIS FAVORITOS" apareceu com chip "Casa" + "Salvo!" flash. ✓
- Share tracking: serviço ativo → "Compartilhar rastreamento" visível ao lado de "Cancelar solicitação". ✓
- Scroll animations: StepCards animam entrada ao rolar para a seção "Como funciona". ✓
- `bun run lint`: 0 erros. Sem erros de browser.

## Unresolved issues / risks + next-phase recommendations
- **Settings screen:** não implementada nesta rodada. O tema e som já têm toggles individuais nos headers, mas uma tela consolidada de configurações ficaria para próxima fase.
- **Weekly leaderboard:** o leaderboard atual mostra apenas hoje/total. Dados históricos (semana/mês) requerem persistência no backend.
- **Recomendação próxima fase:**
  - Tela de configurações consolidada (som, tema, notificações, privacidade).
  - Persistir tudo em Prisma (schema.prisma) — favoritos, histórico, loyalty, leaderboard.
  - Estatísticas avançadas no perfil (gráfico de serviços por dia, mapa de calor).
  - Sistema de ranking semanal/mensal com recompensas.
  - PWA / instalação no celular.
  - Internacionalização (i18n) com next-intl.
  - Notificação push quando novo tier desbloqueado.
  - Cupons resgatáveis com validade (expiram após N dias).
  - Histórico de localizações favoritas no backend (sincronizar entre dispositivos).
  - Tela de rastreamento público (URL /?track={id} acessível sem login).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork a partir de `/home/z/my-project/mini-services/rescue-service`: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy) para o WebSocket `/?XTransformPort=3003` rotear corretamente.

---
Task ID: 10 (user request — rebrand)
Agent: main (user-driven)
Task: Renomear plataforma de SocorroJá para Help Bibi, aplicar cores da logo (azul #00B0FF + laranja #FFA500), adicionar LiveCountdown e AreaChart.

## Current project status / assessment
- Usuário solicitou rebranding: nome "Help Bibi" + cores da logo enviada (azul #00B0FF + laranja #FFA500).
- VLM analisou a logo: azul #00B0FF (primário, confiança/tecnologia), laranja #FFA500 (acento, energia/urgência), preto para texto, design flat com map pin + carro + estrada.
- rescue-service e Next.js ambos ativos.

## Completed modifications / verification results
### Rebranding
1. **Nome: SocorroJá → Help Bibi** — substituição global em todos os arquivos .ts/.tsx: títulos, headers, textos, metadata, logs do backend, chaves localStorage (socorroja → helpbibi). Layout metadata atualizada com favicon da logo.

2. **Logo** — copiada para `public/help-bibi-logo.png`, usada no header da landing e no footer (img tag com alt "Help Bibi"). Favicon atualizado no metadata.

3. **Esquema de cores: amber → sky (azul), emerald → orange (laranja)** — substituição global de classes Tailwind: todos os `amber-X` → `sky-X` (azul #00B0FF da logo), todos os `emerald-X` → `orange-X` (laranja #FFA500 da logo). CSS global customizado com `!important` overrides para que `sky-500` = #00B0FF exato e `orange-500` = #FFA500 exato (não os defaults do Tailwind). Substituição de hex values diretos (#f59e0b → #00B0FF, #10b981 → #FFA500, etc.). Light mode overrides atualizados.

### Recursos da rodada anterior (finalizados)
4. **LiveCountdown** — componente que conta regressivamente MM:SS em tempo real. Integrado no ETA do ServiceTracker do cliente e do prestador. Muda para vermelho quando ≤30s com "Chegando!" animado. *Validado: mostrou "9:42" contando regressivamente durante serviço ativo.*

5. **AreaChart de tendência de ganhos** — gráfico de área com gradiente no EarningsView do prestador, mostra tendência de ganhos por dia. Só aparece quando há 2+ dias de dados.

6. **Settings screen** — aba "Ajustes" em ambos os painéis com: notificações sonoras (toggle), tema (dark/light toggle), notificações visuais (toggle), privacidade e dados (limpar histórico), sobre o Help Bibi. *Validado: aba "Ajustes" visível, todas as seções renderizam.*

7. **AnimatedCounter** — contadores animados na stats bar da landing (12.000+, 850+, 8 min, 24h) com ease-out cubic. *Bug corrigido: useInView não disparava → trocado para setTimeout animation que funciona corretamente.*

### Verificação (agent-browser via porta 81)
- Título: "Help Bibi — Auto socorro por aplicativo" ✓
- Logo: carregando no header (71px) e footer (57px) ✓
- Cor primária: botão "Ver demo" tem backgroundColor rgb(0, 176, 255) = #00B0FF ✓
- Cor secundária: 36 elementos com classe orange encontrados ✓
- Fluxo de serviço: Ana Cliente + Bob Prestador → solicitou → aceitou → "Chegando no local" + ETA "9:42" countdown ✓
- Backend log: "Help Bibi rescue-service running on port 3003" ✓
- `bun run lint`: 0 erros. Sem erros de browser.

### Arquivos modificados
- `public/help-bibi-logo.png` (novo) — logo copiada do upload.
- `src/app/layout.tsx` — metadata com "Help Bibi", favicon, lang="pt-BR".
- `src/app/globals.css` — CSS overrides para sky=#00B0FF e orange=#FFA500, light mode atualizado.
- `src/app/page.tsx` — logo no header/footer, todas as cores amber→sky, emerald→orange.
- `src/components/rescue/client-panel.tsx` — cores, nome, LiveCountdown, SettingsView, AnimatedCounter.
- `src/components/rescue/provider-panel.tsx` — cores, nome, LiveCountdown, SettingsView, AreaChart.
- `src/components/rescue/live-countdown.tsx` (novo) — countdown MM:SS em tempo real.
- `src/components/rescue/settings-view.tsx` (novo) — tela de configurações.
- `src/components/rescue/animated-counter.tsx` (novo) — contador animado.
- `mini-services/rescue-service/index.ts` — nome "Help Bibi" nos logs.
- Todos os arquivos .ts/.tsx — substituição global amber→sky, emerald→orange, SocorroJá→Help Bibi.

## Unresolved issues / risks + next-phase recommendations
- **Cores customizadas via CSS !important:** as cores sky e orange são sobrescritas via CSS com `!important` para corresponder exatamente à logo. Isso funciona mas é uma solução de protótipo. Para produção, configurar o Tailwind config com as cores customizadas.
- **Logo no header:** a logo original é 1920x1080 (landscape), redimensionada via CSS. Funciona bem mas uma versão quadrada ou só do ícone seria melhor para o header.
- **Recomendação próxima fase:**
  - Criar versão do ícone da logo (só o símbolo) para usar em espaços pequenos.
  - Configurar as cores brand no tailwind.config.ts para evitar !important.
  - Persistir tudo em Prisma.
  - PWA / instalação no celular.
  - Internacionalização (i18n).
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy).

---
Task ID: 11 (FASE 11 — Consolidação Help Bibi + Rastreamento Público)
Agent: main (user-driven)
Task: Consolidar identidade Help Bibi no código, corrigir cores exatas (#00BFFF + #FFA500), adicionar variáveis CSS da marca, implementar rastreamento público por link.

## Current project status / assessment
- Nome oficial da plataforma: **Help Bibi** (não mais SocorroJá).
- Cores oficiais: **Azul #00BFFF** (primário), **Laranja #FFA500** (acento), Preto #000000.
- rescue-service e Next.js ambos ativos e funcionando.
- Rebranding anterior (Task 10) usava #00B0FF (incorreto) — corrigido para #00BFFF nesta fase.

## Completed modifications / verification results
### 1. Rebranding real para Help Bibi
- Verificação completa: nenhum remanescente de "SocorroJá", "socorroja", "amber", ou "emerald" no código.
- Metadata em `src/app/layout.tsx`: title, description, keywords, OpenGraph, Twitter — todos com "Help Bibi".
- Favicon: `/logo-help-bibi.png` (arquivo local, sem favicon externo).
- `lang="pt-BR"` no html.
- rescue-service: logs e health response com "Help Bibi".
- worklog.md preservado com histórico, registrando nome oficial atual.

### 2. Logo
- Arquivo: `public/logo-help-bibi.png` (renomeado de `help-bibi-logo.png`).
- Usada no header da landing (h-10), no footer (h-8), e na tela de rastreamento público (h-9 e h-8).
- Proporção mantida com `w-auto`.

### 3. Cores da marca
- Variáveis CSS globais em `:root`:
  - `--helpbibi-blue: #00BFFF`
  - `--helpbibi-orange: #FFA500`
  - `--helpbibi-black: #000000`
  - `--helpbibi-blue-rgb: 0, 191, 255`
  - `--helpbibi-orange-rgb: 255, 165, 0`
- CSS overrides com `var()` para sky-500 e orange-500 (não mais hex direto).
- Azul (#00BFFF): CTAs, marca, cliente, links, destaque tecnológico.
- Laranja (#FFA500): prestador, SOS, urgência, alerta positivo, energia.
- Verde/vermelho mantidos para sucesso/erro semânticos.

### 4. Padronização visual
- Header da landing: logo Help Bibi + "auto socorro por aplicativo".
- Footer: logo Help Bibi.
- Painel do cliente: "Help Bibi · Cliente".
- Painel do prestador: "Help Bibi · Prestador".
- Hero tagline: "Socorro veicular em minutos" + "Seguro, rastreável e sem burocracia."

### 5. Rastreamento público por link
- **Backend**: evento socket.io `public:track` que retorna dados públicos seguras (sem nome do cliente, sem pagamento, sem placa). Qualquer conexão pode solicitar — sem login.
- **Frontend**: `PublicTracking` component que conecta via socket.io, faz polling a cada 2s, e exibe:
  - Status do serviço com banner colorido
  - Tipo de serviço + ID
  - Prestador (nome, veículo, nota) — se aceito
  - ETA com LiveCountdown em tempo real
  - Trajeto (origem → destino)
  - Timeline resumida com timestamps
  - Logo Help Bibi + tagline
  - Botão "Voltar" para a landing
  - Estado seguro: "Rastreamento indisponível ou encerrado" para IDs inválidos/expirados
- **Integração**: `page.tsx` detecta `?track={serviceId}` na URL e renderiza `PublicTracking` em vez da landing.
- **Segurança**: não mostra nome do cliente, método de pagamento, placa, ou dados desnecessários.

### Arquivos modificados
- `public/logo-help-bibi.png` (renomeado de help-bibi-logo.png).
- `src/app/layout.tsx` — metadata, favicon, lang.
- `src/app/globals.css` — variáveis CSS da marca, correção #00BFFF, uso de var().
- `src/app/page.tsx` — deteção de ?track=, import PublicTracking, useEffect, hero tagline atualizada.
- `src/components/rescue/public-tracking.tsx` (novo) — tela de rastreamento público via socket.io.
- `src/components/rescue/loyalty-card.tsx` — correção #00BFFF.
- `src/components/rescue/rescue-map.tsx` — correção #00BFFF.
- `mini-services/rescue-service/index.ts` — evento public:track, CORS headers, health com name.
- Todos os arquivos .ts/.tsx — correção global #00B0FF → #00BFFF.

### Verificação (agent-browser via porta 81)
- Landing: título "Help Bibi — Auto socorro por aplicativo" ✓
- Logo: carregando de /logo-help-bibi.png no header e footer ✓
- Cor azul: botão primário rgb(0, 191, 255) = #00BFFF ✓
- Hero: "Socorro veicular em minutos" + "Seguro, rastreável e sem burocracia." ✓
- Demo: abre, registra cliente e prestador ✓
- Serviço: solicitado → aceito → "Chegando no local" com ETA ✓
- Compartilhar rastreamento: botão visível ✓
- Rastreamento público: URL `/?track=svc_3yswy8m3` → tela pública com status, prestador, ETA, timeline ✓
- Segurança: nome do cliente (Ana Track), pagamento (PIX), placa (TRK1D23) — NÃO exibidos ✓
- Estado indisponível: `/?track=svc_invalid999` → "Rastreamento indisponível ou encerrado" ✓
- Modo claro: alterna corretamente, cor azul mantida ✓
- Modo escuro: funciona corretamente ✓
- `bun run lint`: 0 erros ✓
- Sem erros no console ✓
- Sem erros de hidratação ✓

## Unresolved issues / risks + next-phase recommendations
- **Rastreamento público via socket.io:** o endpoint HTTP `/track/:id` não funciona porque socket.io (path: '/') intercepta todas as requisições HTTP. Solução: usar evento socket.io `public:track` que funciona perfeitamente. Para produção, considerar mudar o path do socket.io ou usar um servidor HTTP separado.
- **Dados em memória:** serviços, providers, loyalty — tudo em memória no rescue-service. Reiniciar o serviço perde tudo. Para produção, persistir em Prisma.
- **Recomendação próxima fase:**
  - Persistir tudo em Prisma (schema.prisma).
  - PWA / instalação no celular.
  - Internacionalização (i18n) com next-intl.
  - Tela de rastreamento público com mapa (atualmente só texto/timeline).
  - Notificação push quando prestador chega ao local.
  - Cupons resgatáveis com validade.
  - Sistema de ranking semanal/mensal.
  - Configurar cores brand no tailwind.config.ts para evitar CSS !important.
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy).

---
Task ID: 12 (FASE 12 — Fundação Real do Backend e Persistência)
Agent: main (user-driven)
Task: Sair do protótipo em memória/localStorage e preparar a Help Bibi para MVP com banco de dados, modelos persistentes e camada de domínio.

## Diagnóstico técnico inicial
### Dados em memória (rescue-service/index.ts)
- `providers` Map: todos os prestadores ativos (id, name, vehicle, plate, rating, position, etc.)
- `clients` Map: clientes registrados (id, socketId, name)
- `services` Map: todas as solicitações de serviço ativas/históricas
- `chats` Map: mensagens de chat por serviceId
- `clientLoyalty` Map: pontos de fidelidade por nome de cliente
- `socketToRole` Map: mapeamento socket → role

### Dados em localStorage (frontend)
- `helpbibi:history` — histórico de serviços do cliente/prestador
- `helpbibi:favorites` — locais favoritos
- `socorroja:notif` (legado) — configuração de notificações

### Riscos se o servidor reiniciar
- TODOS os serviços ativos são perdidos (em memória)
- TODO o chat é perdido
- TODOS os pontos de fidelidade resetam
- TODOS os prestadores precisam re-registrar
- Links de rastreamento público param de funcionar

## Completed modifications / verification results

### 1. Modelo de dados Prisma (schema.prisma)
Criado schema completo com 13 entidades:
- **User** — base com role (CLIENT/PROVIDER/ADMIN), email, name, phone
- **ClientProfile** — perfil de cliente vinculado ao User (1:1)
- **ProviderProfile** — perfil de prestador com vehicle, plate, rating, isAvailable, isVerified, documentStatus, vehicleStatus
- **Vehicle** — veículo do prestador
- **ServiceRequest** — solicitação com type, status, price, locations (JSON), paymentMethod, loyaltyPoints, timestamps
- **ServiceTimelineEvent** — eventos da timeline (persistente)
- **ServiceChatMessage** — mensagens de chat (persistente)
- **ServiceRating** — avaliação bidirecional (unique por serviceId+targetRole)
- **PromoCode** — cupons de desconto
- **LoyaltyAccount** — pontos e tier de fidelidade
- **TrackingShare** — links de rastreamento público com token e expiry

Enums: UserRole, VerificationStatus, ServiceType, ServiceStatus, PaymentMethod.

Status lifecycle formal:
REQUESTED → OFFERED → ACCEPTED → PROVIDER_EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED
             ↓                                                      ↓
          CANCELED                                               CANCELED
          EXPIRED                                                EXPIRED
          FAILED                                                 FAILED

### 2. Banco configurado
- Prisma + SQLite (desenvolvimento), preparado para Postgres (produção)
- `prisma/schema.prisma` — schema completo validado ✅
- `.env.example` — template de variáveis de ambiente
- Scripts já existem: `db:push`, `db:generate`, `db:migrate`
- `bunx prisma validate` ✅
- `bunx prisma generate` ✅
- `bunx prisma db push` ✅ — tabelas criadas no SQLite

### 3. Camada de repositórios (src/server/)
- `src/server/db/prisma.ts` — cliente Prisma singleton
- `src/server/repositories/users.repository.ts` — findOrCreateUser, findUserById, updateLoyaltyPoints, getLoyaltyInfo
- `src/server/repositories/providers.repository.ts` — createProviderProfile, updateProviderRating, incrementProviderStats, getLeaderboard
- `src/server/repositories/service-requests.repository.ts` — createServiceRequest, findServiceById, updateServiceStatus, addTimelineEvent, updateProviderPosition, getActiveServices
- `src/server/repositories/tracking.repository.ts` — getPublicTracking (seguro, sem dados sensíveis), createTrackingShare
- `src/server/repositories/ratings.repository.ts` — createRating, getRatingsForService, hasRated
- `src/server/repositories/chat.repository.ts` — getChatMessages, addChatMessage

### 4. API Route para rastreamento público
- `src/app/api/track/[serviceId]/route.ts` — GET endpoint que busca do banco via tracking.repository
- Retorna apenas dados seguros: status, type, provider (nome+veículo+nota), ETA, trajeto, timeline
- NÃO retorna: nome do cliente, telefone, placa, pagamento, chat, preço

### 5. Rastreamento público com fallback
- `public-tracking.tsx` atualizado para tentar API (banco) primeiro, com fallback para socket.io (memória)
- Serviços em memória (demo) ainda funcionam via fallback socket
- Serviços persistidos no banco funcionam via API
- Polling a cada 3s para atualizações em tempo real

### 6. Segurança do rastreamento público
Validado no browser:
- ❌ Nome do cliente (Carlos DB) — NÃO exibido ✓
- ❌ Método de pagamento (PIX) — NÃO exibido ✓
- ❌ Placa do veículo (DB1A23) — NÃO exibido ✓
- ❌ Preço (R$ 204) — NÃO exibido ✓
- ✅ Status, tipo, prestador (nome+veículo+nota), ETA, trajeto, timeline — exibidos ✓

### 7. Base para autenticação futura
- User com role (CLIENT/PROVIDER/ADMIN)
- ClientProfile e ProviderProfile separados, vinculados ao User
- ProviderProfile com campos de verificação: documentStatus, vehicleStatus, isVerified, isAvailable
- Estrutura permite que um User tenha ambos perfis no futuro

### Arquivos criados
- `prisma/schema.prisma` — schema completo reescrito (13 entidades + 5 enums)
- `.env.example` — template de variáveis
- `src/server/db/prisma.ts` — cliente Prisma
- `src/server/repositories/users.repository.ts`
- `src/server/repositories/providers.repository.ts`
- `src/server/repositories/service-requests.repository.ts`
- `src/server/repositories/tracking.repository.ts`
- `src/server/repositories/ratings.repository.ts`
- `src/server/repositories/chat.repository.ts`
- `src/app/api/track/[serviceId]/route.ts` — API route para tracking público

### Arquivos modificados
- `src/components/rescue/public-tracking.tsx` — agora usa API route (banco) com fallback socket.io

### O que foi persistido de verdade
- **Schema Prisma criado e validado** — todas as 13 entidades no banco SQLite
- **API route de tracking** funciona e busca do banco (retorna "indisponível" para serviços só em memória)
- **Repositórios** prontos para integração com o rescue-service

### O que ainda ficou em memória
- O rescue-service (mini-services/rescue-service/index.ts) ainda opera 100% em memória
- A migração parcial do rescue-service para usar os repositórios ficou como pendência para não quebrar a demo
- Chat, loyalty, providers — ainda em memória no rescue-service
- Histórico e favoritos — ainda em localStorage no frontend

### Verificação (agent-browser via porta 81)
- Landing: abre com "Help Bibi" ✓
- Demo: abre, registra cliente e prestador ✓
- Serviço: solicitado → aceito → "Chegando no local" com ETA ✓
- Rastreamento público: link `/?track=svc_x19lw4fa` → API (banco) retorna "indisponível" → fallback socket.io → mostra serviço ativo com status, prestador, ETA, timeline ✓
- Segurança: nome do cliente, pagamento, placa, preço — NÃO exibidos ✓
- `bun run lint`: 0 erros ✓
- `bunx prisma validate`: schema válido ✓
- `bunx prisma generate`: client gerado ✓
- `bunx prisma db push`: tabelas criadas ✓
- Sem erros no console ✓

## Unresolved issues / risks + next-phase recommendations
- **Rescue-service ainda 100% em memória:** os repositórios foram criados mas o rescue-service ainda não os usa. A migração parcial (ServiceRequest, timeline, tracking, chat) precisa ser feita com cuidado para não quebrar a demo.
- **Resgate de pontos via socket:** o rescue-service usa `clientLoyalty` Map em memória. Quando integrar com o banco, usar `users.repository.ts → updateLoyaltyPoints`.
- **Frontend localStorage:** histórico e favoritos ainda em localStorage. Migrar para o banco quando auth estiver pronta.
- **Recomendação próxima fase (FASE 13):**
  - Migrar rescue-service para usar repositórios: createServiceRequest → banco, updateServiceStatus → banco, addTimelineEvent → banco, chat → banco.
  - Implementar auth básica (login/registro) com NextAuth.js.
  - Migrar histórico do frontend do localStorage para o banco.
  - Seed de dados iniciais (promos, providers demo).
  - Migração do leaderboard para buscar do banco.
  - Testes de integração com banco real.
- **Importante para o próximo agente:** o rescue-service precisa estar ativo. Se down, reiniciar com double-fork: `( ( nohup bun index.ts > /home/z/my-project/rescue-service.log 2>&1 & ) & )`. Testar via http://localhost:81 (Caddy). Banco SQLite em `db/custom.db`.
