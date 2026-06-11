CREATE TABLE IF NOT EXISTS user_progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  points_delta INTEGER NOT NULL DEFAULT 0,
  experience_delta INTEGER NOT NULL DEFAULT 0,
  post_id INTEGER,
  comment_id INTEGER,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_logs_user_created
  ON user_progress_logs(user_id, created_at);

INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_checkin_points', '10');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_checkin_experience', '20');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_post_points', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_post_experience', '20');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_reply_points', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_reply_experience', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_post_replied_points', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reward_post_replied_experience', '3');
