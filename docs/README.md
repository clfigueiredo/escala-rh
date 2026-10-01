# Documentação — Sistema de Escala RH

1. [Visão geral e escopo](01-visao-geral.md)
2. [Arquitetura](02-arquitetura.md)
3. [Infraestrutura](03-infraestrutura.md)
4. [Banco de dados](04-banco-de-dados.md)
5. [WhatsApp: lembretes e bot](05-whatsapp.md)
6. [Fases do projeto](06-fases.md)
7. [Operação: deploy, backup e troubleshooting](07-operacao.md)
8. [Contrato da API](08-api.md)
9. [Guia de uso para o RH e gestores](09-guia-rh.md) — passo a passo do painel (não técnico)
10. [Roteiro para gerar o tutorial](10-roteiro-tutorial.md) — instruções para um Claude Code percorrer o painel e escrever o tutorial completo
11. [Tutorial completo](11-tutorial.md) — passo a passo ilustrado (imagens em `tutorial/img/`)

Os documentos 01–09, 11 e o README da raiz também aparecem no painel, em **Administração › Documentação**
(a lista fica em `web/src/lib/documentos.ts`). Editou um `.md`? O painel mostra a nova versão no próximo deploy.

Para desenvolvedores: `app/README.md` (convenções do backend, helpers de data/telefone/escopo, testes).
