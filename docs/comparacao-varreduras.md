# Comparação de varreduras

## Acesso e direção

O Dashboard oferece comparação quando há duas execuções COMPLETED no domínio. A tela permite escolher uma base e uma comparada; as diferenças são relativas à direção escolhida, sem impor que a base seja a mais antiga. O endpoint `GET /api/scans/{id}/compare/{otherId}` exige duas IDs distintas, COMPLETED, do mesmo registro de domínio, não excluídas e dentro do escopo do ator. Proprietário, gerente e administrador seguem as regras existentes; ambos os recursos são autorizados antes das validações funcionais. Uma transação de leitura repetível mantém o snapshot da comparação.

## Identidade e agrupamento

A migração 010 acrescenta campos nulos `zap_rule_id` e `http_method`, sem inferir dados históricos ou alterar migrations anteriores. O parser preserva `alertRef` (incluindo a variante) e usa `pluginId` quando não há referência. Referências inválidas ou inconsistentes ficam desconhecidas; CWE, título e descrição nunca substituem um ID. A [documentação de alertas ZAP](https://www.zaproxy.org/docs/desktop/start/features/alerts/) explica a referência da regra e de sua variante.

A identidade inclui regra/variante, URL, parâmetro e método HTTP. Métodos são tokens com caixa preservada: GET e get não se confundem, conforme [RFC 9110, seção 9.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.1). Esse componente adicional evita misturar achados de GET e POST na mesma URL/parâmetro.

A URL normaliza apenas esquema/host, porta padrão, caminho vazio para `/` e remove fragmento. Preserva esquema HTTP/HTTPS distinto, porta não padrão, caixa e conteúdo do caminho, escapes e ordem/conteúdo da query. Não ordena parâmetros nem troca nomes www. URL inválida/com credenciais ou método ausente limita a comparação.

Duplicatas da mesma identidade são agrupadas; aparecem a quantidade e a maior severidade entre as ocorrências identificadas. Empate escolhe o menor ID para apresentação determinística. Texto diferente não cria outro achado por si só; parâmetro, URL, variante ou método distintos criam outra identidade. A comparação não usa score aproximado como CVSS.

## Limites e apresentação

`complete` significa apenas que as identidades estão disponíveis e coerentes para esse cálculo, não que a cobertura de segurança seja completa. Achados conhecidos dos dois lados são persistentes, com indicação de mudança de severidade observada. Somente identidades presentes em um lado aparecem em added/removed quando a comparação não está limitada.

Qualquer achado sem identidade confiável ou mistura de referência genérica/variante do mesmo plugin torna a comparação limitada: added/removed ficam vazios e as identidades sem par vão para unmatchedBaseline/unmatchedCompared. A interface mostra valores indeterminados para o lado desconhecido, não ausência, zero ocorrências ou correção confirmada. Contagens de registros sem identidade também ficam visíveis.

Ausência de detecção não comprova correção: cobertura, política, condições e conteúdo do alvo podem variar. A normalização conservadora pode deixar identidades diferentes onde uma aplicação as trataria como equivalentes; isso é preferível a unir silenciosamente alvos/parâmetros distintos. A preservação da URL original do scan (#28) e a revalidação integrada (#52) continuam pendências separadas.

## Verificação e implantação

Testes cobrem parser e persistência do worker, grupos duplicados, nomes alterados, severidade, método/query/variante, legado, acesso entre contas, gerente/admin, estado, exclusão e mesma origem de domínio. A interface testa seleção explícita, descarte de resposta atrasada, conteúdo como texto e comparação limitada. Não inicia varredura externa.

Após merge: atualizar/revisar a main e alterações simultâneas de Jaçanã, conferir CI/CD do SHA integrado, imagens, version.txt e saúde/schema; comparar duas execuções controladas, inverter a direção e negar acesso de outra conta. Não fechar #30/#24 com base apenas no CI da PR. SMTP externo permanece desativado e sua configuração/aceite não é substituído por esta etapa.
