# app/ — API + worker (Node 22, TypeScript, Fastify 5, Prisma 6)

Guia rápido para quem vai mexer aqui. Contrato da API: `docs/08-api.md`. Banco: `docs/04-banco-de-dados.md`.

## Comandos

```bash
npm run typecheck   # tsc --noEmit (inclui testes)
npm test            # vitest (roda com TZ=UTC de propósito)
npm run build       # tsc → dist/ (server.js, worker.js, seed.js)
npx prisma validate # precisa de DATABASE_URL no ambiente (qualquer valor)
```

Dependências já instaladas — **não rode `npm install`** sem combinar. CommonJS (imports sem extensão `.js`).

## Estrutura

```
src/
├── server.ts          # entrada da API (escuta 0.0.0.0:PORT)
├── app.ts             # criarApp(): registra plugins e TODOS os módulos com prefixo — não precisa mexer
├── worker.ts          # entrada do worker (chama jobs/lembretes.ts a cada minuto)
├── seed.ts            # seed idempotente (admin, padrões, regra "1 hora antes", configurações) — ADMIN_EMAIL/ADMIN_PASSWORD só são exigidos se precisar criar o admin
├── config/env.ts      # env validado com zod: import { env } from '../config/env'
├── auth/
│   ├── guards.ts      # requireAuth, requireAdmin
│   ├── escopo.ts      # setoresPermitidos, podeAcessarSetor, assertSetorPermitido, whereSetor, carregarFuncionarioPermitido
│   ├── rotas.ts       # /api/auth/*
│   ├── sessao.ts      # serializarUsuario, carregarUsuario(Sessao), gravarSessao, revogarSessoes, cookie `sessao` (JWT com `ver` = usuarios.sessao_versao)
│   ├── senha.ts       # gerarHashSenha, conferirSenha (bcryptjs)
│   └── tipos.ts       # UsuarioSessao; request.usuario
├── lib/
│   ├── prisma.ts      # export const prisma (singleton)
│   ├── datas.ts       # fuso America/Sao_Paulo (luxon)
│   ├── telefone.ts    # normalização BR + 9º dígito
│   ├── log.ts         # serializers do logger: mascaram o token do webhook (URL/erros)
│   ├── proxy.ts       # trustProxy de um salto (só o Caddy, rede privada)
│   ├── heartbeat.ts   # /tmp/worker-heartbeat (healthcheck do worker)
│   ├── erros.ts       # HttpError, badRequest, unauthorized, forbidden, notFound, conflict
│   ├── validacao.ts   # schemas zod comuns (idParamSchema, boolQuery, intQuery, horaSchema, dataSchema, instanteSchema, corSchema, textoObrigatorio, textoOpcional)
│   └── tratador-erros.ts # handler global → { erro, detalhes? }
├── jobs/lembretes.ts  # processarLembretes(agora) —  (agente WhatsApp)
└── modules/<nome>/index.ts  # um plugin Fastify por módulo (export default)
```

Módulos e prefixos (já registrados em `app.ts`):

| Módulo | Prefixo | Dono |
|---|---|---|
| usuarios, setores, funcionarios, turnos | `/api/<nome>` | core (prontos) |
| padroes, escala, ausencias | `/api/padroes`, `/api/escala`, `/api/ausencias` | agente ESCALA |
| configuracoes, regras-lembrete, whatsapp, mensagens | `/api/<nome>` | agente WHATSAPP |
| webhook | `/api/webhooks/evolution` (rota `/:token`) | agente WHATSAPP |

## Como escrever um módulo

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../auth/guards';
import { assertSetorPermitido, whereSetor, carregarFuncionarioPermitido } from '../../auth/escopo';
import { notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { idParamSchema } from '../../lib/validacao';

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);            // todas as rotas exigem login

  app.get('/', async (request) => {
    return prisma.plantao.findMany({ where: { ...whereSetor(request.usuario) } });
  });

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = z.object({ /* ... */ }).parse(request.body);   // ZodError → 400 automático
    // ...
    return reply.code(201).send(criado);
  });
};
export default plugin;
```

- **Erros:** lance `badRequest/forbidden/notFound/conflict(...)` (de `lib/erros`). ZodError → 400, Prisma P2002 → 409, P2025 → 404, banco fora → 503. Formato sempre `{ erro, detalhes? }`.
- **Não use 401** para erro de negócio (o painel redireciona para o login).
- **Escopo de setor (regra 6):** toda rota de funcionário/escala/ausência/mensagem de GESTOR precisa filtrar.
  - `setoresPermitidos(usuario): number[] | null` — `null` = ADMIN (tudo).
  - `whereSetor(usuario)` → `{}` ou `{ setorId: { in: [...] } }`; `whereSetor(usuario, 'id')` para a própria tabela de setores. Relação: `{ funcionario: whereSetor(usuario) }`.
  - `assertSetorPermitido(usuario, setorId)` → 403.
  - `await carregarFuncionarioPermitido(usuario, id, 'leitura' | 'escrita')` → 404 se não existe; fora do escopo: 404 (leitura) / 403 (escrita).
- **Datas:** nunca use `new Date(y, m, d)`/`getHours()` (fuso do processo). Use `lib/datas`:
  `combinarDataHora(data, hora)`, `intervaloTurno(data, horaInicio, horaFim)`, `viraNoite`, `somarDias`, `diferencaDias`, `listarDias`, `diaDaSemana` (0=dom), `inicioDoDia`, `fimDoDiaExclusivo`, `paraDataSP`, `formatarData` (dd/MM), `formatarDataCompleta`, `formatarHora` (HH:mm), `diaSemanaExtenso`, `diaSemanaCurto`, `nomeDiaSemana`, `agoraSP`, `hojeSP`, `sobrepoe`, `dataParaDb`/`dataDoDb` (colunas `@db.Date` ↔ "YYYY-MM-DD").
- **Horas** (`Turno.horaInicio/horaFim`, `RegraLembrete.horario`) são strings `"HH:mm"` no banco.
- **Telefone:** `normalizarTelefone(v)` (→ `"5551999998888"` ou `null`), `variacaoNonoDigito(n)`, `variantesTelefone(v)` (para buscar em `telefone` OU `telefoneAlt`), `telefoneValido`, `formatarTelefone`. Aceita JID (`...@s.whatsapp.net`).
- **Webhook:** se o payload da Evolution for grande, use `bodyLimit` na rota (padrão do Fastify: 1 MB).
- **Testes:** `src/**/*.test.ts`; exemplo com `app.inject` e Prisma mockado em `src/__tests__/api.test.ts`.

## Models Prisma → tabelas

`Usuario`→usuarios · `UsuarioSetor`→usuario_setores · `Setor`→setores · `Funcionario`→funcionarios · `Turno`→turnos · `PadraoEscala`→padroes_escala · `Plantao`→escala · `Ausencia`→ausencias · `RegraLembrete`→regras_lembrete · `LembreteEnviado`→lembretes_enviados (`@@unique([escalaId, regraId])`) · `Mensagem`→mensagens · `Configuracao`→configuracoes.

Mudou o schema? Crie uma nova pasta em `prisma/migrations/` (ex.: `0002_<nome>`) com
`npx prisma migrate diff --from-schema-datamodel <schema antigo> --to-schema-datamodel prisma/schema.prisma --script`
(ou `migrate dev` com banco) e atualize `docs/04-banco-de-dados.md`.
