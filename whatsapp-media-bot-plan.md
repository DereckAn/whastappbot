# WhatsApp Media Downloader Bot — Plan Completo

## Resumen del Proyecto

Un bot que escucha mensajes en grupos de WhatsApp, detecta links de Twitter/X e Instagram, descarga automáticamente el contenido multimedia (fotos y videos), lo organiza en carpetas por nombre de grupo, y lo sube a Google Drive. Todo containerizado en Docker para portabilidad total.

---

## Stack Tecnológico Recomendado

| Componente | Tecnología | Justificación |
|---|---|---|
| **Lenguaje principal** | **Bun (TypeScript)** | Mejor ecosistema para WhatsApp bots, async nativo, tipado fuerte |
| **Cliente WhatsApp** | **Baileys** (`@whiskeysockets/baileys`) | Ligero, no requiere navegador (a diferencia de whatsapp-web.js que necesita Puppeteer), bajo consumo de RAM, ideal para Docker y Raspberry Pi |
| **Descarga de media** | **yt-dlp** (CLI) | Soporta Twitter/X, Instagram, TikTok, YouTube y 1000+ sitios. Se actualiza constantemente |
| **Google Drive** | **googleapis** (npm) | SDK oficial de Google, bien documentado |
| **Base de datos local** | **SQLite** (via `better-sqlite3`) | Sin servidor, un solo archivo, perfecto para tracking de descargas |
| **Containerización** | **Docker + Docker Compose** | Multi-plataforma, fácil de desplegar |
| **Gestor de procesos** | **tsx** (dev) / **node** (prod) | TypeScript directo sin compilar en dev |

### ¿Por qué Baileys sobre whatsapp-web.js?

- **Sin navegador**: whatsapp-web.js usa Puppeteer (Chrome headless) → ~500MB+ RAM. Baileys usa WebSocket directo → ~50MB RAM
- **Ideal para Docker/RPi**: Sin dependencias pesadas de Chromium
- **Activamente mantenido**: `@whiskeysockets/baileys` es el fork más activo
- **Riesgo de ban**: Similar en ambos (son no oficiales). Para mitigar: usa tu cuenta personal en un grupo donde solo estés tú, no hagas spam, no automatices mensajes masivos

### ¿Por qué NO la API oficial de WhatsApp Business?

- Requiere una cuenta de WhatsApp Business verificada
- Cuesta dinero por mensaje (conversation-based pricing)
- Requiere un webhook público (necesitarías un dominio + HTTPS)
- Overkill para uso personal con un grupo privado

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│                   Docker Container                   │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────┐      │
│  │   Baileys     │───▶│   Message Handler     │      │
│  │  (WhatsApp)   │    │  (Link Detection)     │      │
│  └──────────────┘    └──────────┬────────────┘      │
│                                  │                    │
│                        ┌─────────▼─────────┐         │
│                        │   Link Parser     │         │
│                        │ (URL → platform)  │         │
│                        └─────────┬─────────┘         │
│                                  │                    │
│                        ┌─────────▼─────────┐         │
│                        │   yt-dlp          │         │
│                        │  (Downloader)     │         │
│                        └─────────┬─────────┘         │
│                                  │                    │
│                     ┌────────────┼────────────┐      │
│                     ▼                         ▼      │
│           ┌─────────────────┐     ┌──────────────┐   │
│           │  File Organizer │     │ Google Drive  │   │
│           │  (Local FS)     │     │   Uploader    │   │
│           └─────────────────┘     └──────────────┘   │
│                                                      │
│           ┌─────────────────┐                        │
│           │    SQLite DB    │                        │
│           │ (Download Log)  │                        │
│           └─────────────────┘                        │
│                                                      │
│  Volumes:                                            │
│    /data/auth     → Sesión de WhatsApp               │
│    /data/downloads → Media descargada                │
│    /data/db       → SQLite database                  │
│    /data/credentials → Google service account         │
└─────────────────────────────────────────────────────┘
```

---

## Estructura del Proyecto

```
whatsapp-media-bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuración centralizada
│   ├── whatsapp/
│   │   ├── client.ts         # Conexión Baileys + manejo de sesión
│   │   └── handler.ts        # Procesamiento de mensajes
│   ├── downloader/
│   │   ├── parser.ts         # Detectar plataforma desde URL
│   │   ├── ytdlp.ts          # Wrapper de yt-dlp
│   │   └── index.ts          # Orquestador de descargas
│   ├── storage/
│   │   ├── organizer.ts      # Crear carpetas y mover archivos
│   │   ├── gdrive.ts         # Upload a Google Drive
│   │   └── db.ts             # SQLite - log de descargas
│   └── utils/
│       ├── logger.ts         # Logging con pino
│       └── sanitize.ts       # Limpiar nombres de archivo
├── data/                     # Gitignored - datos persistentes
│   ├── auth/                 # Sesión de WhatsApp
│   ├── downloads/            # Media organizada por grupo
│   └── db/                   # SQLite
├── .env                      # Variables de entorno
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Plan de Implementación Paso a Paso

