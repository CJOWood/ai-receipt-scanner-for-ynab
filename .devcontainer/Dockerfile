FROM oven/bun:1
WORKDIR /usr/src/app

# Install Git (for both Alpine and Debian/Ubuntu)
RUN if command -v apk > /dev/null; then apk update && apk add git; else apt-get update && apt-get install -y git; fi

# Optionally install other dev tools here

# Set Bun in PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Set default user (optional, for VS Code compatibility)
USER root