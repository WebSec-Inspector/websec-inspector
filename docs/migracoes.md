# Migrações versionadas e operação

O serviço `migrate` executa os SQLs imutáveis de `worker/migrations`, usando o driver PostgreSQL já existente na imagem do worker. O histórico `websec_schema_history` registra versão e SHA-256. Um lock transacional serializa execuções. Bootstrap, upgrades e histórico usam uma única transação; falha reverte tudo. Novas mudanças exigem novo arquivo numerado, sem BEGIN/COMMIT e sem comandos incompatíveis com transação.

Foi escolhido esse executável compartilhado em vez de introduzir Flyway e uma segunda imagem: backend e worker usam o mesmo schema, e o projeto já possui as migrações SQL e psycopg2. O backend passa a validar o schema em vez de alterá-lo; o worker verifica o histórico antes de consumir a fila.

## Banco novo

`docker compose up --build` inicia o banco e aguarda `migrate` antes do backend. O worker só consome após conferir a versão. Em produção o deploy baixa as imagens e faz backup do ambiente existente antes de parar backend/worker e executar a migração.

## Primeira adoção de banco existente

1. Fazer inventário do schema e backup validado, incluindo teste de restauração em banco separado. Preservar o dump anterior ao deploy.
2. Conferir se as cinco tabelas e colunas básicas correspondem à aplicação. Tabelas adicionais ou schema parcial bloqueiam a adoção, mesmo com a opção explícita. A validação final também exige tipos, tamanhos, nulabilidade, identidade e chaves primárias/únicas/estrangeiras compatíveis. O inventário manual de dados e constraints adicionais continua necessário.
3. Definir `SCHEMA_ADOPT_LEGACY=true` apenas para a primeira execução auditada. Não há baseline automático. Nunca usar isso para aceitar um schema desconhecido.
4. Executar a versão candidata primeiro em staging restaurado. Conferir contas, tokens e achados antes/depois e o funcionamento do backend com ddl-auto=validate.
5. Após sucesso, voltar `SCHEMA_ADOPT_LEGACY=false`. Essa flag não ignora checksum, versão futura ou gaps de histórico.

SQLs históricos de `infra/migrations` continuam disponíveis para referência e instalações antigas. Depois da adoção, não executá-los como substituto do histórico versionado.

## Falha e recuperação

- Antes de invocar o migrador: o deploy pode restaurar as imagens anteriores. Uma vez invocado, um erro de transporte pode ocultar um commit; o rollback automático passa a ser bloqueado mesmo quando o cliente retorna erro. A transação SQL em si reverte alterações em caso de erro de SQL.
- Depois do commit: a volta automática para imagens antigas é bloqueada de forma conservadora, mesmo se a execução foi no-op. Backend/worker ficam parados para evitar acesso incompatível. A revisão anterior em `.release.env` é um registro da última liberação verificada, não prova de que continua ativa.
- Recuperar usando uma imagem compatível com o schema ou restaurar o backup em manutenção, com procedimento coordenado. Nunca fazer downgrade de schema nem restaurar dados automaticamente.
- `.release.env` e `current` só são atualizados após a verificação da nova revisão. Backup, mensagens operacionais e log do job de migração permitem identificar a tentativa falha.

## Validação

`python -m unittest discover -s worker/tests -v` com `TEST_POSTGRES_DSN` em PostgreSQL descartável; `python -m unittest discover -s infra/production/tests -v` em Linux. Cobrem banco vazio, adoção explícita, preservação, constraints históricas, rollback, checksum, ordem de deploy e bloqueio de rollback após migração.

Refs #69, #47. Não aplicar esta mudança diretamente em produção antes da revisão e validação em staging.
