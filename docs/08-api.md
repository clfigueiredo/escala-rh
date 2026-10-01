# 8. Contrato da API

Referência comum entre backend (`app/`) e painel (`web/`). Qualquer mudança aqui precisa ser refletida nos dois lados.
Descreve o comportamento **implementado** (conferido no código em 30/09/2026).

## Convenções

- Base: `/api` (o Caddy encaminha `/api/*` para `app:3000`).
- JSON em **camelCase** (`setorId`, `horaInicio`). No banco as colunas são snake_case (Prisma `@map`/`@@map`).
- `timestamptz` → string ISO 8601 em UTC (`2026-10-06T10:00:00.000Z`). O painel converte para `America/Sao_Paulo` na exibição.
  Na entrada, instantes precisam ser ISO com hora (`...T...`, com `Z` ou offset).
- Datas puras (`date`) → `"YYYY-MM-DD"`. Horas → `"HH:mm"` (relógio de São Paulo).
- IDs: inteiros.
- **Criação (`POST`) → `201`** com o objeto criado (mesmo formato do `GET`). **`PUT` é parcial**: todos os campos são
  opcionais, os ausentes ficam como estão; responde `200` com o objeto completo atualizado. `DELETE` → `204`.
- Textos opcionais (`cargo`, `observacoes`, `observacao`): string vazia ou só espaços vira `null`; máx. 1000 caracteres.
- Limites: nomes máx. 150 caracteres; e-mail 254; telefone 30; busca 100; senha nova 8 a 72 bytes (limite do bcrypt);
  `funcionarioIds` do gerador e `setorIds` de usuário até 500 itens.
- Erros: status HTTP + `{ "erro": "mensagem em pt-BR", "detalhes"?: any }`.
  - `400` validação — erro do zod traz `detalhes: [{ campo, mensagem }]`; `erro` = a primeira mensagem.
  - `401` não autenticado (o painel redireciona para `/login`). **Erro de negócio nunca usa 401.**
  - `403` sem permissão (perfil ou setor) · `404` não encontrado (inclusive rota inexistente)
  - `409` conflito (e-mail/telefone/nome duplicado — `P2002` genérico vira `{ erro: "Registro duplicado" }`, sem nomes de colunas)
  - `429` rate limit (`"Muitas tentativas. Tente novamente em N s."`) ou bloqueio por conta no login
  - Demais `4xx` do Fastify (JSON malformado, corpo grande…): só `{ erro }` genérico — o detalhe vai para o log.
  - `502` falha de comunicação com a Evolution API (rotas `/api/whatsapp/*`) · `503` banco indisponível · `500` erro interno (logado)
- Autenticação: cookie `httpOnly` `sessao` (JWT com `sub` e `ver`, validade **12 h**; sessão revogada → 401 "Sessão encerrada. Entre novamente."), `secure` (em produção), `sameSite=strict`, `path=/`.
  O painel usa `fetch(..., { credentials: 'include' })`. O usuário é recarregado do banco a cada requisição:
  desativado ou excluído perde o acesso na hora (401).
- **Filtro de setor:** para perfil `GESTOR`, toda listagem/leitura/escrita de funcionários, escala, ausências e mensagens
  fica restrita aos setores vinculados. Filtro `?setorId` de outro setor → 403. Leitura por id fora do escopo → 404;
  escrita fora do escopo → 403. `ADMIN` vê tudo.
- Não há DELETE para usuários, setores, funcionários, turnos e padrões: desativar via `PUT` com `ativo: false`.

## Autenticação

| Método | Rota | Corpo / Query | Resposta |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, senha }` | `{ usuario }` + cookie. Rate limit: 5/min por IP **e** bloqueio por conta: 10 senhas erradas para o mesmo e-mail em 15 min (de qualquer IP) → 429 `"Muitas tentativas para este usuário. Tente novamente em N min."` por 15 min, mesmo com a senha certa (vale também para e-mail inexistente; em memória, zera ao reiniciar). Login certo zera o contador. Erro → 401 (`E-mail ou senha inválidos` / `Usuário desativado`) |
| POST | `/api/auth/logout` | — | `204` (limpa cookie; não exige sessão). Se o token ainda for o atual, revoga **todas** as sessões do usuário (incrementa `sessaoVersao`) |
| GET | `/api/auth/me` | — | `{ usuario }` |
| POST | `/api/auth/senha` | `{ senhaAtual, novaSenha }` | `204`. `novaSenha` de 8 a 72 caracteres (acentos contam 2). **Senha atual errada → `400`** (não 401, para o painel não tratar como sessão expirada). Sucesso emite cookie novo e derruba as outras sessões. Rate limit 5/min (429) |

`usuario` = `{ id, nome, email, perfil: "ADMIN"|"GESTOR", ativo, setorIds: number[] }` (e-mail sempre em minúsculas).

## Cadastros

### Usuários — só ADMIN
| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/usuarios` | → `usuario[]` (ordem por nome) |
| POST | `/api/usuarios` | `{ nome, email, senha, perfil, setorIds?, ativo? }` → `201 usuario` |
| PUT | `/api/usuarios/:id` | parcial; `senha` vazia/`null`/ausente = mantém a atual |

