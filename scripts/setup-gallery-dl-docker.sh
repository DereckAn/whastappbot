#!/bin/sh
# Setup gallery-dl configuration in Docker volume

mkdir -p /root/.config/gallery-dl

cat > /root/.config/gallery-dl/config.json << 'EOF'
{
  "extractor": {
    "instagram": {
      "cookies": "/data/www.instagram.com_cookies.txt"
    },
    "twitter": {
      "cookies": "/data/x.com_cookies.txt"
    }
  }
}
EOF

echo "✓ gallery-dl config created"
