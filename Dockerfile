FROM --platform=linux/amd64 node:20-alpine AS base

# ----------------------------------------------------------
#                   DEPENDENCY MANAGEMENT
# ----------------------------------------------------------
# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# ----------------------------------------------------------
#                       BUILD
# ----------------------------------------------------------
# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED 1

RUN yarn build

# ----------------------------------------------------------
#                      PRODUCTION
# ----------------------------------------------------------
# Production image, copy all the files and run next
FROM base AS runner

# Set up environment
ENV PORT 3000
ENV NODE_ENV production

# Users configuration
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED 1

# Configure application directory
WORKDIR /app
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Adjust permissions for next cache
RUN mkdir -p /app/.next/cache/fetch-cache && chmod -R 755 /app/.next/cache/fetch-cache

# Switch user
USER nextjs

# Runtime
EXPOSE ${PORT}
CMD ["node", "server.js"]