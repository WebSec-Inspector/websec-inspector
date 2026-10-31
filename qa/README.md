# QA — issue #52

Suíte adaptada à main em `9ddd65e`, preservando as PRs #59, #60, #62 e #63.
As evidências integradas antigas em `docs/qa/issue-52/historico-b440325/` pertencem
exclusivamente a `b440325`; não comprovam falhas na versão atual.

## Preparação e testes locais

Node.js 20+ e Python 3.12. Na raiz do projeto:

```powershell
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run test:regressions
npm --prefix frontend run build
python -m pip install -r worker/requirements.txt
python -m unittest discover -s worker/tests -v
```

O frontend padrão inclui todos os testes existentes da equipe e os novos testes de QA.
`test:regressions` seleciona a revalidação de Dashboard, polling e falhas; agora deve passar.
Não há test.fails, expectativas invertidas ou exclusão de suítes existentes. React, rotas,
AuthProvider, DomainProvider e Axios são reais; só o transporte HTTP é simulado.
O Dashboard usa domínios da API e rejeita preferência antiga inválida. Polling mantém os
intervalos atuais: 15s pendente, 5s fila e 4s execução.

Os testes Python novos verificam estados do worker com ZAP/PDF/SMTP simulados e cursor substituto;
usam o parser e o SQL atuais. Os testes existentes de parser e PostgreSQL são mantidos.
Os dois testes de banco existentes ficam SKIP sem TEST_POSTGRES_DSN. Para executá-los, utilize
um PostgreSQL de testes descartável, como o serviço já definido no CI:

```powershell
$env:TEST_POSTGRES_DSN = "postgresql://websec_test:test-only@localhost:5432/websec_test"
python -m unittest discover -s worker/tests -v
```

## API integrada

```powershell
docker compose up -d --build
npm --prefix qa ci
$env:QA_SERVICE_REVISION = "<commit efetivamente implantado>"
node --test qa/api.system.test.mjs
```

Se docker não estiver no PATH no Windows, substitua docker compose por:

```powershell
& "$env:USERPROFILE\.docker\cli-plugins\docker-compose.exe" up -d --build
```

O script aceita somente localhost (`QA_API_URL`, padrão http://localhost:8080/api), cria contas
QA A/B e scans pendentes e verifica autenticação, isolamento, domainId, histórico e erros.
Não publica desafios de propriedade nem dispara ZAP. Contas/scans são mantidos para evidência.
Senhas, JWT, Authorization e tokens de propriedade são omitidos do JSON gerado.
Falhas retornam código 1. API-10/API-14 expressam a proposta de HTTP 404 para recurso inexistente.

API-18/API-19 usam o domainId público retornado pelo scan atual. Em versões antigas sem esse
campo, pode-se definir QA_TEST_DATABASE=1 e instalar as dependências de qa.
A opção usa uma transação READ ONLY em PostgreSQL localhost:5432, websec/websec (Compose),
resolvendo somente o domainId do scan e da conta QA da execução. QA_DB_PASSWORD permite
outra senha. Não enumera terceiros nem altera dados/schema. Sem o campo na API nem a opção de banco, ambos são SKIP.
O SHA do código local não comprova a versão do container: confirme a imagem efetivamente implantada.

## Fluxo integrado controlado

```powershell
$env:QA_ALLOW_ACTIVE_LOCAL_SCAN = "1"
$env:QA_TEST_DATABASE = "1"
node qa/local-flow.mjs
```

O único alvo é host.docker.internal, servido pelo próprio script nas portas 80/443.
Não pode ser substituído por site externo. O HTML não tem links externos/formulários/estado.
Certificado de teste é gerado em memória, não instalado no Windows. As portas devem estar livres;
o teste falha se não puder abri-las e fecha ambos os servidores em finally.

Cria conta QA, valida rejeição antes da meta tag, publica o próprio token, confirma propriedade,
dispara ZAP apenas no fixture, acompanha até COMPLETED e consulta histórico. Decodifica MIME do
MailHog local em 8025, valida anexo PDF por %PDF-, tamanho e SHA-256. Não avalia layout do PDF
nem comprova o destinatário de negócio: registra o destinatário padrão do worker em desenvolvimento.
PARTIAL, timeout ou falha retornam código 1. Não há bypass nem mudança de autorização.
Contas, scans e mensagens são mantidos, sem exclusão automática. Linux sem Docker Desktop
precisa de configuração de rede específica, não validada nesta entrega.

Opções: QA_SCAN_TIMEOUT_MS (padrão 240000), QA_ARTIFACT_DIR e QA_CREDENTIALS_FILE para conta QA
existente. Nunca versione esse arquivo. Remova variáveis QA após usar.
O fluxo integrado não foi reexecutado contra containers de 9ddd65e: esta sessão não tem acesso
ao mecanismo Docker para atualizar o ambiente antigo.

## Evidências

```powershell
npm --prefix frontend test -- --reporter=json --outputFile=../qa/artifacts/frontend-current.json
```

Resultados gerados de API/fluxo ficam em qa/artifacts, ignorado pelo Git.
O CI existente já executa npm test e descoberta de testes Python: workflows preservados sem
modificações nesta PR. Revalidação e comparação histórica: docs/qa/issue-52/README.md.
