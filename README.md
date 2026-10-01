# Sistema de Escala RH

Sistema web para o RH montar a escala de trabalho dos funcionários e avisar cada pessoa pelo **WhatsApp** antes do turno.
O funcionário não acessa o painel: ele recebe lembretes e consulta a própria escala conversando com um bot no WhatsApp.

## Funcionalidades

- Cadastro de setores, turnos, funcionários e padrões de escala
- Calendário de escala (FullCalendar) com geração automática e detecção de conflitos
- Ausências (férias, folgas, afastamentos)
- Lembretes automáticos por WhatsApp com regras configuráveis (nunca envia duas vezes)
- Bot de consulta: o funcionário pergunta pelo WhatsApp e recebe a própria escala
- Perfis **admin** e **gestor** (o gestor só vê os setores vinculados a ele)
- Painel 100% responsivo (funciona no celular)

## Stack

| Camada | Tecnologia |
|---|---|
| Backend + worker | Node.js 22, TypeScript, Fastify, Prisma |
| Banco | PostgreSQL 16 |
| Painel | React + Vite + FullCalendar |
| WhatsApp | Evolution API v2 + Redis (só na rede interna do Docker) |
| Proxy/HTTPS | Caddy (certificado Let's Encrypt automático) |
| Orquestração | Docker Compose |

```
Internet ──► Caddy (80/443) ──► painel (estático)
                    └──► /api ──► app (Fastify) ──► PostgreSQL
                                   worker (lembretes) ─┘
                          app/worker ◄──► Evolution API ◄──► WhatsApp
```

---

# Instalação passo a passo

Guia para subir o sistema do zero num servidor novo. Copie e cole os comandos **na ordem**.

## 0. O que você precisa antes

| Item | Detalhe |
|---|---|
| Servidor (VPS) | **Ubuntu 24.04**, mínimo 2 vCPU / 4 GB RAM / 30 GB de disco, com acesso `root` por SSH |
| Domínio | Um (sub)domínio com registro **DNS tipo A** apontando para o IP do servidor (ex.: `escala.seudominio.com.br → 203.0.113.10`) |
| WhatsApp | Um número de WhatsApp **exclusivo** para o sistema (de preferência WhatsApp Business), num celular à mão para ler o QR Code |

> Confira o DNS antes de seguir: `ping escala.seudominio.com.br` deve responder com o IP do seu servidor.
> Sem isso o Caddy não consegue emitir o certificado HTTPS.

Acesse o servidor:

```bash
ssh root@IP_DO_SEU_SERVIDOR
```

## 1. Atualizar o sistema e ajustar o fuso horário

```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg openssl ufw cron
timedatectl set-timezone America/Sao_Paulo
timedatectl            # deve mostrar "Time zone: America/Sao_Paulo"
```

## 2. Instalar o Git e o GitHub CLI

```bash
apt install -y git gh
git --version
gh --version
```

Configure seu nome e e-mail (aparecem nos commits que você fizer):

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

> **Opcional — login no GitHub.** Só é necessário se você for fazer *fork* ou enviar alterações (`git push`).
> Para apenas clonar este repositório público, pode pular.
>
> ```bash
> gh auth login          # GitHub.com → HTTPS → Login with a web browser (copie o código e abra o link)
> gh auth setup-git      # faz o git usar esse login no push
> gh auth status         # confere
> ```

## 3. Clonar o repositório

O sistema espera ficar em `/var/www/escala`:

```bash
mkdir -p /var/www
git clone https://github.com/clfigueiredo/escala-rh.git /var/www/escala
cd /var/www/escala
ls
```

> Fez um *fork*? Troque a URL pela do seu fork: `gh repo fork clfigueiredo/escala-rh --clone` (e mova a pasta para `/var/www/escala`).

## 4. Instalar o Docker

Repositório oficial da Docker:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Limite o tamanho dos logs dos containers e teste:

```bash
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
systemctl restart docker
docker --version
docker compose version
docker run --rm hello-world     # deve imprimir "Hello from Docker!"
```

## 5. Instalar o Node.js 22

O Node do servidor é usado só para compilar o painel (o backend roda dentro do Docker).

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v      # v22.x
npm -v
```

## 6. Firewall

Libere o SSH **antes** de ativar, senão você perde o acesso:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
ufw status verbose
```

> Só o Caddy publica portas. A Evolution API (8080), o Postgres e o Redis ficam **só na rede interna** do Docker — nunca publique essas portas.

## 7. Criar o arquivo `.env` (senhas e configurações)

Edite as **duas primeiras linhas** com o seu domínio e o e-mail do administrador, depois cole o bloco inteiro.
Ele copia o modelo e gera todas as senhas aleatórias:

```bash
cd /var/www/escala
DOMINIO=escala.seudominio.com.br        # <-- seu domínio
EMAIL_ADMIN=voce@seudominio.com.br      # <-- e-mail de login do admin no painel

cp .env.example .env && chmod 600 .env
APP_DB=$(openssl rand -hex 24)
sed -i \
  -e "s|^DOMAIN=.*|DOMAIN=$DOMINIO|" \
  -e "s|^POSTGRES_USER=.*|POSTGRES_USER=postgres|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$APP_DB|" \
  -e "s|<APP_DB_PASSWORD>|$APP_DB|" \
  -e "s|^EVOLUTION_DB_PASSWORD=.*|EVOLUTION_DB_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
  -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$EMAIL_ADMIN|" \
  -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -hex 8)|" \
  -e "s|^EVOLUTION_API_KEY=.*|EVOLUTION_API_KEY=$(openssl rand -hex 32)|" \
  -e "s|^WEBHOOK_TOKEN=.*|WEBHOOK_TOKEN=$(openssl rand -hex 32)|" \
  .env
```

Confira que nenhuma variável ficou vazia (o comando abaixo **não deve imprimir nada**):

```bash
grep -vE '^\s*(#|$)' .env | grep -E '=$'
```

> O `.env` guarda todas as senhas. Ele **nunca** vai para o Git (está no `.gitignore`) e não deve ser copiado para fora do servidor.
> Detalhes de cada variável em [`docs/03-infraestrutura.md`](docs/03-infraestrutura.md).

## 8. Subir o sistema

```bash
cd /var/www/escala
./scripts/deploy.sh
```

O script faz tudo: compila o painel, gera a imagem do backend, sobe Postgres/Redis/Evolution/Caddy, cria os usuários do banco,
aplica as migrations, cria o admin inicial e sobe o app e o worker. A primeira vez demora alguns minutos.

No final, todos os serviços devem estar `running` / `healthy`:

```bash
docker compose ps
```

## 9. Primeiro acesso ao painel

1. Veja o login do admin (só no servidor):
   ```bash
   grep -E '^ADMIN_(EMAIL|PASSWORD)=' .env
   ```
2. Abra `https://SEU_DOMINIO` no navegador e entre com esse e-mail e senha.
3. **Troque a senha**: menu do usuário (canto superior direito) › **Trocar senha**.

> Mudar `ADMIN_PASSWORD` no `.env` depois do primeiro deploy **não** muda a senha. Use sempre "Trocar senha" no painel.

## 10. Conectar o WhatsApp

1. No painel, abra **WhatsApp › Conexão** e clique em **Conectar**.
2. No celular do número do sistema: WhatsApp › **Aparelhos conectados** › **Conectar um aparelho** e leia o QR Code.
3. O status muda para **Conectado**. Pronto: lembretes e bot já funcionam.

Depois cadastre setores, turnos e funcionários (telefone com DDD) e monte a escala.
O passo a passo do uso do painel está no [Guia do RH](docs/09-guia-rh.md).

## 11. Backup automático (diário às 03:00)

```bash
cat > /etc/cron.d/escala-backup <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root /var/www/escala/scripts/backup.sh >> /var/log/escala-backup.log 2>&1
CRON
./scripts/backup.sh     # teste manual
ls -lh backups/
```

Os dumps ficam em `backups/` por 14 dias. Para restaurar: `./scripts/restore.sh backups/<arquivo>.sql.gz`
(ver [`docs/07-operacao.md`](docs/07-operacao.md)).

## 12. (Recomendado) Proteger o SSH

```bash
apt install -y fail2ban
systemctl enable --now fail2ban
fail2ban-client status sshd
```

---

# Dia a dia

```bash
cd /var/www/escala
docker compose ps                         # status dos serviços
docker compose logs -f app worker         # logs da aplicação
docker compose logs -f evolution          # logs do WhatsApp
docker compose restart worker             # reinicia o worker (seguro: não duplica lembretes)
./scripts/backup.sh                       # backup manual
```

**Atualizar para a versão mais nova do repositório:**

```bash
cd /var/www/escala
git pull
./scripts/deploy.sh        # faz backup antes de aplicar as migrations
```

**Rodar os testes do backend:**

```bash
cd /var/www/escala/app
npm ci
npm test
```

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| Site sem HTTPS / não abre | O DNS aponta para o IP do servidor? Portas 80 e 443 liberadas no `ufw` e no painel da hospedagem? `docker compose logs caddy` |
| Painel abre mas dá erro 502 | `docker compose ps app` deve estar `healthy`; `docker compose logs app` mostra variável do `.env` inválida no início |
| `deploy.sh`: "Arquivo .env não encontrado" | Faça o passo 7 dentro de `/var/www/escala` |
| Lembrete não chegou | Tela **Mensagens** (filtro Status = Falhou); WhatsApp conectado? Funcionário ativo e com telefone? `docker compose logs worker` |
| Bot não responde | WhatsApp conectado? (clicar em **Conectar** também reconfigura o webhook); o telefone cadastrado bate com o número que mandou? |
| Esqueci a senha do admin | Procedimento em [`docs/07-operacao.md`](docs/07-operacao.md#acesso-ao-painel) |

Mais casos em [`docs/07-operacao.md`](docs/07-operacao.md#troubleshooting).

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/01-visao-geral.md`](docs/01-visao-geral.md) | Escopo, funcionalidades e perfis |
| [`docs/02-arquitetura.md`](docs/02-arquitetura.md) | Componentes e fluxos (lembrete, bot, geração de escala) |
| [`docs/03-infraestrutura.md`](docs/03-infraestrutura.md) | Docker Compose, Caddy, firewall, variáveis de ambiente |
| [`docs/04-banco-de-dados.md`](docs/04-banco-de-dados.md) | Modelo de dados |
| [`docs/05-whatsapp.md`](docs/05-whatsapp.md) | Evolution API, lembretes, bot, normalização de telefone |
| [`docs/06-fases.md`](docs/06-fases.md) | Roadmap |
| [`docs/07-operacao.md`](docs/07-operacao.md) | Deploy, logs, backup/restore, troubleshooting |
| [`docs/08-api.md`](docs/08-api.md) | Contrato da API |
| [`docs/09-guia-rh.md`](docs/09-guia-rh.md) | Guia de uso do painel para o RH (não técnico) |
| [`docs/10-roteiro-tutorial.md`](docs/10-roteiro-tutorial.md) | Roteiro para gerar o tutorial completo com o Claude Code |
| [`app/README.md`](app/README.md) | Convenções do backend para desenvolvedores |

## Estrutura de pastas

```
escala-rh/
├── app/                  # API + worker (Node/TypeScript/Prisma)
├── web/                  # painel (React/Vite)
├── docs/                 # documentação
├── infra/postgres/init/  # scripts de inicialização do Postgres
├── scripts/              # deploy.sh, backup.sh, restore.sh, db-roles.sh
├── docker-compose.yml
├── Caddyfile
└── .env.example          # modelo do .env
```
