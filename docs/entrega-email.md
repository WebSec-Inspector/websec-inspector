# Entrega de relatórios por e-mail

## Escopo e ativação

O envio usa SMTP e fica desativado por padrão (`REPORT_EMAIL_ENABLED=false`). Não existe destinatário de teste como fallback. O endereço vem do proprietário do domínio da varredura, consultado no banco a cada reivindicação; gerente/admin podem solicitar dentro do escopo, mas não escolher outro endereço. Credenciais ficam apenas no ambiente do servidor.

Após configurar um provedor autorizado, definir no `.env` do servidor:

```dotenv
REPORT_EMAIL_ENABLED=true
SMTP_HOST=smtp.example.invalid
SMTP_PORT=587
SMTP_TLS_MODE=starttls
SMTP_USER=
SMTP_PASSWORD=
REPORT_FROM_EMAIL=reports@example.invalid
SMTP_TIMEOUT_SECONDS=15
```

Os valores acima são exemplos, não um provedor funcional. TLS aceita `starttls` ou `tls` (TLS implícito, normalmente porta 465). `none` serve ao servidor local de testes, sem autenticação; credenciais com `none` são recusadas. A validação do certificado permanece habilitada. O timeout por operação é configurável entre 1 e 60 segundos. Backend e worker recebem a mesma flag pelo Compose.

No desenvolvimento, usar Mailhog existente (`SMTP_HOST=mailhog`, porta 1025, modo `none`) ou Mailpit. O CI usa Mailpit descartável, sem relay externo. A [API oficial do Mailpit](https://mailpit.axllent.org/docs/api-v1/) permite conferir destinatário e os bytes MIME/anexo recebidos. Isso comprova transporte SMTP no ambiente de testes, não entrega em uma caixa externa.

## Estado e retentativa

A migração 009 é aditiva e preserva `sent_at` legado; um valor histórico não é promovido automaticamente a comprovação de envio. Estados: NOT_REQUESTED, PENDING, SENDING, SENT e FAILED. A tentativa persiste destinatário, contador, lease/token, próximo prazo e código sanitizado. `SENT` significa que o SMTP aceitou a mensagem; não confirma recebimento na caixa, leitura ou ausência de bounce posterior.

Com a flag ativa, um PDF recém-gerado agenda entrega. Relatórios históricos prontos não são enviados em massa ao ativar a configuração. Eles podem ter um envio solicitado explicitamente. Pedidos PENDING/SENDING/SENT são idempotentes; FAILED permite uma nova série de tentativas. Reenviar um relatório já SENT não faz parte desta operação. Se o PDF precisar ser regenerado, a nova identidade tem sua própria entrega pendente (ou NOT_REQUESTED se desativado); o SENT do arquivo antigo não é transferido ao novo.

Falhas transitórias têm até três tentativas, com espera de 60 e 120 segundos. Falhas de configuração, destinatário permanente ou anexo ficam FAILED. Quedas de processo recuperam lease vencido, também limitadas a três reivindicações. Abertura do arquivo, PDF inválido/ausente e anexo maior que 10 MiB são falhas de entrega e mantêm scan COMPLETED e PDF READY. PDFs maiores podem continuar disponíveis pelo download, até seu limite de 32 MiB.

A tentativa mantém locks da varredura e do relatório durante a troca SMTP: exclusão aguarda um envio já iniciado, e outro worker não reivindica o mesmo relatório em paralelo. Regeneração durante SENDING recebe conflito; a conclusão também confere a identidade do PDF. Isso pode adiar uma exclusão enquanto o servidor SMTP responde, respeitando os timeouts configurados.

O Message-ID é estável para o mesmo relatório/conteúdo, ajudando a correlacionar tentativas; ele não garante deduplicação pelo provedor. Se o SMTP aceitar e o processo cair antes de persistir SENT, uma retomada pode duplicar a mensagem. Uma falha apenas no QUIT após aceitação conhecida não agenda outra tentativa.

## API e interface

- `GET /api/scans/{id}/report/email`: flag ativa, estado, contador, data aceita, próxima tentativa e código sanitizado. Não retorna endereço, credencial ou caminho interno.
- `POST /api/scans/{id}/report/email`: solicita/reinicia envio de PDF disponível e varredura concluída; o corpo não determina destinatário. Fora do escopo ou excluído: 404. Configuração desativada ou PDF indisponível: 409.

A interface mantém download independente e oferece retentativa/consulta manual. A consulta automática é limitada e descartada ao trocar de varredura/sair da tela.

## Aceite após merge

1. Atualizar main e revisar o merge, preservando alterações simultâneas de Jaçanã e o histórico de migrations.
2. Conferir CI/CD da revisão integrada, versão implantada, backend/worker e schema. A flag permanece desativada sem provedor.
3. Revalidar em ambiente controlado duas contas, anexos e destinatários, falha SMTP, retentativa, ausência de duplicação por pedido repetido e integridade do PDF/scan.
4. Com provedor e caixa de teste autorizados, validar o recebimento externo e registrar evidência sanitizada. Nunca usar contas reais de terceiros como teste.

O usuário confirmou que ainda não há provedor externo definido. Essa configuração e a comprovação de recebimento externo permanecem pendentes: não encerrar #31/#23 apenas pelo Mailpit ou CI. Resend, caso mantido como requisito de tecnologia, continua uma integração distinta.
