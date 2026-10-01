# 4. Banco de dados

PostgreSQL 16, base `escala`, gerenciada pelo Prisma 6 (`app/prisma/schema.prisma`, migrations em `app/prisma/migrations/`). Todas as tabelas têm `id` (serial, inteiro), `criado_em` e `atualizado_em` (timestamptz), omitidos abaixo.

## Diagrama

```
usuarios ──< usuario_setores >── setores ──< funcionarios ──< escala >── turnos
                                                  │              │
                                                  ├──< ausencias │
                                                  │              └──< lembretes_enviados >── regras_lembrete
                                                  └──< mensagens
padroes_escala   configuracoes
```

## Tabelas

### usuarios
| Campo | Tipo | Observação |
|---|---|---|
| nome | text | |
| email | text | único, sempre em minúsculas |
| senha_hash | text | bcrypt |
| perfil | enum `ADMIN` \| `GESTOR` | |
| ativo | bool | |
| sessao_versao | int, default 0 | vai no JWT (`ver`); incrementada no logout, na troca de senha e quando o admin muda senha/perfil ou desativa o usuário — sessões com versão antiga recebem 401 (migration `0003_sessao_versao`) |

### usuario_setores
Vínculo N:N — quais setores o gestor pode ver. `(usuario_id, setor_id)` único, índice em `setor_id`. Admin ignora esta tabela.

### setores
| Campo | Tipo |
|---|---|
| nome | text (único) |
| ativo | bool |

### funcionarios
| Campo | Tipo | Observação |
|---|---|---|
| nome | text | |
| telefone | text | só dígitos, com DDI: `5551999998888` |
| telefone_alt | text, nulo | variação sem/com 9º dígito, calculada ao salvar (nulo se não se aplica, ex.: fixo) |
| setor_id | fk setores | |
| cargo | text | opcional |
| observacoes | text | opcional |
| ativo | bool | inativo não recebe lembrete nem resposta do bot |

Índices: `telefone`, `telefone_alt`, `setor_id` (o `telefone` deixou de ser único na migration `0005`). A unicidade vale **só entre ativos** e é garantida pela API: um funcionário ativo não pode usar um número (em qualquer variação) que esteja em `telefone` ou `telefone_alt` de outro ativo. Inativo não bloqueia o número. Excluir um funcionário apaga junto os plantões e as ausências dele; as mensagens ficam com `funcionario_id` nulo.

### turnos
| Campo | Tipo | Observação |
|---|---|---|
| nome | text | "Manhã", "Plantão dia", "Noturno" |
| hora_inicio | varchar(5) `"HH:mm"` | relógio de SP (ver nota abaixo) |
| hora_fim | varchar(5) `"HH:mm"` | se `hora_fim <= hora_inicio` → termina no dia seguinte |
| cor | text | hex `#rrggbb` para o calendário (padrão `#3b82f6`) |
| ativo | bool | |

### padroes_escala
| Campo | Tipo | Observação |
|---|---|---|
| nome | text | "12x36", "6x1", "5x2" |
| tipo | enum `CICLO` \| `SEMANAL` | |
| dias_trabalho | int | só CICLO |
| dias_folga | int | só CICLO |
| dias_semana | int[] | só SEMANAL (0=dom … 6=sáb) |
| ativo | bool | |

Seed inicial: 12x36 (ciclo 1/1), 6x1 (ciclo 6/1), 5x2 (semanal 1–5).

### escala (plantões)
| Campo | Tipo | Observação |
|---|---|---|
| funcionario_id | fk | |
| setor_id | fk | setor do plantão (padrão: setor do funcionário) |
| turno_id | fk, nulo | nulo = horário avulso (vira nulo se o turno for apagado) |
| inicio | timestamptz | |
| fim | timestamptz | |
| status | enum `AGENDADO` \| `CANCELADO` | cancelado não gera lembrete |
| origem | enum `GERADO` \| `MANUAL` | padrão `MANUAL`; o gerador grava `GERADO` |
| observacao | text | |
| criado_por | fk usuarios, nulo | |

Índices: `(inicio)`, `(funcionario_id, inicio)`, `(setor_id, inicio)`.

### ausencias
| Campo | Tipo |
|---|---|
| funcionario_id | fk |
| tipo | enum `FERIAS` \| `ATESTADO` \| `FOLGA` \| `OUTRO` |
| data_inicio | date |
| data_fim | date (inclusiva) |
| observacao | text |

Índice: `(funcionario_id, data_inicio)`.

### regras_lembrete
| Campo | Tipo | Observação |
|---|---|---|
| nome | text | "1 hora antes", "Véspera" |
| tipo | enum `ANTECEDENCIA` \| `VESPERA` | |
| minutos | int | ANTECEDENCIA: quantos minutos antes |
| horario | varchar(5) `"HH:mm"` | VESPERA: hora do envio no dia anterior (relógio de SP) |
| template | text | texto com variáveis |
| ativo | bool | |