### FASE 1: Setup Inicial (Mac local)

#### Paso 1.1 — Inicializar proyecto

```bash
mkdir whatsapp-media-bot && cd whatsapp-media-bot
bun init -y
bun install typescript tsx @types/node -D
bunx tsc --init
```

`tsconfig.json` recomendado:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

#### Paso 1.2 — Instalar dependencias

```bash
# WhatsApp
bun add @whiskeysockets/baileys @hapi/boom pino

# Descarga
brew add yt-dlp          # En Mac
# yt-dlp se instala en el sistema, se llama desde Node via child_process

# Google Drive
bun add googleapis

# Base de datos
bun add better-sqlite3
bun add @types/better-sqlite3 -D

# Utilidades
bun add dotenv zod       # Config + validación
```

#### Paso 1.3 — Archivo de configuración (.env)

```env
# WhatsApp
WHATSAPP_AUTH_DIR=./data/auth

# Descargas
DOWNLOADS_DIR=./data/downloads
YT_DLP_PATH=yt-dlp

# Google Drive
GDRIVE_ENABLED=false
GDRIVE_CREDENTIALS_PATH=./data/credentials/service-account.json
GDRIVE_ROOT_FOLDER_ID=tu_folder_id_aqui

# Grupos a monitorear (dejar vacío = todos los grupos)
# Formato: nombre_grupo1,nombre_grupo2
MONITORED_GROUPS=arte

# Logging
LOG_LEVEL=info
```

---

### FASE 2: Cliente de WhatsApp con Baileys

#### Paso 2.1 — Conexión y autenticación (QR Code)

Archivo: `src/whatsapp/client.ts`

Funcionalidad:
- Conectar a WhatsApp via QR code (primera vez)
- Guardar credenciales en disco para reconexión automática
- Manejar desconexiones y reconexión con backoff exponencial
- Emitir eventos cuando llegan mensajes nuevos

Puntos clave de Baileys:
```typescript
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WAMessage
} from '@whiskeysockets/baileys';

// useMultiFileAuthState guarda la sesión en archivos
// La primera vez muestra QR en terminal
// Después reconecta automáticamente
```

#### Paso 2.2 — Handler de mensajes

Archivo: `src/whatsapp/handler.ts`

Lógica:
1. Escuchar evento `messages.upsert`
2. Filtrar: solo mensajes de grupos monitoreados
3. Extraer texto del mensaje (puede estar en `message.conversation`, `message.extendedTextMessage.text`, etc.)
4. Buscar URLs con regex: `/https?:\/\/[^\s]+/g`
5. Filtrar URLs que sean de plataformas soportadas
6. Enviar a la cola de descarga

