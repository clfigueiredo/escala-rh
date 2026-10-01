# 3. Infraestrutura

## Servidor

| Item | Valor |
|---|---|
| SO | Ubuntu 24.04 LTS |
| CPU / RAM / Disco | 4 vCPU / 8 GB / 145 GB |
| IP | 62.171.184.27 |
| Domínio | hotspotcontabo.forumtelecom.com.br (A → 62.171.184.27, já configurado) |
| Diretório do projeto | `/var/www/escala` |

## Pacotes no host

- **Docker Engine + plugin Compose** (repositório oficial da Docker)
- **ufw** — firewall
- **fail2ban** — proteção do SSH (`/etc/fail2ban/jail.local`, jail `sshd` lendo `/var/log/auth.log` — no Ubuntu 24.04 o backend systemd não casa com a unit `ssh.service`; ban de 1h após 5 falhas em 10 min)
- **cron** — backup diário (`/etc/cron.d/escala-backup`, log em `/var/log/escala-backup.log`)
- Rotação de logs do Docker também no daemon (`/etc/docker/daemon.json`: json-file, 10m, 3)
- Node 22 instalado em `/usr/local` (tarball), usado pelo `deploy.sh` para buildar o painel
- Fuso do host: `America/Sao_Paulo` (`timedatectl set-timezone`)

## Firewall (ufw)

