# Oracle Cloud Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar o WebSec Inspector exclusivamente em recursos gratuitos da Oracle e automatizar seu deploy a partir do GitHub.

**Architecture:** Uma VM ARM64 executa Docker Compose e Caddy; PostgreSQL, Redis, worker, ZAP e capturador SMTP ficam internos. O GitHub Actions testa, publica imagens por commit no GHCR e atualiza a VM por SSH com verificação de disponibilidade e tentativa de rollback das imagens.

**Tech Stack:** Ubuntu LTS ARM64, Docker Compose, Caddy, sslip.io, PostgreSQL 16, Redis 7, Java 17, Python 3.12, React/Vite, GitHub Actions e GHCR.

**Spec:** [Desenho aprovado](../specs/2026-10-04-oracle-cloud-deployment-design.md). O usuário aprovou a especificação e o plano em 04/10/2026, com execução inline e revisão independente ao final.

**Estado:** configuração e scripts preparados; provisionamento e publicação bloqueados por falta de capacidade A1 em São Paulo. A documentação operacional distingue verificações locais das verificações cloud ainda pendentes.

## Global Constraints

- Exclusivamente recursos gratuitos, sem upgrade, recursos pagos, licenças pagas ou dependência dos créditos de teste.
- Repositório `WebSec-Inspector/websec-inspector`, branch de publicação `main`; não implantar pull requests.
- VM proposta `VM.Standard.A1.Flex`, 2 OCPUs, 12 GB de RAM, disco de 50 GB e home region gratuita; confirmar os custos no console antes da criação.
- Configuração cloud separada do desenvolvimento; preservar as otimizações locais sem sobrescrever trabalho do usuário.
- Imagens ARM64 por commit, mesma versão para backend, frontend e worker; não usar `latest` para determinar a versão implantada.
- Não publicar portas de PostgreSQL, Redis, ZAP, SMTP ou interfaces administrativas; HTTPS público pelo Caddy.
- Segredos fora do Git e logs; chave SSH dedicada ao deploy e validação da chave do host.
- Preservar volumes e backup; nenhuma varredura contra terceiros durante validação.
- SMTP de demonstração, sem promessa de entrega de e-mail real; nenhum domínio comprado.

## Review Focus

1. Falta de capacidade A1 ou resumo indicando custo: parar a criação, registrar o motivo e não migrar automaticamente para recurso pago. Verificação na tarefa 3.
2. Visitante usando outro computador ou rota interna da SPA: frontend deve usar `/api`, HTTPS válido e rotas devem funcionar sem `localhost`. Testes na tarefa 1 e verificação na tarefa 5.
3. Segredo ausente ou imagem sem ARM64: configuração deve falhar antes de atualizar o servidor, sem imprimir segredos. Verificações nas tarefas 1 e 2.
4. Dois pushes, transferência incompleta ou falha após troca de imagens: serializar deploys, manter versão anterior e volumes, sinalizar falha e tentar rollback. Testes nas tarefas 2 e 4.
5. SSH acessível a runners hospedados no GitHub e alteração de schema: registrar alcance real do acesso e limite do rollback, validar host e manter backup antes de deploy. Verificações nas tarefas 3 e 5.

## Task 1: Preparar o repositório e as imagens cloud

**Files:** modificar `frontend/Dockerfile`; incorporar `docker-compose.yml`, `frontend/.dockerignore`, `backend/.dockerignore`, `worker/.dockerignore`; copiar a especificação e este plano; criar `frontend/nginx.conf` se necessário ao servir a SPA em nginx.

**Interfaces:** build do frontend aceita `VITE_API_URL`, preservando `http://localhost:8080/api` como padrão local e usando `/api` no cloud. Backend e worker mantêm interfaces e variáveis atuais. Produzir imagens ARM64 dos três componentes com versão do commit.

- [ ] Inspecionar artefatos/worktrees disponíveis, obter uma cópia Git do repositório correto sem alterar a pasta local e ler todos os `AGENTS.md` aplicáveis. Registrar SHA base e verificar se houve mudanças remotas desde a especificação.
- [ ] Comparar as otimizações locais com a base remota e incorporar apenas as mudanças conhecidas. Não copiar `.env`, `node_modules`, `target` nem arquivos pessoais.
- [ ] Reproduzir o build atual e verificar que o bundle cloud ainda contém a URL de API local antes da correção.
- [ ] Ajustar o build do frontend para aceitar a URL da API e, se necessário, substituir o servidor Node por nginx com fallback SPA. Preservar porta 5173 e execução local existentes.
- [ ] Construir e inspecionar imagens ARM64; servir o frontend construído em container e confirmar que uma rota SPA retorna HTML e a chamada de API resolve no mesmo host. Verificar bundle sem referência ao fallback `localhost:8080` no build cloud.
- [ ] Verificar manifestos ARM64 de PostgreSQL, Redis, Caddy, ZAP e Mailpit; selecionar e registrar versões/digests disponíveis. Mailpit substitui apenas o MailHog do ambiente cloud.
- [ ] Executar checks existentes pertinentes e registrar resultados antes de commit da tarefa.

