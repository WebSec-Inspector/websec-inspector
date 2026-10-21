# Issue #52 — revalidação para revisão

Data: 21/10/2026. Base da PR: `9ddd65ec63848c75c91ca65c90cb57e0bd4df1be`.

## O que foi preservado

A main recebeu as correções de autorização (#59), Dashboard/polling (#60), parser ZAP (#62)
e restauração de autenticação/infraestrutura (#63) depois do primeiro teste.
Esta branch parte dessa main atual. Não modifica fontes da aplicação, backend, worker em produção,
Docker Compose, migrations ou workflows. Mantém `react-test-renderer`, Vitest 2 e o comando de
CI existentes. Novos testes são adicionais e incluídos na descoberta normal.

A cópia original e a entrega inicial foram preservadas em outra pasta. Não houve reset destrutivo,
force-push, merge em main ou deploy. A PR deve ser revisada antes de integração.

## Revalidação atual

- Frontend: **30/30 testes passaram**, incluindo 3 testes preexistentes e 27 novos.
- Regressões da issue: polling pendente até conclusão; FAILED; histórico com domainId real do
  DomainProvider; erro de rede; timeout; HTTP 500/404; corpo sem domainId; findings nulo;
  histórico vazio; domínio pendente; erro de histórico.
- Worker: **9 testes passaram**, incluindo 6 existentes e 3 novos; **2 testes PostgreSQL SKIP**
  porque TEST_POSTGRES_DSN não foi configurado. O CI existente possui banco descartável para eles.
- Build TypeScript/Vite: passou.
- Diff contra a main: fontes de produto, Docker, migrations, testes existentes e CI preservados.

Os testes frontend usam componentes/provedores/Axios reais e HTTP simulado. Os testes novos do worker
substituem ZAP, cursor, PDF e SMTP nas fronteiras. Isso não aprova a API/infraestrutura integrada atual.
Avisos de React Router dos testes existentes e RequestsDependencyWarning das dependências Python
foram preservados nas saídas; não são falhas de asserção.

## Antes e depois, sem misturar versões

| Cenário | b440325 (histórico) | 9ddd65e (revalidação atual) |
| --- | --- | --- |
| Dashboard/histórico/domainId | falha real e simulada | componente/provedor/API simulada aprovados |
| PENDING_VERIFICATION no resultado | polling interrompido | polling segue até COMPLETED no teste |
| Rede/timeout/HTTP/scan inexistente | loading sem recuperação | alerta após tentativas limitadas no teste |
| FAILED | mensagem de espera | mensagem de falha e nova execução |
| Payload inválido/findings nulo | crash com findings nulo | resposta inválida tratada e findings nulo normalizado |
| Autorização entre contas | acesso indevido reproduzido na API antiga | correção #59 preservada; reteste API atual pendente |
| Fluxo ZAP/PDF | scan local e PDF realizados na versão antiga | reteste integrado atual pendente |

As evidências antigas foram rotuladas em [historico-b440325](historico-b440325/relatorio.md).
Não se deve abrir/reabrir um bug atual usando apenas esses resultados antigos.
Evidências atuais: [frontend](evidencias-atual/frontend-results.json),
[saída frontend](evidencias-atual/frontend-console.txt),
[worker](evidencias-atual/worker-console.txt), [build](evidencias-atual/build-console.txt).

## Pendências para concluir a issue

A sessão não tem acesso ao mecanismo Docker para substituir o ambiente antigo. Assim, a PR entrega
QA pronta para revisão, mas **não fecha a issue #52**: é necessário executar API, autorização,
Dashboard contra API real e fluxo integrado nas imagens atuais. Os scripts estão em `qa/` e
as instruções em [qa/README.md](../../../qa/README.md). Não se marcou a tarefa como Done.

A troca do token ao repetir submissão, o status da senha incorreta e os contratos de recurso ausente
precisam de reteste/triagem na versão implantada. A inspeção do código atual por si só não substitui
essa execução. Não há alegação de exploração atual de acesso indevido.

Matrizes históricas completas, falhas e capturas estão preservadas. A matriz atual resume a
aceitação observável nesta branch; cenários de infraestrutura atual permanecem pendentes.

[Matriz da revisão atual](matriz-atual.md) · [CSV](matriz-atual.csv)
