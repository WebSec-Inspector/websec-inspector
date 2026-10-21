# Deploy gratuito na Oracle Cloud e CI/CD

## Objetivo e contexto confirmado

Publicar o WebSec Inspector para acesso remoto e automatizar atualizações a partir de `WebSec-Inspector/websec-inspector`, branch `main`. O usuário criou uma conta Oracle, quer exclusivamente recursos gratuitos e não possui domínio. O GitHub CLI autenticado possui acesso ADMIN ao repositório público. O console Oracle está autenticado na região `sa-saopaulo-1`. A listagem do compartimento raiz está vazia e a tela de criação oferece `VM.Standard.A1.Flex` como Always Free-eligible.

O workflow existente já testa backend, constrói frontend, verifica sintaxe Python, constrói containers e publica imagens no GHCR. Os três últimos runs consultados passaram. Não existe etapa de deploy nem configuração de servidor no repositório consultado. O checkout local é uma cópia sem Git e contém otimizações do Compose ainda ausentes no repositório remoto; a implementação deve trabalhar sobre uma cópia Git do repositório correto e incorporar essas mudanças sem sobrescrever trabalho local.

## Opções consideradas

1. **Uma VM com Docker Compose — recomendada.** Reaproveita a arquitetura atual e permite manter toda a aplicação no orçamento gratuito. Exige administrar atualizações, armazenamento e backups do servidor.
2. **Separar os serviços entre VMs gratuitas.** Aumenta a configuração de rede e operação sem benefício relevante para o tamanho atual do projeto.
3. **Kubernetes ou serviços gerenciados.** Adicionam complexidade e não oferecem garantia de custo zero para esta composição; fora do escopo.

## Infraestrutura proposta

- VM `websec-inspector`, Ubuntu LTS compatível com ARM, shape `VM.Standard.A1.Flex`, 2 OCPUs, 12 GB de RAM e volume de inicialização de 50 GB, na home region gratuita da conta.
- Confirmar no console elegibilidade, limites da conta, custos do armazenamento e demais recursos antes de criar. Não fazer upgrade da conta, escolher recursos pagos, acrescentar licença paga ou usar créditos de teste como substituto do Always Free. Se faltar capacidade, registrar o erro e tentar somente alternativas que continuem gratuitas; não prometer capacidade disponível.
- Rede pública com gateway de internet e regras para o site em TCP 80/443. SSH deve ser restrito ao acesso administrativo e de deploy quando possível. A decisão sobre a origem do SSH deve ser registrada: runners hospedados no GitHub não possuem um único IP fixo. Não abrir banco, Redis, ZAP, SMTP nem interfaces de administração na internet.
- Volumes persistentes para PostgreSQL, relatórios e certificados. O deploy não deve apagar volumes nem recriar o banco do zero. Uma primeira publicação inicia banco novo; migração de dados locais não foi solicitada.
- A Oracle pode recuperar instâncias gratuitas ociosas. Documentar backup e recuperação, sem criar carga artificial para evitar essa regra.

## Aplicação e acesso sem domínio comprado

- Usar endereço `websec-<IP-com-hifens>.sslip.io`, vinculado ao IP público, e Caddy para HTTPS e renovação automática. A emissão deve ser confirmada com certificado público válido. O DNS é de terceiro e o endereço pode precisar mudar se o IP mudar.
- Caddy recebe tráfego público e encaminha `/api/*` ao backend, preservando o prefixo; encaminha os demais caminhos ao frontend, incluindo rotas da SPA. Frontend deve usar `/api` no build de cloud, eliminando a referência a `localhost` no navegador dos visitantes. Preservar o comportamento do desenvolvimento local.
- Usar configuração de produção separada do Compose local. Incorporar limites de recursos e rotação de logs já preparados. Monitoramento permanece opcional e sem interfaces públicas.
- Gerar senha do PostgreSQL e segredo JWT exclusivos, mantidos fora do Git. Nenhum segredo deve ser mostrado nos logs ou incluído nas imagens. Produção não deve usar as credenciais de exemplo.
- Construir backend, frontend e worker para ARM64. Verificar compatibilidade das imagens de terceiros. ZAP atual oferece ARM64; MailHog deve ser substituído no ambiente cloud por um capturador SMTP compatível com ARM, com interface interna. Isso preserva o ambiente de demonstração e não equivale a entrega de e-mail real; SMTP externo fica para uma configuração posterior, se solicitado.
- Manter o fluxo de verificação de domínio antes dos scans. Não executar varreduras contra terceiros para validar o deploy.

## CI/CD proposto

- Estender o workflow existente, preservando seus checks de pull requests e da branch `main`.
- Publicar imagens ARM64 com identificação imutável do commit; o deploy deve usar a mesma versão para os três componentes. Não implantar pull requests.
- Após sucesso de testes e publicação, atualizar a VM via SSH: transferir apenas arquivos de deploy, baixar as imagens e executar Docker Compose. Builds ficam no GitHub, fora da VM.
- Usar chave dedicada ao deploy, acesso necessário para operar o Compose e validação da chave de host SSH; não usar `StrictHostKeyChecking=no`. Guardar os dados de conexão em Secrets/Variables do ambiente GitHub destinado ao servidor. Segredos da aplicação permanecem no servidor.
- Serializar deploys e evitar cancelar uma atualização remota em andamento quando chega um novo push.
- Verificar disponibilidade e versão após cada deploy. Se falhar, sinalizar falha e restaurar imagens anteriores quando possível. Rollback de imagem não garante reversão de alterações de schema feitas pelo Hibernate; documentar esse limite e preservar backup antes de mudanças de schema.
- Não registrar runner permanente do GitHub na VM: esse acesso adicional não é necessário para a solução proposta.

## Verificação e entrega

- Validar Compose e scripts antes de enviar para o servidor; validar builds ARM64 e frontend usando a API relativa.
- Confirmar containers estáveis, limites aplicados, volumes persistentes, frontend acessível em HTTPS, API respondendo e rotas SPA funcionando.
- Fazer teste de cadastro/login com conta de verificação, sem usar dados pessoais. Verificar worker e ZAP sem iniciar scans externos.
- Confirmar que serviços internos não estão publicados e que nenhum segredo aparece no repositório ou nos logs.
- Executar o workflow e confirmar que a versão esperada chegou à VM; entregar URL, documentação de operação, backup, recuperação e procedimento de atualização.

## Estado desta proposta

Esta é a especificação para revisão. Nenhuma VM, rede, chave de deploy, regra de acesso ou alteração remota no GitHub foi criada nesta etapa. Antes da implementação, falta revisar esta especificação e o plano derivado dela, conforme o fluxo de planejamento aplicado. O acesso à Oracle já está disponível; disponibilidade da VM e gratuidade final ainda precisam ser verificadas na criação.

## Referências

- Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Primeiro servidor Linux na OCI: https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm
- Caddy HTTPS: https://caddyserver.com/docs/automatic-https
- sslip.io, documentação do mantenedor: https://github.com/cunnie/docs/blob/main/sslip.io.md
- GitHub Actions e GHCR: https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
