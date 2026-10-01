# Sistema de Escala RH — imagem da API e do worker (mesmo código).
# API:    node dist/server.js   | Worker: node dist/worker.js
# Seed:   node dist/seed.js     | Migrations: npx prisma migrate deploy

# ---------- build ----------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    TZ=America/Sao_Paulo \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# prisma (CLI) é dependency: `npx prisma migrate deploy` funciona no container
RUN npm ci --omit=dev && npm cache clean --force && rm -rf /root/.cache /tmp/*
# client gerado no estágio de build
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
# /tmp gravável pelo usuário node (heartbeat do worker: /tmp/worker-heartbeat)
RUN mkdir -p /tmp && chmod 1777 /tmp
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
