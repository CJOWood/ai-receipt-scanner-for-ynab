# Use Bun as the base image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lockb server/package.json shared/package.json client/package.json /temp/prod/
WORKDIR /temp/prod
RUN bun install --frozen-lockfile --production

# Build shared, server, and client
FROM base AS build
WORKDIR /usr/src/app
COPY --from=install /temp/prod/node_modules node_modules
COPY . .
RUN bun run build:shared && bun run build:server && bun run build:client

# Copy frontend build to server/public
RUN mkdir -p server/public && cp -r client/dist/* server/public/

# Final image
FROM oven/bun:1 AS release
WORKDIR /usr/src/app
COPY --from=build /usr/src/app .
ENV NODE_ENV=production
USER bun
ENTRYPOINT [ "bun", "run", "server/src/index.ts" ]
