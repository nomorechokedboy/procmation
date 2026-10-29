FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    musl-dev

WORKDIR /app

# Same pnpm major as CI and the lockfile
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm i --frozen-lockfile

FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build time: the only variable inlined into the bundle. Everything else is
# read when the app runs (see compose.prod.yaml).
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
# Optional: show the generic workflow tools (default: hidden)
# ARG NEXT_PUBLIC_SHOW_GENERIC_WORKFLOW_TOOLS
# ENV NEXT_PUBLIC_SHOW_GENERIC_WORKFLOW_TOOLS=${NEXT_PUBLIC_SHOW_GENERIC_WORKFLOW_TOOLS}

RUN pnpm run build

# Applies the database migrations, then exits. Build it with
# `docker build --target migrate`; it needs DATABASE_URL when it runs.
FROM base AS migrate
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
# drizzle-kit reads the schema file, which imports a few other files under lib
COPY lib ./lib
CMD ["pnpm", "db:migrate"]

FROM base AS runner

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app && \
    chown nextjs /app

WORKDIR /app

# Runtime (not baked in): DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
# INTEGRATION_ENCRYPTION_KEY, plus any optional ones. Pass them at `docker run`.
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN mkdir .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