## Task 2: Configuração de produção e deploy recuperável

**Files:** criar `infra/production/compose.yml`, `infra/production/Caddyfile`, `infra/production/.env.example`, `infra/production/deploy.sh`, `infra/production/backup.sh`, `infra/production/tests/test_deploy.py`; modificar `.gitignore` para excluir segredos gerados.

**Interfaces:** `deploy.sh <commit-sha>` executa a partir de `/opt/websec-inspector`; aceita SHA completo hexadecimal de 40 caracteres. `.env` contém `SITE_HOST`, `POSTGRES_PASSWORD`, `JWT_SECRET`; `.release.env` contém apenas `IMAGE_TAG=sha-<commit-sha>`. Imagens usam `ghcr.io/websec-inspector/websec-inspector-{backend,frontend,worker}`. Scripts saem com código diferente de zero em falhas e nunca apagam volumes.

- [ ] Escrever testes comportamentais de `deploy.sh` com comandos externos substituídos por doubles: SHA inválido rejeitado sem chamar Docker; pull falhando não troca a versão; falha no health check restaura versão anterior e ainda retorna erro; deploy concorrente rejeitado/serializado; nenhum comando remove volumes. Rodar primeiro e observar falhas por ausência do script.
- [ ] Criar Compose independente, imagens por commit, volumes persistentes, limites já definidos, logs rotacionados, restart adequado e health checks de banco, Redis, backend e ZAP. Dependências devem aguardar prontidão. Variáveis secretas obrigatórias devem falhar quando ausentes.
- [ ] Caddy preserva `/api/*` ao encaminhar ao backend e envia demais rotas ao frontend. Publicar somente portas 80/443. Mailpit permanece interno; monitoramento é opcional e sem portas públicas.
- [ ] Implementar deploy com `flock`, pull completo antes de atualizar, troca atômica da versão, `up --wait` com timeout apropriado à inicialização do ZAP, health check externo HTTPS e rollback de imagens. Preservar código de erro original e apresentar também eventual falha do rollback. Não tratar rollback como recuperação de schema.
- [ ] Implementar `backup.sh` para gerar dump PostgreSQL e cópia dos relatórios antes de atualização; manter últimos sete conjuntos no servidor e documentar exportação externa. Não incluir senha em argumentos ou saída.
- [ ] Rodar testes dos scripts em Linux, `bash -n`, validar Caddy e `docker compose --env-file <arquivo-de-teste> -f infra/production/compose.yml config --quiet`. Usar somente segredos de teste no arquivo temporário e não imprimir Compose resolvido com segredos.
- [ ] Confirmar que ausência de `POSTGRES_PASSWORD` ou `JWT_SECRET` rejeita configuração e que apenas Caddy publica portas. Commit da tarefa após verificações.

## Task 3: Provisionar VM e preparar acesso operacional

**Files:** criar `infra/production/bootstrap.sh` e `docs/oracle-cloud.md`; segredos e chaves ficam fora do repositório.

**Interfaces:** VM Ubuntu ARM64 com Docker/Compose instalado; diretório `/opt/websec-inspector` preparado; chave administrativa e chave de deploy distintas; host SSH conhecido e validado; `.env` persistido com acesso restrito. GitHub recebe `OCI_SSH_KEY`, `OCI_KNOWN_HOSTS` como secrets e `OCI_HOST`, `OCI_USER`, `SITE_HOST` como variables do ambiente `oracle-production`.

- [ ] Conferir home region, cotas gratuitas e recursos existentes antes da criação. Preparar VM A1 2/12, Ubuntu e volume de 50 GB no console; revisar todos os itens e preços antes do envio. Se faltar capacidade, registrar o erro sem provisionar recursos pagos.
- [ ] Preparar rede e regras TCP 80/443. Definir origem do SSH em função do acesso administrativo e dos runners, documentando eventual alcance público de TCP 22, autenticação exclusivamente por chave e privilégio efetivo do usuário Docker. Cumprir confirmações do controle do navegador quando aplicáveis, no momento da ação.
- [ ] Criar chaves locais em caminho exclusivo, sem sobrescrever chaves existentes, enviar apenas a chave pública administrativa à Oracle e aguardar IP/estado Running.
- [ ] Confirmar a chave do host por canal confiável do console antes de cadastrar `known_hosts`; não aceitar por confiança apenas em `ssh-keyscan`. Usar console/Cloud Shell para confirmar quando necessário.
- [ ] Instalar Docker a partir da origem oficial no Ubuntu, criar diretórios, configurar usuário/acesso dedicado ao deploy e gravar senha do banco e JWT aleatórios com permissões restritas. Não publicar seus valores no chat nem no Git.
- [ ] Configurar endereço sslip.io derivado do IP, conferir resolução DNS e chegada de TCP 80/443. Registrar configuração de firewall OCI e do sistema operacional.
- [ ] Verificar `uname -m`, Docker/Compose, espaço em disco, permissões de arquivos, acesso SSH com host verificado e custo/elegibilidade registrados. Gravar identificadores não secretos necessários na documentação.

