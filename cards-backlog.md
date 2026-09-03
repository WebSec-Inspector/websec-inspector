# Cards do Backlog — GitHub Projects
## WebSec Inspector — Sprint 1 a 4

Copie e cole cada card no GitHub Projects. Use as labels indicadas.

---

## SPRINT 1 — Fundação

### Card 1
**Título:** `[S1] Subir ambiente Docker Compose`

**Descrição:**
```
Configurar docker-compose.yml com todos os serviços:
- PostgreSQL, MongoDB, Redis, RabbitMQ, MinIO
- Backend FastAPI, Frontend Next.js, Worker Celery, ZAP
- Healthchecks, networks isoladas, non-root users
- Makefile com comandos úteis (up, down, logs, test, lint)

Critério de aceitação:
- [ ] docker compose up --build sobe sem erros
- [ ] Todos os serviços respondem nas portas corretas
- [ ] Todo o time consegue subir o ambiente localmente
```

**Labels:** `sprint-1`, `infra`
**Responsável:** Tech Lead
**Pontos:** 3

---

### Card 2
**Título:** `[S1] Criar tela de login (Next.js)`

**Descrição:**
```
Implementar tela de login em Next.js 14:
- Formulário com e-mail e senha
- Validação de campos (e-mail válido, senha preenchida)
- Estado de loading no botão
- Mensagem de erro genérica (não revela se e-mail existe)
- Link para tela de cadastro
- Integração com endpoint POST /api/v1/auth/login

Critério de aceitação:
- [ ] Tela renderiza corretamente em desktop
- [ ] Validação funciona no frontend antes de enviar
- [ ] Em caso de erro, exibe mensagem amigável
```

**Labels:** `sprint-1`, `front`
**Responsável:** Front End
**Pontos:** 3

---

### Card 3
**Título:** `[S1] Criar tela de cadastro (Next.js)`

**Descrição:**
```
Implementar tela de cadastro em Next.js 14:
- Formulário com nome, e-mail, senha, confirmação de senha
- Validação: e-mail válido, senha mínimo 8 caracteres, senhas coincidem
- Estado de loading no botão
- Mensagem de sucesso após cadastro
- Link para tela de login
- Integração com endpoint POST /api/v1/auth/register

Critério de aceitação:
- [ ] Tela renderiza corretamente
- [ ] Validações funcionam no frontend
- [ ] Após cadastro, redireciona para login com mensagem de sucesso
```

**Labels:** `sprint-1`, `front`
**Responsável:** Front End
**Pontos:** 3

---

### Card 4
**Título:** `[S1] Endpoint POST /auth/register (FastAPI)`

**Descrição:**
```
Implementar endpoint de cadastro:
- Receber: email, password, full_name
- Validar: email único, senha >= 8 caracteres
- Criptografar senha com bcrypt
- Salvar usuário no PostgreSQL
- Retornar: user_id, email, message

Schema Pydantic:
- UserRegister: email (EmailStr), password (min_length=8), full_name (optional)

Critério de aceitação:
- [ ] Usuário é criado no PostgreSQL com senha hasheada
- [ ] E-mail duplicado retorna 400 com mensagem clara
- [ ] Senha curta retorna 400 com validação
```

**Labels:** `sprint-1`, `back`
**Responsável:** Back End
**Pontos:** 3

---

### Card 5
**Título:** `[S1] Endpoint POST /auth/login (FastAPI)`

**Descrição:**
```
Implementar endpoint de login:
- Receber: email, password
- Buscar usuário no PostgreSQL
- Verificar senha com bcrypt
- Gerar access_token (30 min) e refresh_token (7 dias)
- Salvar sessão no Redis
- Retornar: access_token, refresh_token, token_type="bearer"

Schema Pydantic:
- UserLogin: email, password
- TokenResponse: access_token, refresh_token, token_type

Critério de aceitação:
- [ ] Login válido retorna tokens JWT
- [ ] Login inválido retorna 401 (mensagem genérica)
- [ ] Token é validado em rotas protegidas
```

**Labels:** `sprint-1`, `back`
**Responsável:** Back End
**Pontos:** 3

---

### Card 6
**Título:** `[S1] Configurar CORS e proxy entre Next.js e FastAPI`

**Descrição:**
```
- Configurar CORS no FastAPI para aceitar requisições do localhost:3000
- Configurar rewrites no next.config.mjs para proxy /api/* → backend:8000
- Testar integração end-to-end: frontend chama backend sem erro de CORS

Critério de aceitação:
- [ ] Front consegue chamar /api/v1/auth/register sem erro de CORS
- [ ] Front consegue chamar /api/v1/auth/login sem erro de CORS
```

**Labels:** `sprint-1`, `infra`
**Responsável:** Tech Lead
**Pontos:** 2

---

### Card 7
**Título:** `[S1] Escrever casos de uso UC01 e UC02`

**Descrição:**
```
Documentar em docs/casos-de-uso.md:
- UC01: Cadastrar Usuário (ator, pré-condições, fluxo principal, alternativos, pós-condições)
- UC02: Autenticar Usuário (ator, pré-condições, fluxo principal, alternativos, pós-condições)

Seguir template padrão de caso de uso.
```

