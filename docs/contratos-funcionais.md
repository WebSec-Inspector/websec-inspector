# Contratos funcionais e pendências de implementação

Base auditada: `bb3f76f116c7da9fed412f7efadfc9c36550ff80`, em 31/10/2026.

Este documento distingue a implementação atual das entregas que ainda precisam de validação. Uma issue fechada não substitui evidência de aceitação. As propostas abaixo não retiram requisitos antigos automaticamente.

## Arquitetura existente

API Spring Boot/Java 17; frontend React/TypeScript com Vite; PostgreSQL; fila Redis; worker Python com OWASP ZAP; PDF em ReportLab e SMTP. Referências antigas a FastAPI, Next.js e RabbitMQ devem ser reconciliadas com essa arquitetura, sem reescrever o produto apenas para recuperar os nomes do planejamento.

## Requisitos que permanecem pendentes

| Área | Existe | Falta | Issue principal |
|---|---|---|---|
| Domínios | Cadastro, listagem, verificação, escopo e arquivamento lógico implementados nesta entrega | Validação integrada em PostgreSQL/ambiente de produção; tela pode receber evolução visual | #11; relacionada #10 |
| Alvo | Hostname persistido | Preservar protocolo, porta e caminho autorizados | #28 |
| Verificação | DNS TXT e meta tag | Cancelamento persistido e limite de retentativas | #66 |
| Token | Geração vinculada ao domínio | Antecipação e estabilidade entre scans, inclusive concorrentes | #67, #68 |
| Scanner | Spider, active scan e parser | Deadline, recuperação de trabalhos e política de scan explícita | #19; tarefa de confiabilidade |
| Achados | Persistência e exibição básica | Evidências visíveis, filtros, expansão e rótulo correto do score | #21 |
| PDF | Arquivo básico no worker | Registro Report, conteúdo completo, regeneração e download autorizado | #29; relacionadas #22/#49 |
| E-mail | SMTP com destinatário de teste | Destinatário do proprietário, entrega externa e registro de tentativas | #31; relacionada #23 |
| Comparação | Histórico por domínio | Comparação de duas execuções compatíveis | #30; relacionada #24 |
| E2E | Vitest e scripts de QA | Playwright e execução do fluxo integrado no CI | #25, #52 |
| Deploy | Backup, imagens e checagens HTTP | Migrações versionadas e bloqueio por schema incompatível | #47; tarefa de migrações |

## Decisões que não podem ser confundidas com entregas

- **JWT (#5):** existe access token com reautenticação; não existe refresh token nem sessão Redis. Enquanto não houver aprovação de mudança de escopo, esses critérios originais continuam pendentes.
- **Cadastro (#3/#57):** hoje autentica e abre o Dashboard. Propõe-se manter esse fluxo e adicionar confirmação de senha. A mudança do critério antigo de retorno ao login exige validação de produto. Erros úteis de duplicidade e indisponibilidade continuam necessários.
- **PDF (#22):** manter ReportLab é uma proposta, desde que o conteúdo e a apresentação atendam aos critérios. A troca de biblioteca não resolve a ausência de download ou persistência.
- **Entrega externa (#23):** propõe-se SMTP configurável, mantendo Mailpit apenas em testes. Se a integração Resend for obrigatória, a issue permanece pendente até implementá-la. Captura no Mailpit não comprova recebimento externo.
- **Classificação (#19/#21):** os valores 8.5/5.5/3.0/0.0 derivam do risco do ZAP. Devem aparecer como score aproximado, até existir cálculo CVSS com versão, vetor e método verificáveis.
- **Scans (#17):** existe histórico por domínio, mas falta listagem geral paginada por escopo. Redis é a fila real; isso não prova cumprimento do contrato antigo de RabbitMQ.
- **Limites ZAP (#19):** profundidade 10 e política Light ainda não estão configuradas. Prazo total proposto de 15 minutos deve ser validado em ambiente controlado.

## Critério para encerrar trabalho

Cada entrega precisa indicar issue, PR, testes executados, limitações e revisão validada. Varredura, emissão de PDF e envio de e-mail devem ter estados independentes: falha no PDF ou SMTP não apaga uma varredura concluída. Novos endpoints precisam respeitar proprietário e escopo de gerente/administrador.

O fluxo integrado a validar é: cadastro → login → domínio/token → comprovação real → scan → achados → PDF → e-mail → histórico/comparação. Incluir expiração, cancelamento, reinício de worker e tentativas de acesso entre contas.


## Entrega da issue #11 — gestão de domínios

A API de domínios usa o padrão existente `/api/domains`:

- `GET /api/domains`: lista somente registros ativos, ordenados por hostname, dentro do escopo do ator. O token não é incluído na listagem.
- `POST /api/domains`: recebe `hostname` e `targetUserId` opcional. Aceita hostname ou URL HTTP/HTTPS, valida DNS, cria sem abrir scan/fila e retorna `201` para novo registro ou `200` para registro idempotente/reativado. O token é retornado somente quando o ator é o próprio proprietário.
- `POST /api/domains/{id}/verify`: verifica DNS TXT ou meta tag diretamente. Sucesso retorna `200`; prova ausente retorna `409` com `code=VERIFICATION_PENDING`. Não cria scan.
- `DELETE /api/domains/{id}`: arquiva logicamente e retorna `204`. Scans `PENDING_VERIFICATION`, `QUEUED` ou `RUNNING` impedem o arquivamento com `409`.

A entidade `domains` mantém a unicidade `(hostname,user_id)` e recebe `is_active BOOLEAN NOT NULL DEFAULT TRUE` pela migração versionada `worker/migrations/005_domain_archival.sql`. Reativar reaproveita o ID e o token, mas limpa `verified_at`, exigindo nova comprovação. O histórico continua consultável porque os endpoints de histórico não filtram o estado ativo do domínio.

A tela `/dominios` permite cadastrar, visualizar, verificar e arquivar. Para recuperar o token de um domínio próprio já cadastrado, basta enviar novamente o mesmo hostname pelo formulário: o POST é idempotente e devolve o mesmo token.
