# 7. Operação

Todos os comandos a partir de `/var/www/escala`.

## Dia a dia

```bash
docker compose ps                         # status dos serviços (app, postgres, redis e evolution têm healthcheck)
docker compose logs -f app worker         # logs da aplicação
docker compose logs -f evolution          # logs do WhatsApp
docker compose restart worker             # reinicia só o worker (seguro: não duplica lembretes)
```

O worker escreve uma linha `[lembretes] ... ciclo: N enviado(s), N falha(s), N ignorado(s) por ausência` nos ciclos em que algo aconteceu. O app loga cada mensagem
recebida pelo bot (`bot: mensagem processada`).

## Acesso ao painel

- URL: https://escala.seudominio.com.br
- **Admin inicial:** criado pelo seed com `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`. Para ver os dados (só no servidor,
  nunca copiar para fora):
  ```bash
  grep -E '^ADMIN_(EMAIL|PASSWORD)=' .env
  ```
- **Trocar a senha:** no painel, menu do usuário (canto superior direito) › **Trocar senha**. Faça isso no primeiro acesso.
  Mudar `ADMIN_PASSWORD` no `.env` depois **não** altera a senha: o seed só cria o admin se o e-mail ainda não existir.
- **Senha de outro usuário:** um admin abre **Cadastros › Usuários › Editar** e preenche "Nova senha".
- **Esqueceu a senha do único admin:** gera uma senha aleatória, grava no `ADMIN_PASSWORD` do `.env`, aplica o hash no banco e derruba as sessões antigas:
  ```bash
  cd /var/www/escala
  sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)/" .env
  AP=$(grep ^ADMIN_PASSWORD= .env | cut -d= -f2-); AE=$(grep ^ADMIN_EMAIL= .env | cut -d= -f2); PU=$(grep ^POSTGRES_USER= .env | cut -d= -f2)
  HASH=$(docker compose exec -T -e P="$AP" app node -e "console.log(require('bcryptjs').hashSync(process.env.P,10))")
  echo "update usuarios set senha_hash = :'h', ativo = true, sessao_versao = sessao_versao + 1, atualizado_em = now() where email = :'e';" \
    | docker compose exec -T postgres psql -U "$PU" -d escala -v h="$HASH" -v e="$AE"
  grep ^ADMIN_PASSWORD= .env   # senha para entrar
  ```
  (`psql -c` não substitui variáveis `:'x'` — por isso o SQL vai pela entrada padrão. Depois de entrar, troque a senha pelo painel.)
- Sessão dura 12 h; o login bloqueia após 5 tentativas por minuto por IP (espera 1 min).

## Testes

```bash
cd app && npm test          # vitest: ~190 testes (datas/fuso, telefone, gerador, conflitos, template, bot, lembretes, API)
cd app && npm run typecheck # checagem de tipos
cd web && npm run build     # tsc + build do painel (falha se houver erro de tipo)
```

Os testes não precisam de banco nem de Evolution (Prisma e envio são simulados) e rodam com `TZ=UTC` de propósito
(nada pode depender do fuso do processo). Usam o Node 22 do host (`/usr/local/bin/node`).

## Deploy de nova versão

`./scripts/deploy.sh` executa:
1. Build do painel com o node do host: `cd web && npm ci && npm run build` → `web/dist`
2. `docker compose build app worker`
3. `docker compose up -d postgres redis evolution caddy`
4. Backup (`./scripts/backup.sh`; se falhar, só avisa e segue)
5. `./scripts/db-roles.sh` (idempotente: garante roles `escala_app`/`evolution_app`, posse e permissões) — antes das migrations
6. `docker compose run --rm app npx prisma migrate deploy` (roda como `escala_app`, via `APP_DB_URL`)
7. Seed idempotente: `docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD app node dist/seed.js`. `ADMIN_EMAIL`/`ADMIN_PASSWORD` são lidos do `.env` pelo script e só existem nesse container (não estão no ambiente de app/worker). Cria só o que não existe; não sobrescreve o que foi alterado no painel
8. `docker compose up -d` + `docker compose restart caddy` (garante que o caddy enxergue o `web/dist` novo)

Subir só a infraestrutura (sem app/worker): `docker compose up -d postgres redis evolution caddy`.

## Backup e restore

- Automático: `/etc/cron.d/escala-backup`, diário 03:00 → `backups/`, mantém 14 dias. Log: `/var/log/escala-backup.log`.
- Manual: `./scripts/backup.sh` → `backups/AAAA-MM-DD_HHMM_escala.sql.gz` e `..._evolution.sql.gz` (pasta com permissão 700).
  Exige o container postgres rodando.
- Restore: `./scripts/restore.sh [-y] backups/<arquivo>.sql.gz [base_destino]`
  - A base é deduzida pelo sufixo do arquivo (`_escala` / `_evolution`). Esse sufixo também define a role da aplicação que faz o restore (`escala_app` / `evolution_app`); arquivos com outros nomes são recusados.
  - O restore roda como essa role, então os objetos continuam pertencendo a ela (os dumps são `--no-owner --no-privileges`). Base temporária é criada com essa role como dona. Em `escala`/`evolution` (produção) o script reaplica `./scripts/db-roles.sh` no fim.
  - Destino `escala`: para app/worker (se rodando), restaura e sobe de novo. Destino `evolution`: idem com o container evolution.
  - Pede confirmação (digitar `sim`); `-y` pula.
  - Testar um dump sem tocar em nada: `./scripts/restore.sh -y backups/<arq>.sql.gz restore_teste` e depois
    `docker compose exec postgres sh -c 'dropdb -U "$POSTGRES_USER" restore_teste'`.
