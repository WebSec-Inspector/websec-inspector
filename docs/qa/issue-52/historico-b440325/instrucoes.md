> **EVIDÊNCIA HISTÓRICA — b440325.** Não descreve a main atual. Consulte [a revalidação atual](../README.md) antes de classificar estas falhas como abertas.

# QA — atividade #52

Referência: https://github.com/WebSec-Inspector/websec-inspector/issues/52

## Preparação

Use Node.js 20 ou superior, Python 3.12 e o ambiente Docker Compose do repositório.
Na raiz do projeto:

```powershell
docker compose up -d --build
npm --prefix frontend ci
npm --prefix qa ci
python -m pip install -r worker/requirements.txt
```

No Windows, se `docker` não estiver no PATH, substitua `docker compose` por:

```powershell
& "$env:USERPROFILE\.docker\cli-plugins\docker-compose.exe" up -d --build
```

## Camada de componentes e worker

```powershell
npm --prefix frontend test
python -m unittest discover -s worker/tests -v
npm --prefix frontend run build
```

Vitest executa componentes React reais, AuthProvider, rotas e cliente Axios. Apenas o transporte HTTP
é simulado, usando axios-mock-adapter. Timers controlados permitem verificar polling sem esperar
segundos reais. Os testes Python executam regras do worker e persistência SQL contra um cursor
substituto; ZAP, banco, PDF e SMTP são fronteiras simuladas nesses testes. Isso não substitui o
fluxo integrado abaixo. O CI existente passa a executar os testes de componentes e do worker.

## Regressões conhecidas

```powershell
npm --prefix frontend run test:regressions
```

Este comando deve falhar enquanto os problemas REG-01 a REG-08 permanecerem. Não há `test.fails`,
`skip` ou expectativas invertidas para transformar bugs em sucesso. As quatro rejeições não
tratadas da tela de resultado também são sintomas do código atual. Depois das correções, execute
novamente: as mesmas expectativas devem passar. Esta suíte é separada do baseline do CI para não
bloquear todos os PRs com problemas preexistentes. Um CI verde do baseline **não aprova** a atividade #52.

REG-03 fornece o domínio 7 por `?domainId=7` como entrada proposta para o fixture de QA e exige
consulta de `/scans/domain/7/history` e apresentação do hostname retornado. O mecanismo de seleção
de domínio ainda não existe no Dashboard. Quando esse mecanismo for implementado, adequar o
preparo do teste à interface acordada com a equipe, mantendo as asserções de chamada e dados exibidos.
A URL proposta não é apresentada como requisito já implementado ou contrato oficial do produto.

## API real

```powershell
node --test qa/api.system.test.mjs
```

O comando cria duas contas `qa52-...@example.invalid`, dois scans pendentes e não dispara ZAP.
Usa apenas localhost. Contas e scans são mantidos no banco para evidência; não há exclusão automática.
JWT, senhas e tokens de propriedade são removidos do JSON. Asserções seguem o contrato desejado;
o comando retorna código 1 quando encontra bugs. Os casos de HTTP 404 são propostas de contrato,
explicitamente identificadas no relatório para validação com o backend.

Para validar também o histórico de domínios conhecidos, usando o banco **local de desenvolvimento**:

```powershell
$env:QA_TEST_DATABASE = "1"
node --test qa/api.system.test.mjs
Remove-Item Env:QA_TEST_DATABASE
```

Essa opção usa PostgreSQL em localhost:5432 (`websec/websec`, conforme o Compose). Pode-se definir
`QA_DB_PASSWORD` quando a senha local tiver sido alterada. A transação é `READ ONLY`; o SELECT filtra
simultaneamente o scan criado pelo teste e o e-mail da sua própria conta. Isso permite obter o
`domainId` sem enumerar dados de usuários. Não contorna a verificação de propriedade. Sem a opção,
API-18/API-19 são explicitamente SKIP, nunca PASS. API-09 continua exigindo `domainId` na resposta pública.

## Fluxo completo em alvo controlado

Este teste abre temporariamente as portas 80 e 443 para um HTML descartável no próprio computador,
com certificado de teste gerado em memória. Não execute se essas portas estiverem ocupadas. O
único alvo é `host.docker.internal`, acessível pelos containers do Docker Desktop; não há parâmetro
para selecionar sites externos. O fixture não tem links externos, formulários ou estado persistente.
O certificado não é instalado no Windows e a validação TLS da aplicação não é desativada.

```powershell
$env:QA_ALLOW_ACTIVE_LOCAL_SCAN = "1"
$env:QA_TEST_DATABASE = "1"
node qa/local-flow.mjs
Remove-Item Env:QA_ALLOW_ACTIVE_LOCAL_SCAN
Remove-Item Env:QA_TEST_DATABASE
```

O teste cria uma conta QA, verifica a rejeição antes de publicar a meta tag, publica o token no
fixture, confirma propriedade e dispara ZAP **apenas nesse fixture local**. Verifica repetição da
confirmação, acompanha estados por até 240 segundos e consulta o histórico. No MailHog local,
decodifica MIME e verifica anexo PDF, assinatura `%PDF-`, tamanho e SHA-256. Não avalia layout visual
do PDF. O worker atual direciona o e-mail a `usuario@exemplo.com` dentro do MailHog; o teste registra
esse comportamento, sem validar que seja o destinatário correto de negócio.

Em Linux sem Docker Desktop, `host.docker.internal` precisa de configuração explícita de rede;
esse cenário não foi validado nesta entrega. O fluxo falha de forma explícita se o fixture não
puder iniciar ou se houver timeout; em `finally`, fecha os dois servidores. Não há limpeza de
contas, scans, achados ou mensagens do MailHog.

Opções adicionais: `QA_SCAN_TIMEOUT_MS` ajusta o limite; `QA_CREDENTIALS_FILE` aponta para um JSON
local com e-mail/senha **de conta QA existente** (usado para cruzar evidências de UI e API). Nunca
versione esse arquivo. O teste não registra suas credenciais.

## Evidências e interpretação

`qa/artifacts/` é ignorado pelo Git. Os testes geram:

- `api-current/results.json`: cenários, expectativas, resultados e requisições sanitizadas;
- `local-flow-current/results.json`: etapas do fluxo integrado e checksum do PDF;
- relatórios frontend podem ser produzidos com os comandos abaixo.

```powershell
npm --prefix frontend test -- --reporter=json --outputFile=../qa/artifacts/frontend-current.json
npm --prefix frontend run test:regressions -- --reporter=json --outputFile=../qa/artifacts/regressions-current.json
```

`QA_ARTIFACT_DIR` altera o diretório dos scripts de API/fluxo (relativo ao diretório de execução).
Na execução do fluxo, `PARTIAL` também retorna código 1: o scan e o PDF podem funcionar enquanto o
contrato `domainId` ou o histórico continuam reprovados. Não interprete `COMPLETED` do scan como
aprovação do sistema inteiro. Relatório, matrizes e registro de falhas estão em `docs/qa/issue-52/`.
