FROM oven/bun:1.1.43-debian AS build

WORKDIR /app

COPY bun.lockb .
COPY package.json .

RUN bun install --frozen-lockfile

COPY . /app

# execute the binary!
CMD ["bun", "run", "index.ts"]