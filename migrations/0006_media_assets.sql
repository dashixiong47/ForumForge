CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'post',
  owner_id INTEGER,
  post_id INTEGER,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  media_type TEXT NOT NULL DEFAULT 'image',
  source TEXT NOT NULL DEFAULT 'upload',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_scope_created ON media_assets(scope, created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_post ON media_assets(post_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);
