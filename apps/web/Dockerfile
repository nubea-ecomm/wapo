FROM node:22-alpine AS build
WORKDIR /src
RUN npm install --global pnpm@11.5.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY scripts/copy-docs-assets.mjs scripts/copy-docs-assets.mjs
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
COPY apps/web apps/web
COPY packages/sdk packages/sdk
RUN pnpm --filter @nubea-ecomm/wapo-sdk build && pnpm --filter @wapo/web build
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
