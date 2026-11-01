# Recuperação e prevenção de falhas de deploy

## Incidente corrigido

A adoção inicial de um banco legado foi recusada por ausência da aprovação explícita. O deploy já havia parado os escritores e manteve manutenção de forma conservadora, pois uma falha de transporte pode esconder um commit. As tentativas seguintes não avançaram: o backup usava `exec` no worker parado.

A recuperação foi autorizada, com dump e arquivo de relatórios preservados. O dump foi restaurado em PostgreSQL separado, numa rede Docker interna sem portas publicadas, e recebeu as migrações da revisão candidata. Somente depois da aprovação dessa etapa, a mesma sequência foi executada no banco principal. Conferências dos dados originais antes/depois não encontraram alteração, considerando a normalização prevista de perfis legados.

Backend, worker e frontend foram iniciados na revisão atual da main. Cadastro, login e emissão/recuperação autenticada de desafio foram verificados; a conta temporária de teste e seu desafio foram removidos. Não foi criada varredura externa. A recuperação manual não apaga o registro histórico de falha no GitHub Actions.

## Backup durante uma indisponibilidade

`backup.sh` usa o PostgreSQL disponível para o dump e `docker cp` para obter um tar dos relatórios do container worker, que pode estar parado. Não inicia o worker nem sua aplicação. O container precisa existir para localizar o conteúdo; se foi removido, o script falha em vez de declarar um backup vazio como válido.

O dump precisa ser não vazio e ter catálogo legível por `pg_restore --list`. O gzip dos relatórios é checado, assim como a estrutura e o tamanho em blocos do tar. Apenas após essas verificações e a cópia de `release.env`, o script grava `COMPLETE` e informa sucesso. Isso é validação básica do arquivo, não substitui testes periódicos de restauração completa como o realizado nesta recuperação.

A retenção automática de sete backups passa a contar somente diretórios com marcador `COMPLETE`. Backups antigos sem marcador e tentativas incompletas são preservados para revisão operacional, sem remoção automática por essa regra. A remoção também valida o caminho absoluto e rejeita links simbólicos. Os backups especiais da recuperação não participam dessa retenção.

## Preflight antes de interromper serviços

O migrador oferece `python schema_migrations.py --preflight`: executa transação somente leitura, verifica aprovação para legado e compatibilidade do histórico/checksums. Não aplica SQL nem cria o histórico. Mensagens de `RuntimeError` do validador descrevem o motivo estrutural sem imprimir dados de contas/achados; detalhes de erros PostgreSQL continuam omitidos.

Se já existe uma release, o deploy faz backup e executa esse gate contra o banco existente **antes de parar/recriar qualquer serviço ou dependência**. Só após passar, instala o tratamento de recuperação, para os escritores e reconcilia a infraestrutura candidata. No primeiro deploy, inicia as dependências necessárias para a primeira consulta.

Uma falha de preflight deixa a aplicação anterior intacta. Uma falha ao reconciliar infraestrutura depois do gate entra no tratamento de recuperação anterior à migração. Depois de invocar a migração, a proteção conservadora contra rollback de imagens permanece: o operador deve confirmar o schema e usar revisão compatível ou restaurar o backup em manutenção.

Se `.release.env` estiver ilegível para `websec` (por exemplo, após uma execução manual como `root`), o deploy recompõe o metadata da release anterior a partir do link `current`, desde que ele aponte para uma release válida. Se o link não permitir identificar a release com segurança, o deploy para antes de interromper serviços; corrija a propriedade e mantenha o arquivo privado com `sudo chown websec:websec /opt/websec-inspector/.release.env && sudo chmod 0600 /opt/websec-inspector/.release.env`.

O preflight não prevê todos os erros possíveis do SQL pendente. Inventário, backup e teste do upgrade numa restauração isolada continuam necessários, especialmente antes da primeira adoção. A aprovação `SCHEMA_ADOPT_LEGACY=true` deve ser usada apenas na execução auditada, não como configuração permanente para aceitar bancos desconhecidos. Após adoção, o histórico permite as próximas atualizações sem essa opção.

## Evidências automatizadas

Testes de backup simulam worker parado, container ausente, dump inválido, tar truncado e preservação de backups não certificados. Os testes de deploy exigem ausência de `up` e `stop` antes de um gate recusado e recuperação da configuração anterior se a infraestrutura falhar depois dele. PostgreSQL descartável comprova que preflight de legado não altera roles, tabelas ou histórico e que checksum modificado bloqueia a atualização.
