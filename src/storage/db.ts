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
  INSERT OR IGNORE INTO downloads (url, platform, group_name, file_path, file_size, gdrive_id)
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

// Filas por archivo (url contiene "#"); las filas sin "#" solo marcan el link como descargado
export interface DownloadRow {
  id: number;
  post_url: string; // link original (sin el "#archivo")
  platform: string;
  group_name: string;
  file_path: string;
  gdrive_id: string | null;
  downloaded_at: string;
  part: number; // posición dentro del carrusel (1..parts)
  parts: number;
}

// Todos los archivos de un grupo (o de todos), del más nuevo al más viejo; `search` filtra por link o ruta
export function listDownloads(group: string | null, search: string | null): DownloadRow[] {
  return getDb()
    .prepare(`
  SELECT * FROM (
    SELECT id, substr(url, 1, instr(url, '#') - 1) AS post_url, platform, group_name, file_path, gdrive_id, downloaded_at,
      ROW_NUMBER() OVER (PARTITION BY substr(url, 1, instr(url, '#') - 1) ORDER BY id) AS part,
      COUNT(*) OVER (PARTITION BY substr(url, 1, instr(url, '#') - 1)) AS parts
    FROM downloads WHERE url LIKE '%#%'
  )
  WHERE (?1 IS NULL OR group_name = ?1) AND (?2 IS NULL OR post_url LIKE '%' || ?2 || '%' OR file_path LIKE '%' || ?2 || '%')
  ORDER BY id DESC
`)
    .all(group, search) as DownloadRow[];
}
