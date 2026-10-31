# Preparar a prova antes de informar o site

Refs #67, #68 e #52. Na tela de nova varredura, o link **Gerar token antes de informar o site** abre `/verificacao/token`.

## Comportamento

- A emissão não recebe URL, não cria domínio/scan, não faz consulta DNS/HTTP e não publica trabalho para Redis/ZAP.
- Há um único desafio pendente por conta. Clicar novamente em gerar reutiliza esse desafio; GET recupera o valor após recarga ou novo login. Não existe expiração automática nesta entrega: fica pendente até o vínculo.
- O valor público é independente do JWT de autenticação. Pode ser publicado como TXT ou meta tag no HTML entregue pelo servidor; inserção somente por JavaScript no navegador não atende ao verificador.
- **Usar este token em um site** leva à submissão com a seleção explícita. O vínculo e a criação do scan PENDING_VERIFICATION ocorrem na mesma transação. Só a comprovação efetiva pode enfileirar o trabalho.
- Após o primeiro vínculo, o desafio serve apenas para aquele domínio. Pode ser reutilizado nele, mas não transferido a outro site. Não aparece mais como desafio pendente; continua persistido e acessível ao proprietário pelo ID.
- Outra conta não consulta nem consome o desafio, inclusive quando conhece seu ID. Gerentes/admins não transferem desafios próprios para a conta de um cliente.
- Se o domínio já tem outro token estável, o servidor responde conflito com a prova desse domínio, sem alterar nada. A interface mostra o valor e exige escolher **Usar token existente**. O antecipado permanece pendente para outro domínio. Se foi publicado por engano no domínio já cadastrado, a tela orienta usar a prova estável existente.
- Cancelar uma execução na futura entrega #66 não deve remover o vínculo nem rotacionar a prova.

## API autenticada

| Operação | Resposta |
|---|---|
| `POST /api/verification-challenges` sem URL | 200, desafio pendente emitido/reutilizado |
| `GET /api/verification-challenges/current` | 200 com o pendente; 204 se não existe |
| `GET /api/verification-challenges/{uuid}` | 200 para o proprietário; 404 para ausente/outra conta |
| `POST /api/scans` com `verificationChallengeId` opcional | 200 com scan pendente e prova selecionada; conflito não cria domínio/scan |

Resposta do desafio: `id`, `token`, `createdAt`, `domainId` e `hostname`; os dois últimos são nulos antes do vínculo. O request existente de scans sem desafio permanece compatível.

Conflito de token estável: HTTP 409, `code=EXISTING_DOMAIN_TOKEN`, `existingToken`, `domainId`, `hostname` e `error`. O valor é retornado somente no escopo do proprietário do domínio e após validação da seleção. Uma tentativa de reuso em outro domínio retorna 409 sem permitir rebinding.

## Persistência e concorrência

A migração 005 cria `verification_challenges`; não altera tokens já publicados. Chaves únicas protegem token e domínio vinculado, e índice parcial limita a um desafio pendente por usuário. Emissão e vínculo usam o bloqueio da linha do proprietário adotado na #68.

A autorização da seleção é checada antes de processar a URL. O estado de vínculo é lido novamente após adquirir o bloqueio, evitando que duas transações usem uma cópia desatualizada do mesmo desafio em sites diferentes. Colisões/conflitos revertem domínio, vínculo e scan juntos.

Aplicar pelo migrador versionado antes de iniciar os novos backend/worker. Não executar o SQL manualmente nem marcar a migração como aplicada sem executá-la. Seguir [migrações](migracoes.md) para backup e recuperação. Ainda não existe exclusão ou rotação manual de desafios.

## Validação e limites de evidência

Testes Spring/HTTP/PostgreSQL cobrem emissão e persistência entre logins, nenhuma criação de scan/fila na emissão, autorização, vínculo, prova ausente/presente, conflito com token estável, restrição a um domínio, emissão simultânea e disputa entre dois vínculos. Nesses testes, somente o resultado da prova e o cliente Redis são substituídos; a persistência, transações, autenticação e filtros são reais.

Testes de componentes cobrem copiar meta tag, recuperar pendente, enviar a seleção, aceitar explicitamente o token existente, impedir envio com seleção inválida e resposta de conflito atrasada. O campo URL não é editável durante envio, para evitar aplicar o conflito de um site em outro.

Não houve scan externo nem envio de e-mail nesta validação. A publicação real do HTML/TXT e o fluxo completo com ZAP permanecem na revalidação integrada da #52 antes do aceite final da #67.