## Task 4: Estender o workflow de CI/CD

**Files:** modificar `.github/workflows/ci-cd.yml`; usar scripts e configuração da tarefa 2; atualizar `docs/oracle-cloud.md`.

**Interfaces:** jobs existentes de CI continuam ativos. Publicação oferece ARM64, tags `sha-${{ github.sha }}` e metadados de versão. Job `deploy` depende da matriz de publicação inteira, usa ambiente `oracle-production`, copia artefatos da mesma revisão e chama o script com o SHA completo. Publicação automática somente em push de `main`; execução manual em `main` também deve suportar publicação/deploy.

- [ ] Inspecionar workflow/base atual e testar as condições previstas para PR, push `main`, execução manual `main` e execução manual fora de `main` usando uma matriz de casos; apenas os dois casos de `main` aprovados publicam/implantam.
- [ ] Ajustar a construção/publicação para ARM64 e API relativa, evitando repetir builds completos desnecessários. Preservar todos os checks atuais. Usar tags por SHA completo e garantir que os três componentes existam antes de deploy.
- [ ] Adicionar job de deploy com SSH estrito, arquivos de chave restritos, transferência para área temporária versionada e ativação atômica dos arquivos. Não transferir `.env` do checkout. Usar configuração do servidor para secrets e apenas SHA validado para versão.
- [ ] Separar concorrência de CI e deploy: permitir cancelar CI obsoleto sem interromper deploy em andamento; combinar grupo de deploy com `flock` no servidor.
- [ ] Configurar ambiente, variables e secrets via GitHub CLI, sem imprimir valores. Conferir se o pull do GHCR é público; se autenticação for necessária, usar acesso mínimo documentado em vez de tornar pacotes públicos sem avaliar.
- [ ] Validar sintaxe e condições com linter de Actions e checks locais, criar commit/branch/PR reviewable e anexar a PR a este chat. Documentar a mudança necessária em `main` para ativar o workflow.

## Task 5: Publicar e confirmar a entrega

**Files:** atualizar `docs/oracle-cloud.md`, `README.md` e o estado deste plano.

**Interfaces:** URL HTTPS acessível, commit implantado identificado, CI/CD executado com sucesso e procedimento documentado para parar, atualizar, exportar backup e recuperar aplicação.

- [ ] Revisar o diff completo e corrigir problemas antes de integração; método de revisão conforme execução escolhida. Integrar e publicar no escopo aprovado pelo usuário; comunicar mudanças externas concretas.
- [ ] Executar workflow na revisão final; acompanhar jobs e confirmar publicação ARM64 dos três componentes e execução bem-sucedida do deploy.
- [ ] Validar certificado HTTPS público sem ignorar TLS, homepage, rota SPA, API, cadastro/login com dados de teste e containers estáveis. Não iniciar scans de terceiros. Conferir worker aguardando fila e ZAP saudável.
- [ ] Comparar labels/digests e SHA do servidor com a revisão do workflow; registrar consumo em repouso e ausência de OOM/restarts inesperados. Verificar portas efetivamente publicadas e acesso restrito a serviços internos.
- [ ] Testar backup e restauração em banco isolado, preservando banco publicado. Verificar continuidade dos dados após atualização e documentar limite de rollback frente a mudanças de schema.
- [ ] Entregar URL, versão, resultado do workflow e documentação. Se um bloqueio externo impedir a publicação, informar precisamente o que foi concluído e o que falta, sem declarar deploy pronto.

## Revisão do plano

Cobertura conferida: gratuidade/capacidade e rede (tarefa 3); acesso sem domínio e ARM (tarefas 1–3); segredos/volumes/backup/rollback (tarefas 2–3 e 5); workflow e concorrência (tarefa 4); validação e operação (tarefa 5). Recursos só serão criados após a revisão deste plano. A configuração local em execução não precisa ser parada para preparar a publicação cloud.
