FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder

COPY . .
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV OPENAI_API_KEY=build-placeholder

RUN npm run db:generate
RUN npm run build

FROM node:24-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 omnininja \
  && useradd --system --uid 1001 --gid omnininja omnininja

COPY --from=builder --chown=omnininja:omnininja /app/.next/standalone ./

USER omnininja
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
