-- ForumForge plugin platform: editable manifests, sharing, and install telemetry.

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  html TEXT DEFAULT '',
  block_types TEXT DEFAULT '[]',
  i18n TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE plugins ADD COLUMN slug TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN author TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN homepage TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN icon TEXT DEFAULT 'Puzzle';
ALTER TABLE plugins ADD COLUMN type TEXT DEFAULT 'system';
ALTER TABLE plugins ADD COLUMN css TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN js TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN head_html TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN config_schema TEXT DEFAULT '{}';
ALTER TABLE plugins ADD COLUMN permissions TEXT DEFAULT '[]';
ALTER TABLE plugins ADD COLUMN tags TEXT DEFAULT '[]';
ALTER TABLE plugins ADD COLUMN source_url TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN share_token TEXT DEFAULT '';
ALTER TABLE plugins ADD COLUMN share_notify INTEGER DEFAULT 1;

UPDATE plugins SET slug = id WHERE slug IS NULL OR slug = '';

CREATE TABLE IF NOT EXISTS plugin_share_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  plugin_slug TEXT NOT NULL,
  token TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'install',
  source_url TEXT NOT NULL DEFAULT '',
  installer_origin TEXT NOT NULL DEFAULT '',
  installer_user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plugin_share_events_token ON plugin_share_events(token, created_at);
CREATE INDEX IF NOT EXISTS idx_plugin_share_events_plugin ON plugin_share_events(plugin_id, created_at);
