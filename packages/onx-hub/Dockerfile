FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/onx-hub/package.json packages/onx-hub/
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
COPY packages/shared/ packages/shared/
COPY packages/onx-hub/ packages/onx-hub/
RUN pnpm --filter @onx-kit/shared build && pnpm --filter @onx-kit/onx-hub build
EXPOSE 3000
CMD ["node", "packages/onx-hub/dist/index.js"]
