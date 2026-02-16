FROM node:22-slim AS base

RUN npm install -g @anthropic-ai/claude-code

# ─── Build UI ────────────────────────────────────────────────
FROM base AS ui-builder
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install
COPY ui/ ./
RUN npm run build

# ─── Build Backend ───────────────────────────────────────────
FROM base AS backend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

# ─── Production ─────────────────────────────────────────────
FROM base AS production
WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=backend-builder /app/dist ./dist
COPY --from=ui-builder /app/ui/dist ./dist/ui

# Create dirs for repo clones and temp files
RUN mkdir -p repos tmp

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