Seed inicial: "1 hora antes" (ANTECEDENCIA, 60 min) com o template padrão (ver doc 05).

### lembretes_enviados
| Campo | Tipo | Observação |
|---|---|---|
| escala_id | fk | |
| regra_id | fk | |
| status | enum `PENDENTE` \| `ENVIADO` \| `FALHOU` \| `IGNORADO` | |
| mensagem_id | fk mensagens, nulo | |
| erro | text | |

**`(escala_id, regra_id)` único** — garante envio único. Índice extra em `regra_id`. Apagar o plantão ou a regra apaga os registros (cascade).

Se o horário **ou o funcionário** de um plantão for alterado depois de lembrado, os registros dele são apagados para permitir novo lembrete.

### mensagens
| Campo | Tipo | Observação |
|---|---|---|
| direcao | enum `ENVIADA` \| `RECEBIDA` | |
| telefone | text | |
| funcionario_id | fk, nulo | |
| conteudo | text | |
| origem | enum `LEMBRETE` \| `BOT` \| `MANUAL` | |
| status | enum `OK` \| `FALHOU` | |
| erro | text | |
| evolution_msg_id | text, nulo | id da mensagem na Evolution (`key.id`); usado para não responder duas vezes a um webhook reenviado |

Índices: `(criado_em)`, `(funcionario_id, criado_em)`, `(telefone)`; **único** `(evolution_msg_id, direcao)` (migration `0004`, substitui o índice simples da `0002`; NULLs permitidos).

### configuracoes
Chave/valor (`chave` text único, `valor` jsonb). Chaves usadas (criadas pelo seed; se faltar ou estiver inválida, a API usa o valor padrão de `app/src/lib/configuracoes.ts`):
- `bot.menu` — texto do menu
- `bot.numero_desconhecido` — `{ "acao": "ignorar" | "responder", "texto": "..." }`
- `bot.sem_turno` — texto quando não há turno no período

## Notas de implementação (Prisma)

- **Models** em PascalCase singular, campos camelCase com `@map` para snake_case e `@@map` para a tabela:
  `Usuario`→`usuarios`, `UsuarioSetor`→`usuario_setores`, `Setor`→`setores`, `Funcionario`→`funcionarios`,
  `Turno`→`turnos`, `PadraoEscala`→`padroes_escala`, **`Plantao`→`escala`**, `Ausencia`→`ausencias`,
  `RegraLembrete`→`regras_lembrete`, `LembreteEnviado`→`lembretes_enviados`, `Mensagem`→`mensagens`,
  `Configuracao`→`configuracoes`. Coluna `escala.criado_por` = campo `criadoPorId`.
- **Horas como texto:** `hora_inicio`, `hora_fim` e `horario` são `varchar(5)` no formato `"HH:mm"`, em vez de
  `time`. Motivo: o Prisma mapeia `time` para `Date` (1970-01-01 em UTC), o que gera erro de fuso. A hora é sempre
  interpretada no relógio de `America/Sao_Paulo` (helpers em `app/src/lib/datas.ts`). Comparação lexicográfica
  `"HH:mm"` funciona para `viraNoite`.
- **Datas puras** (`ausencias.data_inicio/data_fim`) são `date`; no Prisma chegam como `Date` à meia-noite UTC —
  converter com `dataParaDb` / `dataDoDb`.
- `padroes_escala.dias_semana` é `integer[]` (vazio para CICLO).
- `configuracoes.valor` é `jsonb`.
- Exclusões: apagar um plantão ou uma regra de lembrete apaga os `lembretes_enviados` ligados (cascade); apagar um turno deixa `escala.turno_id` NULL (na prática não há DELETE de turno); apagar um funcionário apaga ausências
  (na prática não há DELETE de funcionário); `mensagens.funcionario_id` e `lembretes_enviados.mensagem_id` viram
  NULL se o alvo for apagado.
- Todos os índices estão listados junto de cada tabela acima.

## Migrations

Pasta `app/prisma/migrations/`, aplicadas com `prisma migrate deploy` (feito pelo `scripts/deploy.sh`):

| Migration | Conteúdo |
|---|---|
| `0001_init` | Todas as tabelas, enums, índices e chaves estrangeiras |
| `0002_indice_evolution_msg_id` | Índice `mensagens(evolution_msg_id)` para deduplicar mensagens recebidas pelo webhook |
| `0003_sessao_versao` | Campo `usuarios.sessao_versao` (revogação de sessão) |
| `0004_mensagem_unica_evolution` | Troca o índice da `0002` por índice único `mensagens(evolution_msg_id, direcao)` |

Nova mudança de schema: criar `0005_<nome>` (ver `app/README.md`) e atualizar este documento.
