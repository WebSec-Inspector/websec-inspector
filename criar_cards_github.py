#!/usr/bin/env python3
"""
Script para criar cards no GitHub Projects V2 via API GraphQL.

COMO USAR:
1. Gere um Personal Access Token no GitHub:
   - Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Scopes necessários: repo, project, read:org

2. Configure as variáveis abaixo:
   - GITHUB_TOKEN: seu token
   - ORG_NAME: nome da organização ou usuário (ex: "meu-time-fabrica")
   - REPO_NAME: nome do repositório (ex: "websec-inspector")
   - PROJECT_NUMBER: número do projeto (ex: 1)

3. Execute: python criar_cards_github.py

IMPORTANTE:
- Este script cria ISSUES no repositório e as vincula ao projeto.
- As issues viram cards automaticamente no GitHub Projects V2.
- Labels são criadas automaticamente se não existirem.
"""

import requests
import json
import time

# ===================== CONFIGURAÇÃO =====================
GITHUB_TOKEN = "ghp_SEU_TOKEN_AQUI"  # Substitua pelo seu token
ORG_NAME = "meu-time-fabrica"        # Substitua pelo nome da org/usuário
REPO_NAME = "websec-inspector"       # Substitua pelo nome do repo
PROJECT_NUMBER = 1                   # Número do projeto (veja na URL do Projects)
# ========================================================

GRAPHQL_URL = "https://api.github.com/graphql"
REST_URL = "https://api.github.com"

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
}

GRAPHQL_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Content-Type": "application/json"
}


def graphql_query(query, variables=None):
    """Executa uma query GraphQL."""
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    response = requests.post(GRAPHQL_URL, headers=GRAPHQL_HEADERS, json=payload)
    if response.status_code != 200:
        print(f"Erro GraphQL: {response.status_code}")
        print(response.text)
        return None

    data = response.json()
    if "errors" in data:
        print(f"Erros GraphQL: {data['errors']}")
        return None

    return data.get("data")


def get_repo_id():
    """Obtém o ID do repositório."""
    query = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
      }
    }
    """
    result = graphql_query(query, {"owner": ORG_NAME, "name": REPO_NAME})
    return result["repository"]["id"] if result else None


def get_project_id():
    """Obtém o ID do projeto."""
    query = """
    query($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectV2(number: $number) {
          id
        }
      }
    }
    """
    result = graphql_query(query, {"owner": ORG_NAME, "number": PROJECT_NUMBER})
    if result and result.get("organization"):
        return result["organization"]["projectV2"]["id"]

    # Tenta como usuário (não organização)
    query_user = """
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
        }
      }
    }
    """
    result = graphql_query(query_user, {"owner": ORG_NAME, "number": PROJECT_NUMBER})
    if result and result.get("user"):
        return result["user"]["projectV2"]["id"]

    return None


def create_label(name, color, description=""):
    """Cria uma label no repositório (ignora se já existe)."""
    url = f"{REST_URL}/repos/{ORG_NAME}/{REPO_NAME}/labels"
    payload = {
        "name": name,
        "color": color.lstrip("#"),
        "description": description
    }
    response = requests.post(url, headers=HEADERS, json=payload)
    if response.status_code == 201:
        print(f"  Label criada: {name}")
    elif response.status_code == 422:
        print(f"  Label já existe: {name}")
    else:
        print(f"  Erro ao criar label {name}: {response.status_code}")


def create_issue(title, body, labels):
    """Cria uma issue no repositório."""
    url = f"{REST_URL}/repos/{ORG_NAME}/{REPO_NAME}/issues"
    payload = {
        "title": title,
        "body": body,
        "labels": labels
    }
    response = requests.post(url, headers=HEADERS, json=payload)
    if response.status_code == 201:
        issue = response.json()
        print(f"  Issue criada: #{issue['number']} - {title}")
        return issue["node_id"]
    else:
        print(f"  Erro ao criar issue '{title}': {response.status_code}")
        print(response.text)
        return None


def add_issue_to_project(project_id, issue_node_id):
    """Adiciona uma issue ao projeto."""
    query = """
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item {
          id
        }
      }
    }
    """
    result = graphql_query(query, {"projectId": project_id, "contentId": issue_node_id})
    if result:
        print(f"  Adicionada ao projeto ✓")
        return True
    return False


# ===================== CARDS A CRIAR =====================
CARDS = [
    # SPRINT 1
    {
        "title": "[S1] Subir ambiente Docker Compose",
        "body": """Configurar docker-compose.yml com todos os serviços:
