FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/mock-ucp/package.json packages/mock-ucp/
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
COPY packages/shared/ packages/shared/
COPY packages/mock-ucp/ packages/mock-ucp/
RUN pnpm --filter @onx-kit/shared build && pnpm --filter @onx-kit/mock-ucp build
EXPOSE 3002
CMD ["node", "packages/mock-ucp/dist/index.js"]
