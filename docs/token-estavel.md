# Token estável por domínio e conta

Refs #68, #52. Novas varreduras reutilizam o token do domínio, inclusive antes da primeira comprovação. Um token é gerado somente quando não existe domínio equivalente para a conta proprietária. A comprovação real por DNS TXT ou meta tag continua sendo exigida: conhecer o token não autoriza executar o scanner.

## Concorrência

A submissão mantém uma transação e bloqueia a linha do proprietário antes de procurar ou criar seu domínio. Isso serializa a primeira criação mesmo quando ainda não há linha em `domains`, evitando a corrida de inserção e a tentativa de continuar uma transação após violação de unicidade. A consulta de DNS ocorre antes desse bloqueio.

O custo é serializar criações de domínios diferentes da mesma conta. Contas distintas mantêm propriedade e tokens separados. Novos fluxos que criarem/vincularem domínios, como #67 e #11, devem seguir a mesma disciplina transacional, sem inserir diretamente por um caminho concorrente que ignore esse bloqueio.

## Legado e normalização

Novos hostnames são normalizados para minúsculas, sem prefixo `www.` e sem ponto DNS final. A busca também reconhece essas variações em registros antigos, sem reescrever seus tokens ou mover seu histórico. A consulta sempre filtra o proprietário.

Se já existirem dois registros equivalentes da mesma conta, a operação responde conflito (HTTP 409), sem escolher uma prova silenciosamente, fundir históricos ou gerar outro desafio. A correção desses dados exige identificar o registro e a prova corretos antes de qualquer consolidação. Esta entrega não executa migração de tokens nem limpeza de dados em massa.

## Limites

Não há rotação/revogação manual nesta entrega. Não foi introduzido endpoint público para consultar token de outra conta. Cancelamento e desafio antecipado permanecem nas #66/#67 e devem preservar o token aqui definido.

## Validação

O CI prepara um PostgreSQL descartável com as migrações reais, sobe o contexto Spring com validação de schema e chama o serviço transacional. Os casos cobrem duas submissões sequenciais, duas transações simultâneas sem domínio prévio, token já publicado em hostname legado, domínio verificado, isolamento entre contas e conflito de legado ambíguo. Há também fluxo HTTP com login real, nova autenticação, duas submissões e recarga da verificação pendente, usando filtros de segurança e PostgreSQL.

O teste anterior à correção reproduziu três falhas de expectativa e uma falha transacional de concorrência (run 41237647574). A revalidação funcional integrada da #52 deve incluir publicação única da prova e novas execuções sem editar HTML/DNS; esta suíte não inicia ZAP em sites externos.
