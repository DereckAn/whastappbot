# WhatsApp Media Downloader Bot

Escucha grupos de WhatsApp, detecta links de **Twitter/X** e **Instagram**, descarga el
contenido con `gallery-dl`, lo guarda en `data/downloads/{grupo}/{plataforma}/` y
(opcional) lo sube a Google Drive. Registra cada descarga en SQLite para no repetir.

- **Runtime:** Bun (TypeScript)
- **WhatsApp:** Baileys
- **Descargas:** gallery-dl (yt-dlp solo para exportar cookies del navegador)
- **DB:** SQLite (`bun:sqlite`)
- **Deploy:** Docker

---

## Puesta en marcha

Hay dos formas de correrlo. Elige según tu sistema:

| | Local (sin Docker) | Docker |
|---|---|---|
| Requisitos | Bun + `bun run tools` | Solo Docker |
| gallery-dl / yt-dlp | binarios en `./bin` | instalados en la imagen (pip) |
| Cookies del navegador (opción ③) | ✅ funciona | ❌ no hay navegador en el contenedor |
| Recomendado para | Linux x64 / Windows | macOS, Linux ARM, o servidor |

> gallery-dl solo publica binario standalone para **Linux x64** y **Windows**. En
> **macOS** y **Linux ARM** usa Docker (o `pip install gallery-dl`).

### Opción A — Local

```bash
git clone <repo> && cd whastappbot
bun install
bun run tools        # descarga yt-dlp + gallery-dl a ./bin (sin Python)
cp .env.example .env # edita MONITORED_GROUPS con tus grupos reales
bun run cookies      # configura cookies (ver abajo)
bun run dev          # escanea el QR y ¡listo!
```

### Opción B — Docker

```bash
cp .env.example .env                    # edita MONITORED_GROUPS
docker compose run --rm whatsapp-bot    # primera vez: escanear QR
docker compose up -d                    # luego, en segundo plano
docker compose logs -f
```

En Docker las cookies se obtienen del repo privado (opción ① del menú), que corre
automáticamente al arrancar cuando no hay terminal interactiva.

---

## Cookies (Instagram y Twitter/X)

Ambas plataformas exigen sesión iniciada. Al correr `bun run dev` en una terminal
interactiva (o `bun run cookies` en cualquier momento) aparece este menú:

```
=== Configuración de cookies ===
  1) Descargar del repo privado
  2) Buscar archivo en el equipo
  3) Exportar de un navegador a .txt (ya con sesión iniciada)
  0) Continuar con lo que ya hay
```

| Opción | Qué hace | Requisitos | Funciona en Docker |
|---|---|---|---|
| ① Repo privado | Baja los `.txt` desde `DereckAn/da-proj-secrets` con `gh` | `gh` autenticado | ✅ |
| ② Archivo local | Selector de archivo (zenity) o ruta escrita; copia a `data/` | GUI para el selector | ⚠️ solo ruta escrita |
| ③ Navegador → .txt | Exporta cookies del navegador a `data/*.txt` con yt-dlp | yt-dlp + navegador con sesión | ❌ |

**Notas importantes:**

- Las tres opciones dejan las cookies como archivos `.txt` en `data/` y apuntan la
  config de gallery-dl (`~/.config/gallery-dl/config.json`) hacia ellos.
- **Opción ③:** cierra el navegador durante la exportación (Brave/Chrome bloquean su
  base de cookies mientras están abiertos). Una vez exportado el `.txt`, puedes volver
  a abrir el navegador — las descargas usan el archivo, no el navegador vivo.
- El menú solo se muestra con terminal interactiva. En Docker en segundo plano (sin
  TTY) usa la opción ① automáticamente, así el contenedor no se queda esperando input.

---

## Comandos

```bash
bun run dev       # arranca el bot (muestra menú de cookies si es interactivo)
bun run tools     # descarga binarios yt-dlp + gallery-dl a ./bin
bun run cookies   # menú de cookies (fuerza reconfiguración)
bun run secrets   # solo descarga credenciales del repo privado (force)

# self-check del parser de dominios de cookies
bun run src/scripts/setup-cookies.ts --selftest
```

---

