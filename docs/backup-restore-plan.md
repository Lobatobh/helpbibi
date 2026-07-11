# Help Bibi - Backup and Restore Plan

> F34-A documental. Este plano nao executa backup, restore, comandos Docker, comandos de banco ou alteracoes de volume.

## Objetivo

Definir uma estrategia minima de backup e restore para pre-producao, com foco em PostgreSQL, arquivos de configuracao seguros e capacidade real de recuperacao.

## Itens a proteger

| Item | Estrategia | Observacao |
| --- | --- | --- |
| PostgreSQL | Backup logico com `pg_dump` ou ferramenta equivalente | Testar restore antes de dados reais |
| `.env` da VPS | Backup criptografado em cofre seguro | Nunca versionar |
| Compose implantado | Baseline versionado no Git e copia operacional | Nao incluir secrets |
| Logs operacionais | Retencao definida conforme LGPD | Evitar dados sensiveis desnecessarios |
| Evidencias de deploy | Commit, data, responsavel, status de health checks | Sem valores secretos |

## Frequencia sugerida

- Banco de pre-producao: backup diario.
- Antes de mudanca sensivel: backup manual.
- Retencao curta inicial: 7 diarios e 4 semanais, ajustavel apos volume real.
- Restore drill: mensal ou antes de qualquer piloto real.

## Procedimento de backup

1. Confirmar que o ambiente esta estavel.
2. Gerar backup do PostgreSQL com usuario de menor privilegio possivel.
3. Armazenar o arquivo em local criptografado fora da VPS.
4. Registrar checksum, data, ambiente e responsavel.
5. Validar que o backup nao foi salvo dentro do repositorio.
6. Confirmar que nenhum `.db`, `.sqlite` ou `.bak*` foi adicionado ao Git.

## Procedimento de restore isolado

1. Criar ambiente separado de teste.
2. Restaurar o dump em PostgreSQL isolado.
3. Apontar uma instancia temporaria para o banco restaurado.
4. Validar `/api/health` e `/api/health/db`.
5. Executar smoke manual da demo publica sem usuarios reais.
6. Registrar resultado e tempo de recuperacao.
7. Descartar o ambiente isolado sem afetar producao/pre-producao.

## Criterios de aceite

- Existe backup automatico fora da VPS.
- Existe restore testado em ambiente isolado.
- O tempo estimado de recuperacao foi medido.
- `.env` real nao foi versionado.
- Bancos locais e backups nao foram versionados.
- O procedimento de rollback esta alinhado com `docs/rollback-plan.md`.

## Bloqueios atuais

- Backup automatico ainda precisa ser configurado.
- Restore ainda precisa ser ensaiado.
- Retencao final depende de decisao juridica/LGPD.
- Monitoramento de falha de backup ainda precisa ser definido.
