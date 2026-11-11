# Preservação da URL original do scan

Refs #28. A URL informada pelo usuário é preservada da criação do scan até a execução no ZAP e o relatório PDF. O hostname continua separado e é a única base das regras de domínio e da verificação de propriedade.

## Regra de negócio

Cada scan guarda três informações distintas:

| Dado | Onde fica | Uso |
|---|---|---|
| `target_url` | `scans.target_url` (obrigatório, até 2048 caracteres) | URL normalizada que o worker executa e que o PDF mostra como "Alvo utilizado". |
| `submitted_url` | `scans.submitted_url` (opcional, até 2048 caracteres) | Texto exatamente como enviado, mantido para auditoria. Não é lido pelo worker nem exposto pela API. |
| hostname canônico | `domains.hostname` | Agrupamento por domínio, token estável e verificação por DNS TXT ou meta tag. |

O frontend envia o texto digitado sem transformá-lo; a validação local serve apenas para mensagens rápidas. A normalização ocorre somente no backend, em `ScanTarget` (URL) e `DomainHostname` (hostname), as mesmas regras usadas no cadastro de domínios.

## Normalização da URL

| Entrada | `target_url` | Hostname do domínio |
|---|---|---|
| `exemplo.com` | `https://exemplo.com` | `exemplo.com` |
| `exemplo.com/painel` | `https://exemplo.com/painel` | `exemplo.com` |
| `https://exemplo.com/loja/login` | `https://exemplo.com/loja/login` | `exemplo.com` |
| `http://exemplo.com:8080/app` | `http://exemplo.com:8080/app` | `exemplo.com` |
| `https://exemplo.com:443/` | `https://exemplo.com/` | `exemplo.com` |
| `HTTPS://WWW.Exemplo.COM/Caminho?Q=1` | `https://www.exemplo.com/Caminho?Q=1` | `exemplo.com` |
| `https://exemplo.com/a#secao` | `https://exemplo.com/a` | `exemplo.com` |
| `http://juice-shop:3000` | `http://juice-shop:3000` | `juice-shop` |

- Sem esquema, assume-se `https://`.
- Esquema e host vão para minúsculas; caminho e query são mantidos como enviados, inclusive maiúsculas e codificação (`%20`).
- A porta padrão do esquema (`:443` em HTTPS, `:80` em HTTP) é removida; qualquer outra porta de 1 a 65535 é preservada.
- O fragmento (`#...`) é descartado, pois o navegador nunca o envia ao servidor.
- O `www.` é mantido no alvo, porque é o servidor efetivamente acessado, e removido apenas no hostname do domínio.

Entradas rejeitadas com HTTP 400: esquema diferente de HTTP/HTTPS, credenciais na URL (`usuario:senha@`), porta inválida, hostname inválido e URL com mais de 2048 caracteres.

## Decisões registradas

- **Qualquer porta do domínio verificado.** A verificação de propriedade é feita por hostname. Verificar `exemplo.com` libera scans em qualquer porta e caminho desse host. Essa ampliação é intencional, para atender aplicações em portas próprias.
- **Duas colunas.** `target_url` atende o escopo ("persistir URL normalizada") e `submitted_url` atende o critério "a URL enviada é armazenada integralmente" na leitura literal.
- **Scans legados.** A migration `011_scan_target_url.sql` preenche `target_url` com o alvo que o worker inferia (`https://` + hostname, ou `http://juice-shop:3000`) e torna a coluna obrigatória. `submitted_url` fica nulo nesses scans, e o PDF marca o alvo como "inferido; URL original não registrada".
- **Worker sem reconstrução.** O worker lê somente `scans.target_url`. A montagem `https://{hostname}` e o caso fixo do `juice-shop` foram removidos.

## Critérios de aceitação

| Critério | Garantia |
|---|---|
| A URL enviada é armazenada integralmente | `ScanServiceAuthorizationTest.scanCriadoPreservaUrlNormalizadaEOriginal`; frontend: `scan.test.tsx` ("envia a URL digitada sem normalizar") |
| URLs com caminho são executadas com o caminho informado | `ScanTargetTest.preservaCaminhoEQuery`; `test_scan_worker.test_zap_receives_persisted_url_with_port_path_and_query` |
| URLs com porta válida preservam a porta | `ScanTargetTest.preservaPortaNaoPadraoERemovePortaPadrao` |
| O worker não reconstrói o alvo pelo hostname | `test_scan_jobs.test_worker_target_is_the_persisted_url_not_the_hostname` |
| A validação de propriedade continua sobre o domínio | `ScanTargetTest` (hostname canônico de cada entrada) e testes de verificação existentes (`VerificationChallengePostgresTest`, `StableDomainTokenPostgresTest`) |
| Migração de bancos existentes | `test_schema_migrations.test_legacy_requires_explicit_adoption_and_preserves_data` |
| Relatório mostra o alvo executado | `test_report_jobs.test_report_shows_the_persisted_target_url` e `test_legacy_report_marks_the_target_as_inferred` |
