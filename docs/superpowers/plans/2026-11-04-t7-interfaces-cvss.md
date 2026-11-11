# T7 e CVSS real — implementação

> For agentic workers: use superpowers:subagent-driven-development for independent tasks and executing-plans for the CVSS integration. Each functional branch requires review and green CI; no merge/deploy without the user's integration decision.

Goal: concluir as pendências T7 preservando a main 0ede917 e permitir avaliação CVSS4.0 Base verificável, escolhida pelo usuário em 04/11/2026.

Architecture: Spring/React/PostgreSQL/worker atuais. Avaliação humana fornece 11 métricas obrigatórias; Java calcula CVSS-B usando biblioteca versionada, sem inferir métricas do risco ZAP. Risco ZAP, score aproximado legado e CVSS são campos separados. Escopo do ator e revisões evitam acesso entre contas e sobrescrita concorrente. PDF regenerado após avaliação usa token de geração existente para descartar versão obsoleta.

## T7-A — Resultados e CVSS, PR própria
- [ ] Migração012 aditiva para avaliação atual e histórico por finding, vetor/versão/score/gravidade/justificativa/autor/data/revisão; não editar001–010.
- [ ] Motor CVSS4.0 Base com validação estrita de 11 métricas, sem defaults e sem aceitar nota do cliente. Vetores oficiais/de referência e erros têm testes.
- [ ] Preview autenticado; leitura por escopo; gravação por gerente/admin no escopo, só scan concluído e não excluído, revisão esperada e auditoria append-only. Cliente pode ler; canAssess informa permissão.
- [ ] Invalidação segura de PDF em andamento/pronto após alteração, mantendo COMPLETED; worker inclui avaliação salva no PDF, com versão/vetor e score aproximado separado.
- [ ] Resultados com filtro por risco ZAP, evidências como texto, cards expansíveis acessíveis, CVSS não avaliado claramente indicado; histórico diferencia nenhum achado de INFORMATIONAL.
- [ ] Corrigir o reset de loading da comparação para query inválida e verificar a navegação.
- [ ] Testes apropriados, revisão independente e CI; abrir PR e registrar gate pós-merge.

## T7-B — Cadastro, PR independente
- [ ] Confirmar senha no frontend, atualizar validação ao editar senha, prevenir duplo submit.
- [ ] Erros seguros de duplicidade, rede e indisponibilidade, inclusive duas criações concorrentes no backend sem500.
- [ ] Preservar cadastro públicoCLIENTE, API atual e login automático já existente; não alegar aprovação do requisito antigo de retorno ao login.
- [ ] Testes UI/PG, revisão e CI; sem editar JWT/refresh nesta branch.

## T7-C — Listagem paginada, PR independente
- [ ] GET/api/scans paginado20/max100, ordenação estável createdAt/id desc, filtros opcionais domínio/status, escopo cliente/gerente/admin e exclusão lógica.
- [ ] Resumo inclui contagem/maior risco ZAP, distingue INFORMATIONAL de ausência; histórico de domínio arquivado preservado.
- [ ] Página /varreduras, filtros, paginação e descarte de respostas atrasadas; testes UI/PG de permissão/paginação.
- [ ] Revisão e CI; navegação adicionada na própria branch sem sobrescrever Dashboard de outra branch.

## T7-D — Sessão, PR própria após cadastro/CVSS
- [ ] Implementar refresh rotativo e revogável se mantido o critério original; accessJWT existente continua compatível. Hash do token no banco, limites/expiração, logout/replay/concorrência e frontend controlam renovação.
- [ ] Migração013 sobre012 para manter manifesto contíguo; branch empilhada explicita dependência sem duplicar diffs de revisão.
- [ ] Testar rotação/replay, expiração/revogação e isolamentos sem logar credenciais. Revisão de segurança e CI antes de PR pronta.

## Verificação após cada merge
Atualizar origin/main; conferir diff integrado e alterações da equipe; CI/CD do SHA mesclado, imagens, version.txt, saúde/schema e fluxo afetado em ambiente controlado. Não encerrar issues apenas pela PR/CI. T8/T9 e URLoriginal#28/provedorSMTP externo continuam etapas separadas.

## Isolamento e decisões
Cadastro e listagem usam clones isolados porque a ferramenta de worktree não pôde registrar o repositório já utilizado fora dos roots cadastrados. São branches reversíveis, sem alteração dos arquivos originais do usuário. Revisões pertencem ao proprietário humano responsável; autor/data/vetor permitem reproduzir a nota, não validam automaticamente a escolha das métricas. Base apenas nesta entrega; Threat/Environmental não são aceitos silenciosamente como Base.
