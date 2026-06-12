FROM node:22-slim AS base

# 使用阿里云 Debian 镜像，加速国内 VPS 下载
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    echo "APT mirror switched"

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json server/
COPY client/package.json client/
# BuildKit cache mount: pnpm store 持久化到 VPS 磁盘，跨构建复用
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store --frozen-lockfile --ignore-scripts
RUN --mount=type=cache,target=/pnpm-store pnpm rebuild --store-dir /pnpm-store @prisma/client prisma @prisma/engines @nestjs/core
COPY server/ server/
ENV DATABASE_URL=file:/tmp/prisma-build.db
RUN pnpm --filter server exec prisma generate
RUN pnpm --filter server build

FROM base AS prod
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json server/
COPY client/package.json client/
# 与 build 阶段共享同一个 cache mount，首次构建后几乎零下载
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store --frozen-lockfile --prod --filter server --ignore-scripts
RUN --mount=type=cache,target=/pnpm-store pnpm rebuild --store-dir /pnpm-store prisma @prisma/client @prisma/engines
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
RUN cd server && npx prisma generate

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/dev.db"
EXPOSE 3000
WORKDIR /app/server
CMD sh -c "npx prisma migrate deploy && node dist/main"