## Variables de entorno (`.env`)

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `WHATSAPP_AUTH_DIR` | ✅ | — | Carpeta de sesión de WhatsApp |
| `DOWNLOADS_DIR` | | `./downloads` | Carpeta de descargas |
| `GALLERY_DL_PATH` | | `gallery-dl` | Ejecutable; se prefiere `./bin/gallery-dl` si existe |
| `MONITORED_GROUPS` | | vacío | Nombres de grupo separados por coma |
| `GDRIVE_ENABLED` | | `false` | Activa subida a Google Drive |
| `GDRIVE_OAUTH_CREDENTIALS_PATH` | | — | Credenciales OAuth |
| `GDRIVE_OAUTH_TOKEN_PATH` | | — | Token OAuth |
| `GDRIVE_ROOT_FOLDER_ID` | | — | Carpeta raíz en Drive |
| `LOG_LEVEL` | | `info` | Nivel de log |

> Bun autocarga `.env`. En Docker las variables entran por `env_file` en
> `docker-compose.yml` (no se usa `dotenv`).

---

## Estructura

```
src/
├── index.ts                  # arranque: dirs → cookies/secretos → DB → WhatsApp
├── config.ts                 # config validada con Zod
├── tools.ts                  # resuelve binarios: ./bin primero, luego PATH
├── whatsapp/
│   ├── client.ts             # conexión Baileys + reconexión (adjunta el handler)
│   └── handler.ts            # procesa mensajes, cachea nombres de grupo
├── downloader/
│   ├── parser.ts             # detecta plataforma por URL
│   ├── gallery.ts            # wrapper de gallery-dl
│   └── index.ts              # orquesta la descarga
├── storage/
│   ├── db.ts                 # SQLite (bun:sqlite), dedup por URL
│   └── gdrive.ts             # subida a Drive (OAuth, cliente cacheado)
└── scripts/
    ├── fetch-secrets.ts      # baja cookies/credenciales del repo privado (gh)
    ├── setup-cookies.ts      # menú de cookies
    └── install-tools.ts      # descarga binarios a ./bin
bin/                          # binarios descargados (gitignored)
data/                         # sesión, descargas, DB, credenciales (gitignored)
```

---

## Cómo funciona una descarga

1. Llega un mensaje a un grupo → `handler.ts` obtiene el nombre del grupo (cacheado)
   y lo compara con `MONITORED_GROUPS`.
2. Extrae URLs y filtra Twitter/X e Instagram.
3. `isUrlDownloaded()` evita duplicados (SQLite).
4. `processUrl()` → `gallery-dl url -D data/downloads/{grupo}/{plataforma} --range 1-100`.
   Devuelve la lista de archivos (carruseles = varios archivos).
5. Si `GDRIVE_ENABLED=true`, sube cada archivo a `Drive/{grupo}/{plataforma}/`.
6. Guarda cada archivo y la URL principal en SQLite.

---

## Notas de mantenimiento / decisiones

- **gallery-dl dejó de publicar binarios en v1.32+.** `install-tools.ts` busca por la
  API de GitHub la release más reciente que aún trae el binario (hoy v1.31.10).
  yt-dlp sí usa siempre `latest`.
- **`resolveTool()`** hace que el proyecto prefiera `./bin/` y caiga al `PATH` si no
  existe. Por eso el mismo código funciona local (binarios) y en Docker (pip).
- **Reconexión de WhatsApp:** el handler se adjunta dentro de `startWhatsApp()`, así
  cada socket nuevo (incluidas reconexiones) queda con handler.
- **Google Drive** autentica una sola vez (cliente cacheado), no por archivo.
- **Cookies del repo:** la carpeta en el repo se llama `coockies` (con doble o); las
  rutas en `fetch-secrets.ts` lo reflejan.
- La app se ejecuta con `bun run src/index.ts` (sin paso de compilación); el código
  muerto en TS no afecta el arranque.

---

## Seguridad

- Nunca se commitea `data/`, `.env` ni `bin/` (están en `.gitignore`).
- Al exportar cookies del navegador (opción ③) el jar completo (todas tus cookies) se
  borra tras separar solo Instagram/Twitter.
- Úsalo solo en grupos privados; WhatsApp puede banear números por uso masivo.
