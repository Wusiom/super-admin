FROM node:22-slim AS base

# 使用阿里云 Debian 镜像，加速国内 VPS 下载
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    echo "APT mirror switched"

RUN apt-get update && apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm rebuild @prisma/client prisma @prisma/engines @nestjs/core
COPY server/ server/
ENV DATABASE_URL=file:/tmp/prisma-build.db
RUN pnpm --filter server exec prisma generate
RUN pnpm --filter server build
RUN pnpm --filter server exec playwright install chromium --with-deps

FROM base AS prod
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile --prod --filter server --ignore-scripts
RUN pnpm rebuild prisma @prisma/client @prisma/engines
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
RUN cd server && npx prisma generate
COPY --from=build /root/.cache/ms-playwright /root/.cache/ms-playwright

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/dev.db"
EXPOSE 3000
WORKDIR /app/server
CMD sh -c "npx prisma migrate deploy && node dist/main"
