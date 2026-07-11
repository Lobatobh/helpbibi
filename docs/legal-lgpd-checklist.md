# Help Bibi - Legal and LGPD Checklist

> F34-A documental. Este checklist nao substitui revisao juridica. Ele lista pontos minimos antes de piloto real ou producao comercial.

## Objetivo

Organizar pendencias legais, privacidade e LGPD para a Help Bibi antes do uso com clientes e prestadores reais.

## Checklist principal

| Item | Risco | Status esperado antes de piloto real |
| --- | --- | --- |
| Termos de uso | Uso sem contrato claro | Publicado e revisado |
| Politica de privacidade | Coleta de dados sem transparencia | Publicada e revisada |
| Base legal | Tratamento de dados sem enquadramento | Definida por categoria de dado |
| Consentimento | Usuario nao entende coleta de localizacao | Fluxo claro e registrado |
| Dados de localizacao | Dado sensivel operacionalmente | Minimizar, proteger e definir retencao |
| Dados de prestador | Placa, veiculo e documentos podem ser pessoais | Mapear finalidade e acesso |
| Dados de cliente | Nome, contato, localizacao e historico | Mapear finalidade e acesso |
| Retencao | Guardar dados alem do necessario | Politica definida |
| Exclusao de dados | Titular sem canal de solicitacao | Processo e canal definidos |
| Auditoria | Logs com dados excessivos | Revisar mascaramento e finalidade |
| Incidentes | Vazamento sem resposta formal | Plano de resposta definido |
| Pagamentos | Dados financeiros e reembolsos | Regras futuras documentadas antes de Mercado Pago real |
| Responsabilidade do socorro | Expectativa de atendimento real | Termos claros sobre disponibilidade, riscos e limites |
| Prestadores | Onboarding sem validacao | Processo comercial e documental definido |

## Dados pessoais a mapear

- Identificacao de cliente.
- Identificacao de prestador.
- Localizacao aproximada ou precisa.
- Historico de solicitacoes.
- Mensagens ou eventos de atendimento, se aplicavel.
- Avaliacoes.
- Dados de pagamento futuros.
- Logs tecnicos associados a usuario ou IP.

## Controles minimos

- Coletar somente o necessario para o atendimento.
- Restringir acesso administrativo.
- Registrar finalidade de cada dado.
- Definir prazo de retencao por tipo de dado.
- Criar canal para solicitacoes LGPD.
- Evitar secrets e dados sensiveis em logs.
- Revisar textos publicos antes do piloto real.

## Criterios de aceite

- Termos de uso e politica de privacidade publicados.
- Fluxo de consentimento de localizacao revisado.
- Retencao e exclusao documentadas.
- Processo de incidente definido.
- Responsavel LGPD definido.
- Go/no-go juridico aprovado antes de producao comercial.
