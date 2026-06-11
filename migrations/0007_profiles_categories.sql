ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN experience INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN last_checkin_date TEXT;

ALTER TABLE categories ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN hero_title TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN hero_description TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN updated_at TIMESTAMP DEFAULT '';
UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = '';
