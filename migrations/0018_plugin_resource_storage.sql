ALTER TABLE plugin_resources ADD COLUMN payload_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plugin_resources ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'd1';
ALTER TABLE plugin_resources ADD COLUMN storage_key TEXT NOT NULL DEFAULT '';

