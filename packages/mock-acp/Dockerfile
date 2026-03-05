FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/mock-acp/package.json packages/mock-acp/
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
COPY packages/shared/ packages/shared/
COPY packages/mock-acp/ packages/mock-acp/
RUN pnpm --filter @onx-kit/shared build && pnpm --filter @onx-kit/mock-acp build
EXPOSE 3001
CMD ["node", "packages/mock-acp/dist/index.js"]
