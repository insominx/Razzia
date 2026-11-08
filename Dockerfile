# ---- BASE ----
FROM node:25-alpine AS base
# Exact pnpm 11: the workspace relies on pnpm 11 supply-chain settings
RUN npm install -g pnpm@11.0.0

# ---- BUILDER ----
FROM base AS builder
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json ./packages/common/
COPY packages/web/package.json ./packages/web/
COPY packages/socket/package.json ./packages/socket/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ---- RUNNER ----
FROM alpine:3.23.4 AS runner

RUN apk add --no-cache nginx nodejs supervisor && \
    addgroup -g 1000 -S node && adduser -u 1000 -S -G node node && \
    mkdir -p /app/config && chown node:node /app/config

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh

COPY --from=builder /app/packages/web/dist /app/web
COPY --from=builder /app/packages/socket/dist/index.cjs /app/socket/index.cjs
COPY config/quizz /app/seed/quizz

EXPOSE 3000

# The socket.io polling handshake goes through nginx, so this checks both processes
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:3000/ws/?EIO=4&transport=polling" || exit 1

CMD ["sh", "/entrypoint.sh"]
