# WebSec Inspector

**Fábrica de Software 2026.2 — UTFPR — Time 5**

Plataforma web para avaliação automatizada de segurança de aplicações acessíveis por HTTP/HTTPS. O alvo precisa passar por uma verificação de controle do domínio antes que a análise seja colocada em fila. As varreduras são executadas de forma assíncrona por um worker isolado, utilizando OWASP ZAP.

## Aplicação hospedada na AWS

**Acesse: [WebSec Inspector](https://18-225-177-140.sslip.io)**

A aplicação está publicada em uma instância Amazon EC2 com Ubuntu e Docker Compose.
O Caddy fornece HTTPS e encaminha as requisições para o frontend e a API;
PostgreSQL, Redis, OWASP ZAP, worker e Mailpit permanecem na rede interna dos containers.
Para utilizar a versão hospedada, abra o link e crie sua conta pelo site.

O GitHub Actions executa testes e validações, publica as imagens no GitHub Container
Registry e atualiza a aplicação automaticamente após pushes ou merges na branch `main`.
A infraestrutura utiliza créditos temporários do plano gratuito da AWS; a continuidade
da hospedagem depende da disponibilidade desses créditos. O endereço pode mudar
se a instância for parada e iniciada novamente.

Veja a [documentação da hospedagem e do CI/CD](docs/aws-cloud.md).

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Frontend | React, TypeScript, Vite, TailwindCSS |
| Backend | Java 17, Spring Boot 3.3.2, Spring Security, JWT |
| Persistência | PostgreSQL, Spring Data JPA |
| Processamento | Python, Redis |
| Segurança | OWASP ZAP |
| Relatórios | ReportLab, SMTP/MailHog |
| API | REST, OpenAPI/Swagger |
| Infraestrutura | Docker, Docker Compose |
| Observabilidade | Prometheus, Grafana |

## Estrutura do projeto

```text
websec-inspector/
├── backend/              # API Spring Boot
├── frontend/             # aplicação React/TypeScript
├── worker/               # processamento assíncrono, ZAP e relatórios
├── infra/                # configurações de infraestrutura
├── docs/                 # documentação técnica e requisitos
├── docker-compose.yml    # ambiente completo de desenvolvimento
└── README.md
```

## Como executar

### 1. Pré-requisitos

É necessário estar habilitado a virtualização na BIOS. O projeto é executado pelo Docker Compose. Não é necessário instalar Java, Node.js, Python, PostgreSQL, Redis ou OWASP ZAP separadamente para o ambiente definido neste repositório: esses componentes são fornecidos pelos próprios containers e imagens do `docker-compose.yml`.

#### Windows

Instale o **Docker Desktop** e utilize o backend **WSL 2**, que é o backend recomendado pelo Docker para a maioria das instalações Windows. O WSL deve estar habilitado e atualizado. Em uma janela do PowerShell, é possível verificar a instalação com:

```powershell
wsl --version
docker --version
docker compose version
```

Caso o WSL não esteja instalado ou atualizado, execute o PowerShell como administrador e use:

```powershell
wsl --install
wsl --update
```

Depois, abra o Docker Desktop e aguarde até o mecanismo Docker estar em execução.

#### macOS e Linux

Instale o Docker Desktop compatível com o seu sistema e confirme que o Docker está iniciado. Verifique no terminal:

```bash
docker --version
docker compose version
```

> **Importante:** o projeto utiliza containers Linux. No Windows, mantenha o Docker Desktop configurado para usar WSL 2.

### 2. Baixar o projeto

```bash
git clone https://github.com/WebSec-Inspector/websec-inspector.git
cd websec-inspector
```

### 3. Subir o ambiente

```bash
docker compose up --build
```

Na primeira execução, o Docker irá baixar as imagens necessárias, construir `backend`, `frontend` e `worker`, criar a rede do projeto e iniciar PostgreSQL, Redis, OWASP ZAP e MailHog.

Prometheus e Grafana são opcionais. Para incluir esses serviços locais, utilize
`docker compose --profile monitoring up -d`.

Após a primeira construção, para iniciar o ambiente novamente:

```bash
docker compose up
```

Para executar em segundo plano:

```bash
docker compose up -d
```

### 4. Acessar os serviços

| Serviço | Endereço |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| MailHog | http://localhost:8025 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |
| OWASP ZAP | http://localhost:8090 |

### 5. Parar e reiniciar

Parar os containers:

```bash
docker compose down
```

Parar e remover também os volumes persistentes do projeto, apagando banco e relatórios locais:

```bash
docker compose down -v
```

Ver logs dos serviços:

```bash
docker compose logs -f
```

Ver o estado dos containers:

```bash
docker compose ps
```

## Funcionamento do ambiente

O `docker-compose.yml` inicia os serviços e liga suas dependências. O fluxo principal é:

```text
Frontend
   ↓
Backend API
   ├── PostgreSQL
   └── Redis
          ↓
       Worker
          ↓
      OWASP ZAP
          ↓
   Findings / PDF
          ↓
       MailHog
```

A aplicação frontend conversa com a API. A API grava os dados no PostgreSQL e coloca scans autorizados na fila Redis. O worker consome a fila, executa a análise no ZAP, persiste os resultados e gera o relatório.

## Documentação

- [`docs/aws-cloud.md`](docs/aws-cloud.md) — hospedagem atual na AWS, acesso público, CI/CD e operação.
- [`docs/oracle-cloud.md`](docs/oracle-cloud.md) — alternativa de infraestrutura Oracle, pendente de capacidade A1.
- [`docs/arquitetura.md`](docs/arquitetura.md) — arquitetura, fluxo e decisões técnicas.
- [`docs/equipe.md`](docs/equipe.md) — designação técnica, organização das responsabilidades.
- [`docs/requisitos.md`](docs/requisitos.md) — requisitos funcionais, não funcionais e de segurança.

O backlog operacional, prioridades, responsáveis e andamento devem ser acompanhados no [GitHub Projects](https://github.com/orgs/WebSec-Inspector/projects/1).
