# Cancelar uma verificação e limitar retentativas

Refs #66, #52. Esta entrega cancela somente a comprovação de domínio de um scan em `PENDING_VERIFICATION`. Não interrompe ZAP nem retira um trabalho já enfileirado.

## Comportamento

- **Cancelar verificação** está disponível durante espera ou consulta em andamento. Aborta a chamada do navegador, interrompe timers e pede cancelamento persistido ao backend.
- O estado terminal é `CANCELLED`, exibido como **Cancelada**, com data e explicação próprias no resultado/histórico. O polling termina ao recebê-lo.
- Repetir o cancelamento de um scan cancelado retorna o estado cancelado, sem novo efeito. Uma execução cancelada não é retomada: iniciar outra cria novo scan e reutiliza a prova do domínio.
- Token, vínculo do desafio antecipado, propriedade e outras execuções do domínio permanecem intactos.
- Se confirmação/enfileiramento vencer a disputa, o cancelamento responde conflito com o estado real. A tela informa que não cancelou e oferece consultar o resultado. Não afirma ter interrompido o scanner.
- Se a resposta de cancelamento falhar/expirar, a tela diz que o cancelamento não foi confirmado, sem retomar automaticamente a confirmação. É possível repetir a ação ou consultar o estado.

## Consistência no backend

`POST /api/scans/{id}/cancel-verification` requer autenticação e o mesmo escopo de acesso do scan. Faz atualização condicional `PENDING_VERIFICATION → CANCELLED` e retorna `ScanResponse`. Uma conta fora do escopo recebe 404. Gerente segue o escopo dos clientes já autorizado no sistema.

Confirmação e cancelamento competem por atualizações condicionais no PostgreSQL. A consulta lenta DNS/HTTP não segura o bloqueio da linha de scan. Se o cancelamento confirmar primeiro, a confirmação tardia não altera a execução nem o domínio e não notifica Redis. Se o enfileiramento confirmar primeiro, cancelar retorna HTTP 409 com `code=SCAN_STATE_CHANGED` e `status` atual.

A confirmação também se torna idempotente para estado já resolvido. Duas confirmações concorrentes só publicam uma notificação. Somente o vencedor altera `verifiedAt` e agenda a notificação após o commit. O registro QUEUED permanece a fonte durável de trabalho.

Após uma atualização em lote, o estado é lido como projeção escalar, evitando reutilizar a entidade `Scan` antiga do contexto JPA. Não se chama `save(scan)` depois da transição condicional. A migração 006 amplia a constraint de estado sem reescrever histórico; deve rodar pelo migrador antes do novo backend/worker.

## Retentativas no navegador

| Variável pública de build | Padrão | Valores aceitos |
|---|---:|---|
| `VITE_VERIFICATION_MAX_ATTEMPTS` | 20 | inteiro 1–1000 |
| `VITE_VERIFICATION_TIMEOUT_SECONDS` | 300 | inteiro 1–86400 |
| `VITE_VERIFICATION_RETRY_SECONDS` | 15 | inteiro 1–3600 |

O primeiro limite atingido encerra o ciclo. Valores ausentes/inválidos usam os padrões, inclusive NaN, infinito, zero e negativos. O prazo inclui a requisição em andamento: existe timer de encerramento e o timeout HTTP é limitado ao tempo restante e a 20 segundos. Não há requisições ativas sobrepostas no cliente.

Depois de atingir o limite ou pausar, **Tentar verificação manual** executa uma única consulta, sem reiniciar o ciclo. **Reiniciar tentativas automáticas** exige clique explícito e renova apenas o orçamento do navegador, sem criar outro scan/token. Recarregar/retomar não inicia confirmações automaticamente: requer ação do usuário.

**Pausar tentativas automáticas** é diferente de cancelar: interrompe o acompanhamento local, mas não muda o estado do backend. Uma requisição já recebida pelo servidor pode terminar; aborto HTTP do cliente, sozinho, não desfaz a operação. Para garantir o cancelamento é necessário receber `CANCELLED` do backend. O limite automático também não equivale a cancelamento persistido.

Para desenvolvimento, copiar os valores de `frontend/.env.example` para `frontend/.env.local`. Em Docker, usar os build args homônimos. O workflow de publicação aceita as três variáveis de repositório com os mesmos nomes. Como Vite incorpora os valores no build, alterar apenas o ambiente do container nginx não modifica uma imagem já publicada. Nenhum desses valores é secreto.

## Evidências e aceite

- PostgreSQL/HTTP: cancelamento persistente/idempotente, autorização, outras execuções/token/desafio preservados, cancelamento enquanto a prova está bloqueada, confirmação atrasada, enfileiramento vencedor e notificação única em duas confirmações.
- Componentes com relógio controlado: aborto/descarte tardio, limite de tentativas, limite durante requisição lenta, confirmação manual isolada, reinício explícito e cancelamento não confirmado por falha de rede.
- Worker: `CANCELLED` não é elegível para claim. Migrações e constraints são exercidas em PostgreSQL descartável.

A prova e o Redis são substituídos nos testes de transição HTTP para controlar a corrida; o banco, transações e autenticação são reais. O aceite integrado da #52 deve repetir o caso de consulta DNS/HTTP lenta em ambiente controlado e conferir histórico após recarga. Não foram executadas varreduras externas nem alterações diretas de produção nesta entrega.