**Labels:** `sprint-1`, `docs`
**Responsável:** PM/PO
**Pontos:** 2

---

### Card 8
**Título:** `[S1] Wireframes de login e cadastro no Figma`

**Descrição:**
```
Desenhar wireframes de baixa fidelidade:
- Tela de login (campos, botão, link para cadastro)
- Tela de cadastro (campos, botão, link para login)
- Estados: vazio, preenchido, erro, loading
- Versão desktop (tablet é nice-to-have)

Entregar link do Figma compartilhado com o time.
```

**Labels:** `sprint-1`, `ux`
**Responsável:** UX/UI
**Pontos:** 3

---

### Card 9
**Título:** `[S1] Documentar contrato de API v0.1 (auth)`

**Descrição:**
```
Criar docs/api-contracts/v1/auth.md com:
- POST /api/v1/auth/register (request, response, erros)
- POST /api/v1/auth/login (request, response, erros)
- POST /api/v1/auth/refresh (request, response)

Incluir exemplos de JSON para cada endpoint.
```

**Labels:** `sprint-1`, `docs`, `infra`
**Responsável:** Tech Lead
**Pontos:** 2

---

## SPRINT 2 — Domínios

### Card 10
**Título:** `[S2] Tela "Meus Domínios" (listar, adicionar, remover)`

**Descrição:**
```
- Lista de domínios do usuário logado
- Botão "Adicionar domínio" com modal/formulário
- Card de domínio com: URL, status (verificado/não), data
- Botão de remover domínio (com confirmação)
- Integração com endpoints GET/POST/DELETE /api/v1/domains
```

**Labels:** `sprint-2`, `front`
**Responsável:** Front End
**Pontos:** 5

---

### Card 11
**Título:** `[S2] CRUD de domínios no FastAPI`

**Descrição:**
```
Implementar endpoints:
- GET /api/v1/domains/ → listar domínios do usuário
- POST /api/v1/domains/ → criar domínio (validar URL, gerar token)
- DELETE /api/v1/domains/{id} → remover domínio
- POST /api/v1/domains/{id}/verify → verificar propriedade

Modelo: Domain (id, user_id, domain, verification_token, verified_at, is_active)
```

**Labels:** `sprint-2`, `back`
**Responsável:** Back End
**Pontos:** 5

---

### Card 12
**Título:** `[S2] Verificação de domínio via DNS TXT e meta-tag`

**Descrição:**
```
- Gerar token único de verificação (UUID)
- Implementar consulta DNS TXT (usando dnspython ou similar)
- Implementar consulta HTTP para meta-tag
- Atualizar status do domínio para "verificado" se token encontrado
- Retornar instruções claras ao usuário
```

**Labels:** `sprint-2`, `back`
**Responsável:** Back End
**Pontos:** 8

---

### Card 13
**Título:** `[S2] Tela de instruções de verificação`

**Descrição:**
```
- Após adicionar domínio, mostrar tela com:
  - Token de verificação
  - Instruções passo a passo para DNS TXT
  - Instruções passo a passo para meta-tag
  - Botão "Já fiz, verificar agora"
- Feedback visual: verificando... / verificado / falhou
```

**Labels:** `sprint-2`, `front`
**Responsável:** Front End
**Pontos:** 5

---

### Card 14
**Título:** `[S2] Protótipos de alta fidelidade (login, cadastro, domínios)`

**Descrição:**
```
Evoluir wireframes para protótipos no Figma:
- Cores, tipografia, espaçamentos definidos
- Componentes reutilizáveis (botão, input, card)
- Estados de erro e loading
- Versão desktop
```

**Labels:** `sprint-2`, `ux`
**Responsável:** UX/UI
**Pontos:** 5

---

### Card 15
**Título:** `[S2] Plano de testes para verificação de domínio`

**Descrição:**
```
Documentar cenários de teste:
- Fluxo feliz: adicionar → verificar via DNS → status verificado
- Erro: domínio inválido
- Erro: token DNS não encontrado
- Erro: domínio já cadastrado
- Permissão: usuário não pode verificar domínio de outro
```

**Labels:** `sprint-2`, `qa`
**Responsável:** QA
**Pontos:** 3

---

## SPRINT 3 — Scanner

### Card 16
**Título:** `[S3] Tela "Novo Scan" e dashboard de scans`

**Descrição:**
```
- Dropdown para selecionar domínio verificado
- Botão "Iniciar Scan" com confirmação
- Dashboard com lista de scans (status, data, domínio)
- Status em tempo real: Pendente, Executando, Concluído, Falhou
- Badge de severidade máxima (CVSS)
```

**Labels:** `sprint-3`, `front`
**Responsável:** Front End
**Pontos:** 8

---

### Card 17
**Título:** `[S3] Endpoints de scan (criar, listar, detalhes)`

**Descrição:**
```
- POST /api/v1/scans/ → iniciar scan (validar domínio verificado)
- GET /api/v1/scans/ → listar scans do usuário
- GET /api/v1/scans/{id} → detalhes do scan (metadados + vulns)

Integrar com fila RabbitMQ ao criar scan.
```