Regex para detectar plataformas:
```typescript
const PLATFORM_PATTERNS = {
  twitter: /https?:\/\/(twitter\.com|x\.com|t\.co)\/\S+/i,
  instagram: /https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/\S+/i,
};
```

---

### FASE 3: Motor de Descarga

#### Paso 3.1 — Parser de URLs

Archivo: `src/downloader/parser.ts`

- Recibe una URL
- Identifica la plataforma (twitter, instagram, desconocido)
- Resuelve URLs cortas (t.co → twitter.com) si es necesario
- Retorna metadata: `{ platform, originalUrl, resolvedUrl }`

#### Paso 3.2 — Wrapper de yt-dlp

Archivo: `src/downloader/ytdlp.ts`

Ejecutar yt-dlp como proceso hijo:
```typescript
import { execFile } from 'child_process/promises';

async function download(url: string, outputDir: string): Promise<DownloadResult> {
  const args = [
    url,
    '-o', `${outputDir}/%(title)s.%(ext)s`,  // Template de nombre
    '--write-info-json',                       // Metadata JSON
    '--write-thumbnail',                       // Thumbnail
    '--no-playlist',                           // No descargar playlists
    '--restrict-filenames',                    // Nombres seguros
    '--max-filesize', '100M',                  // Límite de tamaño
  ];

  const { stdout, stderr } = await execFile('yt-dlp', args);
  // Parsear stdout para obtener el path del archivo descargado
}
```

**Notas importantes sobre yt-dlp:**
- Para **Twitter/X**: Funciona directo, no necesita cookies usualmente
- Para **Instagram**: Puede requerir cookies de sesión para contenido privado o stories. Se pasan con `--cookies-from-browser` o un archivo de cookies
- Actualizar frecuentemente: `yt-dlp -U` (los sitios cambian sus APIs seguido)

#### Paso 3.3 — Cookies de Instagram (si es necesario)

Si Instagram requiere autenticación:
```bash
# Opción 1: Exportar cookies del navegador
yt-dlp --cookies-from-browser chrome URL

# Opción 2: Archivo de cookies (mejor para Docker)
yt-dlp --cookies ./cookies.txt URL
```

Para Docker, exporta tus cookies a un archivo Netscape y móntalo como volumen.

---

### FASE 4: Organización de Archivos

#### Paso 4.1 — File Organizer

Archivo: `src/storage/organizer.ts`

Estructura de carpetas:
```
data/downloads/
├── arte/                          # Nombre del grupo
│   ├── twitter/                   # Plataforma
│   │   ├── 2025-02-12_usuario_tweet-id.mp4
│   │   └── 2025-02-12_usuario_tweet-id.jpg
│   └── instagram/
│       ├── 2025-02-12_usuario_post-id.mp4
│       └── 2025-02-12_usuario_post-id.jpg
└── memes/                         # Otro grupo
    └── ...
```

Convención de nombres: `{fecha}_{usuario}_{id}.{ext}`

#### Paso 4.2 — Base de datos SQLite

Archivo: `src/storage/db.ts`

Schema:
```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,          -- URL original (evitar duplicados)
  platform TEXT NOT NULL,            -- twitter | instagram
  group_name TEXT NOT NULL,          -- Nombre del grupo de WhatsApp
  file_path TEXT NOT NULL,           -- Path local del archivo
  file_size INTEGER,                 -- Bytes
  gdrive_id TEXT,                    -- ID en Google Drive (null si no se subió)
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_at DATETIME               -- Cuándo se subió a Drive
);

CREATE UNIQUE INDEX idx_url ON downloads(url);
```

Esto te permite:
- Evitar descargar duplicados
- Saber qué falta por subir a Drive
- Ver estadísticas de descargas

---

### FASE 5: Integración con Google Drive

#### Paso 5.1 — Crear proyecto en Google Cloud Console

