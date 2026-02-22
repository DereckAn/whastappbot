# WhatsApp Media Downloader Bot

## Project Overview

This is a WhatsApp bot that listens to group messages, detects links from Twitter/X and Instagram, automatically downloads multimedia content (photos and videos), organizes it in folders by group name, and uploads to Google Drive. The entire project is containerized in Docker for complete portability.

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **WhatsApp Client**: Baileys (`@whiskeysockets/baileys`)
- **Media Downloader**: gallery-dl (CLI) - switched from yt-dlp for better Instagram/Twitter support
- **Google Drive**: googleapis (npm) with OAuth authentication
- **Database**: SQLite (via `bun:sqlite` native)
- **Containerization**: Docker + Docker Compose

## Project Structure

```
whatsapp-media-bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Centralized configuration
│   ├── whatsapp/
│   │   ├── client.ts         # Baileys connection + session handling
│   │   └── handler.ts        # Message processing
│   ├── downloader/
│   │   ├── parser.ts         # Detect platform from URL
│   │   ├── gallery.ts        # gallery-dl wrapper (returns array of file paths)
│   │   └── index.ts          # Download orchestrator
│   ├── storage/
│   │   ├── gdrive.ts         # Upload to Google Drive (OAuth)
│   │   └── db.ts             # SQLite - download log (bun:sqlite)
│   └── scripts/
│       └── generate-oauth-token.ts  # Generate Google OAuth token
├── data/                     # Gitignored - persistent data
│   ├── auth/                 # WhatsApp session
│   ├── downloads/            # Media organized by group/platform
│   ├── db/                   # SQLite database
│   ├── credentials/          # OAuth credentials & tokens
│   │   ├── oauth-credentials.json  # OAuth client credentials
│   │   └── oauth-token.json        # Generated OAuth token
│   ├── www.instagram.com_cookies.txt  # Instagram cookies
│   └── x.com_cookies.txt              # Twitter/X cookies
├── .env
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Development Guidelines

### Code Style

- Use TypeScript with strict mode enabled
- Prefer async/await over promises
- Use descriptive variable names in Spanish when it makes sense for domain terms (e.g., "grupo", "arte")
- Keep functions small and focused on a single responsibility
- Use Zod for configuration validation

### Architecture Principles

1. **Separation of Concerns**: Each module has a clear, single responsibility
   - `whatsapp/` - Only handles WhatsApp connection and message events
   - `downloader/` - Only handles media downloading logic
   - `storage/` - Only handles file organization and cloud uploads

2. **Error Handling**:
   - Always wrap yt-dlp calls in try-catch blocks
   - Implement exponential backoff for network operations
   - Log errors with context using pino
   - Don't crash the bot on individual download failures

3. **Deduplication**: Always check SQLite before downloading to avoid duplicate downloads

4. **File Organization**:
   - Structure: `data/downloads/{group_name}/{platform}/{date}_{user}_{id}.{ext}`
   - Sanitize all filenames to be filesystem-safe

### Key Implementation Details

#### WhatsApp (Baileys)

- Use `useMultiFileAuthState` for session persistence
- Listen to `messages.upsert` event for new messages
- Filter messages by monitored groups (from `MONITORED_GROUPS` env var)
- Extract text from various message types (conversation, extendedTextMessage, etc.)
- Implement reconnection logic with exponential backoff

#### URL Detection

Detect platforms using these patterns:
```typescript
const PLATFORM_PATTERNS = {
  twitter: /https?:\/\/(twitter\.com|x\.com|t\.co)\/\S+/i,
  instagram: /https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/\S+/i,
};
```

#### gallery-dl Configuration

**Why gallery-dl instead of yt-dlp:**
- Better support for Instagram carousels (downloads all images)
- More reliable with Twitter/X
- Simpler cookie handling

**Required flags:**
- `-D {outputDir}` - Destination directory
- `--range 1-100` - Limit number of downloads

**Cookie configuration** (required for Instagram & Twitter):
- Located at `~/.config/gallery-dl/config.json`
- Uses separate cookie files for each platform:
  - `data/www.instagram.com_cookies.txt`
  - `data/x.com_cookies.txt`
- Export cookies using "Get cookies.txt LOCALLY" browser extension
- **Important:** Cookies are sensitive - never commit to git

**Returns:** Array of file paths (handles multiple files from carousels)

#### SQLite Schema

```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  group_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  gdrive_id TEXT,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_at DATETIME
);
CREATE UNIQUE INDEX idx_url ON downloads(url);
```

#### Google Drive

**Authentication:** OAuth (not Service Account due to storage quota limitations)

**Setup process:**
1. Create OAuth credentials in Google Cloud Console
2. Run `bun run scripts/generate-oauth-token.ts` to generate refresh token
3. Add yourself as test user in OAuth consent screen
4. Token stored in `data/credentials/oauth-token.json`

**Configuration:**
- Mirror local folder structure: `root/{group_name}/{platform}/`
- Store `gdrive_id` in SQLite after successful upload
- Optional via `GDRIVE_ENABLED` env var
- Handles multiple files (uploads each file from carousels)

### Testing Checklist

Before considering a feature complete, verify:
- Twitter links with video download correctly
- Twitter links with images download correctly
- Twitter links with multiple images download all
- Instagram posts download correctly
- Instagram reels download correctly
- Duplicate links are skipped
- Messages without links are ignored
- Unsupported links are ignored
- Google Drive upload works (when enabled)
- Bot reconnects after WiFi disconnection
- Bot reconnects after script restart
- QR code scanning works in Docker

### Docker Deployment

- Use `node:20-slim` as base image
- Install yt-dlp from official releases
- Use volumes for persistent data: `/data`
- For first-time setup, run interactively: `docker compose run --rm whatsapp-bot`
- After QR scan, run in background: `docker compose up -d`

### Environment Variables

Required:
- `WHATSAPP_AUTH_DIR` - Path to WhatsApp session storage (e.g., `./data/auth`)
- `DOWNLOADS_DIR` - Path to download directory (e.g., `./data/downloads`)
- `GALLERY_DL_PATH` - Path to gallery-dl executable (usually `gallery-dl`)
- `MONITORED_GROUPS` - Comma-separated list of group names (e.g., `"Poses,Tacones,Lenceria"`)

Optional (Google Drive):
- `GDRIVE_ENABLED` - Enable/disable Google Drive uploads (default: `false`)
- `GDRIVE_OAUTH_CREDENTIALS_PATH` - Path to OAuth credentials JSON (e.g., `./data/credentials/oauth-credentials.json`)
- `GDRIVE_OAUTH_TOKEN_PATH` - Path to OAuth token JSON (e.g., `./data/credentials/oauth-token.json`)
- `GDRIVE_ROOT_FOLDER_ID` - Google Drive folder ID from URL
- `LOG_LEVEL` - Logging level (default: `info`)

### Security Considerations

1. **WhatsApp Ban Risk**: Use only in private groups, don't send mass messages, don't use new phone numbers
2. **Credentials**: Never commit `data/` directory - always in .gitignore
3. **Service Account**: Ensure Google service account JSON is secured and not committed
4. **File Size Limits**: Always enforce max file size to prevent disk exhaustion
5. **Input Validation**: Sanitize all user inputs (group names, URLs) before using in filesystem operations

### Development Phases

1. **Phase 1-2**: WhatsApp connection + message handling (Week 1)
2. **Phase 3-4**: Download engine + file organization (Week 2)
3. **Phase 4**: SQLite tracking + deduplication (Week 3)
4. **Phase 5**: Google Drive integration (Week 4)
5. **Phase 8**: Dockerization (Week 5)
6. **Phase 9**: Deployment (Week 6)

### Common Commands

```bash
# Development
bun install
bun run dev                            # Run bot in development

