# Pull requests e revisão

As alterações na `main` devem ser feitas por pull request. Todos os integrantes
podem abrir PRs; a aprovação exigida é de um dos responsáveis definidos em
[`.github/CODEOWNERS`](../.github/CODEOWNERS): `JonathanSM-dev` ou `JacanaFSilva`.
Novos commits que alterem o conteúdo revisado invalidam a aprovação anterior.

Somente `JonathanSM-dev` e `JacanaFSilva` têm exceção para fazer merge de PRs
sem aprovação, incluindo suas próprias PRs. Essa exceção está limitada ao
fluxo de pull requests: não autoriza push direto na `main`.
O GitHub não permite que o autor registre uma aprovação na própria PR;
a exceção permite o merge sem essa aprovação.

O ruleset `main-review-policy` é aplicado à `main`, com uma aprovação exigida,
revisão dos code owners, bloqueio de exclusão e de force push. Não há exceção
genérica para administradores, equipes ou aplicativos.

Os testes do CI/CD devem ser conferidos antes do merge. O deploy na AWS é
acionado automaticamente após a atualização da `main`.

Administradores do repositório ainda podem editar ou desativar o ruleset.
Para impedir que outros integrantes alterem a política, suas permissões de
administração precisam ser revistas pelos responsáveis pelo repositório.
