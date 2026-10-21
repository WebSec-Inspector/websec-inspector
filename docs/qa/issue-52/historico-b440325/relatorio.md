> **EVIDÊNCIA HISTÓRICA — b440325.** Não descreve a main atual. Consulte [a revalidação atual](../README.md) antes de classificar estas falhas como abertas.

# Entrega de QA — WebSec Inspector, atividade #52

Data: 21/10/2026 (America/Sao_Paulo). Referência: [issue #52](https://github.com/WebSec-Inspector/websec-inspector/issues/52).

A execução de QA foi realizada e a base automatizada foi criada. **A atividade não está apta a ser encerrada como aprovada:** existem defeitos reproduzidos e falta o reteste depois das correções. Esta entrega contém testes e documentação, sem alterações funcionais no produto.

## Ambiente e rastreabilidade

Código-base: `b440325e24b9687bfce58aab505adf12fd332366`. Alterações locais de QA ainda não publicadas. Frontend/Backend/PostgreSQL/Redis/worker/ZAP/MailHog do Compose local; UI e API responderam a HTTP. O acesso ao mecanismo Docker permanece negado dentro desta sessão, mas isso não impediu os testes HTTP e o fluxo real já iniciado no computador. A configuração Compose foi validada com sucesso.

A aplicação servida expôs o bundle `index-BY_jT7LY.js`, coincidente com o build dos fontes locais. Isso dá rastreabilidade do frontend; não foi possível conferir por Docker o digest da imagem do backend. As respostas reais estão registradas no JSON. Não foi alterado o container do usuário nem executado deploy.

## Resultados

| Camada | Resultado | Interpretação |
| --- | --- | --- |
| Componentes React / Axios / rotas | 15/15 passaram | HTTP simulado; não é E2E nem prova do backend real |
| Worker Python | 5/5 passaram | ZAP/DB/PDF/SMTP simulados nas fronteiras; persistência de estados e regras exercitadas |
| API integrada local | 13/20 passaram; 7 falharam | Inclui duas propostas de contrato HTTP; nenhuma falha convertida em sucesso |
| Regressões conhecidas de UI | 8/8 reproduzidas (testes vermelhos) | Dashboard, polling pendente, FAILED, falhas da API e payload inválido |
| Build frontend | PASS | TypeScript e Vite concluíram |
| Fluxo local com ZAP e MailHog | PARTIAL; scan 10 | Verificação, processamento, resultado e PDF funcionam; contrato domainId e Dashboard reprovados |

O fluxo real percorreu cadastro/login QA → domínio local → rejeição antes da verificação → meta tag de propriedade → confirmação → processamento → COMPLETED → resultado com 15 achados → histórico pela API → PDF no MailHog. O histórico foi consultado usando o ID obtido por uma transação somente leitura restrita à própria conta QA, porque a API não fornece domainId. **Não houve fluxo completo de histórico pela interface.**

Os achados do scan pertencem à página descartável do teste e não são uma avaliação de segurança do WebSec Inspector. Nenhum site externo foi alvo de ZAP. O fixture abriu portas 80/443 temporariamente e fechou os servidores ao terminar. O relatório foi verificado tecnicamente (MIME, %PDF-, tamanho e hash), sem inspeção visual do layout. O destinatário observado é o padrão do worker no MailHog, não o e-mail da conta QA; entrega ao destinatário de negócio permanece sem validação.

## Principais falhas

- **Crítica:** B consegue ler scan e histórico de A (API-11/API-19).
- Dashboard não consulta histórico; contrato não fornece domainId.
- Resultado mantém Carregando... após falha e pode quebrar com payload inválido.
- Polling do resultado para em PENDING_VERIFICATION; a tela de submissão já possui retry funcional.
- FAILED é apresentado como se ainda estivesse aguardando conclusão.
- Senha incorreta retorna 500; repetir submissão troca o token de propriedade.

Detalhes, pré-condições e evidências: [registro-falhas.md](registro-falhas.md).

## Critérios de conclusão da issue

| Critério | Situação |
| --- | --- |
| Bugs conhecidos revalidados | Reproduzidos por código, testes e observações reais onde indicado |
| Dashboard contra API real | API de histórico funciona para dono; Dashboard não a chama e foi reprovado |
| domainId validado | Ausente no contrato; reprovado |
| PENDING_VERIFICATION antes/depois | Baseline atual registrado; retry da submissão aprovado; resultado direto reprovado; pós-correção pendente |
| Tela de resultado contra falhas | Reprovada em cenários simulados e scan inexistente real |
| Fluxo principal ponta a ponta | Backend/worker/PDF executados; passagem pelo histórico da UI bloqueada pelo bug |
| Cenários negativos | Executados conforme matrizes; desligamento físico do backend e falha real de container não executados |
| Aceitação registrada | Matriz com observações, status e evidências entregue |
| Suíte automatizada e repetibilidade | Componentes, worker, regressões, API e fixture local entregues |
| Falhas registradas | 9 defeitos + 2 propostas de contrato documentados; sem publicação externa |

## Limites e próximos passos

Não há aprovação geral do sistema. Os testes vermelhos devem ser reexecutados após correções sem inverter expectativas. Não foi recriada uma versão histórica anterior da tela de submissão; o “antes” documentado é este commit-base. Falhas de rede/timeout e de worker foram simuladas, não produzidas desligando os serviços reais. Não se executou Maven local por ausência do runtime Java/Maven; esta entrega não adiciona nem alega execução de testes Java. DNS TXT em domínio público e execução em Linux sem Docker Desktop não foram validados.

Contas, scans, achados e mensagens QA foram mantidos para reprodução. Credenciais temporárias, chaves TLS e node_modules não fazem parte da entrega. O fixture usa apenas host.docker.internal. O CI foi editado para executar o baseline frontend/worker; execução no GitHub ainda não realizada. As regressões conhecidas ficam em comando separado e um baseline verde não as aprova.

O teste do worker em Python 3.12 passou com os pacotes fixados no requirements.txt, mas a resolução atual de dependências transitivas emitiu RequestsDependencyWarning (requests 2.32.3 com urllib3/chardet recentes). O aviso está preservado na evidência. As chamadas de rede do worker foram simuladas nesses testes; compatibilidade de rede dessa combinação não foi aprovada. REG-03 usa ?domainId=7 como preparo proposto do fixture, não como contrato oficial do produto, e deverá ser adaptado ao seletor de domínio acordado mantendo as verificações de requisição e conteúdo.

## Arquivos e execução

- [matriz-sistema.md](matriz-sistema.md) e CSV equivalente.
- [matriz-aceitacao.md](matriz-aceitacao.md) e CSV equivalente.
- [registro-falhas.md](registro-falhas.md).
- [instrucoes.md](instrucoes.md): preparação e todos os comandos.
- Pasta evidencias: JSON sanitizados, saídas de testes e capturas de UI.
- Pacote de alterações: arquivos modificados/novos em caminhos relativos ao repositório, excluindo dependências e dados temporários. Aplicar em uma cópia de trabalho e revisar antes de criar PR. Nenhum push, comentário ou alteração de status foi feito no GitHub.
