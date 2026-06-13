CREATE TABLE IF NOT EXISTS plugin_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  type TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  post_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plugin_resources_type_id ON plugin_resources (type, id);
CREATE INDEX IF NOT EXISTS idx_plugin_resources_plugin ON plugin_resources (plugin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plugin_resources_author ON plugin_resources (author_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plugin_resources_post ON plugin_resources (post_id);
