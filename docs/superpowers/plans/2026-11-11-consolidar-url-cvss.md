# Consolidação de URL, PDF e sequência de migrações

Execução: superpowers:executing-plans. Pedido: consolidar #95/#97 e eliminar colisões de migração com #90, preservando as alterações da equipe. Sem merge/deploy em main.

1. Manter a implementação completa de URL da #95 e incorporar somente capa/resumo executivo da #97. Preservar submitted_url e indicação de alvo inferido para legado. Verificar PDF, testes de URL e CI.
2. Atualizar cadastro #88 sobre #95 e listagem #89 sobre cadastro, preservando navegação/conta/admin atuais. Conferir diffs para não restaurar layout antigo.
3. Atualizar #90 sobre listagem, renomear CVSS para012 e combinar consultas/metadados de PDF com URL persistida. Testar manifesto exato, checksums001–010, URL e CVSS no mesmo relatório, schema novo e upgrade em PostgreSQL.
4. Atualizar #91 sobre CVSS, renomear sessão para013 e ajustar referências/expectativas. Verificar ausência de migrações duplicadas ou lacunas e execução completa do CI.
5. Atualizar bases e descrições das PRs, manter dependentes draft e fechar #97 somente quando as alterações exclusivas estiverem preservadas na #95 e verificadas. Não excluir branches.

Ordem: #95 (011 URL/PDF) → #88 → #89 → #90 (012 CVSS) → #91 (013 sessões). Depois de cada merge humano, atualizar a base da próxima para main, repetir CI e conferir SHA integrado/versão/schema/fluxo. Não modificar checksums de migrações já integradas001–010. Bancos experimentais com011/012 das branches antigas exigem diagnóstico/recuperação explícita; nunca reescrever histórico para silenciar checksum.

Revisão final: verificar isolamento de conta, URL efetivamente executada, marcação do legado, permissões CVSS após lock, invalidação PDF/e-mail e preservação de sessão. Evidências e SHAs em .git/resolucao-lacunas/progress.md.