# Setup gallery-dl cookies
brew install gallery-dl
# Export cookies from Brave/Chrome using "Get cookies.txt LOCALLY" extension
# Save to data/www.instagram.com_cookies.txt and data/x.com_cookies.txt
# Config: ~/.config/gallery-dl/config.json

# Setup Google Drive OAuth
bun run scripts/generate-oauth-token.ts  # Generate OAuth token (first time only)

# Docker
docker compose build
docker compose run --rm whatsapp-bot  # First time (QR scan)
docker compose up -d                   # Background
docker compose logs -f                 # View logs
```

### Future Enhancements (Post-MVP)

- Support more platforms (TikTok, YouTube, Reddit)
- Download queue with retry logic
- Web dashboard for statistics
- Bot confirmations in group chat
- Rate limiting for concurrent downloads
- Health check endpoint
- Auto-update yt-dlp within container
- Thumbnail gallery generation
- Deduplication by file hash

### Notes for Claude

- Always use Bun as the package manager (`bun add`, not `npm install`)
- Database uses `bun:sqlite` (native, not better-sqlite3)
- gallery-dl is used instead of yt-dlp (better Instagram/Twitter support)
- Google Drive uses OAuth, not Service Account (storage quota issue)
- Cookie files required for Instagram and Twitter (export with browser extension)
- When working with file paths, always use absolute paths or paths relative to project root
- Spanish terms in group names and messages are expected
- Focus on robustness: the bot should recover from errors gracefully
- Multiple files from carousels: downloader returns array of paths, handler uploads each to Drive
- Current monitored groups: Poses, Tacones, Lenceria, Cuerpo
