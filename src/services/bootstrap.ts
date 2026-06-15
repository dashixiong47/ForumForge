import { ADMIN_PERMISSION_KEYS, defaultRoleRows } from '../admin/permissions';
import type { DBCount } from '../db/types';
import { BUILTIN_LANGUAGES, BUILTIN_TRANSLATIONS } from '../i18n/seed';
import { BUILTIN_PLUGINS } from '../plugins/registry';
import { DEFAULT_PROGRESS_REWARDS, PROGRESS_REWARD_KEYS, type ProgressSource } from '../gamification/progress';
import { readStringEnv } from '../core/env';
import { hashPassword } from '../core/password';
import { FORUMFORGE_ICON_DATA_URL, FORUMFORGE_ICON_FILENAME, FORUMFORGE_ICON_KEY, FORUMFORGE_ICON_SVG } from '../assets/brand';
import { CATEGORY_ICONS } from '../assets/category-icons';
import { KV_BOOTSTRAP_KEY, KV_BOOTSTRAP_TTL } from '../core/kv';
import { seedDemoContent } from "./seed-demo";

const BOOTSTRAP_VERSION = '2026-06-15.3';

let bootstrapPromise: Promise<void> | null = null;
let bootstrapReady = false;

export async function ensureBootstrap(env: Env, db: D1Database): Promise<void> {
	if (bootstrapReady) return;

	// KV fast path: skip D1 entirely when bootstrap version is already cached.
	// Cold-start cost drops from ~20ms (D1 batch) to ~2ms (KV read).
	const kv = env.CACHE;
	if (kv) {
		try {
			const kvVersion = await kv.get(KV_BOOTSTRAP_KEY);
			if (kvVersion === BOOTSTRAP_VERSION) {
				bootstrapReady = true;
				return;
			}
		} catch {
			// KV unavailable — fall through to D1 check
		}
	}

	if (!bootstrapPromise) {
		bootstrapPromise = runBootstrap(env, db)
			.then(async () => {
				bootstrapReady = true;
				if (kv) {
					await kv.put(KV_BOOTSTRAP_KEY, BOOTSTRAP_VERSION, { expirationTtl: KV_BOOTSTRAP_TTL }).catch(() => {});
				}
			})
			.catch((error) => {
				bootstrapPromise = null;
				throw error;
			});
	}
	await bootstrapPromise;
}

