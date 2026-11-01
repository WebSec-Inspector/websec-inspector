# Resolução das lacunas técnicas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Este documento é uma proposta; não autoriza deploy, publicação de tarefas nem alteração de escopo por conta própria.

**Goal:** concluir as funcionalidades pendentes, tornar o processamento recuperável e obter evidências de aceitação para as 25 issues técnicas auditadas.

**Architecture:** preservar Spring Boot/React-Vite/PostgreSQL/Redis/ZAP. Separar o estado da varredura dos estados de geração e envio do relatório. Usar migrações versionadas, trabalhos idempotentes e autorização por proprietário/escopo em todas as novas operações.

**Tech Stack:** Java 17, Spring Boot, React/TypeScript, Python, PostgreSQL 16, Redis, Docker Compose, GitHub Actions; Playwright como adição proposta para E2E.

**Spec:** [Contratos funcionais](../../contratos-funcionais.md). Base auditada: `bb3f76f116c7da9fed412f7efadfc9c36550ff80`.

## Restrições globais

- Usar branches `fix/...` ou `feat/...`, conforme preferência do usuário. Uma PR por entrega verificável; incluir issue, limites do escopo e evidências.
- Não trocar de framework/fila para satisfazer nomenclatura antiga de uma issue.
- Não declarar CVSS sem cálculo e vetor válidos. Não apresentar envio para Mailpit como entrega externa.
- Preservar contas, findings, scans, tokens publicados e regras de autorização existentes.
- Testes destrutivos, SMTP e varreduras usam ambientes e alvos controlados. Não usar produção como bancada de falhas.
- Antes de implementar cada tarefa: atualizar a base, conferir instruções do repositório e rever os contratos propostos abaixo.
- Antes de encerrar uma issue: implementação + revisão + testes pertinentes + evidência integrada na revisão implantada.
- Nomes de arquivos novos e interfaces abaixo são propostas; confirmar compatibilidade com os modelos na implementação.

## Verificação obrigatória após cada merge