- PostgreSQL, MongoDB, Redis, RabbitMQ, MinIO
- Backend FastAPI, Frontend Next.js, Worker Celery, ZAP
- Healthchecks, networks isoladas, non-root users
- Makefile com comandos úteis (up, down, logs, test, lint)

**Critério de aceitação:**
- [ ] docker compose up --build sobe sem erros
- [ ] Todos os serviços respondem nas portas corretas
- [ ] Todo o time consegue subir o ambiente localmente
""",
        "labels": ["sprint-1", "infra"],
        "responsavel": "Tech Lead"
    },
    {
        "title": "[S1] Criar tela de login (Next.js)",
        "body": """Implementar tela de login em Next.js 14:
- Formulário com e-mail e senha
- Validação de campos (e-mail válido, senha preenchida)
- Estado de loading no botão
- Mensagem de erro genérica (não revela se e-mail existe)
- Link para tela de cadastro
- Integração com endpoint POST /api/v1/auth/login

**Critério de aceitação:**
- [ ] Tela renderiza corretamente em desktop
- [ ] Validação funciona no frontend antes de enviar
- [ ] Em caso de erro, exibe mensagem amigável
""",
        "labels": ["sprint-1", "front"],
        "responsavel": "Front End"
    },
    {
        "title": "[S1] Criar tela de cadastro (Next.js)",
        "body": """Implementar tela de cadastro em Next.js 14:
- Formulário com nome, e-mail, senha, confirmação de senha
- Validação: e-mail válido, senha mínimo 8 caracteres, senhas coincidem
- Estado de loading no botão
- Mensagem de sucesso após cadastro
- Link para tela de login
- Integração com endpoint POST /api/v1/auth/register

**Critério de aceitação:**
- [ ] Tela renderiza corretamente
- [ ] Validações funcionam no frontend
- [ ] Após cadastro, redireciona para login com mensagem de sucesso
""",
        "labels": ["sprint-1", "front"],
        "responsavel": "Front End"
    },
    {
        "title": "[S1] Endpoint POST /auth/register (FastAPI)",
        "body": """Implementar endpoint de cadastro:
- Receber: email, password, full_name
- Validar: email único, senha >= 8 caracteres
- Criptografar senha com bcrypt
- Salvar usuário no PostgreSQL
- Retornar: user_id, email, message

**Schema Pydantic:**
- UserRegister: email (EmailStr), password (min_length=8), full_name (optional)

**Critério de aceitação:**
- [ ] Usuário é criado no PostgreSQL com senha hasheada
- [ ] E-mail duplicado retorna 400 com mensagem clara
- [ ] Senha curta retorna 400 com validação
""",
        "labels": ["sprint-1", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S1] Endpoint POST /auth/login (FastAPI)",
        "body": """Implementar endpoint de login:
- Receber: email, password
- Buscar usuário no PostgreSQL
- Verificar senha com bcrypt
- Gerar access_token (30 min) e refresh_token (7 dias)
- Salvar sessão no Redis
- Retornar: access_token, refresh_token, token_type="bearer"

**Schema Pydantic:**
- UserLogin: email, password
- TokenResponse: access_token, refresh_token, token_type

**Critério de aceitação:**
- [ ] Login válido retorna tokens JWT
- [ ] Login inválido retorna 401 (mensagem genérica)
- [ ] Token é validado em rotas protegidas
""",
        "labels": ["sprint-1", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S1] Configurar CORS e proxy entre Next.js e FastAPI",
        "body": """- Configurar CORS no FastAPI para aceitar requisições do localhost:3000
