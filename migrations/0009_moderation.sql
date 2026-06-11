ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'approved';
ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'approved';

UPDATE posts SET status = 'approved' WHERE status IS NULL OR status = '';
UPDATE comments SET status = 'approved' WHERE status IS NULL OR status = '';

INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_posts_default', 'approved');
INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_comments_default', 'approved');
