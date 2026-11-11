# CVSS 4.0 Base por avaliação de métricas

O usuário escolheu avaliação humana com cálculo automático em 04/11/2026. O motor implementa **CVSS-B 4.0**, com as 11 métricas Base explícitas, na ordem da [especificação FIRST](https://www.first.org/cvss/v4.0/specification-document). Não presume métricas pelo título, CWE, risco ZAP ou descrição. Threat/Environmental/Supplemental não são aceitas silenciosamente como uma avaliação Base.

O cálculo usa `us.springett:cvss-calculator:1.5.1`, licença Apache2.0, biblioteca Java de [CVSS Calculator](https://github.com/stevespringett/cvss-calculator). Vetores de referência têm testes de 0.0, 6.4, 9.3 e 10.0; entradas incompletas, inválidas, repetidas ou fora de ordem são recusadas. A API recebe vetor e justificativa, nunca confia numa nota enviada pelo cliente. Versão/vetor/nota permitem reproduzir o cálculo; a adequação semântica das métricas continua responsabilidade do avaliador.

## Fluxo e permissões

- `POST /api/cvss/v4/base/preview`: autenticado, calcula a partir de vetor Base completo.
- `GET /api/findings/{id}/cvss`: leitura dentro do escopo do achado; informa `canAssess`, avaliação atual e até 20 revisões recentes.
- `PUT /api/findings/{id}/cvss`: gerente ou administrador no escopo, varredura COMPLETED/não excluída, vetor, justificativa e revisão esperada obrigatórios.

Cliente pode consultar a avaliação; o gerente responsável ou administrador pode registrá-la. O servidor grava autor, data, versão, vetor, nota, gravidade e justificativa, com histórico append-only. Revisão antiga recebe409. Permissão é revalidada após eventual espera no lock da varredura, com leitura atual dos usuários bloqueada contra reatribuição/demissão durante a gravação.

## Compatibilidade e relatório

O risco ZAP e o campo legado `findings.cvss_score`/`FindingResponse.cvssScore` continuam sendo aproximações do scanner. Não são convertidos em CVSS real. A nova avaliação fica em tabelas próprias e aparece com versão/vetor; a interface chama o valor antigo de score aproximado ZAP. Grupos e comparação existentes continuam baseados no risco observado pelo scanner.

A migração012 é aditiva. Não fabrica vetor para dados antigos. Ao salvar uma avaliação, scan COMPLETED/achados originais são preservados; o PDF é marcado PENDING e os tokens de geração/envio antigos são invalidados na mesma transação. A troca usa o lock da varredura também respeitado pelo envio SMTP. Uma geração atrasada não pode publicar o PDF com a avaliação antiga; um claim de envio anterior não bloqueia a nova geração. O worker inclui a avaliação atual no PDF, com vetor/versão/justificativa/data e score ZAP separado.

Cards de resultado têm filtro por risco ZAP, expansão por teclado, evidências/referências como texto e indicação de CVSS não avaliado quando não há registro. O histórico distingue INFORMATIONAL de nenhum achado. O reset de carregamento em query de comparação inválida foi corrigido nesta etapa.

## Verificação e integração

Regressões cobrem vetores de referência, validação da ordem, revisão concorrente, escopo após reatribuição enquanto aguarda o banco, cliente somente leitura, exclusão, preservação do score ZAP, audit/PDF e claim de e-mail. A apresentação foi verificada em PDF de quatro páginas com avaliação e em PDF legado sem avaliação, além dos testes UI de métricas, filtros e conteúdo não confiável.

Integração empilhada: cadastro → listagem → resultados/CVSS → sessão. Após cada merge, atualizar/revisar main e alterações simultâneas da equipe; conferir CI/CD do SHA integrado, imagens, version.txt, saúde/schema e fluxo afetado controlado. CVSS não fecha sozinho #19/#21 nem o aceite integrado #52; política do scanner, URL original #28 e validações T8/T9 permanecem no planejamento. Não há habilitação de SMTP externo nesta entrega.
