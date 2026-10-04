# Oracle Cloud e GitHub Actions

## Estado em 04/10/2026

Preparação em branch `codex/oracle-cloud-deploy`. **Aplicação ainda não publicada.**
As tentativas gratuitas A1 de 2 OCPUs/12 GB e 1 OCPU/6 GB em
`sa-saopaulo-1`, AD-1, retornaram `Out of capacity`. A região principal
tem somente esse AD. A consulta ao compartimento principal não encontrou
VMs, volumes ou VCNs após as tentativas. Nenhum recurso pago foi escolhido.
Bootstrap, acesso SSH, certificado, publicação ARM64 e deploy real ainda
dependem da disponibilidade da VM. Não habilitar deploy antes dessas verificações.

Validação local em ambiente Docker isolado: oito serviços iniciaram;
homepage, rota SPA, versão e cadastro/login através do Caddy passaram.
Login persistiu após reiniciar backend. Dump PostgreSQL foi restaurado em
banco separado, com conferência do usuário de teste; arquivo de relatórios
também foi gerado. Consumo observado em repouso: aproximadamente 1 GB.
Esse ensaio usou HTTP restrito ao loopback e imagens AMD64 locais;
não comprova certificado público nem execução ARM64 na Oracle.

## Infraestrutura gratuita

Usar somente `VM.Standard.A1.Flex` marcada Always Free, Ubuntu 24.04 ARM64,
50 GB de disco dentro da franquia gratuita da região principal. Conferir
elegibilidade e franquia disponível no console a cada nova tentativa.
Preferir 2 OCPUs/12 GB; 1 OCPU/6 GB funciona com menor velocidade de scans.
Não usar créditos temporários, upgrade ou outra shape como alternativa automática.

Criar VCN e subnet pública, Internet Gateway e rota `0.0.0.0/0` para ele;
atribuir IPv4 público à VNIC. Liberar entrada TCP 80/443 no NSG/security list
e no firewall do Ubuntu. SSH administrativo deve ter origem restrita ao IP
do administrador. Runners GitHub hospedados têm IPs variáveis: se TCP 22
precisar ficar público para o CI/CD, documentar essa exposição antes de
aplicá-la; manter somente autenticação por chave. Não abrir 5432, 6379,
8090, 1025 ou interfaces de mail/monitoramento. Não remover as regras
padrão do firewall inteiro; adicionar somente as permissões necessárias.

## Preparar a VM

1. Criar chaves SSH distintas para administração e deploy, fora do Git.
   Enviar apenas a pública administrativa na criação da VM.
