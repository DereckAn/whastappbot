FROM oven/bun:latest

# Install gallery-dl, python, and dependencies (Debian usa apt-get, no apk)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install gallery-dl and yt-dlp via pip (yt-dlp: exportar cookies del navegador)
RUN pip3 install --break-system-packages gallery-dl yt-dlp

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

# Entrypoint: limpia sesión de WhatsApp y arranca el bot
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