- `senha` mín. 8 caracteres; `setorIds` padrão `[]`, `ativo` padrão `true`.
- E-mail já usado → 409. Algum `setorIds` inexistente → 400. `setorIds` no PUT substitui a lista inteira. Mudar senha, mudar perfil ou desativar derruba as sessões do usuário alterado.
- O admin logado **não pode** desativar a si mesmo nem trocar o próprio perfil para GESTOR → 400.

### Setores
| Método | Rota | Quem | Obs. |
|---|---|---|---|
| GET | `/api/setores` | todos | gestor recebe só os seus. `?ativo=true\|false` |
| POST | `/api/setores` | ADMIN | `{ nome, ativo? }` → `201`. Nome duplicado → 409 |
| PUT | `/api/setores/:id` | ADMIN | parcial |

`setor` = `{ id, nome, ativo }`

### Funcionários
| Método | Rota | Obs. |
|---|---|---|
| GET | `/api/funcionarios` | `?setorId&ativo&busca` — `busca` procura no nome (sem diferenciar maiúsculas); com 3+ dígitos procura também no telefone |
| GET | `/api/funcionarios/:id` | fora do escopo → 404 |
| POST | `/api/funcionarios` | `{ nome, telefone, setorId, cargo?, observacoes?, ativo? }` → `201` |
| PUT | `/api/funcionarios/:id` | parcial. Fora do escopo → 403 |
| DELETE | `/api/funcionarios/:id` | exclusão definitiva → `204`; apaga junto plantões e ausências (mensagens ficam sem vínculo). Fora do escopo → 403 |

- Gestor pode criar/editar funcionários **dos seus setores** (e não pode mover um funcionário para setor fora do escopo → 403).
- `telefone` aceita qualquer formato digitado; o backend normaliza (só dígitos, DDI 55) e calcula `telefoneAlt`.
  Inválido → 400. Já usado por outro funcionário **ativo** (em qualquer das variações com/sem 9º dígito) → 409 — só é verificado quando o
  funcionário fica ativo (inclusive ao reativar); inativo não bloqueia o número
  `{ erro: "Telefone já cadastrado para <nome>", detalhes: { funcionarioId } }` — se o dono do número estiver fora do escopo do gestor, só `{ erro: "Telefone já cadastrado" }`. Setor inexistente → 400.
- `funcionario` = `{ id, nome, telefone, telefoneAlt, setorId, setor: { id, nome }, cargo, observacoes, ativo }`

### Turnos — escrita só ADMIN
| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/turnos` | `?ativo=true\|false` (ordem por hora de início) |
| POST | `/api/turnos` | `{ nome, horaInicio: "HH:mm", horaFim: "HH:mm", cor?: "#rrggbb", ativo? }` → `201` (`cor` padrão `#3b82f6`) |
| PUT | `/api/turnos/:id` | parcial |

`turno` = `{ id, nome, horaInicio, horaFim, cor, ativo, viraNoite }` — `viraNoite` calculado (`horaFim <= horaInicio`).

