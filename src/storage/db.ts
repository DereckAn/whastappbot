import { Database } from "bun:sqlite";
import path from "path";
import { config } from "../config";
import { mkdirSync } from "fs";

const dbPath = path.join(config.downloadsDir, "../db/downloads.db");
let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    // Crear directorio si no existe
    mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
  }
  return db;
}

export function initDatabase() {
  const database = getDb();
  database.run(`
  CREATE TABLE IF NOT EXISTS downloads (
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
`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_url ON downloads (url);`);
}

export default getDb;

export function isUrlDownloaded(url: string): boolean {
  const database = getDb();
  const stmt = database.prepare("SELECT id FROM downloads WHERE url = ?");
  const result = stmt.get(url);
  return !!result; // Devuelve true si se encontró un resultado, false si no
}

export function saveDownload(data: {
  url: string;
  platform: string;
  group_name: string;
  file_path: string;
  file_size?: number;
  gdrive_id?: string;
}): void {
  const database = getDb();
  const stmt = database.prepare(`
  INSERT INTO downloads (url, platform, group_name, file_path, file_size, gdrive_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);
  stmt.run(
    data.url,
    data.platform,
    data.group_name,
    data.file_path,
    data.file_size ?? null,
    data.gdrive_id ?? null,
  );
}


export function closeDatabase() {
  if (db) {
    db.close();
  }
}