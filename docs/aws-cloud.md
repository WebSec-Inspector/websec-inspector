# AWS: publicação com créditos do plano gratuito

## Configuração preparada em 04/10/2026

O usuário solicitou mudar a publicação para a AWS após a falta de capacidade
gratuita A1 na Oracle. Mantém-se a arquitetura já aprovada: uma VM Ubuntu,
Docker Compose, Caddy com HTTPS, serviços internos, volumes persistentes,
backup, verificação da versão e rollback de imagens/configuração.
O workflow passou a aceitar a arquitetura do servidor por variável, mantendo
a opção ARM64 para uma futura VM Oracle. A configuração AWS usa AMD64.

No console, a conta está no **Free account plan**, com US$ 100 de saldo
e término previsto em 04/04/2027, ou antes se os créditos acabarem.
Não fazer upgrade para Paid plan. A VM ainda não foi criada:
a abertura de acesso público e por chave requer confirmação antes do lançamento.

| Recurso | Seleção |
| --- | --- |
| Região | Ohio, `us-east-2` |
| Nome | `websec-inspector` |
| VM | `c7i-flex.large`, 2 vCPUs, 4 GiB, elegível para plano gratuito |
| AMI | Ubuntu Server 24.04 LTS AMD64, `ami-0ea1cddefe0c4aed5`, Canonical |
| Disco | 30 GiB gp3, 3000 IOPS, 125 MiB/s, criptografado, chave padrão EBS |
| Rede | VPC padrão, subnet pública, IPv4 público automático |
| Entrada pública | TCP 80/443 para Caddy e TCP 22 para administração/CI por chave |
| Serviços internos | Banco, Redis, ZAP, worker e Mailpit sem portas públicas |

SSH público permite conexões de IPs variáveis dos runners GitHub; autenticação
somente por chave. Chaves administrativas e de deploy são distintas e ficam
fora do repositório. Usuário `websec` no grupo Docker equivale a acesso root;
proteger sua chave como credencial administrativa. Sem IAM access keys,
load balancer, NAT gateway ou recursos adicionais para o deploy.

## Custo e duração

Console EC2: Linux `c7i-flex.large` custa US$ 0,08479/h. Estimativa com
720 horas ligadas: US$ 61,05 de VM + US$ 2,40 de gp3 30 GiB + US$ 3,60
de IPv4 = **US$ 67,05 por 30 dias**, antes de tráfego e extras.
US$ 100 cobrem aproximadamente 45 dias nesse ritmo, não seis meses garantidos.
Custos elegíveis são descontados dos créditos no Free plan.
Parar a VM reduz consumo de computação; o volume continua consumindo créditos.
O IPv4 automático pode mudar ao parar/ligar, exigindo atualização do hostname,
configuração Caddy, known_hosts validado e variável do GitHub.
Nenhum monitoramento automático de saldo foi agendado.

Referências: [EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html),
[fim do Free plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html),
[EBS](https://aws.amazon.com/ebs/pricing/), [IPv4](https://aws.amazon.com/vpc/pricing/).

## Preparação e GitHub

Após lançar, validar a fingerprint ED25519 do host por canal autenticado
do console, comparando com `sudo ssh-keygen -lf
/etc/ssh/ssh_host_ed25519_key.pub` via conexão do console ou saída de
inicialização da instância. `ssh-keyscan` sozinho não valida a identidade.
Copiar o bootstrap e a pública de deploy, executar como administrador:

```bash
sudo bash bootstrap.sh <IP-com-hifens>.sslip.io deploy.pub
```

Conferir Docker, Compose, disco, segredos modo 600, portas e resolução DNS.
Validar acesso às três imagens no GHCR como `websec`; caso privadas, usar
somente `read:packages` e `docker login --password-stdin`, sem expor token.
Configurar ambiente GitHub `production`:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Secret do ambiente | `DEPLOY_SSH_KEY` | Privada exclusiva de deploy |
| Secret do ambiente | `DEPLOY_KNOWN_HOSTS` | Host SSH validado pelo console |
| Variable do ambiente | `DEPLOY_HOST` | IPv4 da instância |
| Variable do ambiente | `DEPLOY_USER` | `websec` |
| Variable do repositório | `DEPLOY_ARCH` | `amd64` para esta VM; `arm64` para A1 |
| Variable do repositório | `DEPLOY_ENABLED` | `true` somente após preparar e validar a VM |

As antigas variáveis `OCI_*` não são usadas pelo workflow genérico.
Integrar o PR em `main`, publicar imagens por SHA completo e só habilitar
deploy após configurar os secrets. Não implantar pull requests.
Não transferir `.env` do checkout. A condição de versão atual de `main`,
concorrência do deploy e `flock` continuam protegendo as atualizações.

Operação, backups e limite de rollback seguem os procedimentos de
[operação da VM](oracle-cloud.md#atualizar-parar-e-recuperar).
Depois da publicação, verificar HTTPS sem ignorar TLS, SPA, cadastro/login,
versão publicada, serviços saudáveis e persistência. Não iniciar scans contra
terceiros durante validação. Ainda não há URL pública ou verificação AWS concluída.
