# 2. Arquitetura

## Componentes

```
                 Internet
                    │ 80/443
             ┌──────▼──────┐
             │    Caddy    │  HTTPS automático (Let's Encrypt)
             └──┬───────┬──┘
     /  (estático)      │ /api/*
   ┌────────────▼┐   ┌──▼──────────┐        ┌──────────────┐
   │ web (React) │   │  app (API)  │◄───────┤ Evolution API│  webhook interno
   │  build dist │   │   Fastify   │───────►│   (v2)       │  (mensagens recebidas)
   └─────────────┘   └──┬──────────┘ envia  └──┬────────┬──┘
                        │                      │        │
                 ┌──────▼──────┐        ┌──────▼──┐ ┌───▼───┐
                 │ PostgreSQL  │◄───────┤  worker │ │ Redis │
                 │ escala +    │        │ (cron)  │ └───────┘
                 │ evolution   │        └─────────┘       │
                 └─────────────┘                    WhatsApp
```

- **Caddy** — único serviço exposto (80/443). Serve o painel estático e faz proxy de `/api/*` para o app.
- **app** — API REST (Fastify + Prisma). Autenticação, cadastros, escala, configurações, endpoint de webhook da Evolution, proxy controlado para QR Code/status do WhatsApp.
- **worker** — mesmo código do app, outro processo/container. Roda o agendador de lembretes a cada minuto.
- **web** — painel React (Vite + FullCalendar), build estático. Visual segue o design system MiniMax (DM Sans, botões em pílula; tokens no topo de `web/src/styles.css`) e é responsivo: no celular as tabelas viram cartões (componente `Tabela`), o calendário abre em lista e os modais ocupam a tela.
- **PostgreSQL 16** — base `escala` (sistema) e base `evolution` (Evolution API).
- **Evolution API v2** + **Redis** — conexão com o WhatsApp. Só na rede interna do Docker.

## Fluxos

### Lembrete antes do turno
1. Worker acorda a cada minuto.
2. Para cada **regra de lembrete ativa**:
   - *antecedência:* busca plantões `AGENDADO` cujo `inicio - minutos` caiu nos últimos 10 min (tolerância para recuperar minutos perdidos se o worker ficou parado) e que ainda não começaram — ver doc 05;
   - *véspera:* a partir do horário configurado, busca plantões que começam amanhã.
3. Descarta plantões de funcionário inativo ou sem telefone; plantão dentro de ausência é registrado como `IGNORADO`.
4. Insere em `lembretes_enviados (escala_id, regra_id)` — chave única impede duplicidade.
5. Confere se o WhatsApp está `open`, monta o texto a partir do template e envia via Evolution (`/message/sendText`), com 1–3 s entre envios.
6. Grava resultado em `mensagens` e atualiza status do lembrete (`ENVIADO` / `FALHOU`).

### Bot de consulta
1. Funcionário manda mensagem → Evolution dispara webhook `MESSAGES_UPSERT` para `http://app:3000/api/webhooks/evolution/<token>`.
2. App valida o token, responde 200 na hora e processa em segundo plano; ignora mensagens de grupo, de status, enviadas pelo próprio número, sem texto, repetidas (mesmo id) ou com mais de 10 min.
3. Normaliza o telefone e procura funcionário ativo (com e sem 9º dígito).
4. Não achou → segue configuração (ignora ou resposta padrão).
5. Achou → interpreta: `1` próximo turno, `2` semana, `3` próximos 30 dias, qualquer outra coisa → menu.
6. Responde via Evolution e registra entrada e saída em `mensagens`.

### Geração de escala
1. Usuário escolhe funcionário(s), padrão, turno, data de início do ciclo e período (até 93 dias).
2. App calcula os dias de trabalho:
   - *ciclo:* `(dia - data_inicio) mod (trabalho + folga) < trabalho`;
   - *semanal:* dia da semana está na lista do padrão.
3. Para cada dia, cria plantão com `inicio`/`fim` a partir do turno (fim no dia seguinte se o turno vira a noite).
4. Mostra prévia com conflitos (plantão existente, ausência, sobreposição entre os próprios itens) antes de gravar. Opção de substituir ou pular os conflitantes; a gravação é uma transação única.