2. Validar a fingerprint ED25519 do host pelo console/Cloud Shell usando
   `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Comparar com
   a chave obtida pelo cliente antes de gravar `known_hosts`.
   `ssh-keyscan` sozinho não prova a identidade do servidor.
3. Copiar `infra/production/bootstrap.sh` e a pública de deploy à VM.
   Executar `sudo bash bootstrap.sh <IP-com-hifens>.sslip.io deploy.pub`.
   Confirmar previamente resolução desse hostname para o IPv4 da VM.
4. O bootstrap instala Docker do repositório oficial, cria usuário `websec`,
   diretório `/opt/websec-inspector` e `.env` com segredos aleatórios e modo
   600, sem sobrescrever uma configuração existente. Desabilita login por
   senha. Usuário no grupo Docker tem privilégio equivalente a root;
   proteger a chave de deploy como acesso administrativo.
5. Confirmar `uname -m` (`aarch64`), Docker/Compose, espaço em disco, regras
   OCI/Ubuntu, SSH com host validado e leitura das imagens GHCR pelo usuário
   `websec`. Nova sessão SSH é necessária após adicionar o grupo Docker.

Configuração de produção fica somente no servidor. O exemplo
`infra/production/.env.example` mostra as variáveis; não substituir
senhas do servidor pelos exemplos. Caddy provisiona HTTPS automaticamente
quando DNS e portas 80/443 estiverem acessíveis. sslip.io depende do IPv4;
se o IP mudar, atualizar hostname e configuração antes de novo deploy.

## GitHub

O workflow preserva testes de backend/frontend/worker e build local,
valida Compose e roda oito testes do script de deploy. Publicação ocorre
somente em push de `main` ou execução manual em `main`. Com DEPLOY_ARCH=arm64, cada um dos três
componentes publica imagem ARM64 com tag `sha-<SHA completo>` e `latest`;
o deploy usa exclusivamente a tag por SHA.

Após integrar o PR em `main`, criar ambiente `production`:

| Tipo | Nome | Conteúdo |
| --- | --- | --- |
| Secret do ambiente | `DEPLOY_SSH_KEY` | Privada dedicada do usuário websec |
| Secret do ambiente | `DEPLOY_KNOWN_HOSTS` | Linha known_hosts do IPv4 validado pelo console |
| Variable do ambiente | `DEPLOY_HOST` | IPv4 público |
| Variable do ambiente | `DEPLOY_USER` | `websec` |
| Variable do repositório | `DEPLOY_ENABLED` | `true` somente após preparar a VM |

A ausência de `DEPLOY_ENABLED=true` mantém o deploy desativado.
Nenhuma chave, segredo de banco ou JWT é transferido pelo checkout.
Pacotes GHCR novos podem ser privados. O job usa `GITHUB_TOKEN` com
`packages: read`, enviado por stdin via SSH a `docker login --password-stdin`.
Um diretório Docker temporário é removido ao final, inclusive em falhas.
Não instalar PAT nem `GITHUB_TOKEN` como credencial permanente no servidor.

O job aguarda toda a matriz de imagens, valida SSH estritamente, transfere
somente quatro arquivos de release e ativa o diretório por rename.
Deploys usam concorrência própria sem cancelamento e `flock` no servidor.
Não existe cancelamento global que interrompa uma atualização em curso.
Antes de um deploy automático, o job consulta `main` e ignora um commit
superado, evitando que um build antigo reimplante uma versão anterior.
Execuções manuais são ações explícitas do operador.

## Atualizar, parar e recuperar

`/opt/websec-inspector/.release.env` registra tag e diretório ativos.
`current` aponta para o último release verificado. Antes de atualizar,
o script baixa todas as imagens e faz backup do banco e relatórios.
Espera serviços saudáveis, verifica HTTPS com TLS normal e exige que
`/version.txt` corresponda ao commit. Uma falha após ativação tenta restaurar
as imagens e configuração anteriores e mantém o job com status de erro.
No primeiro deploy não existe versão anterior para restaurar.

Rollback de imagens **não desfaz schema ou dados**. Alterações incompatíveis
do banco exigem migração reversível ou restauração planejada; nunca
restaurar automaticamente um dump sobre o banco ativo.

Como `websec`, para consultar/parar sem remover volumes:

```bash
cd /opt/websec-inspector
release=$(sed -n 's/^RELEASE_DIR=//p' .release.env)
docker compose -p websec-production --env-file .env --env-file .release.env -f "$release/compose.yml" ps
docker compose -p websec-production --env-file .env --env-file .release.env -f "$release/compose.yml" stop
bash "$release/backup.sh"
```

Para retomar a versão atual, usar o mesmo Compose com `up -d --wait
--wait-timeout 600`. Para reimplantar uma versão já transferida, executar
`bash releases/<SHA>/deploy.sh <SHA>`.

Backups ficam em `backups/`, com últimos sete conjuntos locais. Copiar
periodicamente para armazenamento fora da VM via SCP; backup no mesmo
disco não protege contra perda da VM. Para validar dump, criar banco
isolado, restaurar `postgres.dump` com `pg_restore` e conferir dados antes
de planejar recuperação em produção. Esse ensaio e a continuidade dos
dados após atualização ainda devem ser executados quando a VM existir.

Mailpit apenas captura e-mails dentro da rede Docker; não entrega e-mail
real. ZAP e worker ficam internos. Os limites de memória e CPU reduzem
consumo em repouso e durante scans; confirmar OOM/restarts e consumo real
após a primeira publicação, sem iniciar varreduras de terceiros no teste.

Referências: [Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/),
[runners ARM64 do GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