### Padrões de escala — escrita só ADMIN
| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/padroes` | `?ativo=true\|false` |
| POST | `/api/padroes` | `{ nome, tipo: "CICLO"\|"SEMANAL", diasTrabalho?, diasFolga?, diasSemana?: number[], ativo? }` → `201` |
| PUT | `/api/padroes/:id` | parcial (a validação usa o registro atual + campos enviados) |

CICLO exige `diasTrabalho >= 1` e `diasFolga >= 0` (máx. 365; `diasSemana` gravado vazio); SEMANAL exige `diasSemana`
não vazio (0=dom … 6=sáb; duplicados removidos; `diasTrabalho`/`diasFolga` gravados `null`).

## Escala (plantões)

`plantao` =
```json
{
  "id": 1, "funcionarioId": 3, "setorId": 2, "turnoId": 1,
  "inicio": "ISO", "fim": "ISO",
  "status": "AGENDADO", "origem": "GERADO", "observacao": null,
  "funcionario": { "id": 3, "nome": "Ana" },
  "setor": { "id": 2, "nome": "Recepção" },
  "turno": { "id": 1, "nome": "Plantão dia", "cor": "#3b82f6" },
  "conflitos": [ { "tipo": "SOBREPOSICAO" | "AUSENCIA", "descricao": "texto", "plantaoId"?: 9 } ]
}
```
`turnoId`/`turno` são `null` em plantão de horário avulso. Plantão `CANCELADO` sempre vem com `conflitos: []`, e só
plantões `AGENDADO` contam como sobreposição. Ausência conflita se qualquer data (fuso SP) tocada pelo plantão cair
nela (um 19:00–07:00 toca os dois dias).

| Método | Rota | Corpo / Query |
|---|---|---|
| GET | `/api/escala` | `?inicio=ISO&fim=ISO` (obrigatórios, **período máx. 370 dias**) `&setorId&funcionarioId&status` → `plantao[]` (intervalo sobrepõe `[inicio, fim)`, ordem por início) |
| POST | `/api/escala` | `{ funcionarioId, setorId?, turnoId?, inicio, fim, observacao? }` → `201 plantao` (manual, `origem: MANUAL`, `status: AGENDADO`); `setorId` padrão = setor do funcionário; `turnoId` ausente/`null` = horário avulso |
| PUT | `/api/escala/:id` | parcial: `{ funcionarioId, setorId, turnoId (null = avulso), inicio, fim, status, observacao }` (usado também para arrastar/redimensionar no calendário) |
| DELETE | `/api/escala/:id` | `204` (os `lembretes_enviados` do plantão caem por cascade) |

- `fim` deve ser > `inicio` → senão 400. Funcionário inativo → 400. Setor/turno inexistente → 400.
- `turnoId` só identifica o turno (cor/nome); o horário gravado é sempre o `inicio`/`fim` enviados.
- PUT que muda o horário **ou o funcionário** apaga os `lembretes_enviados` do plantão (novo lembrete no horário novo).
- Conflitos não bloqueiam a gravação manual; só são sinalizados.
- **Escopo do gestor:** leitura pelo setor do plantão. Escrita (PUT/DELETE) exige que o **setor do plantão e o setor
  do funcionário** estejam no escopo (403 se não); no POST/PUT, o novo funcionário e o novo setor também precisam estar
  no escopo.

### Gerador
| Método | Rota | Corpo |
|---|---|---|
| POST | `/api/escala/gerar/previa` | `gerarInput` → `previa` (não grava nada) |
| POST | `/api/escala/gerar` | `gerarInput + { modoConflito: "PULAR" \| "SUBSTITUIR" }` → `{ criados, pulados, substituidos }` (uma transação; conflitos recalculados na hora) |

```json
gerarInput = {
  "funcionarioIds": [1, 2], "padraoId": 1, "turnoId": 1,
  "dataInicioCiclo": "2026-10-01",
  "periodoInicio": "2026-10-01", "periodoFim": "2026-10-31",
  "setorId": null
}
previa = {
  "itens": [ { "funcionarioId": 1, "funcionarioNome": "Ana", "inicio": "ISO", "fim": "ISO",
               "conflitos": [ { "tipo": "SOBREPOSICAO", "descricao": "...", "plantaoId": 9 } ] } ],
  "total": 31, "comConflito": 2
}
```
- Período **máx. 93 dias** (inclusivo); `periodoFim >= periodoInicio`.
- `dataInicioCiclo` obrigatória só para padrão CICLO (o painel sempre envia).
- Padrão ou turno inativo/inexistente → 400. Funcionário inativo/inexistente → 400. Funcionário ou `setorId` fora do
  escopo do gestor → 403. `setorId` `null` = setor de cada funcionário.
- CICLO: dia trabalhado se `(dia - dataInicioCiclo) mod (diasTrabalho + diasFolga) < diasTrabalho` (dias antes de
  `dataInicioCiclo` também seguem o ciclo, mod positivo).
- SEMANAL: dia da semana ∈ `diasSemana`.
- Horário a partir do turno no fuso `America/Sao_Paulo`; turno que vira a noite termina no dia seguinte.
- Conflitos: plantão existente (com `plantaoId`), ausência, e sobreposição entre itens da própria geração (sem `plantaoId`).
- `PULAR`: não cria nenhum item com conflito. `SUBSTITUIR`: apaga os plantões existentes sobrepostos e cria o item;
  mas **pula** o item se houver conflito de ausência, sobreposição entre itens gerados ou se algum plantão a apagar
  estiver fora do escopo do gestor.
- Plantões criados: `origem: GERADO`, `status: AGENDADO`.

## Ausências
| Método | Rota | Corpo / Query |
|---|---|---|
| GET | `/api/ausencias` | `?funcionarioId&setorId&inicio=YYYY-MM-DD&fim=YYYY-MM-DD` (ausências que tocam `[inicio, fim]`, ordem por data inicial) |
| POST | `/api/ausencias` | `{ funcionarioId, tipo: "FERIAS"\|"ATESTADO"\|"FOLGA"\|"OUTRO", dataInicio, dataFim, observacao? }` → `201` |
| PUT | `/api/ausencias/:id` | parcial |
| DELETE | `/api/ausencias/:id` | `204` |

`ausencia` = `{ id, funcionarioId, funcionario: { id, nome }, tipo, dataInicio, dataFim, observacao }`.
`dataFim` inclusiva e `>= dataInicio`. Escopo pelo setor do funcionário (escrita fora do escopo → 403).

## WhatsApp

### Regras de lembrete — só ADMIN
| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/regras-lembrete` | → `regra[]` (ordem de criação) |
| POST | `/api/regras-lembrete` | `{ nome, tipo: "ANTECEDENCIA"\|"VESPERA", minutos?, horario?: "HH:mm", template, ativo? }` → `201` |
| PUT | `/api/regras-lembrete/:id` | parcial (validação sobre o registro atual + campos enviados) |
| DELETE | `/api/regras-lembrete/:id` | `204` (apaga também o histórico `lembretes_enviados` da regra) |
| POST | `/api/regras-lembrete/previa` | `{ template }` → `{ texto }` (renderizado com dados de exemplo: Maria Silva, amanhã 07:00–19:00, "Plantão dia", "Recepção") |