async function runBootstrap(env: Env, db: D1Database): Promise<void> {		const ensureBootstrapAdmin = async () => {
			const row = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first<DBCount>();
			if ((row?.count || 0) > 0) return;

			const email = readStringEnv(env, 'ADMIN_EMAIL').toLowerCase();
			const username = readStringEnv(env, 'ADMIN_USERNAME') || 'Admin';
			const password = readStringEnv(env, 'ADMIN_PASSWORD');

			if (!email || !password) {
				throw new Error('No admin account exists. Configure ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap the first administrator.');
			}
			if (password.length < 8) {
				throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
			}

			const passwordHash = await hashPassword(password);
			const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();

			if (existing?.id) {
				await db.prepare(
					'UPDATE users SET username = ?, password = ?, role = "admin", permissions = ?, verified = 1, nickname = ? WHERE id = ?'
				).bind(username, passwordHash, JSON.stringify(ADMIN_PERMISSION_KEYS), username, existing.id).run();
				return;
			}

			await db.prepare(
				'INSERT INTO users (email, username, password, role, permissions, verified, nickname) VALUES (?, ?, ?, "admin", ?, 1, ?)'
			).bind(email, username, passwordHash, JSON.stringify(ADMIN_PERMISSION_KEYS), username).run();
		};

		const ensureSchema = async () => {
			const tableColumns = async (table: string): Promise<Set<string>> => {
				try {
					const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
					return new Set(((rows.results || []) as any[]).map((row) => String(row.name)));
				} catch {
					return new Set();
				}
			};
			const pluginColumns = await tableColumns('plugins');
			const userColumns = await tableColumns('users');
			const categoryColumns = await tableColumns('categories');
			const postColumns = await tableColumns('posts');
			const commentColumns = await tableColumns('comments');
			const pluginResourceColumns = await tableColumns('plugin_resources');
			const badgeDefinitionColumns = await tableColumns('badge_definitions');
			const profileAlterStmts = [
				...[
					{ name: 'role', stmt: "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'" },
					{ name: 'verified', stmt: 'ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0' },
					{ name: 'verification_token', stmt: 'ALTER TABLE users ADD COLUMN verification_token TEXT' },
					{ name: 'totp_secret', stmt: 'ALTER TABLE users ADD COLUMN totp_secret TEXT' },
					{ name: 'totp_enabled', stmt: 'ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0' },
					{ name: 'reset_token', stmt: 'ALTER TABLE users ADD COLUMN reset_token TEXT' },
					{ name: 'reset_token_expires', stmt: 'ALTER TABLE users ADD COLUMN reset_token_expires INTEGER' },
					{ name: 'pending_email', stmt: 'ALTER TABLE users ADD COLUMN pending_email TEXT' },
					{ name: 'email_change_token', stmt: 'ALTER TABLE users ADD COLUMN email_change_token TEXT' },
					{ name: 'avatar_url', stmt: 'ALTER TABLE users ADD COLUMN avatar_url TEXT' },
					{ name: 'nickname', stmt: 'ALTER TABLE users ADD COLUMN nickname TEXT' },
					{ name: 'email_notifications', stmt: 'ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1' },
					{ name: 'show_public_posts', stmt: 'ALTER TABLE users ADD COLUMN show_public_posts INTEGER DEFAULT 1' },
					{ name: 'bio', stmt: "ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''" },
					{ name: 'points', stmt: 'ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0' },
					{ name: 'experience', stmt: 'ALTER TABLE users ADD COLUMN experience INTEGER DEFAULT 0' },
					{ name: 'level', stmt: 'ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1' },
					{ name: 'last_checkin_date', stmt: 'ALTER TABLE users ADD COLUMN last_checkin_date TEXT' },
					{ name: 'permissions', stmt: "ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'" },
					{ name: 'disabled_until', stmt: 'ALTER TABLE users ADD COLUMN disabled_until INTEGER DEFAULT 0' },
					{ name: 'disabled_reason', stmt: "ALTER TABLE users ADD COLUMN disabled_reason TEXT DEFAULT ''" },
					{ name: 'muted_until', stmt: 'ALTER TABLE users ADD COLUMN muted_until INTEGER DEFAULT 0' },
					{ name: 'muted_reason', stmt: "ALTER TABLE users ADD COLUMN muted_reason TEXT DEFAULT ''" },
					{ name: 'deleted_at', stmt: 'ALTER TABLE users ADD COLUMN deleted_at INTEGER DEFAULT 0' },
					{ name: 'deleted_by', stmt: 'ALTER TABLE users ADD COLUMN deleted_by INTEGER DEFAULT 0' },
					{ name: 'created_at', stmt: 'ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
				].filter((item) => userColumns.size && !userColumns.has(item.name)).map((item) => item.stmt),
				...[
					{ name: 'description', stmt: "ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ''" },
					{ name: 'hero_title', stmt: "ALTER TABLE categories ADD COLUMN hero_title TEXT DEFAULT ''" },
					{ name: 'hero_description', stmt: "ALTER TABLE categories ADD COLUMN hero_description TEXT DEFAULT ''" },
					{ name: 'icon_url', stmt: "ALTER TABLE categories ADD COLUMN icon_url TEXT DEFAULT ''" },
					{ name: 'enabled', stmt: 'ALTER TABLE categories ADD COLUMN enabled INTEGER DEFAULT 1' },
					{ name: 'admin_only', stmt: 'ALTER TABLE categories ADD COLUMN admin_only INTEGER DEFAULT 0' },
					{ name: 'sort_order', stmt: 'ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0' },
					{ name: 'updated_at', stmt: 'ALTER TABLE categories ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
				].filter((item) => categoryColumns.size && !categoryColumns.has(item.name)).map((item) => item.stmt),
				...[
					{ name: 'category_id', stmt: 'ALTER TABLE posts ADD COLUMN category_id INTEGER' },
					{ name: 'is_pinned', stmt: 'ALTER TABLE posts ADD COLUMN is_pinned INTEGER DEFAULT 0' },
					{ name: 'view_count', stmt: 'ALTER TABLE posts ADD COLUMN view_count INTEGER DEFAULT 0' },
					{ name: 'status', stmt: "ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'approved'" },
					{ name: 'rejection_reason', stmt: "ALTER TABLE posts ADD COLUMN rejection_reason TEXT DEFAULT ''" },
					{ name: 'is_category_pinned', stmt: 'ALTER TABLE posts ADD COLUMN is_category_pinned INTEGER DEFAULT 0' },
					{ name: 'min_view_level', stmt: 'ALTER TABLE posts ADD COLUMN min_view_level INTEGER DEFAULT 0' },
					{ name: 'min_comment_level', stmt: 'ALTER TABLE posts ADD COLUMN min_comment_level INTEGER DEFAULT 0' },
					{ name: 'deleted_at', stmt: 'ALTER TABLE posts ADD COLUMN deleted_at INTEGER DEFAULT 0' },
					{ name: 'deleted_by', stmt: 'ALTER TABLE posts ADD COLUMN deleted_by INTEGER DEFAULT 0' },
					{ name: 'created_at', stmt: 'ALTER TABLE posts ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
					{ name: 'published_at', stmt: 'ALTER TABLE posts ADD COLUMN published_at TIMESTAMP' },
				].filter((item) => postColumns.size && !postColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'status', stmt: "ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'approved'" }]
					.filter((item) => commentColumns.size && !commentColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'rejection_reason', stmt: "ALTER TABLE comments ADD COLUMN rejection_reason TEXT DEFAULT ''" }]
					.filter((item) => commentColumns.size && !commentColumns.has(item.name)).map((item) => item.stmt),
				...[
					{ name: 'parent_id', stmt: 'ALTER TABLE comments ADD COLUMN parent_id INTEGER' },
					{ name: 'deleted_at', stmt: 'ALTER TABLE comments ADD COLUMN deleted_at INTEGER DEFAULT 0' },
					{ name: 'deleted_by', stmt: 'ALTER TABLE comments ADD COLUMN deleted_by INTEGER DEFAULT 0' },
					{ name: 'created_at', stmt: 'ALTER TABLE comments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
				].filter((item) => commentColumns.size && !commentColumns.has(item.name)).map((item) => item.stmt)
			];
			const pluginAlterStmts = pluginColumns.size ? [
				{ name: 'slug', stmt: "ALTER TABLE plugins ADD COLUMN slug TEXT DEFAULT ''" },
				{ name: 'author', stmt: "ALTER TABLE plugins ADD COLUMN author TEXT DEFAULT ''" },
				{ name: 'homepage', stmt: "ALTER TABLE plugins ADD COLUMN homepage TEXT DEFAULT ''" },
				{ name: 'icon', stmt: "ALTER TABLE plugins ADD COLUMN icon TEXT DEFAULT 'Puzzle'" },
				{ name: 'type', stmt: "ALTER TABLE plugins ADD COLUMN type TEXT DEFAULT 'system'" },
				{ name: 'css', stmt: "ALTER TABLE plugins ADD COLUMN css TEXT DEFAULT ''" },
				{ name: 'html', stmt: "ALTER TABLE plugins ADD COLUMN html TEXT DEFAULT ''" },
				{ name: 'js', stmt: "ALTER TABLE plugins ADD COLUMN js TEXT DEFAULT ''" },
				{ name: 'head_html', stmt: "ALTER TABLE plugins ADD COLUMN head_html TEXT DEFAULT ''" },
				{ name: 'block_types', stmt: "ALTER TABLE plugins ADD COLUMN block_types TEXT DEFAULT '[]'" },
				{ name: 'resource_types', stmt: "ALTER TABLE plugins ADD COLUMN resource_types TEXT DEFAULT '[]'" },
				{ name: 'i18n', stmt: "ALTER TABLE plugins ADD COLUMN i18n TEXT DEFAULT '{}'" },
				{ name: 'config_schema', stmt: "ALTER TABLE plugins ADD COLUMN config_schema TEXT DEFAULT '{}'" },
				{ name: 'permissions', stmt: "ALTER TABLE plugins ADD COLUMN permissions TEXT DEFAULT '[]'" },
				{ name: 'tags', stmt: "ALTER TABLE plugins ADD COLUMN tags TEXT DEFAULT '[]'" },
				{ name: 'source_url', stmt: "ALTER TABLE plugins ADD COLUMN source_url TEXT DEFAULT ''" },
				{ name: 'share_token', stmt: "ALTER TABLE plugins ADD COLUMN share_token TEXT DEFAULT ''" },
				{ name: 'share_notify', stmt: "ALTER TABLE plugins ADD COLUMN share_notify INTEGER DEFAULT 1" },
				{ name: 'deleted_at', stmt: 'ALTER TABLE plugins ADD COLUMN deleted_at INTEGER DEFAULT 0' },
				{ name: 'deleted_by', stmt: 'ALTER TABLE plugins ADD COLUMN deleted_by INTEGER DEFAULT 0' }
			].filter((item) => !pluginColumns.has(item.name)).map((item) => item.stmt) : [];
			const pluginResourceAlterStmts = pluginResourceColumns.size ? [
				{ name: 'payload_size', stmt: 'ALTER TABLE plugin_resources ADD COLUMN payload_size INTEGER NOT NULL DEFAULT 0' },
				{ name: 'storage_provider', stmt: "ALTER TABLE plugin_resources ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'd1'" },
				{ name: 'storage_key', stmt: "ALTER TABLE plugin_resources ADD COLUMN storage_key TEXT NOT NULL DEFAULT ''" }
			].filter((item) => !pluginResourceColumns.has(item.name)).map((item) => item.stmt) : [];
			const i18nSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  native_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'system',
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope, key, locale),
  FOREIGN KEY (locale) REFERENCES languages(code)
);`,
				`CREATE INDEX IF NOT EXISTS idx_translations_scope_locale ON translations(scope, locale);`,
				`CREATE INDEX IF NOT EXISTS idx_translations_key ON translations(key);`,
				...BUILTIN_LANGUAGES.map((language) =>
					`INSERT OR IGNORE INTO languages (code, name, native_name, enabled, sort_order) VALUES (` +
					`'${language.code}', '${language.name.replace(/'/g, "''")}', '${language.native_name.replace(/'/g, "''")}', ${language.enabled}, ${language.sort_order});`
				),
				...BUILTIN_TRANSLATIONS.flatMap((entry) => [
					`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('system', '${entry.key.replace(/'/g, "''")}', 'zh-CN', '${entry.zh.replace(/'/g, "''")}');`,
					`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('system', '${entry.key.replace(/'/g, "''")}', 'en-US', '${entry.en.replace(/'/g, "''")}');`
				]),
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_name', 'zh-CN', 'ForumForge');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_name', 'en-US', 'ForumForge');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_tagline', 'zh-CN', '高密度图文讨论流');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_tagline', 'en-US', 'Dense media discussion feed');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'name', 'zh-CN', '全部');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'name', 'en-US', 'All');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'description', 'zh-CN', '全部论坛帖子。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'description', 'en-US', 'All forum posts.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_title', 'zh-CN', '高密度图文讨论流');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_title', 'en-US', 'Media-first forum feed');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_description', 'zh-CN', '快速扫读图文、视频和长文讨论。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_description', 'en-US', 'Scan posts fast. Media stays clear.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'name', 'zh-CN', '公告');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'name', 'en-US', 'Announcements');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'description', 'zh-CN', '官方更新和发布说明。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'description', 'en-US', 'Official updates and release notes.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_title', 'zh-CN', '公告');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_title', 'en-US', 'Announcements');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_description', 'zh-CN', '官方更新、发布说明和站点新闻。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_description', 'en-US', 'Official updates, releases, and site news.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'name', 'zh-CN', '构建日志');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'name', 'en-US', 'Build Logs');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'description', 'zh-CN', '项目和插件的进度记录。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'description', 'en-US', 'Progress notes for projects and plugins.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_title', 'zh-CN', '构建日志');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_title', 'en-US', 'Build Logs');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_description', 'zh-CN', '跟踪实现记录和发布进度。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_description', 'en-US', 'Track implementation notes and release progress.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'name', 'zh-CN', '展示');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'name', 'en-US', 'Showcase');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'description', 'zh-CN', '富媒体示例和演示。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'description', 'en-US', 'Media-rich examples and demos.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_title', 'zh-CN', '展示');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_title', 'en-US', 'Showcase');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_description', 'zh-CN', '图文帖子、预览和演示内容。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_description', 'en-US', 'Media-rich posts, previews, and demos.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'name', 'zh-CN', '想法');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'name', 'en-US', 'Ideas');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'description', 'zh-CN', '提案和产品决策讨论。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'description', 'en-US', 'Proposals and product decisions.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_title', 'zh-CN', '想法');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_title', 'en-US', 'Ideas');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_description', 'zh-CN', '简短提案和设计讨论。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_description', 'en-US', 'Short proposals and design discussions.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:1', 'name', 'zh-CN', '设计');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:1', 'name', 'en-US', 'Design');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:2', 'name', 'zh-CN', '媒体');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:2', 'name', 'en-US', 'Media');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:3', 'name', 'zh-CN', '插件');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:3', 'name', 'en-US', 'Plugin');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:4', 'name', 'zh-CN', '发布');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:4', 'name', 'en-US', 'Release');`,
				`UPDATE translations SET value = '翻译管理' WHERE scope = 'system' AND key = 'admin.i18n.title' AND locale = 'zh-CN' AND value IN ('语言与翻译', '语言和翻译');`,
				`UPDATE translations SET value = '版块' WHERE scope = 'system' AND key = 'index.hero.categories' AND locale = 'zh-CN' AND value IN ('分类');`,
				`UPDATE translations SET value = 'Boards' WHERE scope = 'system' AND key = 'index.hero.categories' AND locale = 'en-US' AND value IN ('Categories');`,
				`UPDATE translations SET value = '回复' WHERE scope = 'system' AND key = 'index.hero.pageComments' AND locale = 'zh-CN' AND value IN ('本页评论');`,
				`UPDATE translations SET value = 'Replies' WHERE scope = 'system' AND key = 'index.hero.pageComments' AND locale = 'en-US' AND value IN ('Comments on page');`
			];
			const tagSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);`
			];
			const pluginSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  slug TEXT DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  author TEXT DEFAULT '',
  homepage TEXT DEFAULT '',
  icon TEXT DEFAULT 'Puzzle',
  type TEXT DEFAULT 'system',
  css TEXT DEFAULT '',
  html TEXT DEFAULT '',
  js TEXT DEFAULT '',
  head_html TEXT DEFAULT '',
  block_types TEXT DEFAULT '[]',
  resource_types TEXT DEFAULT '[]',
  i18n TEXT DEFAULT '{}',
  config_schema TEXT DEFAULT '{}',
  permissions TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  source_url TEXT DEFAULT '',
  share_token TEXT DEFAULT '',
  share_notify INTEGER DEFAULT 1,
  deleted_at INTEGER DEFAULT 0,
  deleted_by INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS plugin_share_events (
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
);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_share_events_token ON plugin_share_events(token, created_at);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_share_events_plugin ON plugin_share_events(plugin_id, created_at);`,
				`CREATE TABLE IF NOT EXISTS plugin_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  type TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  post_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  payload_size INTEGER NOT NULL DEFAULT 0,
  storage_provider TEXT NOT NULL DEFAULT 'd1',
  storage_key TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_resources_type_id ON plugin_resources(type, id);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_resources_plugin ON plugin_resources(plugin_id, created_at);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_resources_author ON plugin_resources(author_id, created_at);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_resources_post ON plugin_resources(post_id);`,
				...pluginAlterStmts,
				...pluginResourceAlterStmts,
				`UPDATE plugins SET slug = id WHERE slug IS NULL OR slug = '';`,
				...BUILTIN_PLUGINS.map((plugin) => {
					const pType = (plugin as any).type || 'system';
					const pConfigSchema = (plugin as any).configSchema ? JSON.stringify((plugin as any).configSchema).replace(/'/g, "''") : '';
					return `INSERT INTO plugins (id, slug, name, description, version, enabled, config, type, css, html, js, resource_types, i18n, config_schema) VALUES (` +
					`'${plugin.id}', '${plugin.id}', '${plugin.name}', '${plugin.description.replace(/'/g, "''")}', '${plugin.version}', ${plugin.enabled}, ` +
					`'${plugin.config.replace(/'/g, "''")}', '${pType}', '${plugin.css.replace(/'/g, "''")}', '${plugin.html.replace(/'/g, "''")}', '${plugin.js.replace(/'/g, "''")}', '${JSON.stringify((plugin as any).resourceTypes || []).replace(/'/g, "''")}', '${JSON.stringify(plugin.i18n).replace(/'/g, "''")}', '${pConfigSchema}') ` +
					`ON CONFLICT(id) DO UPDATE SET ` +
					`css = CASE WHEN plugins.css IS NULL OR plugins.css = '' THEN excluded.css ELSE plugins.css END, ` +
					`html = CASE WHEN plugins.html IS NULL OR plugins.html = '' THEN excluded.html ELSE plugins.html END, ` +
					`js = CASE WHEN plugins.js IS NULL OR plugins.js = '' THEN excluded.js ELSE plugins.js END, ` +
					`resource_types = CASE WHEN plugins.resource_types IS NULL OR plugins.resource_types = '[]' OR plugins.resource_types = '' THEN excluded.resource_types ELSE plugins.resource_types END, ` +
					`i18n = CASE WHEN plugins.i18n IS NULL OR plugins.i18n = '{}' OR plugins.i18n = '' THEN excluded.i18n ELSE plugins.i18n END, ` +
					`config_schema = CASE WHEN '${pConfigSchema}' != '' THEN excluded.config_schema ELSE plugins.config_schema END, ` +
					`config = CASE WHEN plugins.config IS NULL OR plugins.config = '{}' OR plugins.config = '' THEN excluded.config ELSE plugins.config END;`;
				})
			];
			const mediaSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS media_assets (
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
);`,
				`CREATE INDEX IF NOT EXISTS idx_media_assets_scope_created ON media_assets(scope, created_at);`,
				`CREATE INDEX IF NOT EXISTS idx_media_assets_post ON media_assets(post_id);`,
				`CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);`
			];
			const progressSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS user_progress_logs (
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
);`,
				`CREATE INDEX IF NOT EXISTS idx_user_progress_logs_user_created ON user_progress_logs(user_id, created_at);`,
				...Object.entries(PROGRESS_REWARD_KEYS).flatMap(([source, keys]) => [
					`INSERT OR IGNORE INTO settings (key, value) VALUES ('${keys.points}', '${DEFAULT_PROGRESS_REWARDS[source as ProgressSource].points}');`,
					`INSERT OR IGNORE INTO settings (key, value) VALUES ('${keys.experience}', '${DEFAULT_PROGRESS_REWARDS[source as ProgressSource].experience}');`
				])
			];
			const postTranslationSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS post_translations (
  post_id INTEGER NOT NULL,
  locale TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, locale),
  FOREIGN KEY (post_id) REFERENCES posts(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_post_translations_locale ON post_translations(locale);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('posts_i18n_enabled', '1');`
			];
			const notificationSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  post_id INTEGER,
  comment_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at);`
			];
			const visitSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS visit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'XX',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  date_bucket TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_date ON visit_events(date_bucket);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_country_date ON visit_events(country, date_bucket);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_path_date ON visit_events(path, date_bucket);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_created ON visit_events(created_at);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('id_codec_secret', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('visit_log_retention_days', '90');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('visit_log_max_rows', '100000');`
			];
			const rolePermissionSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT PRIMARY KEY,
  permissions TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				...defaultRoleRows().map((item) =>
					`INSERT OR IGNORE INTO role_permissions (role, permissions) VALUES ('${item.role}', '${JSON.stringify(item.permissions).replace(/'/g, "''")}');`
				)
			];
			const pluginStoreSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS plugin_store (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 0,
  collection TEXT NOT NULL,
  item_key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT 'null',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_id, user_id, collection, item_key)
);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_store_plugin_user ON plugin_store(plugin_id, user_id, collection);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_store_plugin_coll ON plugin_store(plugin_id, collection, updated_at);`,
				`CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plugin_id TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  color TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by INTEGER DEFAULT 0,
  UNIQUE(user_id, plugin_id, badge_key)
);`,
				`CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);`,
				`ALTER TABLE user_badges ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;`,
				`CREATE TABLE IF NOT EXISTS badge_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_id, badge_key)
);`,
				...(badgeDefinitionColumns.size && !badgeDefinitionColumns.has('description') ? [`ALTER TABLE badge_definitions ADD COLUMN description TEXT DEFAULT '';`] : []),
				`INSERT OR IGNORE INTO badge_definitions (plugin_id, badge_key, label, description, icon, color)
  SELECT DISTINCT plugin_id, badge_key, label, description, icon, color FROM user_badges;`,
			];
			const oauthSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT DEFAULT '',
  profile_json TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_google_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_google_client_id', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_google_client_secret', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_github_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_github_client_id', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_github_client_secret', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_epic_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_epic_client_id', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_epic_client_secret', '');`
			];
			// Fast path: single batch roundtrip to check version + admin count
			try {
				const results = await db.batch([
					db.prepare("SELECT value FROM settings WHERE key = 'bootstrap_version'"),
					db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'"),
				]);
				const marker = results[0].results?.[0] as { value: string } | undefined;
				const adminRow = results[1].results?.[0] as DBCount | undefined;
				const badgeDefinitionReady = !badgeDefinitionColumns.size || badgeDefinitionColumns.has('description');
				if (marker?.value === BOOTSTRAP_VERSION && badgeDefinitionReady) {
					if ((adminRow?.count || 0) === 0) await ensureBootstrapAdmin();
					return;
				}
				// Version mismatch — schema exists, run migrations below
			} catch {
				// Schema missing — fall through to full bootstrap
			}

			let baseSchemaMissing = false;
			try {
				await db.prepare('SELECT 1 FROM posts LIMIT 1').first();
			} catch {
				baseSchemaMissing = true;
				console.warn('Database schema missing, initializing');
			}

			if (!baseSchemaMissing) {
				for (const stmt of [...profileAlterStmts, ...tagSchemaStmts, ...pluginSchemaStmts, ...i18nSchemaStmts, ...mediaSchemaStmts, ...progressSchemaStmts, ...postTranslationSchemaStmts, ...notificationSchemaStmts, ...visitSchemaStmts, ...rolePermissionSchemaStmts, ...oauthSchemaStmts, ...pluginStoreSchemaStmts]) {
					try {
						await db.prepare(stmt).run();
					} catch (e) {
						console.error('Error running extension schema statement', e, stmt);
					}
				}
				await ensureBootstrapAdmin();
				await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_version', ?)").bind(BOOTSTRAP_VERSION).run();
				return;
			}

			// using prepare().run() instead of exec ensures each statement is committed
			const stmts = [
				`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  verified INTEGER DEFAULT 0,
  verification_token TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  reset_token TEXT,
  reset_token_expires INTEGER,
  pending_email TEXT,
  email_change_token TEXT,
  avatar_url TEXT,
  nickname TEXT,
  email_notifications INTEGER DEFAULT 1,
  show_public_posts INTEGER DEFAULT 1,
  points INTEGER DEFAULT 0,
  experience INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  last_checkin_date TEXT,
  permissions TEXT DEFAULT '[]',
  disabled_until INTEGER DEFAULT 0,
  disabled_reason TEXT DEFAULT '',
  muted_until INTEGER DEFAULT 0,
  muted_reason TEXT DEFAULT '',
  deleted_at INTEGER DEFAULT 0,
  deleted_by INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  hero_title TEXT DEFAULT '',
  hero_description TEXT DEFAULT '',
  icon_url TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  admin_only INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id INTEGER,
  is_pinned INTEGER DEFAULT 0,
  is_category_pinned INTEGER DEFAULT 0,
  min_view_level INTEGER DEFAULT 0,
  min_comment_level INTEGER DEFAULT 0,
  status TEXT DEFAULT 'approved',
  rejection_reason TEXT DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER DEFAULT 0,
  deleted_by INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);`,
				`CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  parent_id INTEGER,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'approved',
  rejection_reason TEXT DEFAULT '',
  deleted_at INTEGER DEFAULT 0,
  deleted_by INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);`,
				`CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				...tagSchemaStmts,
				`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);`,
				...pluginSchemaStmts,
				...i18nSchemaStmts,
				...mediaSchemaStmts,
				...progressSchemaStmts,
				...postTranslationSchemaStmts,
				...notificationSchemaStmts,
				...visitSchemaStmts,
				...rolePermissionSchemaStmts,
				...oauthSchemaStmts,
				...pluginStoreSchemaStmts,
				`CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);`,
				`CREATE TABLE IF NOT EXISTS sessions (
  jti TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				`CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('turnstile_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_posts_default', 'approved');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_comments_default', 'approved');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_default_reject_reason', '内容不符合社区规则，请修改后重新提交。');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_reject_reasons', '内容不符合社区规则，请修改后重新提交。\n标题或正文信息不足，请补充更多上下文。\n图片、视频或链接无法正常访问，请修正后重新提交。');`
			];
			for (const stmt of stmts) {
				try {
					await db.prepare(stmt).run();
				} catch (e) {
					console.error('Error running schema statement', e, stmt);
				}
			}
			await ensureBootstrapAdmin();
			await seedDemoContent(env, db).catch((e) => console.warn('Demo content skipped:', e));
			await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_version', ?)").bind(BOOTSTRAP_VERSION).run();
			// verify posts table exists now
			try {
				await db.prepare('SELECT 1 FROM posts LIMIT 1').first();
			} catch (e) {
				console.error('Failed to verify posts table after init', e);
			}
		};

	await ensureSchema();
}
