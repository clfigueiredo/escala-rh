# 5. WhatsApp: Evolution API, lembretes e bot

## Evolution API

- Imagem `evoapicloud/evolution-api` (v2, versão fixada no compose).
- Acessível **somente** em `http://evolution:8080` dentro da rede Docker.
- Autenticação: header `apikey: $EVOLUTION_API_KEY`.
- Uma instância: `$EVOLUTION_INSTANCE` (padrão `escala`), número **dedicado**.

### Endpoints usados pelo app

| Ação | Método / rota |
|---|---|
| Criar instância | `POST /instance/create` (`integration: WHATSAPP-BAILEYS`, `qrcode: true`) |
| Obter QR Code | `GET /instance/connect/{instance}` |
| Status da conexão | `GET /instance/connectionState/{instance}` |
| Desconectar | `DELETE /instance/logout/{instance}` |
| Configurar webhook | `POST /webhook/set/{instance}` |
| Enviar texto | `POST /message/sendText/{instance}` `{ number, text }` |

> Formatos **confirmados na v2.3.7** (chamadas reais + código-fonte da versão). A API muda entre releases v2:
> ao trocar a imagem, revalidar com a instância de teste e ajustar `app/src/lib/evolution.ts` e `app/src/modules/webhook/parser.ts`.

| Chamada | Resposta real (v2.3.7) |
|---|---|
| `POST /instance/create` `{ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }` | `201 { instance: { instanceName, status: "connecting" }, hash, qrcode: { code, base64: "data:image/png;base64,..." } }` |
| `GET /instance/connect/{i}` | `200 { pairingCode, code, base64, count }` (já conectado: `{ instance: { state: "open" } }`) |
| `GET /instance/connectionState/{i}` | `200 { instance: { instanceName, state: "open" \| "connecting" \| "close" } }` |
| `GET /instance/fetchInstances?instanceName={i}` | `200 [{ name, connectionStatus, ownerJid: "5551...@s.whatsapp.net" \| null, profileName, ... }]` — usado para o número conectado |
| `DELETE /instance/logout/{i}` | `200 { status: "SUCCESS" }`; já desconectado → `400 "... is not connected"` (tratado como sucesso) |
| `POST /webhook/set/{i}` `{ webhook: { enabled, url, byEvents: false, base64: false, events: [...] } }` | `201 { url, enabled, events, webhookByEvents, webhookBase64 }` |
| `POST /message/sendText/{i}` `{ number, text }` | `201 { key: { id, remoteJid, fromMe }, ... }`; número sem WhatsApp → `400 { response: { message: [{ exists: false, jid, number }] } }`; instância `close` → `500 "Connection Closed"` |
| instância inexistente (qualquer rota) | `404 { response: { message: ['The "x" instance does not exist'] } }` |

Observações:
- Com a instância em `connecting` (QR não lido), `sendText` pode **travar até o timeout** (ou responder 500 genérico). Por isso o worker consulta `connectionState` antes de enviar e só envia com `open`.
- Não validado (sem número conectado): resposta de `sendText` com sucesso, evento `messages.upsert` real vindo do celular e `ownerJid` preenchido — os formatos acima vêm do código-fonte da v2.3.7.

### Webhook

- URL: `http://app:3000/api/webhooks/evolution/{WEBHOOK_TOKEN}` (rede interna).
- Eventos: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`.
- O app rejeita requisições com token errado (404).
- Ignorar: mensagens `fromMe`, grupos (`@g.us`), status (`status@broadcast`), mensagens sem texto.
- O app responde `200` na hora e processa em segundo plano (a Evolution reenvia em erro/timeout, até 10 tentativas;
  mensagem já registrada com o mesmo `key.id` não é respondida de novo). Mensagens com mais de 10 min
  (sincronização após reconectar) não recebem resposta.

Envelope real (v2.3.7) — `event` vem **em minúsculas com ponto**:
```json
{ "event": "messages.upsert", "instance": "escala", "data": { ... },
  "destination": "http://app:3000/api/webhooks/evolution/...", "date_time": "...",
  "sender": "5551...@s.whatsapp.net", "server_url": "http://evolution:8080", "apikey": null }
```
`data` de `messages.upsert` (um objeto por mensagem):
```json
{ "key": { "remoteJid": "5551999998888@s.whatsapp.net", "fromMe": false, "id": "3EB0...",
           "remoteJidAlt": "...", "addressingMode": "pn" },
  "pushName": "Maria", "message": { "conversation": "1" }, "messageType": "conversation",
  "messageTimestamp": 1759226400, "instanceId": "...", "source": "android" }
