# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
# Uses the Node 26 Current line (package.json requires >= 26.8.1; CI tracks
# the latest Current release).
FROM node:26-alpine AS build
WORKDIR /app

# Locked dependencies, including the devDependencies the TypeScript build needs.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript to /app/build (tsc emits to ./build per tsconfig.json).
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Keep only runtime dependencies for the image.
RUN npm prune --omit=dev

# ---- Runtime stage ---------------------------------------------------------
FROM node:26-alpine
# Run as an unprivileged user. SQLite and its WAL live in /app/data.
RUN addgroup -g 1001 mcp && adduser -u 1001 -G mcp -s /bin/sh -D mcp
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=build --chown=mcp:mcp /app/build ./build
COPY --chown=mcp:mcp package.json ./

RUN mkdir -p /app/data && chown mcp:mcp /app/data
USER mcp
EXPOSE 3000

# The HTTPS reverse proxy is responsible for TLS termination.
ENV MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3000 \
    DATABASE_PATH=/app/data/spotify.sqlite

CMD ["node", "build/index.js"]
