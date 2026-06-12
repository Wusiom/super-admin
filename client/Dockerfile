FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY client/package.json client/
COPY server/package.json server/
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store --frozen-lockfile
COPY client/ client/
RUN pnpm --filter client build

FROM nginx:alpine
RUN apk add --no-cache curl
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