- O script de init que cria a base `evolution` (`infra/postgres/init/`) só roda com o volume `pg_data` vazio. Se recriar o volume, ele roda de novo automaticamente.
- Se precisar usar outro nome de base de teste, o 2º argumento continua valendo, mas o arquivo precisa terminar em `_escala.sql.gz` ou `_evolution.sql.gz`.
- Os backups ficam no mesmo servidor; cópia externa ainda não está configurada.

## Administração do banco (roles)

`./scripts/db-roles.sh [escala|evolution|todas]` (padrão: `todas`) é idempotente e pode rodar a qualquer momento (ex.: depois de um restore). Corrige posse e permissões dos objetos e aplica a senha do `.env` na role.

Trocar a senha de uma role: mude `APP_DB_PASSWORD` (ou `EVOLUTION_DB_PASSWORD`) no `.env` (e `APP_DB_URL`, se for a do app), rode `./scripts/db-roles.sh escala` (ou `evolution`) e recrie o serviço afetado (`docker compose up -d --force-recreate app worker` ou `evolution`). Senhas só com `[A-Za-z0-9]`, mínimo 24 caracteres.

Acesso ao banco: como admin, `docker compose exec postgres psql -U "$POSTGRES_USER" ...` (a variável existe dentro do container; use `sh -c` como nos exemplos acima); como aplicação, `docker compose exec postgres psql -h postgres -U escala_app -d escala` (pede a senha de `APP_DB_PASSWORD`).

Redis: o `redis-cli` exige senha, por exemplo `docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'`.

## Trocar o WEBHOOK_TOKEN

1. Mude `WEBHOOK_TOKEN` no `.env` (só `[A-Za-z0-9]`, gere com `openssl rand -hex 32`).
2. `./scripts/deploy.sh` (ou, mais rápido, `docker compose up -d --force-recreate app worker`).
3. No painel, tela **WhatsApp**, clique em **Conectar**: isso reconfigura o webhook na Evolution com o novo token. Até lá o bot não recebe mensagens.

O token aparece mascarado (`***`) nos logs do app.

## Atualizar a Evolution API

1. Ler o changelog da nova versão (mudanças de payload são comuns).
2. Fazer backup.
3. Trocar a tag no `docker-compose.yml`, `docker compose pull evolution && docker compose up -d evolution`.
4. Testar status da conexão, envio e bot; conferir os formatos em `docs/05-whatsapp.md` (ajustar `app/src/lib/evolution.ts` e `app/src/modules/webhook/parser.ts` se mudarem).

## Troubleshooting

| Sintoma | Verificar |
|---|---|
| Site sem HTTPS | DNS do domínio aponta para 203.0.113.10? Portas 80/443 abertas? `docker compose logs caddy` |
| Painel abre mas `/api` dá 502 | `docker compose ps app` (healthy?); `docker compose logs app` (variável de ambiente inválida aparece no início do log) |
| Lembrete não chegou | Tela **Mensagens** (filtro Status = Falhou; a coluna Mensagem mostra o erro); WhatsApp conectado?; regra ativa?; funcionário ativo com telefone?; plantão cancelado ou em ausência?; `docker compose logs worker` |
| Lembrete com erro "Envio interrompido" | O worker reiniciou no meio do envio; por segurança não reenvia (pode ter saído). Avisar o funcionário manualmente se necessário |
| Bot não responde | WhatsApp conectado? (clicar em **Conectar** também reconfigura o webhook); telefone do funcionário bate (9º dígito)?; funcionário ativo?; `docker compose logs app` |
| WhatsApp desconectou | Reconectar pelo QR em **WhatsApp › Conexão**; se recorrente, verificar se o número foi usado em outro aparelho/WhatsApp Web |
| Evolution não sobe / erro de migration | `docker compose logs evolution`; base `evolution` existe? (`docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -l'`); erro de permissão/posse: `./scripts/db-roles.sh evolution` |
| Evolution responde 500 "Not allowed by CORS" | `CORS_ORIGIN` no serviço `evolution` do compose deve ser `"*"` (a v2.3.7 rejeita requisições sem header `Origin` se a lista não tiver `"*"`). Não é risco: a Evolution não é exposta |
| Mudei o `Caddyfile` e nada mudou | `sed -i` troca o inode e o bind mount não enxerga; rode `docker compose restart caddy` |
| Worker `unhealthy` | O heartbeat (`/tmp/worker-heartbeat`) está parado há mais de 3 min (ciclo travado ou processo preso). `docker compose logs --tail 100 worker`; `docker compose restart worker` (seguro, não duplica lembretes) |
| `redis-cli` dá NOAUTH | Redis exige senha: `REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ...` dentro do container |
| `psql` nega acesso | Admin: `-U $POSTGRES_USER` (dentro do container); aplicação: `-h postgres -U escala_app`. Uma role não acessa a base da outra |
| Firewall / SSH | `ufw status verbose` (só 22/tcp, 80/tcp, 443/tcp e 443/udp); `fail2ban-client status sshd` (desbanir: `fail2ban-client set sshd unbanip <ip>`) |
| Disco cheio | `docker system df`; limpar imagens antigas `docker image prune`; checar pasta `backups/` |
