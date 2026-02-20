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