**Labels:** `sprint-3`, `back`
**Responsável:** Back End
**Pontos:** 5

---

### Card 18
**Título:** `[S3] Configurar RabbitMQ + Celery Workers`

**Descrição:**
```
- Configurar Celery app com RabbitMQ como broker
- Criar task run_owasp_scan(scan_id, target_url)
- Configurar DLQ (Dead Letter Queue) para retries
- Testar: publicar mensagem → worker consome → processa
```

**Labels:** `sprint-3`, `infra`, `back`
**Responsável:** Tech Lead + Back End
**Pontos:** 8

---

### Card 19
**Título:** `[S3] Integrar com OWASP ZAP`

**Descrição:**
```
- Implementar ZAPService: start_scan(), get_status(), get_alerts()
- Configurar ZAP em modo daemon no Docker Compose
- Limitar scope: spider depth=10, scan policy "Light"
- Converter alerts do ZAP para schema interno
- Calcular CVSS a partir dos alerts
```

**Labels:** `sprint-3`, `back`
**Responsável:** Back End
**Pontos:** 13

---

### Card 20
**Título:** `[S3] Salvar resultados no MongoDB e evidências no MinIO`

**Descrição:**
```
- Criar collection vulnerabilities no MongoDB
- Schema flexível por tipo de vulnerabilidade
- Salvar screenshots/logs no MinIO (bucket "evidence")
- Gerar URL assinada para acesso temporário
```

**Labels:** `sprint-3`, `back`
**Responsável:** Back End
**Pontos:** 5

---

### Card 21
**Título:** `[S3] Tela de detalhes do scan (vulnerabilidades)`

**Descrição:**
```
- Lista de vulnerabilidades com severidade (cor: crítica=vermelho, alta=laranja)
- Card expansível com: título, descrição, URL, CVSS, evidência, recomendação
- Filtros por severidade
- Mensagem "Nenhuma vulnerabilidade detectada" quando aplicável
```

**Labels:** `sprint-3`, `front`
**Responsável:** Front End
**Pontos:** 8

---

## SPRINT 4 — Relatórios

### Card 22
**Título:** `[S4] Template HTML do relatório + geração de PDF`

**Descrição:**
```
- Criar template HTML com CSS para impressão (@media print)
- Capa, resumo executivo, detalhamento de vulns, evidências, recomendações
- WeasyPrint: HTML → PDF
- Upload do PDF para MinIO
- Endpoint GET /api/v1/reports/{scan_id}/download
```

**Labels:** `sprint-4`, `back`, `ux`
**Responsável:** Back End + UX/UI
**Pontos:** 8

---

### Card 23
**Título:** `[S4] Envio de e-mail via Resend API`

**Descrição:**
```
- Integrar com Resend (API REST)
- Template HTML de e-mail: "Relatório de Segurança — [domínio]"
- Anexar link do PDF (URL assinada, 7 dias)
- Trigger: ao concluir scan, disparar e-mail automaticamente
- Fallback: se Resend falhar, logar erro e não bloquear o scan
```

**Labels:** `sprint-4`, `back`
**Responsável:** Back End
**Pontos:** 5

---

### Card 24
**Título:** `[S4] Tela de histórico e comparação de scans`

**Descrição:**
```
- Lista de scans anteriores por domínio
- Selecionar 2 scans para comparar
- Visualização: vulns novas (vermelho), corrigidas (verde), persistentes (amarelo)
- Mudança no score CVSS máximo
```

**Labels:** `sprint-4`, `front`
**Responsável:** Front End
**Pontos:** 5

---

### Card 25
**Título:** `[S4] Testes E2E com Playwright`

**Descrição:**
```
- Instalar Playwright no frontend
- Criar testes:
  - Fluxo completo: cadastro → login → adicionar domínio → verificar
  - Scan: iniciar scan → aguardar conclusão → ver resultado
- Rodar no CI (GitHub Actions)
```

**Labels:** `sprint-4`, `qa`, `front`
**Responsável:** Front + QA
**Pontos:** 8

---

### Card 26
**Título:** `[S4] Deploy em nuvem (AWS Free Tier / Oracle Cloud)`

**Descrição:**
```
- Criar VM na nuvem (AWS EC2 free tier ou Oracle Cloud Always Free)
- Instalar Docker e Docker Compose
- Clonar repo e subir com docker compose up -d
- Configurar firewall (security group) para portas 3000, 8000
- Testar acesso público
```

**Labels:** `sprint-4`, `infra`
**Responsável:** Tech Lead
**Pontos:** 5

---

### Card 27
**Título:** `[S4] Documentação final e preparação para demo`

**Descrição:**
```
- Documento de requisitos atualizado
- Diagramas UML (casos de uso, classes, sequência)
- Manual de instalação (README completo)
- Script de demo gravado (vídeo de 3-5 min)
- Slides de apresentação
```

**Labels:** `sprint-4`, `docs`
**Responsável:** PM/PO + Tech Lead
**Pontos:** 5

---

*Total de cards: 27 | Sprints: 4*