- Atualizar origin/main e revisar o diff integrado, incluindo alterações de outras pessoas; nunca restaurar arquivos de uma base antiga.
- Confirmar SHA do merge, CI da main, publicação de imagens e deploy; CI da PR isolada não encerra esta etapa.
- Conferir version.txt contra o SHA implantado, saúde da API e regressões do fluxo afetado em ambiente controlado.
- Registrar revisão, execução, evidências e pendências no diário de execução; se falhar, manter a entrega em aberto e corrigir em PR própria.
- Base de retomada: 20efa0b; preservar CRUD/arquivamento (#79) e correções de deploy (#80/#81) de Jaçanã.

## Pontos de revisão obrigatórios

1. Reinício após retirada da fila: trabalho deve ser recuperado sem perder o scan nem duplicar seus resultados (T2).
2. Cancelamento concorrente com confirmação: um scan cancelado não pode entrar na fila depois (T3).
3. Downloads e comparação de IDs de outra conta: negar acesso, incluindo escopo de gerente (T4/T6).
4. PDF ou SMTP indisponível: resultado concluído permanece concluído e permite retentativa independente (T4/T5).
5. Banco legado com dados inesperados: migração deve abortar com diagnóstico, sem alteração parcial (T1).

## Ordem e dependências

T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.

Essa é a ordem sugerida de integração; T6/T7 podem ser preparados independentemente depois que os contratos de T0 estiverem definidos. T8 deve começar com a infraestrutura mínima de testes e crescer junto das entregas. Não esperar o fim para escrever testes.

## T0 — Ajustar backlog e contratos antes das mudanças

**Issues:** todas; foco #3/#5/#17/#19/#22/#23/#25/#29/#30/#31.
**Arquivos:** criar `docs/contratos-funcionais.md`; atualizar `docs/requisitos.md` e `docs/arquitetura.md` apenas nas decisões aprovadas.

- [ ] Registrar a matriz auditada no backlog: reabrir #25/#29/#30/#31; usar #30 como principal da comparação e referenciar #24. Não publicar sem autorização para essa ação.
- [ ] Usar #11/#28/#52/#66/#67/#68 existentes, sem criar duplicatas. Propor duas novas tarefas: recuperação do worker e compatibilidade de migrações no deploy.
- [ ] Registrar decisões propostas: manter Redis, Spring e Vite; manter ReportLab se passar nos critérios de conteúdo/layout; usar SMTP externo configurável para entrega real, com Mailpit restrito a testes. Se Resend for requisito obrigatório, manter #23 pendente até integrar a API dele.
- [ ] Resolver #5: implementar refresh token ou aprovar explicitamente JWT com reautenticação após expiração. Não marcar o escopo original como cumprido sem uma dessas decisões.
- [ ] Resolver #3: proposta de manter autenticação automática após cadastro; incluir confirmação de senha na interface. Confirmar o fluxo com produto antes de alterar critérios antigos.
- [ ] Definir política de scan: profundidade 10, política Light criada/configurada explicitamente, prazo total inicial de 15 minutos, configurável e visível. Validar esse valor em alvo controlado antes de fixar como padrão.
- [ ] Formalizar listagem geral de scans (#17): proposta `GET /api/scans`, paginada, limitada ao escopo autorizado; preservar histórico por domínio.

**Saída:** critérios reconciliados e registro das decisões, sem apagar exigências que ainda aguardem decisão.

## T1 — Migrações e bloqueio de incompatibilidade

**Issues:** #47/#1/#26; nova tarefa de migrações.
**Arquivos:** `backend/pom.xml`, `backend/src/main/resources/application.yml`, novos SQLs em `backend/src/main/resources/db/migration/`, `infra/production/deploy.sh`, `infra/production/compose.yml`; testes em `infra/production/tests/test_deploy.py` e teste de migração PostgreSQL.
**Interface:** comando de migração executado uma vez antes de liberar backend/worker da nova revisão; readiness exige versão de schema compatível.

- [ ] Criar testes em banco novo e legado com contas/findings; incluir as constraints históricas e perfil desconhecido; comprovar falha antes da implementação.
- [ ] Adotar migrador versionado, proposto Flyway. Definir baseline explícito após inventário; não habilitar baseline automático indiscriminadamente nem copiar SQL antigo com BEGIN/COMMIT sem adaptação.
- [ ] Migrar constraints existentes preservando dados; substituir atualização automática de schema por validação após migração.
- [ ] Fazer backup validado; bloquear tráfego de escrita/pausar worker durante mudanças incompatíveis. Se migração falhar, não iniciar nova revisão.
- [ ] Testar que migrations incompatíveis não provocam rollback automático de aplicação contra schema incompatível; documentar recuperação coordenada.
- [ ] Executar testes PostgreSQL e `python -m unittest discover -s infra/production/tests -v`; demonstrar falha de migração bloqueando deploy em staging. Abrir PR com evidências.

**Aceite:** instalação limpa, upgrade legado e repetição aprovados; nenhuma alteração de conta/finding; deploy não fica verde com schema incompatível.

## T2 — Recuperação e limites do worker

**Issues:** #19/#17; nova tarefa de confiabilidade; #28 como dependência para alvo correto.
**Arquivos:** `worker/scan_worker.py`, novo `worker/scan_queue.py`, `worker/tests/test_scan_worker.py`, novo teste integrado de recuperação; `backend/.../service/ScanService.java`, `backend/.../model/Scan.java` e migração de controle de execução.
**Interfaces propostas:** publicação durável por outbox PostgreSQL; transporte Redis com confirmação (Streams/consumer group); lease por scan, tentativa e último heartbeat persistidos. `process_scan(conn, scan_id)` deve reivindicar atomicamente somente trabalho elegível.

- [ ] Reproduzir em ambiente isolado morte após consumo e antes do commit; testar mensagem duplicada e morte após commit antes do ACK.
- [ ] Implementar outbox na transação da confirmação; dispatcher idempotente publica no Redis. Confirmar a mensagem somente após resultado persistido ou falha terminal registrada.
- [ ] Implementar recuperação de leases expirados, limite inicial de três tentativas para falhas transitórias e diagnóstico sanitizado; erro de dado/validação não deve repetir indefinidamente.
- [ ] Usar relógio monotônico para deadline de ZAP, IDs explícitos de spider/active scan e timeouts HTTP; interromper jobs ZAP ao atingir o limite.
- [ ] Preservar a URL conforme #28; não reconstruir sempre HTTPS nem perder porta/caminho. Validar escopo e redirecionamentos para evitar atingir destinos fora do alvo autorizado.
- [ ] Configurar profundidade/política aprovadas em T0; validar com alvo de teste e conferir que o worker atende outro scan depois de timeout.
- [ ] Executar `python -m unittest discover -s worker/tests -v` com PostgreSQL descartável e teste integrado Redis/ZAP; abrir PR.

**Aceite:** reinício recupera trabalho; duplicidade não duplica findings; timeout libera o worker; falha de publicação não deixa QUEUED perdido.

## T3 — Token estável, antecipação e cancelamento

**Issues:** #12/#13/#48 e abertas #66/#67/#68.
**Arquivos:** `backend/.../service/ScanService.java`, `DomainVerificationService.java`, modelos/repositórios/controllers e migração do desafio; `frontend/src/pages/SubmitScanPage.tsx`, `frontend/src/lib/scanStatus.ts`, testes backend e componentes.
**Interfaces propostas:** `POST /api/verification-challenges` gera desafio sem site; vínculo explícito posterior validado por proprietário. `POST /api/scans/{id}/cancel-verification` cancela somente PENDING_VERIFICATION, conforme #66.

- [ ] Criar testes de geração antecipada, recarga, concorrência, mesmo hostname normalizado e preservação do token já publicado.
- [ ] Gerar token uma única vez; reutilizar por conta/domínio. Se desafio antecipado conflitar com domínio já existente, preservar token do domínio e informar qual deve ser publicado; nunca substituir silenciosamente.
- [ ] Implementar CANCELLED persistido e transição atômica competindo com confirmação. Se já enfileirado, responder conflito e mostrar o estado real; cancelamento de execução RUNNING exige escopo separado.
- [ ] Limitar confirmação automática: proposta de 20 tentativas em 5 minutos, sem requisições sobrepostas; ao esgotar, manter retomada manual e opção de cancelar. Limpar timers e descartar respostas antigas.
- [ ] Confirmar que geração/vínculo não iniciam scan nem fazem requisição ao alvo. Validar ownership de todas as operações.
- [ ] Executar testes backend/frontend e corrida com PostgreSQL real; abrir PRs separadas por #68, #67 e #66, nessa ordem.

**Aceite:** uma publicação de token serve entre scans; desafio pode anteceder o site; cancelado não é enfileirado; interface não fica repetindo sem limite.

## T4 — Relatório persistido e download autorizado

**Issues:** #22/#29/#49.
**Arquivos:** `worker/report_service.py`, `worker/scan_worker.py`, `backend/.../model/Report.java`, `ReportRepository.java`, novos `ReportController.java`/`ReportService.java`, `frontend/src/pages/ScanReportPage.tsx`, Compose e migrações; novos testes de relatório.
**Interfaces propostas:** estado de geração separado PENDING/GENERATING/READY/FAILED; `GET /api/scans/{id}/report` retorna metadados e `GET /api/scans/{id}/report/download` transmite PDF após autorização. Nenhum caminho de arquivo é recebido do usuário.

- [ ] Testar PDF inexistente, acesso entre contas, scan sem achados, textos extensos e caracteres especiais; teste força falha de geração e exige scan permanecer COMPLETED.
- [ ] Persistir Report vinculado ao scan e versão de geração; gerar a partir dos findings persistidos. Usar escrita temporária e publicação atômica; permitir regeneração idempotente.
- [ ] Incluir alvo efetivo, data/hora, duração, estado, resumo por severidade, evidências, recomendações e metodologia; score aproximado deve ser identificado como tal.
- [ ] Disponibilizar armazenamento persistente e leitura autenticada pelo backend; proposta de volume compartilhado com backend somente leitura. Se MinIO for obrigatório, implementar storage correspondente sem expor bucket público.
- [ ] Quebrar texto e tabelas, repetir cabeçalho e paginar; renderizar PDFs curtos e longos para inspeção visual, além dos testes de conteúdo.
- [ ] Separar emissão do término da varredura; exibir relatório pendente/falho e retentativa adequada sem reenfileirar ZAP.
- [ ] Testar download por cliente/gerente/admin e negação fora do escopo; abrir PR.

**Aceite:** usuário baixa PDF do próprio scan; conteúdo corresponde ao banco; relatório sobrevive a restart; falha de emissão não apaga o resultado do scan.

## T5 — Entrega real de e-mail e retentativa

**Issues:** #23/#31. Depende de Report READY de T4.
**Arquivos:** `worker/report_service.py`, novo `worker/email_service.py`, migração de estado/tentativas de envio, `.env.example`, `infra/production/compose.yml`, testes SMTP.
**Interface:** envio usa Report ID, resolve destinatário pelo dono do scan no banco e persiste PENDING/SENT/FAILED, `sent_at` e tentativa. Nunca aceita e-mail arbitrário da requisição do cliente.

- [ ] Testar que duas contas recebem somente seus próprios relatórios; mock de SMTP indisponível mantém scan COMPLETED e Report READY.
- [ ] Remover fallback de destinatário de teste no fluxo real; Mailpit fica para desenvolvimento/QA. Tornar host/porta/TLS/remetente configuráveis e manter credenciais fora do repositório.
- [ ] Implementar retentativas limitadas e bloqueio de envios concorrentes; documentar que uma queda depois da aceitação SMTP e antes do registro pode gerar duplicidade, ou escolher provedor com idempotência quando isso for requisito.
- [ ] Validar anexo, destinatário, data e falhas persistidas. Abertura do arquivo também deve ficar no tratamento de erro de entrega.
- [ ] Executar integração contra Mailpit e, separadamente, entrega externa em conta controlada com configuração autorizada. Se provedor não estiver configurado, registrar bloqueio e não fechar #31.
- [ ] Abrir PR; anexar evidência sem endereço pessoal, credencial ou token.

**Aceite:** destinatário correto recebe o PDF; tentativa e sucesso são rastreáveis; indisponibilidade externa não altera resultado do scan.

## T6 — Histórico comparável

**Issues:** #24/#30.
**Arquivos:** novo `backend/.../service/ScanComparisonService.java`, DTO de comparação, `ScanController.java`, nova `frontend/src/pages/ScanComparisonPage.tsx`, `DashboardPage.tsx`, testes Java e frontend.
**Interface:** `GET /api/scans/{id}/compare/{otherId}`, somente scans COMPLETED do mesmo domínio e dentro do escopo. Identidade proposta: ID de regra ZAP + URL canônica + parâmetro; persistir ID de regra no parser/modelo antes de comparar.

- [ ] Criar fixtures de achados novos/corrigidos/persistentes, duplicados e mudança de severidade; negar IDs de outro domínio/conta.
- [ ] Comparar conjuntos normalizados sem usar descrição como identidade. Legados sem ID confiável devem informar comparação limitada; não inferir correção onde dados são insuficientes.
- [ ] Expor contagens e alterações, seleção de duas execuções e legenda na interface. Não comparar valor aproximado como CVSS verdadeiro.
- [ ] Executar testes determinísticos e fluxo com duas execuções controladas; abrir PR vinculada à #30 e referência à #24.

**Aceite:** usuário identifica alterações entre execuções compatíveis sem vazamento entre contas e sem falsos resultados em dados legados incompletos.

## T7 — Completar interfaces e contratos restantes

**Issues:** #3/#5/#10/#11/#16/#17/#19/#21/#57.
**Arquivos:** `frontend/src/pages/RegisterPage.tsx`, `ScanReportPage.tsx`, `DashboardPage.tsx`, `frontend/src/services/api.ts`, `backend/.../controller/DomainController.java`/`ScanController.java`; novos serviços e testes conforme cada entrega.

- [ ] Implementar CRUD de domínios conforme #11, com confirmação de remoção e política explícita para histórico associado. Preferir arquivamento preservando scans; negar remoção durante execução, se essa for a regra aprovada.
- [ ] Exibir evidências técnicas como texto, filtros por severidade e cards expansíveis. Testar conteúdo não confiável, navegação por teclado e achados extensos.
- [ ] Adicionar badge de maior severidade no histórico; diferenciar INFORMATIONAL de ausência de achados.
- [ ] Substituir rótulo CVSS por score aproximado enquanto não houver cálculo válido, inclusive no PDF; se CVSS for obrigatório, implementar tarefa própria com vetor/versão e testes de referência antes de fechar #19.
- [ ] Tornar erros de cadastro específicos sem expor dados indevidos; implementar confirmação de senha e fluxo aprovado em T0. Testar e-mail duplicado, offline e submissão concorrente.
- [ ] Entregar listagem geral paginada aprovada em T0. Implementar refresh se mantido como requisito, com rotação/revogação e testes de replay; caso contrário registrar aprovação da mudança, sem alegar que existe.
- [ ] Fazer cada mudança como PR própria ou agrupamento funcional pequeno; executar `npm test`, `npm run build` e `mvn -B test` pertinentes.

**Aceite:** cada critério residual tem implementação e teste, ou decisão de produto explícita que o substitui.

## T8 — E2E e revalidação integrada

**Issues:** #25/#52; sustenta encerramento de todas as demais.
**Arquivos:** `frontend/package.json`, novo `frontend/playwright.config.ts`, novos `frontend/e2e/*.spec.ts`, novo Compose de QA isolado, `.github/workflows/ci-cd.yml`, `qa/README.md`.

- [ ] Criar ambiente descartável com alvo controlado e Mailpit; disponibilizar comprovação real por meta tag, sem bypass administrativo como evidência do fluxo do cliente.
- [ ] Escrever testes Playwright de cadastro/login/logout, domínio/token, verificação, cancelamento, conclusão/resultado, PDF, histórico/comparação e sessão expirada.
- [ ] Adicionar testes de autorização entre contas na API. Falhas ZAP/SMTP/restart usam injeção controlada em ambiente isolado; não transformar todos os E2E em esperas de scanner imprevisíveis.
- [ ] Executar suíte rápida em cada PR e fluxo real ZAP em job integrado identificável e obrigatório para candidatos a release. Scripts qa/ existentes devem ter execução explícita, não apenas presença no repositório.
- [ ] Publicar relatórios e traces sanitizados; vincular revisão, ambiente e resultado na issue. Confirmar que falha de teste bloqueia o gate definido.

**Comandos-alvo:** `npx playwright test`; `npm test` e `npm run build` em frontend; `npm test` e `npm run test:flow` em qa; `mvn -B test` em backend; `python -m unittest discover -s worker/tests -v` com TEST_POSTGRES_DSN.

**Aceite:** #25 só fecha com E2E executado no CI; #52 só fecha com revalidação integrada da revisão atual, e não apenas com mocks.

## T9 — Liberação e fechamento verificável

**Issues:** #1/#2/#4/#6/#12/#13/#26/#47/#48/#50 e todas as reabertas.

- [ ] Revisar matriz das 25 issues com link para PR, teste, revisão implantada e critério atendido; explicar todas as mudanças aprovadas de tecnologia/contrato.
- [ ] Executar staging com banco novo e com restauração sanitizada de schema antigo. Validar migração, recuperação, autorização e um fluxo completo real.
- [ ] Fazer backup e release controlada com procedimento de recuperação compatível com as migrações. Checar funcionalidades além de HTTP 200/OpenAPI.
- [ ] Hellen valida o fluxo integrado; responsável técnico revisa evidências antes de encerrar cada issue. Não alterar responsáveis sem alinhamento.
- [ ] Conferir que nenhuma tarefa essencial ficou sem issue, dono ou teste de aceite.

## Organização sugerida de responsáveis

Proposta baseada nas áreas já registradas nas issues, sem alterar atribuições: Jonathan Silva coordena arquitetura/migrações/revisão; Gustavo lidera APIs/autorização/relatório e envio; Jonathan Luiz lidera worker/fila/infra; Murilo lidera parser/classificação/conteúdo e comparação; Vitor e Romildo lideram interfaces; Juan apoia usabilidade; Hellen lidera QA integrado, com testes de unidade/integração escritos também por quem implementa; Jaçanã valida mudanças de escopo. Confirmar disponibilidade antes de estimar calendário.

## Definição de conclusão

Concluir significa fluxo cadastro → domínio/token → comprovação → scan → resultado → PDF → e-mail → histórico/comparação comprovado na revisão entregue; falhas e reinícios recuperáveis; separação entre contas; migrações seguras; ausência de critérios pendentes escondidos em issues fechadas. Nenhuma estimativa de prazo foi fixada sem conhecer disponibilidade da equipe.
