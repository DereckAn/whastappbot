# WhatsApp Media Downloader Bot

## Project Overview

This is a WhatsApp bot that listens to group messages, detects links from Twitter/X and Instagram, automatically downloads multimedia content (photos and videos), organizes it in folders by group name, and uploads to Google Drive. The entire project is containerized in Docker for complete portability.

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **WhatsApp Client**: Baileys (`@whiskeysockets/baileys`)
- **Media Downloader**: yt-dlp (CLI)
- **Google Drive**: googleapis (npm)
- **Database**: SQLite (via `better-sqlite3`)
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
│   │   ├── ytdlp.ts          # yt-dlp wrapper
│   │   └── index.ts          # Download orchestrator
│   ├── storage/
│   │   ├── organizer.ts      # Create folders and move files
│   │   ├── gdrive.ts         # Upload to Google Drive
│   │   └── db.ts             # SQLite - download log
│   └── utils/
│       ├── logger.ts         # Logging with pino
│       └── sanitize.ts       # Clean filenames
├── data/                     # Gitignored - persistent data
│   ├── auth/                 # WhatsApp session
│   ├── downloads/            # Media organized by group
│   ├── db/                   # SQLite
│   └── credentials/          # Google service account
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

#### yt-dlp Configuration

Always use these flags:
- `-o '%(title)s.%(ext)s'` - Output template
- `--write-info-json` - Save metadata
- `--write-thumbnail` - Download thumbnails
- `--no-playlist` - Don't download playlists
- `--restrict-filenames` - Safe filenames
- `--max-filesize 100M` - Size limit

For Instagram, you may need: `--cookies-from-browser chrome` or `--cookies ./cookies.txt`

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

- Use service account authentication
- Mirror local folder structure in Drive: root/{group_name}/{platform}/
- Store `gdrive_id` in SQLite after successful upload
- Make Google Drive upload optional via `GDRIVE_ENABLED` env var

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
- `WHATSAPP_AUTH_DIR` - Path to WhatsApp session storage
- `DOWNLOADS_DIR` - Path to download directory
- `YT_DLP_PATH` - Path to yt-dlp executable
- `MONITORED_GROUPS` - Comma-separated list of group names to monitor

Optional:
- `GDRIVE_ENABLED` - Enable/disable Google Drive uploads (default: false)
- `GDRIVE_CREDENTIALS_PATH` - Path to service account JSON
- `GDRIVE_ROOT_FOLDER_ID` - Google Drive folder ID
- `LOG_LEVEL` - Logging level (default: info)

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
npx tsx src/index.ts

# Build
bun run build

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
- Prefer `tsx` for development execution
- When working with file paths, always use absolute paths or paths relative to project root
- The user wants this to run on Mac locally first, then deploy to Docker
- Spanish terms in group names and messages are expected
- Focus on robustness: the bot should recover from errors gracefully
- The primary monitored group is called "arte"
