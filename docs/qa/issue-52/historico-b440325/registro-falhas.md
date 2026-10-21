> **EVIDÊNCIA HISTÓRICA — b440325.** Não descreve a main atual. Consulte [a revalidação atual](../README.md) antes de classificar estas falhas como abertas.

# Registro de falhas — atividade #52

Ambiente compartilhado: Windows, Docker Desktop com containers Linux, Compose de desenvolvimento, API localhost:8080, UI localhost:5173. Código-base `b440325e24b9687bfce58aab505adf12fd332366`.

Todos os registros se relacionam à [issue #52](https://github.com/WebSec-Inspector/websec-inspector/issues/52). Foram criadas somente contas/varreduras QA. Tokens e senhas estão omitidos das evidências JSON. Severidades são propostas de QA para triagem da equipe. Os dois registros CONTRATO são recomendações; o status HTTP esperado não estava formalizado em um contrato de erro fornecido. Não foram abertas issues nem enviados comentários ao GitHub.

## BUG-52-01 — Dashboard não carrega histórico

- Severidade: Alta.
- Pré-condições: Conta QA com scan concluído.
- Reprodução: Abrir / após concluir scan.
- Esperado: Exibir histórico real e tratar domínio/histórico vazio/erro da API.
- Observado: Somente texto fixo; nenhuma integração de histórico.
- Evidência: UI-REAL-01; REG-03.
- Código relacionado: frontend/src/pages/DashboardPage.tsx.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-02 — domainId ausente no contrato de scan

- Severidade: Alta.
- Pré-condições: Conta QA e scan criado.
- Reprodução: GET /api/scans/{id} com token do dono.
- Esperado: Informar domainId para consultar o histórico documentado.
- Observado: Resposta não contém domainId. Foi necessário ler a própria linha QA no banco.
- Evidência: API-09; FLOW-domainId-contract.
- Código relacionado: backend/src/main/java/br/utfpr/websec/dto/ScanResponse.java; frontend/src/services/api.ts.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-03 — Polling para em PENDING_VERIFICATION na tela de resultado

- Severidade: Alta.
- Pré-condições: Resposta pendente seguida por COMPLETED no transporte simulado.
- Reprodução: Abrir /scans/42; avançar relógio 8 segundos.
- Esperado: Continuar consulta ou oferecer recuperação explícita.
- Observado: Só QUEUED/RUNNING agendam nova consulta; tela não acompanha verificação posterior.
- Evidência: REG-01.
- Código relacionado: frontend/src/pages/ScanReportPage.tsx.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-04 — Resultado fica em Carregando... após falha HTTP/rede/timeout

- Severidade: Alta.
- Pré-condições: Conta autenticada; resposta HTTP falha ou rejeição de rede controlada.
- Reprodução: Abrir scan inexistente real ou simular network/timeout/500/404.
- Esperado: Encerrar loading, mostrar mensagem e permitir recuperação.
- Observado: getScan rejeita sem catch; scan continua null e renderiza Carregando... sem limite.
- Evidência: REG-04 a REG-07; UI-REAL-04.
- Código relacionado: frontend/src/pages/ScanReportPage.tsx; frontend/src/services/api.ts.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-05 — Resposta inválida derruba componente

- Severidade: Média.
- Pré-condições: API simulada responde findings:null.
- Reprodução: Abrir resultado.
- Esperado: Validar resposta ou tratar erro de renderização.
- Observado: Acesso a scan.findings.length gera TypeError. Boundary de QA captura o crash.
- Evidência: REG-08.
- Código relacionado: frontend/src/pages/ScanReportPage.tsx.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-06 — FAILED exibe mensagem de espera

- Severidade: Média.
- Pré-condições: API simulada informa FAILED.
- Reprodução: Abrir resultado sem achados.
- Esperado: Informar que processamento falhou e orientar recuperação.
- Observado: Status FAILED aparece junto de Aguardando conclusão da varredura...
- Evidência: REG-02.
- Código relacionado: frontend/src/pages/ScanReportPage.tsx.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-07 — Acesso indevido a scan e histórico de outra conta (IDOR)

- Severidade: Crítica.
- Pré-condições: Criar contas QA A/B; criar scan só com A.
- Reprodução: Usar token B em GET /scans/{scanA}; depois GET /scans/domain/{dominioA}/history.
- Esperado: 403/404 sem expor dados de A.
- Observado: Ambos retornam 200 com dados de A; inclui token de propriedade enquanto pendente.
- Evidência: API-11; API-19.
- Código relacionado: backend/src/main/java/br/utfpr/websec/controller/ScanController.java; backend/src/main/java/br/utfpr/websec/service/ScanService.java.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-08 — Senha incorreta retorna erro interno HTTP 500

- Severidade: Média.
- Pré-condições: Conta QA cadastrada.
- Reprodução: POST /auth/login com senha incorreta.
- Esperado: 401 para falha de autenticação.
- Observado: 500 com mensagem interna. Handler genérico intercepta BadCredentialsException.
- Evidência: API-04.
- Código relacionado: backend/src/main/java/br/utfpr/websec/config/GlobalExceptionHandler.java; backend/src/main/java/br/utfpr/websec/service/AuthService.java.
- Situação: reproduzido; correção funcional e reteste pendentes.

## BUG-52-09 — Nova submissão muda token de verificação já mostrado

- Severidade: Alta.
- Pré-condições: Domínio QA ainda não verificado.
- Reprodução: Submeter o mesmo domínio duas vezes e comparar tokens.
- Esperado: Preservar desafio em uso ou invalidá-lo com aviso explícito e recuperação.
- Observado: Token muda sem aviso; um usuário que publicou o primeiro desafio pode não conseguir confirmar.
- Evidência: API-15.
- Código relacionado: backend/src/main/java/br/utfpr/websec/service/ScanService.java.
- Situação: reproduzido; correção funcional e reteste pendentes.

## CONTRATO-52-01 — Recurso scan inexistente retorna 409

- Severidade: Baixa; proposta.
- Pré-condições: Conta QA autenticada.
- Reprodução: Consultar identificador de scan inexistente.
- Esperado: Proposta: 404 para recurso ausente; confirmar convenção com backend.
- Observado: 409 Scan não encontrado. Independente do status escolhido, UI precisa tratar a falha.
- Evidência: API-10.
- Código relacionado: backend/src/main/java/br/utfpr/websec/config/GlobalExceptionHandler.java.
- Situação: reproduzido; correção funcional e reteste pendentes.

## CONTRATO-52-02 — Domínio inexistente indistinguível de histórico vazio

- Severidade: Baixa; proposta.
- Pré-condições: Conta QA autenticada.
- Reprodução: Consultar histórico de identificador inexistente.
- Esperado: Proposta: 404 para domínio inexistente; 200 [] apenas para domínio existente sem scans.
- Observado: 200 [] para domínio inexistente; contrato precisa de definição com backend.
- Evidência: API-14.
- Código relacionado: backend/src/main/java/br/utfpr/websec/service/ScanService.java.
- Situação: reproduzido; correção funcional e reteste pendentes.

## Escopo não comprovado

Não se comprovou exploração de confirmação/enfileiramento de scan alheio; a falha de autorização confirmada é leitura de scan/histórico. A leitura está comprovada com duas contas QA, sem inferir acesso administrativo ou execução arbitrária.
