FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/mock-fulfillment/package.json packages/mock-fulfillment/
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
COPY packages/shared/ packages/shared/
COPY packages/mock-fulfillment/ packages/mock-fulfillment/
RUN pnpm --filter @onx-kit/shared build && pnpm --filter @onx-kit/mock-fulfillment build
EXPOSE 3003
CMD ["node", "packages/mock-fulfillment/dist/index.js"]
