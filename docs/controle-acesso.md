# WebSec Inspector — Controle de acesso por perfil

## Perfis e escopo

O backend possui três perfis funcionais, persistidos na coluna `users.role`:

- `CLIENTE`: cria scans para si, consulta seus scans e o histórico dos próprios domínios.
- `GERENTE`: acessa seus próprios recursos e recursos dos usuários com perfil `CLIENTE` cujo `manager_id` aponta para esse gerente. Pode atualizar metadados e excluir logicamente os scans dentro desse escopo.
- `ADMINISTRADOR`: acesso global às operações de scan/histórico e às rotas administrativas de atribuição de perfil e gerente.

A atribuição de gerente é explícita. O cliente não pode escolher seu gerente nem seu perfil pelo cadastro público. Somente um administrador pode atribuir papéis ou alterar `manager_id` usando `/api/admin/users/...`.

## Regras aplicadas

| Operação | Cliente | Gerente | Administrador |
|---|---|---|---|
| Criar scan para si | Permitido | Permitido | Permitido |
| Criar scan para cliente atribuído | Não aplicável | Permitido via `targetUserId` | Permitido via `targetUserId` |
| Consultar scan | Próprio | Próprio ou cliente atribuído | Todos |
| Consultar histórico de domínio | Domínio próprio | Próprio ou cliente atribuído | Todos |
| Alterar nome/identificação de scan | Negado | Dentro do escopo | Todos |
| Excluir scan | Negado | Dentro do escopo, se não estiver `QUEUED`/`RUNNING` | Mesma regra de estado |
| Alterar perfil ou gerente de usuário | Negado | Negado | Permitido |
| Usar bypass de verificação | Negado | Negado | Somente com bypass habilitado no perfil `dev` |

Os scans são excluídos logicamente (`deleted_at`) para preservar findings e histórico de auditoria. Scans `QUEUED` ou `RUNNING` não podem ser excluídos, evitando remover do fluxo uma tarefa que o worker pode estar processando. A edição de scan altera somente `name`; o status é controlado pelo fluxo de processamento, não por CRUD genérico.

## Endpoints

### Scans

- `POST /api/scans` — cria scan. Corpo: `{"url":"https://example.com"}`. `name` é opcional. `targetUserId` também é opcional; quando informado, o backend verifica o escopo do usuário autenticado antes de usar esse proprietário.
- `POST /api/scans/{id}/confirm-verification` — confirma a propriedade e enfileira o scan. Usa ownership/escopo.
- `POST /api/scans/{id}/confirm-verification?bypass=true` — bypass restrito a administrador em ambiente de desenvolvimento com a flag habilitada.
- `GET /api/scans/{id}` — consulta scan e findings dentro do escopo.
- `GET /api/scans/domain/{domainId}/history` — consulta histórico apenas se o domínio estiver no escopo.
- `PUT /api/scans/{id}` — gerente/administrador altera somente o nome. Corpo: `{"name":"Auditoria do portal"}`.
- `DELETE /api/scans/{id}` — gerente/administrador realiza exclusão lógica dentro do escopo.

### Administração de usuários

- `PUT /api/admin/users/{userId}/role` — administrador altera o perfil. Exemplo: `{"role":"GERENTE"}`.
- `PUT /api/admin/users/{userId}/manager` — administrador atribui um cliente a um gerente. Exemplo: `{"managerId":17}`. Para remover o vínculo, envie `{"managerId":null}`.

As rotas `/api/admin/**` também são protegidas no Spring Security pela autoridade `ROLE_ADMINISTRADOR`. O service repete a validação administrativa para defesa em profundidade.

## Ownership e respostas HTTP

O token identifica o usuário; o backend consulta o perfil atual no banco a cada requisição protegida e nunca aceita role fornecida pelo cliente. Para cada scan, o proprietário é obtido por `scan.domain.user`. Para histórico, o proprietário é `domain.user`.

- `401 Unauthorized`: JWT ausente, inválido ou conta removida.
- `403 Forbidden`: perfil sem permissão para a operação.
- `404 Not Found`: recurso inexistente, removido logicamente ou fora do escopo do usuário (não revela recursos de terceiros).
- `409 Conflict`: transição/estado incompatível, tentativa de excluir scan em fila/em execução ou bypass desabilitado.
- `400 Bad Request`: dados de entrada inválidos.

## Bypass de desenvolvimento

Desabilitado por padrão. Requer simultaneamente:

1. usuário com perfil `ADMINISTRADOR`;
2. perfil Spring `dev` ativo;
3. `WEBSEC_DEV_BYPASS_ENABLED=true`.

O perfil `prod` bloqueia o mecanismo mesmo que a flag esteja configurada. Cliente e gerente não podem ativá-lo. O bypass dispensa somente a verificação de domínio para aquela execução e não marca o domínio como verificado.

Exemplo para ambiente local (não usar em produção):

```bash
SPRING_PROFILES_ACTIVE=dev WEBSEC_DEV_BYPASS_ENABLED=true docker compose up --build
```

## Compatibilidade e preparação do banco

`UserRoleConverter` mantém compatibilidade de leitura com valores antigos `USER` e `ADMIN`, mapeando-os para `CLIENTE` e `ADMINISTRADOR`. Novos valores são persistidos com os nomes funcionais atuais. O `ddl-auto: update` adiciona colunas, mas não deve ser usado para substituir a constraint histórica de enum. Um banco que ainda aceita apenas `USER` e `ADMIN` rejeita o cadastro de `CLIENTE` com SQLSTATE `23514`, resultando em HTTP 500.

Após backup, aplique `infra/migrations/20261010-normalizar-perfis.sql` com parada em erro:

```bash
docker exec -i websec-production-postgres-1 \
  psql -X -v ON_ERROR_STOP=1 -U websec -d websec \
  < infra/migrations/20261010-normalizar-perfis.sql
```

Execute no host Docker a partir da cópia do código que contém a migração corrigida, com as permissões necessárias para Docker. O script verifica perfis desconhecidos, bloqueia escritas durante a alteração, substitui o CHECK antigo e normaliza os valores na mesma transação. Preserva IDs, e-mails, senhas e vínculos, sem promover clientes a administradores. Pode ser executado novamente. Caso encontre perfil desconhecido ou exceda o prazo de lock, a transação falha e não deve ser contornada removendo a validação.

O deploy atual não executa esse SQL automaticamente: merge ou rebuild da imagem, por si só, não repara um banco já existente. Confirme o CHECK final e valide cadastro e login depois da aplicação. O projeto ainda não possui migrations automatizadas para o schema completo.

Para bootstrap inicial, execute uma vez no banco de desenvolvimento usando o e-mail de uma conta conhecida:

```sql
UPDATE users SET role = 'ADMINISTRADOR' WHERE email = 'admin@exemplo.com';
```

Depois que existir um administrador, use os endpoints de administração. Não exponha um campo de perfil no cadastro público.

## Testes automatizados

Os testes unitários de autorização cobrem ownership de cliente, escopo de gerente, acesso global administrativo, histórico de domínio, bloqueio de edição por cliente, compatibilidade de roles e as condições do bypass.

Execute no diretório raiz:

```bash
mvn -f backend/pom.xml test
```