- Configurar rewrites no next.config.mjs para proxy /api/* → backend:8000
- Testar integração end-to-end: frontend chama backend sem erro de CORS

**Critério de aceitação:**
- [ ] Front consegue chamar /api/v1/auth/register sem erro de CORS
- [ ] Front consegue chamar /api/v1/auth/login sem erro de CORS
""",
        "labels": ["sprint-1", "infra"],
        "responsavel": "Tech Lead"
    },
    {
        "title": "[S1] Escrever casos de uso UC01 e UC02",
        "body": """Documentar em docs/casos-de-uso.md:
- UC01: Cadastrar Usuário (ator, pré-condições, fluxo principal, alternativos, pós-condições)
- UC02: Autenticar Usuário (ator, pré-condições, fluxo principal, alternativos, pós-condições)

Seguir template padrão de caso de uso.
""",
        "labels": ["sprint-1", "docs"],
        "responsavel": "PM/PO"
    },
    {
        "title": "[S1] Wireframes de login e cadastro no Figma",
        "body": """Desenhar wireframes de baixa fidelidade:
- Tela de login (campos, botão, link para cadastro)
- Tela de cadastro (campos, botão, link para login)
- Estados: vazio, preenchido, erro, loading
- Versão desktop (tablet é nice-to-have)

Entregar link do Figma compartilhado com o time.
""",
        "labels": ["sprint-1", "ux"],
        "responsavel": "UX/UI"
    },
    {
        "title": "[S1] Documentar contrato de API v0.1 (auth)",
        "body": """Criar docs/api-contracts/v1/auth.md com:
- POST /api/v1/auth/register (request, response, erros)
- POST /api/v1/auth/login (request, response, erros)
- POST /api/v1/auth/refresh (request, response)

Incluir exemplos de JSON para cada endpoint.
""",
        "labels": ["sprint-1", "docs", "infra"],
        "responsavel": "Tech Lead"
    },
    # SPRINT 2
    {
        "title": "[S2] Tela \"Meus Domínios\" (listar, adicionar, remover)",
        "body": """- Lista de domínios do usuário logado
- Botão "Adicionar domínio" com modal/formulário
- Card de domínio com: URL, status (verificado/não), data
- Botão de remover domínio (com confirmação)
- Integração com endpoints GET/POST/DELETE /api/v1/domains
""",
        "labels": ["sprint-2", "front"],
        "responsavel": "Front End"
    },
    {
        "title": "[S2] CRUD de domínios no FastAPI",
        "body": """Implementar endpoints:
- GET /api/v1/domains/ → listar domínios do usuário
- POST /api/v1/domains/ → criar domínio (validar URL, gerar token)
- DELETE /api/v1/domains/{id} → remover domínio
- POST /api/v1/domains/{id}/verify → verificar propriedade

Modelo: Domain (id, user_id, domain, verification_token, verified_at, is_active)
""",
        "labels": ["sprint-2", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S2] Verificação de domínio via DNS TXT e meta-tag",
        "body": """- Gerar token único de verificação (UUID)
- Implementar consulta DNS TXT (usando dnspython ou similar)
- Implementar consulta HTTP para meta-tag
- Atualizar status do domínio para "verificado" se token encontrado
- Retornar instruções claras ao usuário
""",
        "labels": ["sprint-2", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S2] Tela de instruções de verificação",
        "body": """- Após adicionar domínio, mostrar tela com:
  - Token de verificação
  - Instruções passo a passo para DNS TXT
  - Instruções passo a passo para meta-tag
  - Botão "Já fiz, verificar agora"
- Feedback visual: verificando... / verificado / falhou
""",
        "labels": ["sprint-2", "front"],
        "responsavel": "Front End"
    },
    {
        "title": "[S2] Protótipos de alta fidelidade (login, cadastro, domínios)",
        "body": """Evoluir wireframes para protótipos no Figma:
- Cores, tipografia, espaçamentos definidos
- Componentes reutilizáveis (botão, input, card)
- Estados de erro e loading
- Versão desktop
""",
        "labels": ["sprint-2", "ux"],
        "responsavel": "UX/UI"
    },
    {
        "title": "[S2] Plano de testes para verificação de domínio",
        "body": """Documentar cenários de teste:
- Fluxo feliz: adicionar → verificar via DNS → status verificado
- Erro: domínio inválido
- Erro: token DNS não encontrado
- Erro: domínio já cadastrado
- Permissão: usuário não pode verificar domínio de outro
""",
        "labels": ["sprint-2", "qa"],
        "responsavel": "QA"
    },
    # SPRINT 3
    {
        "title": "[S3] Tela \"Novo Scan\" e dashboard de scans",
        "body": """- Dropdown para selecionar domínio verificado
- Botão "Iniciar Scan" com confirmação
- Dashboard com lista de scans (status, data, domínio)
- Status em tempo real: Pendente, Executando, Concluído, Falhou
- Badge de severidade máxima (CVSS)
""",
        "labels": ["sprint-3", "front"],
        "responsavel": "Front End"
    },
    {
        "title": "[S3] Endpoints de scan (criar, listar, detalhes)",
        "body": """- POST /api/v1/scans/ → iniciar scan (validar domínio verificado)
- GET /api/v1/scans/ → listar scans do usuário
- GET /api/v1/scans/{id} → detalhes do scan (metadados + vulns)

Integrar com fila RabbitMQ ao criar scan.
""",
        "labels": ["sprint-3", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S3] Configurar RabbitMQ + Celery Workers",
        "body": """- Configurar Celery app com RabbitMQ como broker
- Criar task run_owasp_scan(scan_id, target_url)
- Configurar DLQ (Dead Letter Queue) para retries
- Testar: publicar mensagem → worker consome → processa
""",
        "labels": ["sprint-3", "infra", "back"],
        "responsavel": "Tech Lead + Back End"
    },
    {
        "title": "[S3] Integrar com OWASP ZAP",
        "body": """- Implementar ZAPService: start_scan(), get_status(), get_alerts()
- Configurar ZAP em modo daemon no Docker Compose
- Limitar scope: spider depth=10, scan policy "Light"
- Converter alerts do ZAP para schema interno
- Calcular CVSS a partir dos alerts
""",
        "labels": ["sprint-3", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S3] Salvar resultados no MongoDB e evidências no MinIO",
        "body": """- Criar collection vulnerabilities no MongoDB
- Schema flexível por tipo de vulnerabilidade
- Salvar screenshots/logs no MinIO (bucket "evidence")
- Gerar URL assinada para acesso temporário
""",
        "labels": ["sprint-3", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S3] Tela de detalhes do scan (vulnerabilidades)",
        "body": """- Lista de vulnerabilidades com severidade (cor: crítica=vermelho, alta=laranja)
- Card expansível com: título, descrição, URL, CVSS, evidência, recomendação
- Filtros por severidade
- Mensagem "Nenhuma vulnerabilidade detectada" quando aplicável
""",
        "labels": ["sprint-3", "front"],
        "responsavel": "Front End"
    },
    # SPRINT 4
    {
        "title": "[S4] Template HTML do relatório + geração de PDF",
        "body": """- Criar template HTML com CSS para impressão (@media print)
- Capa, resumo executivo, detalhamento de vulns, evidências, recomendações
- WeasyPrint: HTML → PDF
- Upload do PDF para MinIO
- Endpoint GET /api/v1/reports/{scan_id}/download
""",
        "labels": ["sprint-4", "back", "ux"],
        "responsavel": "Back End + UX/UI"
    },
    {
        "title": "[S4] Envio de e-mail via Resend API",
        "body": """- Integrar com Resend (API REST)
- Template HTML de e-mail: "Relatório de Segurança — [domínio]"
- Anexar link do PDF (URL assinada, 7 dias)
- Trigger: ao concluir scan, disparar e-mail automaticamente
- Fallback: se Resend falhar, logar erro e não bloquear o scan
""",
        "labels": ["sprint-4", "back"],
        "responsavel": "Back End"
    },
    {
        "title": "[S4] Tela de histórico e comparação de scans",
        "body": """- Lista de scans anteriores por domínio
- Selecionar 2 scans para comparar
- Visualização: vulns novas (vermelho), corrigidas (verde), persistentes (amarelo)
- Mudança no score CVSS máximo
""",
        "labels": ["sprint-4", "front"],
        "responsavel": "Front End"
    },
    {
        "title": "[S4] Testes E2E com Playwright",
        "body": """- Instalar Playwright no frontend
- Criar testes:
  - Fluxo completo: cadastro → login → adicionar domínio → verificar
  - Scan: iniciar scan → aguardar conclusão → ver resultado
- Rodar no CI (GitHub Actions)
""",
        "labels": ["sprint-4", "qa", "front"],
        "responsavel": "Front + QA"
    },
    {
        "title": "[S4] Deploy em nuvem (AWS Free Tier / Oracle Cloud)",
        "body": """- Criar VM na nuvem (AWS EC2 free tier ou Oracle Cloud Always Free)
- Instalar Docker e Docker Compose
- Clonar repo e subir com docker compose up -d
- Configurar firewall (security group) para portas 3000, 8000
- Testar acesso público
""",
        "labels": ["sprint-4", "infra"],
        "responsavel": "Tech Lead"
    },
    {
        "title": "[S4] Documentação final e preparação para demo",
        "body": """- Documento de requisitos atualizado
- Diagramas UML (casos de uso, classes, sequência)
- Manual de instalação (README completo)
- Script de demo gravado (vídeo de 3-5 min)
- Slides de apresentação
""",
        "labels": ["sprint-4", "docs"],
        "responsavel": "PM/PO + Tech Lead"
    }
]

# ===================== LABELS A CRIAR =====================
LABELS = [
    ("sprint-1", "1D76DB", "Sprint 1 — Fundação"),
    ("sprint-2", "0E8A16", "Sprint 2 — Domínios"),
    ("sprint-3", "FEF2C0", "Sprint 3 — Scanner"),
    ("sprint-4", "D93F0B", "Sprint 4 — Relatórios"),
    ("front", "FBCA04", "Frontend — Next.js"),
    ("back", "B60205", "Backend — FastAPI"),
    ("ux", "FF7619", "UX/UI — Figma"),
    ("qa", "FFD54F", "Quality Assurance"),
    ("infra", "666666", "Infraestrutura / DevOps"),
    ("docs", "FFFFFF", "Documentação"),
    ("bug", "EE0701", "Bug / Defeito"),
]


def main():
    print("=" * 60)
    print("Criador de Cards — GitHub Projects")
    print("=" * 60)
    print()

    # Verificar configuração
    if GITHUB_TOKEN == "ghp_SEU_TOKEN_AQUI":
        print("ERRO: Configure o GITHUB_TOKEN no script antes de executar.")
        print("Veja as instruções no topo do arquivo.")
        return

    if ORG_NAME == "meu-time-fabrica":
        print("AVISO: Configure ORG_NAME com o nome da sua organização/usuário GitHub.")

    print("Etapa 1/4: Criando labels...")
    for name, color, desc in LABELS:
        create_label(name, color, desc)
        time.sleep(0.5)

    print()
    print("Etapa 2/4: Obtendo IDs do repositório e projeto...")

    repo_id = get_repo_id()
    if not repo_id:
        print("ERRO: Não foi possível obter o ID do repositório.")
        print(f"Verifique se o repo '{ORG_NAME}/{REPO_NAME}' existe e se o token tem permissão.")
        return
    print(f"  Repositório encontrado ✓")

    project_id = get_project_id()
    if not project_id:
        print("AVISO: Não foi possível obter o ID do projeto.")
        print("As issues serão criadas, mas não vinculadas ao projeto automaticamente.")
        print("Você pode adicionar manualmente depois.")
    else:
        print(f"  Projeto encontrado ✓")

    print()
    print("Etapa 3/4: Criando issues (cards)...")
    created = 0
    for card in CARDS:
        print(f"\nCriando: {card['title']}")
        issue_node_id = create_issue(card["title"], card["body"], card["labels"])
        if issue_node_id:
            created += 1
            if project_id:
                add_issue_to_project(project_id, issue_node_id)
        time.sleep(1)

    print()
    print("=" * 60)
    print(f"Concluído! {created}/{len(CARDS)} cards criados.")
    if project_id:
        print("As issues foram vinculadas ao projeto automaticamente.")
    else:
        print("As issues foram criadas. Adicione-as ao projeto manualmente no GitHub.")
    print("=" * 60)


if __name__ == "__main__":
    main()
