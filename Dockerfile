FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN bun run build

FROM oven/bun:1-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["bun", "dist/main.js"]