1. Ve a https://console.cloud.google.com
2. Crea un proyecto nuevo (ej: "whatsapp-media-bot")
3. Habilita la **Google Drive API**
4. Crea una **Service Account**:
   - IAM & Admin → Service Accounts → Create
   - Descarga el JSON de credenciales
   - Guárdalo en `data/credentials/service-account.json`
5. En Google Drive:
   - Crea una carpeta raíz (ej: "WhatsApp Media")
   - Comparte esa carpeta con el email de la service account (algo como `bot@proyecto.iam.gserviceaccount.com`)
   - Copia el ID de la carpeta (está en la URL)

#### Paso 5.2 — Uploader

Archivo: `src/storage/gdrive.ts`

Funcionalidad:
- Autenticarse con service account
- Crear carpetas espejo de la estructura local (grupo → plataforma)
- Subir archivos
- Guardar el `gdrive_id` en SQLite
- Reintentos con backoff exponencial para errores de red

```typescript
import { google } from 'googleapis';

// Autenticación
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GDRIVE_CREDENTIALS_PATH,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

// Crear carpeta
async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
  });
  return res.data.id!;
}

// Subir archivo
async function uploadFile(filePath: string, folderId: string) {
  const res = await drive.files.create({
    requestBody: {
      name: path.basename(filePath),
      parents: [folderId],
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  });
  return res.data.id!;
}
```

---

### FASE 6: Flujo Completo Integrado

#### Flujo de un mensaje:

```
1. Recibes mensaje en grupo "arte":
   "Mira este video: https://x.com/user/status/123456"

2. Handler detecta URL de Twitter/X

3. Parser resuelve la URL y confirma plataforma

4. Checa en SQLite si ya se descargó → si sí, skip

5. yt-dlp descarga el video a una carpeta temporal

6. Organizer mueve el archivo a:
   data/downloads/arte/twitter/2025-02-12_user_123456.mp4

7. SQLite registra la descarga

8. Si GDRIVE_ENABLED=true:
   - Crea carpetas arte/twitter en Drive si no existen
   - Sube el archivo
   - Actualiza SQLite con gdrive_id

9. (Opcional) Envía mensaje de confirmación al grupo:
   "✅ Descargado: video de @user (15.2 MB)"
```

---

### FASE 7: Testing en Mac

#### Paso 7.1 — Primera ejecución

```bash
# Desde la raíz del proyecto
npx tsx src/index.ts
```

1. Aparece QR code en terminal
2. Escanea con WhatsApp (Linked Devices → Link a Device)
3. Envía un link de Twitter al grupo "arte"
4. Verifica que se descargó en `data/downloads/arte/twitter/`

#### Paso 7.2 — Checklist de pruebas

- [ ] Link de Twitter con video → descarga video
- [ ] Link de Twitter con imagen → descarga imagen
- [ ] Link de Twitter con múltiples imágenes → descarga todas
- [ ] Link de Instagram post → descarga imagen/video
- [ ] Link de Instagram reel → descarga video
- [ ] Link duplicado → no descarga de nuevo
- [ ] Mensaje sin link → se ignora
- [ ] Link de sitio no soportado → se ignora
- [ ] Google Drive upload funciona
- [ ] Reconexión después de desconexión de WiFi
- [ ] Reconexión después de reiniciar el script

---

### FASE 8: Dockerización

#### Paso 8.1 — Dockerfile

```dockerfile
FROM node:20-slim

# Instalar yt-dlp y dependencias
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias de Node
COPY package*.json ./
RUN npm ci --production

# Copiar código
COPY dist/ ./dist/

# Volúmenes para datos persistentes
VOLUME ["/data"]

# Variables de entorno por defecto
ENV WHATSAPP_AUTH_DIR=/data/auth \
    DOWNLOADS_DIR=/data/downloads \
    GDRIVE_CREDENTIALS_PATH=/data/credentials/service-account.json \
    LOG_LEVEL=info

CMD ["node", "dist/index.js"]
```

#### Paso 8.2 — docker-compose.yml

