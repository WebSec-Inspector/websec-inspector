# Hospedagem na AWS

**Aplicação publicada:** [WebSec Inspector](https://18-225-177-140.sslip.io)

**Atualizado em:** 04/10/2026

Abra o endereço em um navegador e crie sua conta pela tela de cadastro.
A versão hospedada pode ser utilizada sem executar o Docker localmente.
As varreduras continuam exigindo verificação de controle do domínio do alvo.

## Infraestrutura

A aplicação roda em uma instância Amazon EC2 na região Ohio (`us-east-2`),
com Ubuntu Server 24.04 LTS e Docker Compose.

| Componente | Configuração |
| --- | --- |
| Computação | `c7i-flex.large`, 2 vCPUs e 4 GiB de RAM, AMD64 |
| Armazenamento | 30 GiB EBS gp3 criptografado |
| Entrada web | Caddy com HTTPS e renovação automática de certificados |
| Frontend | React servido por Nginx |
| API | Spring Boot, acessível pelo mesmo domínio em `/api` |
| Dados e fila | PostgreSQL e Redis em rede interna |
| Varreduras | Worker Python e OWASP ZAP em rede interna |
| E-mails | Mailpit para captura interna; sem entrega para caixas de e-mail reais |

A composição de produção está em
[`infra/production/compose.yml`](../infra/production/compose.yml).
Somente o proxy publica portas da aplicação; os demais serviços permanecem
na rede dos containers. A administração utiliza SSH com autenticação por chave.
Volumes persistentes armazenam banco, fila, relatórios e dados do Caddy.
Os serviços têm limites de CPU e memória, rotação de logs e reinício automático.

O hostname gratuito `sslip.io` resolve para o endereço público da instância.
Se a instância for parada e iniciada novamente, o IP automático pode mudar;
nesse caso, o link público, a configuração do servidor e o destino do deploy
precisam ser atualizados pelos responsáveis pela infraestrutura.

## CI/CD no GitHub

O workflow [CI/CD](../.github/workflows/ci-cd.yml) realiza:

1. Testes do backend, build do frontend e validação das fontes Python.
2. Validação das composições Docker, dos scripts e dos testes de deploy.
3. Em pushes e merges na `main`, publicação das três imagens da aplicação
   no GitHub Container Registry, identificadas pelo SHA completo do commit.
4. Transferência da configuração da versão por SSH, backup antes da atualização
   e implantação na EC2.
5. Verificação dos serviços, do HTTPS e da versão publicada.

Pull requests executam as validações sem implantar na VM. O workflow também
pode ser executado manualmente na `main`. A concorrência do pipeline e o
bloqueio no servidor evitam atualizações simultâneas; versões automáticas
superadas por um novo commit são ignoradas antes do deploy.

Em falhas após a ativação, o procedimento tenta restaurar as imagens e a
configuração anteriores. **Esse rollback não desfaz alterações no banco.**

Os nomes de configuração abaixo servem de referência; os valores reais
devem permanecer nas configurações privadas do GitHub e do servidor.

| Local | Configuração |
| --- | --- |
| GitHub Actions Secrets, ambiente `production` | `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |
| GitHub Actions Variables, ambiente `production` | `DEPLOY_HOST`, `DEPLOY_USER` |
| GitHub Actions Variables, repositório | `DEPLOY_ARCH`, `DEPLOY_ENABLED` |
| Ambiente privado do servidor | `SITE_HOST`, `POSTGRES_PASSWORD`, `JWT_SECRET` |

As imagens privadas são baixadas com o `GITHUB_TOKEN` temporário do job,
com permissão `packages: read`, enviado por stdin via SSH. A configuração
Docker temporária é removida ao terminar, inclusive em falhas.
O checkout não transfere o arquivo `.env` do servidor.

**Não publicar** chaves privadas, tokens, senhas, conteúdo de Secrets,
arquivos `.env`, dumps do banco ou dados pessoais em commits, logs e capturas.
Os exemplos do repositório devem usar somente placeholders.

## Operação e monitoramento

O bootstrap está em [`infra/production/bootstrap.sh`](../infra/production/bootstrap.sh)
e o exemplo de configuração sem credenciais reais em
[`infra/production/.env.example`](../infra/production/.env.example).
Antes de preparar outra VM, validar sua identidade SSH pelo console autenticado
da AWS; `ssh-keyscan` sozinho não comprova a identidade do servidor.

Backups são gerados antes das atualizações e podem ser acionados com
[`backup.sh`](../infra/production/backup.sh). O procedimento mantém os últimos
sete conjuntos locais. Copiar backups para um destino privado fora da VM é
necessário para proteção contra perda do disco ou da instância.
Os procedimentos de consulta, parada, retomada e recuperação estão no
[guia de operação da VM](oracle-cloud.md#atualizar-parar-e-recuperar),
também aplicáveis à composição usada na AWS.

Para acompanhar créditos e custos, abrir **Billing and Cost Management**
no console AWS. Para CPU, acessar **EC2 → Instâncias → Monitoramento**.
O consumo de RAM dos containers pode ser consultado por administradores
com `docker stats`; não existe coleta de RAM configurada no CloudWatch.
Prometheus e Grafana são opcionais no ambiente local e não estão implantados
nessa composição de produção.

## Créditos e disponibilidade

A hospedagem utiliza créditos temporários do Free account plan da AWS.
Sua continuidade depende dos créditos disponíveis e do prazo do plano.
O saldo e a data de expiração da conta devem ser consultados no console privado.

A estimativa inicial para essa configuração, com 720 horas ligadas, é de
aproximadamente **US$ 67 por 30 dias**, considerando computação, disco e IPv4,
antes de tráfego e extras. É uma estimativa registrada na implantação;
preços, franquias e consumo efetivo devem ser conferidos no console.
Parar a instância reduz o consumo de computação, mas o armazenamento permanece.

Referências oficiais: [EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html),
[Free account plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html),
[EBS](https://aws.amazon.com/ebs/pricing/) e [IPv4](https://aws.amazon.com/vpc/pricing/).

## Validações realizadas

A publicação e uma atualização automática foram concluídas com sucesso em
04/10/2026. HTTPS, páginas da aplicação, versão publicada, cadastro/login e
persistência da conta após o novo deploy foram verificados. Um backup do
PostgreSQL foi restaurado em banco isolado e o arquivo de relatórios foi validado.
A conta usada na validação foi removida após os testes.

Na amostra inicial, os containers consumiam cerca de 900 MiB de RAM em repouso,
sem OOM ou reinícios inesperados. Essa medição não representa o consumo sob
varreduras. Não foram iniciadas varreduras contra terceiros durante a validação.
