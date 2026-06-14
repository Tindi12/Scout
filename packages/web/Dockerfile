FROM ghcr.io/pnpm/pnpm:11 AS base

# Set Node.js version
RUN pnpm runtime set node 22 -g

COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# No telemetry screw u vercel
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-deps /app/node_modules /app/node_modules

WORKDIR /app/packages/web

# Copy Next.js assets
COPY --from=build --chown=node:node /app/packages/web/public ./public

# Create .next directory and set ownership
RUN mkdir .next
RUN chown node:node .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=build --chown=node:node /app/packages/web/.next/standalone ./
COPY --from=build --chown=node:node /app/packages/web/.next/static ./.next/static

# If you want to persist the fetch cache generated during the build so that
# cached responses are available immediately on startup, uncomment this line:
# COPY --from=build --chown=node:node /app/packages/web/.next/cache ./.next/cache

# Expose port 3000 to allow HTTP traffic
EXPOSE 3000

CMD [ "node", "server.js" ]
