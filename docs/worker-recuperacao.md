# Recuperação do worker e limites de execução

Refs #70, #19, #17. Esta entrega depende das migrações versionadas da PR #72.

## Trabalho durável

O registro `scans.status=QUEUED`, gravado pela confirmação autorizada na transação de negócio, é a fonte durável de trabalho. Redis mantém `scan-queue` como notificação para acordar o worker; perder ou duplicar a mensagem não perde nem duplica o scan. Nenhum payload de Redis concede permissão para executar um ID.

Em vez de adicionar outro outbox/dispatcher e Redis Streams, o próprio registro QUEUED serve como trabalho transacional. Essa escolha reduz componentes e preserva as notificações existentes. O custo é uma consulta periódica ao PostgreSQL, inclusive sem mensagens Redis. Um erro de notificação depois do commit não transforma a confirmação em HTTP 500.

## Posse, recuperação e persistência

- Claim transacional com `FOR UPDATE SKIP LOCKED`, identificador aleatório por tentativa e lease de 60 segundos.
- Heartbeat antes das chamadas ao ZAP renova o lease. Posse expirada não pode ser renovada nem concluir a gravação.
- Somente QUEUED elegível ou RUNNING com posse expirada é retomado; scans excluídos ou aguardando comprovação não entram no processamento.
- No máximo três tentativas. Falhas transitórias têm espera de 30 segundos multiplicada pelo número da tentativa; dados inválidos falham sem repetição automática.
- Achados e COMPLETED são confirmados na mesma transação, sob bloqueio e validação de posse. Tentativa antiga não pode sobrescrever resultados de uma retomada.
- Após queda antes do commit de resultados, outro worker retoma após expirar o lease. Após commit, o scan COMPLETED não é selecionado novamente, mesmo com mensagem repetida.

## Instância dedicada do ZAP

Um advisory lock de sessão no PostgreSQL serializa o uso do ZAP por workers. Fechar ou perder a conexão libera o lock. A instância ZAP deve ser exclusiva desta aplicação: antes de cada tentativa o worker interrompe jobs abandonados e abre uma sessão nova, removendo o estado transitório anterior. Resultados já persistidos no PostgreSQL não são removidos.

Se um worker perde posse, abandona gravação e não tenta interromper IDs que podem ter sido reutilizados por outra sessão. Chamadas HTTP e SQL possuem timeouts; a retomada aguarda a expiração do lease, além da liberação do lock de sessão.

## Prazo e erros auxiliares

`ZAP_SCAN_TIMEOUT_SECONDS` define o orçamento total para spider, active scan e espera do processamento passivo; padrão de 900 segundos. Chamadas ao ZAP usam no máximo 10 segundos por chamada e o restante do orçamento. O encerramento tenta interromper apenas os IDs desta tentativa, com até cinco segundos por chamada de limpeza. Esses segundos de limpeza e checagens SQL podem estender o tempo observado além do orçamento do scanner.

Falha de PDF ou entrega não muda um scan concluído para FAILED. Ainda não há retentativa durável independente de PDF/e-mail: isso permanece nas #29/#31. SMTP possui timeout de 15 segundos, mas a geração do PDF ainda é síncrona nesta entrega.

Preservação da URL completa (#28), token/cancelamento de verificação (#66–#68), configuração Light/profundidade e metodologia CVSS (#19) continuam como escopos separados; esta PR não os declara concluídos.

## Evidências exigidas

Testes PostgreSQL descartáveis: trabalho sem Redis, queda de conexão, liberação do lock, retomada e troca de token, tentativa antiga rejeitada, limite de tentativas e rollback de resultados inválidos. Testes com API ZAP substituída: deadline, IDs explícitos e perda de posse. Testes do backend: notificação Redis indisponível preserva QUEUED. Nenhuma varredura em domínio externo é necessária para executar essa suíte.

Antes da liberação, validar em staging a interrupção de um processo worker com scan controlado, a retomada no ZAP real e o scan seguinte. Não considerar testes simulados como prova dessa etapa integrada.