```yaml
version: "3.8"

services:
  whatsapp-bot:
    build: .
    container_name: whatsapp-media-bot
    restart: unless-stopped
    volumes:
      - ./data:/data              # Datos persistentes
    env_file:
      - .env
    # Para ver el QR code la primera vez:
    # docker compose run --rm whatsapp-bot
    # Después: docker compose up -d
```

#### Paso 8.3 — Primera ejecución en Docker

```bash
# 1. Compilar TypeScript
npm run build    # tsc

# 2. Construir imagen
docker compose build

# 3. Primera vez (interactivo para escanear QR):
docker compose run --rm whatsapp-bot

# 4. Escanea el QR, verifica que funcione

# 5. Después, ejecutar en background:
docker compose up -d

# Ver logs:
docker compose logs -f
```

---

### FASE 9: Deploy en diferentes plataformas

#### AWS EC2

```bash
# En tu EC2 (Amazon Linux 2 / Ubuntu)
sudo yum install docker docker-compose  # o apt-get
git clone tu-repo
cd whatsapp-media-bot
# Copiar tu data/auth/ (sesión) y data/credentials/ al servidor
docker compose up -d
```

**Tip**: Para la primera autenticación en un servidor sin pantalla, puedes:
1. Autenticarte localmente primero
2. Copiar la carpeta `data/auth/` al servidor
3. O usar un servicio de QR remoto (imprimir el QR en los logs)

#### Raspberry Pi

```bash
# Mismo proceso, Docker funciona en ARM
# Dockerfile usa node:20-slim que tiene imagen ARM
docker compose up -d
```

**Nota**: yt-dlp funciona en ARM. Solo asegúrate de que la imagen Docker sea multi-arch o usa `--platform linux/arm64`.

#### Windows

```bash
# Instalar Docker Desktop para Windows
# Mismo docker-compose.yml funciona
docker compose up -d
```

---

## Mejoras Futuras (Post-MVP)

Una vez que el MVP funcione, considera agregar:

1. **Más plataformas**: TikTok, YouTube, Reddit (yt-dlp ya las soporta, solo agrega regex)
2. **Cola de descarga con reintentos**: Usa una queue en memoria o BullMQ con Redis si necesitas persistencia
3. **Web dashboard**: Un frontend simple (Svelte?) para ver estadísticas y descargas recientes
4. **Notificaciones**: El bot responde en el grupo con confirmación de descarga
5. **Rate limiting**: Para no sobrecargar yt-dlp con muchos links simultáneos
6. **Health checks**: Endpoint HTTP para monitoreo (`/health`)
7. **Auto-update de yt-dlp**: Cron job dentro del container para mantenerlo actualizado
8. **Thumbnail gallery**: Generar una galería HTML local con previews
9. **Deduplicación por hash**: Además de URL, comparar hash del archivo para evitar duplicados reales

---

## Orden de Desarrollo Sugerido

| Semana | Tarea |
|--------|-------|
| **1** | Setup proyecto + Baileys conectando + detectar links en grupo |
| **2** | yt-dlp descargando Twitter + Instagram + organización de archivos |
| **3** | SQLite tracking + deduplicación + manejo de errores robusto |
| **4** | Google Drive integration |
| **5** | Dockerización + testing en Docker local |
| **6** | Deploy en EC2 o Raspberry Pi + documentación |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Ban de WhatsApp por usar Baileys | Media | Usa solo en grupos privados tuyos, no envíes mensajes masivos, no uses números nuevos |
| Instagram bloquea yt-dlp | Alta | Mantener cookies actualizadas, actualizar yt-dlp frecuentemente |
| Twitter/X cambia su API | Media | yt-dlp se actualiza rápido, pero puede haber downtime |
| Sesión de WhatsApp expira | Baja | Baileys maneja reconexión automática; si falla, re-escanear QR |
| Espacio en disco | Baja | Monitorear con alertas, limpiar archivos viejos periódicamente |