### Conexão do WhatsApp
1. Admin abre **WhatsApp › Conexão** no painel e clica em **Conectar**.
2. App chama a Evolution: cria a instância se não existir, configura webhook, pede QR Code.
3. Painel mostra o QR e faz polling do status (a cada 3 s) até `open`.

## Estrutura do código

```
app/                          # API + worker (mesma imagem Docker)
├── Dockerfile                # build multi-stage (node:22-bookworm-slim)
├── README.md                 # guia para desenvolvedores (convenções, helpers)
├── package.json              # scripts: build, test, typecheck, seed, dev
├── tsconfig.json / tsconfig.build.json / vitest.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/           # 0001_init, 0002_indice_evolution_msg_id
└── src/
    ├── server.ts             # entrada da API (0.0.0.0:3000)
    ├── app.ts                # criarApp(): plugins + registro dos módulos (usado também nos testes)
    ├── worker.ts             # entrada do worker (lembretes a cada minuto)
    ├── seed.ts               # seed idempotente (admin, padrões, regra "1 hora antes", configurações)
    ├── config/env.ts         # leitura/validação do ambiente (zod)
    ├── auth/                 # rotas /api/auth, sessão (cookie JWT), senha (bcrypt), guardas de perfil e escopo de setor
    ├── lib/                  # prisma, datas/fuso, telefone, evolution (cliente HTTP), bot, template,
    │                         # gerador, conflitos, configuracoes, validacao, erros, tratador-erros
    ├── modules/              # um plugin Fastify por recurso (index.ts)
    │   ├── usuarios/  setores/  funcionarios/  turnos/  padroes/
    │   ├── escala/           # index.ts (CRUD), gerar.ts (gerador), servico.ts (conflitos/escopo)
    │   ├── ausencias/  configuracoes/  regras-lembrete/  mensagens/
    │   ├── whatsapp/         # status, conectar (QR), desconectar
    │   └── webhook/          # entrada da Evolution (index.ts) + parser.ts
    ├── jobs/lembretes.ts     # ciclo de lembretes (chamado pelo worker)
    └── __tests__/            # testes de API (app.inject, Prisma mockado); demais *.test.ts ficam ao lado do código

web/                          # painel (React + Vite + FullCalendar); build em web/dist servido pelo Caddy
├── package.json / vite.config.ts / tsconfig*.json / eslint.config.js / index.html
└── src/
    ├── main.tsx / App.tsx    # rotas (react-router); telas de admin protegidas por <SoAdmin>
    ├── api/                  # client.ts (fetch com cookie), index.ts (funções por recurso), types.ts
    ├── contexts/             # AuthContext (sessão), ToastContext (avisos)
    ├── components/           # Layout (menu, alerta de WhatsApp, trocar senha), PlantaoModal, ui.tsx
    ├── lib/                  # datas (fuso SP), hooks, rotulos, documentos (renderiza os .md de docs/)
    ├── pages/                # Login, Calendario, Gerador, Ausencias, Funcionarios, Setores, Turnos,
    │                         # Padroes, Usuarios, WhatsApp (Conexão), RegrasLembrete, Configuracoes, Mensagens,
    │                         # Documentacao (carregada sob demanda; mostra docs/*.md e o README)
    └── styles.css
```

Rotas do painel: `/` (Calendário), `/gerador`, `/ausencias`, `/funcionarios`, `/setores`, `/turnos`, `/padroes`,
`/mensagens`; só admin: `/usuarios`, `/whatsapp`, `/regras-lembrete`, `/configuracoes`.

## Autenticação

- Login por e-mail + senha (hash bcrypt, `bcryptjs`).
- Sessão via JWT (12 h) em cookie `httpOnly`, `secure`, `sameSite=strict`. O usuário é recarregado do banco a cada
  requisição (desativar alguém corta o acesso na hora).
- Primeiro admin criado pelo seed com `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env` (trocar no primeiro acesso, em
  "Trocar senha" no menu do usuário — ver doc 07).
- Rate limit na rota de login (5 tentativas/min por IP).