```
- `extendedTextMessage` já chega convertido em `message.conversation` (o app aceita os dois).
- **LID:** se `remoteJid` for `...@lid` e houver `remoteJidAlt`, a v2.3.7 já troca antes de enviar o webhook.
  O app ainda tenta `remoteJidAlt`/`senderPn`; sem número alternativo, a mensagem é ignorada (log).
- `connection.update`: `data = { instance, state: "open" | "connecting" | "close", statusReason }` — só é logado
  (o painel consulta o status ao vivo).

## Normalização de telefone

O WhatsApp pode identificar números brasileiros de celular **com ou sem o 9º dígito** (ex.: `5551999998888` vs `555199998888`).

- No cadastro: o painel tem máscara `(DD) 9XXXX-XXXX` e mostra "Será salvo como +55 (DD) …" para conferir o DDD; envia `55` + dígitos. O backend (`normalizarTelefoneCadastro`) é estrito: DDD existente e celular com 9 dígitos começando com 9 (ou fixo de 8 dígitos 2–5). Celular de 8 dígitos é **recusado** no cadastro. Guarda só dígitos com `55` em `telefone` e a variação sem o 9 em `telefone_alt`.
- Atenção ao DDD 55 (RS), igual ao DDI: `(55) 99949-3554` → `5555999493554`.
- No webhook: extrair dígitos do `remoteJid` e procurar em `telefone` **ou** `telefone_alt`.
- No envio: usar `telefone` (a Evolution resolve o JID correto).

## Lembretes

### Regras
Configuradas em `regras_lembrete` (ver doc 04). Pode haver várias ativas ao mesmo tempo, ex.:
- "1 hora antes" — ANTECEDENCIA 60
- "Véspera" — VESPERA 18:00

### Algoritmo do worker (a cada minuto)

```
agora = now()
para cada regra ativa:
  se ANTECEDENCIA:
    janela = plantões AGENDADO com inicio - regra.minutos ∈ (agora - 10min, agora]
             e inicio > agora   # não avisar turno que já começou
  se VESPERA:
    se hora atual >= regra.horario:
      janela = plantões AGENDADO cujo inicio é amanhã (fuso SP)
  remover: já existe em lembretes_enviados (escala_id, regra_id)
           funcionário inativo / sem telefone
           plantão dentro de ausência → grava como IGNORADO
  para cada plantão:
    INSERT lembretes_enviados (PENDENTE)  -- conflito na chave única = pula
    envia via Evolution
    UPDATE status ENVIADO | FALHOU + grava em mensagens
```

- A janela de 10 min de tolerância recupera envios se o worker/container ficar parado por pouco tempo.
- Envio em sequência com pequeno intervalo (1–3 s) entre mensagens para não parecer spam.
- Se o WhatsApp estiver desconectado: marca `FALHOU` com erro claro; o painel mostra alerta de desconexão.
- `PENDENTE` que sobrou (worker morreu entre o INSERT e o envio) **não é reenviado**: depois de 15 min vira
  `FALHOU` com a explicação. Timeout no envio também vira `FALHOU` (a mensagem pode ter saído).
- Um ciclo por vez (o próximo só começa quando o atual termina) + `pg_try_advisory_xact_lock` caso haja 2 workers;
  em `SIGTERM` termina o envio em curso e para.

### Template

Variáveis: `{nome}`, `{data}` (dd/mm), `{dia_semana}` (por extenso), `{inicio}`, `{fim}` (HH:mm), `{turno}` (`Horário avulso` quando o plantão não tem turno), `{setor}`. Variável escrita errada fica literal no texto (aparece na prévia do painel).
Limites: template até 2000 caracteres; antecedência de 1 min a 7 dias.

Exemplo padrão:
```
Olá {nome}! 👋
Lembrete: seu turno começa hoje às {inicio} (até {fim}) no setor {setor}.
Bom trabalho!
```

## Bot de consulta

| Entrada | Resposta |
|---|---|
| `1` | Próximo turno (data, dia da semana, horário, setor) |
| `2` | Turnos de hoje até os próximos 7 dias |
| `3` | Turnos de hoje até os próximos 30 dias |
| qualquer outra coisa | Menu (`configuracoes.bot.menu`) |

- Sem turno no período → `configuracoes.bot.sem_turno`.
- Mostrar ausências no período (ex.: "12/10 a 20/10 — Férias"). Plantões cuja data cai dentro de uma ausência
  não são listados (não serão trabalhados).
- `2` = de hoje até hoje + 7 dias; `3` = de hoje até hoje + 30 dias (janela móvel: no fim do mês já inclui o mês seguinte).
- Registra em `mensagens` a RECEBIDA e a ENVIADA (origem `BOT`). O texto recebido é truncado em 1000 caracteres.
- Número não cadastrado/inativo → `configuracoes.bot.numero_desconhecido` (padrão: `responder` com
  "Este número é da empresa… Não respondemos números não cadastrados."). **Só o 1º contato** do número é gravado
  e respondido; se já existe uma RECEBIDA desse telefone (com ou sem o 9º dígito), as mensagens seguintes são
  ignoradas sem gravar nada. Ex-funcionário inativado que já conversou com o bot também cai aqui (é ignorado).
- Limite simples: no máximo 1 resposta a cada 3 s por número (evita loop com outro bot). Para funcionário ativo o
  limite é checado **antes** de gravar: mensagens em excesso não são registradas.
- Deduplicação: além da consulta prévia, a chave única `mensagens(evolution_msg_id, direcao)` impede gravar a
  mesma mensagem duas vezes quando a Evolution reenvia o evento em paralelo (P2002 → tratada como duplicada).

Exemplo resposta `2`:
```
📅 Sua escala — próximos 7 dias
Seg 06/10 — 07:00 às 19:00 (Recepção)
Qua 08/10 — 07:00 às 19:00 (Recepção)
Sex 10/10 — 07:00 às 19:00 (Recepção)
```

## Boas práticas para evitar bloqueio do número

- Número dedicado, com foto e nome de perfil da empresa.
- Mensagens personalizadas (nome, horário) — nunca texto idêntico em massa.
- Volume baixo e intervalo entre envios.
- Funcionários devem salvar o número na agenda (orientar no cadastro).
