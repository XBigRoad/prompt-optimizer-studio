# Docker-first self-hosted runtime for Prompt Optimizer Studio.
# - Base image: node:22.22-bookworm-slim
# - Workdir: /app
# - Persistent SQLite path: /app/data/prompt-optimizer.db
# - Health endpoint: /api/health on port 3000

FROM node:22.22-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22.22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV PROMPT_OPTIMIZER_DB_PATH=/app/data/prompt-optimizer.db
COPY --from=builder /app /app
RUN npm prune --omit=dev && mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["npm", "run", "start"]