`regra` = `{ id, nome, tipo, minutos, horario, template, ativo }`.
- ANTECEDENCIA exige `minutos` (1 a 10080 = 7 dias) e grava `horario: null`; VESPERA exige `horario` e grava `minutos: null`.
- `nome` até 100 caracteres; `template` até 2000.
- Variáveis do template: `{nome}`, `{data}` (dd/mm), `{dia_semana}` (por extenso), `{inicio}`, `{fim}` (HH:mm), `{turno}`
  (`Horário avulso` se não houver turno), `{setor}`. Variável desconhecida fica como está no texto.

### Configurações — só ADMIN
| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/configuracoes` | → `{ "bot.menu": "...", "bot.numero_desconhecido": { "acao": "ignorar"\|"responder", "texto": "..." }, "bot.sem_turno": "..." }` (chave ausente/inválida no banco vem com o valor padrão) |
| PUT | `/api/configuracoes` | objeto parcial só com as chaves a alterar → **objeto completo** atualizado |

- Chave desconhecida → 400. Textos até 2000 caracteres; `bot.menu` e `bot.sem_turno` não podem ser vazios;
  `acao: "responder"` exige `texto`.

### Conexão
| Método | Rota | Quem | Resposta |
|---|---|---|---|
| GET | `/api/whatsapp/status` | todos | `{ estado: "open"\|"connecting"\|"close"\|"inexistente"\|"erro", numero?: string, erro?: string }` — nunca falha: problema de comunicação vira `estado: "erro"` |
| POST | `/api/whatsapp/conectar` | ADMIN | cria a instância se não existir, **sempre (re)configura o webhook**, → `{ estado: "open" }` se já conectado, senão `{ estado: "connecting", qrcode: "data:image/png;base64,..." }` (ou só `{ estado }` se o QR não veio). Falha na Evolution → 502 |
| POST | `/api/whatsapp/desconectar` | ADMIN | `204`, **idempotente** (já desconectado ou instância inexistente também dá 204). Falha na Evolution → 502 |

O painel faz polling de `/status` (a cada 3 s na tela Conexão; a cada 60 s no layout para mostrar alerta de desconectado).

### Mensagens (histórico)
| Método | Rota | Query |
|---|---|---|
| GET | `/api/mensagens` | `?pagina=1&porPagina=50&direcao&origem&status&funcionarioId&inicio=ISO&fim=ISO` → `{ itens: mensagem[], total }` (mais recentes primeiro; `porPagina` máx. 200; `inicio`/`fim` filtram `criadoEm`, inclusive) |

`mensagem` = `{ id, direcao, telefone, funcionarioId, funcionario: { id, nome } | null, conteudo, origem, status, erro, criadoEm }`.
Gestor vê só mensagens de funcionários dos seus setores; mensagens de números desconhecidos (sem funcionário) só
aparecem para ADMIN. A origem `MANUAL` existe no enum, mas nenhuma rota envia mensagem manual hoje.

## Interno

| Método | Rota | Obs. |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` — usado pelo healthcheck do Docker (não consulta o banco) |
| POST | `/api/webhooks/evolution/:token` | chamado pela Evolution na rede interna (sem sessão). **Bloqueado no Caddy** (404 vindo da internet). Token conferido antes de ler o corpo: errado → 404 (mesmo com JSON inválido); corpo que não é objeto → 400; senão `200 { ok: true }` na hora e processa em segundo plano. Limite de corpo 1 MB (413). O token é mascarado nos logs. Ver doc 05 |
