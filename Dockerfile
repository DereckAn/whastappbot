FROM oven/bun:latest

# Install gallery-dl, python, and dependencies (Debian usa apt-get, no apk)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install gallery-dl via pip
RUN pip3 install --break-system-packages gallery-dl

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies with optimizations
ENV BUN_INSTALL_CACHE_DIR=/tmp/.bun-install
RUN bun install --frozen-lockfile --backend=hardlink --no-cache

# Copy source code
COPY . .

# Setup gallery-dl config
COPY scripts/setup-gallery-dl-docker.sh /usr/local/bin/setup-gallery-dl
RUN chmod +x /usr/local/bin/setup-gallery-dl && /usr/local/bin/setup-gallery-dl

# Create data directories
RUN mkdir -p /data/auth /data/downloads /data/db /data/credentials

# Environment variables
ENV NODE_ENV=production \
    WHATSAPP_AUTH_DIR=/data/auth \
    DOWNLOADS_DIR=/data/downloads \
    GALLERY_DL_PATH=gallery-dl

VOLUME ["/data"]

CMD ["bun", "run", "src/index.ts"]