| Porta | Uso |
|---|---|
| 22/tcp | SSH (liberar **antes** de ativar o ufw) |
| 80/tcp | HTTP (desafio Let's Encrypt + redirect para HTTPS) |
| 443/tcp | HTTPS |
| 443/udp | HTTP/3 (QUIC) do Caddy |

Nada mais é exposto. Atenção: o Docker publica portas passando por cima do ufw — por isso **nenhum serviço além do Caddy usa `ports:`** no compose.

## Serviços (docker-compose.yml)

| Serviço | Imagem | Porta interna | Exposto | Volume |
|---|---|---|---|---|
| `caddy` | `caddy:2.11-alpine` | 80, 443 (+443/udp HTTP/3) | **sim** | `caddy_data`, `caddy_config`, `./web/dist`, `./Caddyfile` |
| `app` | build `./app` | 3000 | não | — |
| `worker` | build `./app` (cmd worker) | — | não | — |
| `postgres` | `postgres:16` | 5432 | não | `pg_data`, `./infra/postgres/init` |
| `redis` | `redis:7-alpine` (AOF ligado) | 6379 | não | `redis_data` |
| `evolution` | `evoapicloud/evolution-api:v2.3.7` | 8080 | não | `evolution_instances` |

- app e worker usam a mesma imagem (`escala-app:latest`, build de `./app`); app roda `node dist/server.js` (porta 3000), worker `node dist/worker.js`.
- Healthcheck do app: `fetch('http://localhost:3000/api/health')` via `node -e` (imagem slim, sem curl).
- Healthcheck do worker: o worker grava `/tmp/worker-heartbeat` a cada ciclo; o compose marca **unhealthy** se o mtime do arquivo passar de 180 s (`start_period` 90 s). Ciclo travado não grava, então o container fica unhealthy.
- O app só confia no proxy do **salto imediato** vindo de rede privada/loopback (o Caddy na rede Docker) para o `X-Forwarded-For`; valores forjados pelo cliente são ignorados (`app/src/lib/proxy.ts`). O token do webhook é mascarado (`***`) nos logs (`app/src/lib/log.ts`).
- O `caddy` **não** depende do app (sobe mesmo sem a API; `/api/*` responde 502 até o app existir).
- A base `escala` é criada via `POSTGRES_DB`; a base `evolution` pelo script `infra/postgres/init/01-criar-base-evolution.sh`, que **só roda com o volume `pg_data` vazio**. Postgres com `TZ`/`PGTZ` = `America/Sao_Paulo`.
- **Roles do Postgres (nenhum serviço usa superusuário):**
  - `escala_app` é dona da base `escala` (usada por app, worker e migrations do Prisma).
  - `evolution_app` é dona da base `evolution` e do schema `evolution_api` (usada pela Evolution API).
  - `POSTGRES_USER` (superusuário) serve só para backup, restore e administração.
  - Nenhuma role acessa a base da outra (`REVOKE ALL ... FROM PUBLIC` nas duas bases).
  - **Volume novo:** as roles são criadas por `infra/postgres/init/02-criar-roles.sh` (lê `APP_DB_PASSWORD` e `EVOLUTION_DB_PASSWORD`, que o serviço `postgres` recebe só para isso).
  - **Volume existente:** rode `./scripts/db-roles.sh` (cria/atualiza as roles e transfere a posse dos objetos já criados). O `deploy.sh` já chama o script a cada deploy.
- **Redis:** exige senha (`--requirepass "$REDIS_PASSWORD"`); o healthcheck usa `REDISCLI_AUTH`; roda como usuário `redis` (o comando passa pelo `docker-entrypoint.sh`, que faz a troca de usuário). A senha não aparece no `ps`.
- Evolution v2.3.7 (última estável em 30/09/2026; 2.4.0 ainda em RC). Usa o schema `evolution_api` dentro da base `evolution` e aplica as próprias migrations ao iniciar.

- Todos na rede `escala_net`.
- `restart: unless-stopped` em todos.
- `healthcheck` em postgres, redis, evolution, app e worker; `depends_on` com `condition: service_healthy`.
- Versões de imagem **fixadas** (sem `latest`) para evitar quebra em atualização.
- Logs com rotação (`logging: json-file, max-size 10m, max-file 3`).

## Caddyfile

Domínio vem da variável `DOMAIN` (`{$DOMAIN}`), passada ao container do caddy. Além do modelo abaixo, o arquivo real adiciona cabeçalhos de segurança (HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`), compressão zstd/gzip e log de acesso em stdout. Ver a CSP e o bloqueio do webhook abaixo.

**Atenção ao editar o `Caddyfile`:** editar com `sed -i` troca o inode do arquivo e o bind mount do container continua vendo a versão antiga. Depois de qualquer alteração rode `docker compose restart caddy`.

```
{$DOMAIN} {
    encode zstd gzip
    handle /api/* {
        reverse_proxy app:3000
    }
    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }
}
```

Trechos adicionais do arquivo real:

```
Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"

# antes do handle /api/*
@webhooks path /api/webhooks /api/webhooks/*
handle @webhooks {
    respond 404
}
```

O webhook da Evolution é chamado pela rede interna (`http://app:3000/api/webhooks/...`), não passa pelo Caddy: `/api/webhooks*` responde **404 para a internet**. A CSP não tem script inline (build Vite); `style-src 'unsafe-inline'` existe porque o FullCalendar injeta `<style>`, e `img-src data:` é para o QR Code.

## Variáveis de ambiente (`.env`)

Modelo em `.env.example` (sem valores reais); o `.env` real é gerado na instalação com senhas aleatórias.

| Variável | Uso |
|---|---|
| `TZ` | `America/Sao_Paulo` |
| `DOMAIN` | `hotspotcontabo.forumtelecom.com.br` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | superusuário do Postgres — só backup/restore/admin (nenhum serviço usa) |
| `APP_DB_PASSWORD` | senha da role `escala_app` (mín. 24 caracteres `[A-Za-z0-9]`) |
| `EVOLUTION_DB_PASSWORD` | senha da role `evolution_app` (mín. 24 caracteres `[A-Za-z0-9]`) |
| `APP_DB_URL` | `postgresql://escala_app:<APP_DB_PASSWORD>@postgres:5432/escala?schema=public` |
| `REDIS_PASSWORD` | senha do Redis (`requirepass`); usada pela Evolution |
| `JWT_SECRET` | assinatura da sessão |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin inicial (seed). **Não** vão para app/worker: o `deploy.sh` lê do `.env` e repassa só ao container do seed |
| `EVOLUTION_API_KEY` | `AUTHENTICATION_API_KEY` da Evolution; o app usa no header `apikey` |
| `EVOLUTION_URL` | `http://evolution:8080` |
| `EVOLUTION_INSTANCE` | nome da instância (`escala`) |
| `WEBHOOK_TOKEN` | token secreto no caminho do webhook |

Variáveis específicas da Evolution (no bloco do serviço):
`SERVER_URL=http://evolution:8080`, `AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}`, `DATABASE_PROVIDER=postgresql`, `DATABASE_CONNECTION_URI=postgresql://evolution_app:…@postgres:5432/evolution?schema=evolution_api`, `DATABASE_CONNECTION_CLIENT_NAME=escala_evolution`, `CACHE_REDIS_ENABLED=true`, `CACHE_REDIS_URI=redis://:<REDIS_PASSWORD>@redis:6379/1`, `CACHE_LOCAL_ENABLED=false`, `DEL_INSTANCE=false`.
`CORS_ORIGIN` fica `"*"` **de propósito**: a Evolution v2.3.7 responde 500 "Not allowed by CORS" a qualquer requisição sem header `Origin` quando a lista não contém `"*"` (o fetch do app e o healthcheck não enviam `Origin`). Não há risco extra: a Evolution não é exposta (só rede interna, protegida por `apikey`) e CORS só vale para navegador.
Extras: `TELEMETRY_ENABLED=false`, `LANGUAGE=pt-BR`, `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false`, `LOG_LEVEL=ERROR,WARN,INFO`, `CONFIG_SESSION_PHONE_CLIENT=Escala RH`, `DATABASE_SAVE_DATA_HISTORIC=false`, `DATABASE_SAVE_DATA_LABELS=false` e todas as integrações não usadas desligadas (RabbitMQ, SQS, Kafka, Pusher, WebSocket, S3, Typebot, Chatwoot, OpenAI, Dify, webhook global). `CONFIG_SESSION_PHONE_VERSION` não é necessário (a versão do WhatsApp Web é obtida automaticamente).

Variáveis passadas a **app** e **worker**: `DATABASE_URL` (= `APP_DB_URL`), `JWT_SECRET`, `EVOLUTION_URL=http://evolution:8080`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WEBHOOK_TOKEN`, `TZ=America/Sao_Paulo`, `DOMAIN`, `NODE_ENV=production`. `ADMIN_EMAIL`/`ADMIN_PASSWORD` não são passadas (só o seed usa).

Senhas geradas só com `[A-Za-z0-9]` (`openssl rand -hex`), pois entram em URLs de conexão.

## Backup

- `scripts/backup.sh`: `pg_dump` (como superusuário, `--no-owner --no-privileges`) das bases `escala` e `evolution` → `backups/AAAA-MM-DD_HHMM_escala.sql.gz` e `backups/AAAA-MM-DD_HHMM_evolution.sql.gz` (um arquivo por base).
- Cron diário às 03:00; retenção de **14 dias**.
- Recomendado (futuro): cópia para fora do servidor.

## Recursos estimados

| Serviço | RAM aproximada |
|---|---|
| Postgres | 150–300 MB |
| Evolution | 300–600 MB |
| Redis | < 50 MB |
| app + worker | 150–250 MB |
| Caddy | < 50 MB |

Folga ampla nos 8 GB.
