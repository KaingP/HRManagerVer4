# Multi-stage Dockerfile for Hung Vuong Concert Scheduler
FROM node:22-bookworm-slim AS builder

WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY templates ./templates
COPY static ./static
COPY db ./db
COPY scripts ./scripts
COPY state.json ./state.json
COPY members-availability.xlsx ./members-availability.xlsx

# Expose server port
EXPOSE 3000

CMD ["node", "dist/server.cjs"]
