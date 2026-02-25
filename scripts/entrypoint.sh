#!/bin/sh
# Limpiar sesión de WhatsApp al iniciar para forzar nuevo QR
echo "🧹 Limpiando sesión de WhatsApp..."
rm -rf /data/auth/*
mkdir -p /data/auth

exec bun run src/index.ts
