# Listagem geral de varreduras (#17 / T7)

`GET /api/scans?page=0&size=20&domainId=&status=` exige autenticação. `page`
começa em zero e `size` aceita de 1 a 100; padrões: 0 e 20. `domainId`
positivo e `status` exato (`PENDING_VERIFICATION`, `QUEUED`, `RUNNING`,
`COMPLETED`, `FAILED`, `CANCELLED`) são filtros opcionais. Filtros vazios de
domínio/status equivalem a não filtrar. Valores inválidos retornam 400.

CLIENTE vê suas varreduras; GERENTE vê as próprias e as de usuários CLIENTE
sob sua gestão; ADMINISTRADOR vê todas. Essa é a política de
`AccessControlService.canAccessUser`. Filtrar domínio inexistente ou fora do
escopo retorna página vazia, sem revelar a existência de recursos de outra
conta. Scans excluídos logicamente não aparecem. Domínios arquivados
preservam o histórico e têm `domainActive: false`.

Resposta estável, sem serialização de entidades JPA:

```json
{
  "content": [{
    "id": 42, "domainId": 7, "hostname": "example.invalid", "name": null,
    "status": "COMPLETED", "createdAt": "2026-10-31T12:00:00Z",
    "finishedAt": "2026-10-31T12:05:00Z", "findingsCount": 3,
    "maxSeverity": "HIGH", "domainActive": true
  }],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

Ordenação fixa: `createdAt DESC, id DESC`. A consulta limita a página antes
de agregar achados, mantendo uma linha por scan. Contagem e conteúdo usam
a mesma transação PostgreSQL com isolamento REPEATABLE READ. Uma página
além do fim retorna `content: []`, preservando os totais; zero resultados
produz `totalPages: 0`. Novas consultas refletem inserções/exclusões
posteriores; não há snapshot compartilhado entre requisições HTTP.

`maxSeverity` representa o maior risco do scanner, nesta ordem:
CRITICAL > HIGH > MEDIUM > LOW > INFORMATIONAL. `null` indica ausência de
achados; INFORMATIONAL permanece distinto. Essa classificação não calcula
CVSS. A resposta não inclui achados completos nem token de verificação.

`ScanListPage` usa paginação no servidor e filtro de status. Exibe somente
metadados, risco e links para os resultados, incluindo a indicação de
domínio arquivado. Mudanças de filtro reiniciam na primeira página,
cancelam a requisição anterior e descartam respostas/erros atrasados mesmo
se o transporte ignorar o cancelamento. Loading, erro recuperável e
resultado vazio têm estados explícitos. A navegação e a rota protegida
`/varreduras` são integradas separadamente nesta entrega T7.

Validação: `ScanListPostgresTest` usa login JWT real e PostgreSQL descartável;
`frontend/tests/component/scan-list.test.tsx` verifica paginação, filtro,
abort, respostas e erros atrasados, ausência de achados e INFORMATIONAL.
