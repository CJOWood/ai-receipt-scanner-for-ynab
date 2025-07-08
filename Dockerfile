FROM oven/bun:latest
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Copy source code
COPY . .

# Install dependencies
RUN bun install

# Build for single origin
RUN bun run build:single

EXPOSE 3000
CMD ["bun", "run", "start:single"]
