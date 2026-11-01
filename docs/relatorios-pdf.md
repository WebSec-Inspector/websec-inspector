# Relatórios PDF persistidos

## Funcionamento

A conclusão da varredura grava os achados, o estado COMPLETED e o pedido PENDING na mesma transação. A emissão usa os achados persistidos; não executa o scanner. O worker consulta a fila de relatórios entre iterações, inclusive após reinício.

Estados do relatório: PENDING, GENERATING, READY e FAILED. NOT_REQUESTED e MISSING são estados de apresentação da API para ausência de pedido ou arquivo indisponível. A tentativa tem token e lease de 20 minutos; resultado de tentativa antiga não substitui outro. Quedas podem ser recuperadas até três reivindicações. Falha de emissão fica FAILED e exige retentativa explícita; ela não altera COMPLETED. Uma varredura em curso pode adiar a geração até a próxima iteração do worker.

## API autenticada

- `GET /api/scans/{id}/report`: estado, emissão, versão e código sanitizado; não retorna caminho interno.
- `POST /api/scans/{id}/report`: solicita ou repete a geração de varredura concluída. Pedidos concorrentes convergem em um Report por scan; pedidos em andamento/prontos permanecem idempotentes. Permite pedir o PDF de scans legados concluídos.
- `GET /api/scans/{id}/report/download`: PDF como anexo, sem cache. Exige arquivo pronto e válido, de até 32 MiB.

Proprietário, gerente dentro do escopo e administrador seguem as regras existentes. Outra conta, gerente fora do escopo e scans excluídos recebem 404. O cliente nunca fornece caminho de arquivo.

## Persistência e conteúdo

Migração 008 acrescenta estado e controle de geração sem alterar as migrations 001–007, contas, scans ou achados. Reports legados são regenerados, preservando registros/IDs e sent_at; caminhos antigos não são publicados como URLs. O volume reports_data permanece gravável pelo worker e é montado somente para leitura no backend. Não há bucket nem acesso público.

Cada tentativa usa nome distinto, arquivo temporário e publicação por substituição atômica. Apenas a tentativa que ainda possui o lease publica o nome no banco. Temporários são removidos quando uma emissão falha normalmente; queda abrupta pode deixar temporários/arquivos órfãos. Limpeza automatizada e retenção de arquivos individuais ficam para evolução; nenhum arquivo antigo é apagado por esta mudança.

O conteúdo inclui domínio, alvo inferido pelo comportamento atual do scanner, tempos UTC/duração, estado, resumo de severidades, evidência, recomendação e metodologia. A URL original continua uma pendência de #28 e não deve ser apresentada como preservada. Score aproximado é identificado como não CVSS. Textos do alvo são escapados e tratados como texto; tabelas/resumos e parágrafos extensos são paginados.

O envio automático para destinatário de teste foi retirado do caminho de conclusão; a entrega real e rastreável por proprietário depende da etapa T5 (#31/#23). Esta PR não comprova envio de e-mail externo.

## Verificação antes e depois do merge

Antes: testes PostgreSQL de conclusão/pedido, recuperação de lease, falha de PDF sem alterar resultado, autorização e download; testes frontend; PDFs de zero achados e múltiplas páginas inspecionados visualmente.

Depois: atualizar main sem restaurar arquivos antigos; conferir alterações de Jaçanã e eventuais mudanças simultâneas; verificar CI/CD do SHA integrado; conferir version.txt e saúde da API; validar em ambiente controlado um scan concluído → geração → download → conteúdo, acesso negado por outra conta e retentativa sem reexecutar ZAP. Registrar evidência na issue antes de fechar #29/#22/#49. HTTP 200 e CI da branch sozinhos não comprovam o fluxo implantado.
