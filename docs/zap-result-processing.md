# Processamento de resultados do ZAP

O worker consome a lista JSON retornada por `zap.core.alerts(baseurl=...)`. Cada item usa os campos da API Core do ZAP: `alert`/`name`, `risk`, `confidence`, `description`, `solution`, `evidence`, `url`, `param`, `cweid`, `wascid`, `reference` e `timestamp`. XML não é usado nesse fluxo.

`worker/zap_parser.py` valida cada alerta e converte `High`, `Medium`, `Low` e `Informational` para `HIGH`, `MEDIUM`, `LOW` e `INFORMATIONAL`. O campo `cvss_score` legado recebe apenas um valor aproximado para compatibilidade (8.5, 5.5, 3.0 e 0.0); não representa um cálculo CVSS. Timestamp ISO-8601 ou epoch é armazenado como instante UTC. Dados opcionais ausentes são persistidos como nulos; nome e risco são obrigatórios.

Os achados ficam na tabela `findings`, ligados obrigatoriamente a `scans.id`. O worker apaga e reinsere os achados daquela scan dentro da mesma transação; falhas revertem a substituição inteira, e a execução sem alertas remove achados antigos e grava uma coleção vazia. O endpoint `GET /api/scans/{id}` retorna os campos normalizados no array `findings`.

## Atualização do banco existente

Antes de ativar as novas imagens de backend e worker, faça backup e aplique
`infra/migrations/20261021-zap-findings.sql` no PostgreSQL do ambiente. O script
adiciona os campos novos, preserva os achados existentes e amplia os textos
livres para `text`, sem truncar evidências, URLs, descrições ou recomendações.
Também atualiza a restrição de severidade para aceitar `INFORMATIONAL`.
Pode ser executado novamente. O deploy atual não executa migrações SQL
automaticamente; `ddl-auto=update` não substitui essa etapa para bancos existentes.

Teste unitário: `python -m unittest discover -s worker/tests -v`.
