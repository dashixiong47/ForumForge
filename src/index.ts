
import { sendEmail } from './integrations/smtp';
import { generateIdenticon } from './utils/identicon';
import { uploadImage, deleteImage, listAllKeys, getPublicUrl, getKeyFromUrl, S3Env } from './integrations/s3';
import { Security, UserPayload } from './core/security';
import type { SiteCategory, SiteTag, SiteUser } from './site/ssr';
import type { DBCount, DBPlugin, DBSetting, DBUser, DBUserEmail, PostAuthorInfo } from './db/types';
import { parseJsonValue } from './utils/json';
import { DEFAULT_LEVEL_SETTINGS, DEFAULT_PROGRESS_REWARDS, LEVEL_SETTING_KEYS, levelFromExperience, normalizeLevelSettings, PROGRESS_REWARD_KEYS, ProgressSource } from './gamification/progress';
import { extractImageUrls } from './utils/media';
import {
	AdminPermissionKey,
	adminPermissionForApiPath,
	adminPermissionForPath,
	canAdmin,
	isBuiltinRole,
	normalizePermissions,
	normalizeRole,
	permissionsForUser,
	sanitizeRole,
} from './admin/permissions';
import { normalizePluginId } from './plugins/registry';
import { renderSiteRoute } from './pages/site-routes';
import { renderAdminRoute } from './pages/admin-routes';
import { handlePublicApi } from './api/public';
import { handlePluginApi } from './api/plugins';
import { handleAdminSettingsApi } from './api/admin-settings';
import { handleAdminI18nApi } from './api/admin-i18n';
import { handleMediaApi } from './api/media';
import { hashPassword, generateToken } from './core/password';
import { verifyTurnstile } from './core/turnstile';
import { hasControlCharacters, hasInvisibleCharacters, hasRestrictedKeywords, isVisuallyEmpty } from './core/validation';
import { ensureBootstrap } from './services/bootstrap';
import { FALLBACK_LOCALE, normalizeLocaleValue, pickLocaleFromAcceptLanguage } from './core/locale';
import { decodePublicId, publicPostPath } from './core/id-codec';
import { handleOAuthRequest, loadOAuthPublicProviders } from './auth/oauth';
import { isLocalRequest } from './core/env';
import worldMap from './assets/maps/world.json';

const WORLD_MAP_JSON = JSON.stringify(worldMap);

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;

		if (url.pathname === '/assets/maps/world.json' && (method === 'GET' || method === 'HEAD')) {
			const headers = {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
				'CDN-Cache-Control': 'public, max-age=604800',
				'Vary': 'Accept-Encoding',
			};
			if (method === 'HEAD') return new Response(null, { headers });

			const cacheKey = new Request(`${url.origin}/assets/maps/world.json`, { method: 'GET' });
			const cached = await caches.default.match(cacheKey);
			if (cached) return cached;

			const response = new Response(WORLD_MAP_JSON, { headers });
			ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch((e) => console.warn('world map cache failed', e)));
			return response;
		}

		const db = env.DB;
		if (!db) {
			return Response.json({ error: 'D1 database binding DB is not configured' }, { status: 500 });
		}

		// Helper function to get base URL
		const getBaseUrl = () => {
			// Priority: 1. Env var 2. X-Original-URL header 3. Request origin
			const baseUrl = (env as any).BASE_URL;
			if (baseUrl) {
				console.log(`✅ Using BASE_URL from env: ${baseUrl}`);
				return baseUrl;
			}
			
			const xOriginalUrl = request.headers.get('X-Original-URL');
			if (xOriginalUrl) {
				console.log(`✅ Using X-Original-URL header: ${xOriginalUrl}`);
				return xOriginalUrl;
			}
			
			console.warn(`⚠️ BASE_URL not configured and no X-Original-URL header, falling back to request origin: ${url.origin}`);
			return url.origin;
		};

		// CORS headers helper
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE, PUT',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Timestamp, X-Nonce',
		};

		// Handle OPTIONS (CORS preflight)
		if (method === 'OPTIONS') {
			return new Response(null, {
				headers: corsHeaders,
			});
		}

		// Helper to return JSON response with CORS
		const jsonResponse = (data: any, status = 200, extraHeaders?: HeadersInit) => {
			return Response.json(data, {
				status,
				headers: {
					...corsHeaders,
					...(extraHeaders || {}),
				},
			});
		};

		// Serve R2 objects through Worker when using bucket binding
		if (url.pathname.startsWith('/r2/') && (method === 'GET' || method === 'HEAD')) {
			const bucket = (env as any).BUCKET as R2Bucket | undefined;
			if (!bucket) return new Response('R2 bucket not configured', { status: 404 });
			const key = decodeURIComponent(url.pathname.slice('/r2/'.length));
			if (!key) return new Response('Not Found', { status: 404 });
			const object = await bucket.get(key);
			if (!object) return new Response('Not Found', { status: 404 });
			const headers = new Headers();
			object.writeHttpMetadata(headers);
			if (object.httpEtag) headers.set('etag', object.httpEtag);
			headers.set('Cache-Control', 'public, max-age=3600');
			return new Response(method === 'HEAD' ? null : object.body, { headers });
		}

		// perform initialization before security setup
		try {
			await ensureBootstrap(env, db);
		} catch (e) {
			console.error('Database initialization failed:', e);
			return Response.json(
				{ error: e instanceof Error ? e.message : 'Database initialization failed' },
				{ status: 500, headers: corsHeaders }
			);
		}

		let security: Security;
		try {
			security = new Security(env);
		} catch (e) {
			console.error('Security initialization failed:', e);
			return Response.json(
				{ error: 'Server misconfigured' },
				{ status: 500, headers: corsHeaders }
			);
		}

		const getCookieValue = (req: Request, name: string) => {
			const cookie = req.headers.get('Cookie') || '';
			for (const part of cookie.split(';')) {
				const [rawKey, ...rawValue] = part.trim().split('=');
				if (rawKey === name) return decodeURIComponent(rawValue.join('=') || '');
			}
			return '';
		};

		const requestLocale = () =>
			normalizeLocale(getCookieValue(request, 'ff_locale')) ||
			pickLocaleFromAcceptLanguage(request.headers.get('Accept-Language')) ||
			FALLBACK_LOCALE;

		const authCookie = (token: string, expiresAt: number) => {
			const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
			const secure = url.protocol === 'https:' ? '; Secure' : '';
			return `ff_token=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
		};

		const clearAuthCookie = () => {
			const secure = url.protocol === 'https:' ? '; Secure' : '';
			return `ff_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
		};

		// authentication helper - throws on failure
		const authenticate = async (req: Request) => {
			const authHeader = req.headers.get('Authorization');
			const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
			const token = bearerToken || getCookieValue(req, 'ff_token');
			if (!token) {
				throw new Error('Unauthorized');
			}
			const payload = await security.verifyToken(token);
			if (!payload) {
				throw new Error('Unauthorized');
			}
			return payload;
		};

		const loadAccessUser = async (payload: UserPayload): Promise<UserPayload> => {
			const row = await db.prepare('SELECT id, email, role, verified, points, experience, level FROM users WHERE id = ?').bind(payload.id).first<DBUser>();
			if (!row) throw new Error('Unauthorized');
			const role = normalizeRole(row.role);
			let permissions = permissionsForUser({ role });
			if (role !== 'admin') {
				const roleRow = await db.prepare('SELECT permissions FROM role_permissions WHERE role = ?').bind(role).first<{ permissions: string }>();
				if (roleRow) permissions = normalizePermissions(roleRow.permissions);
			}
			return {
				id: Number(row.id),
				email: String(row.email || payload.email),
				role,
				verified: Number(row.verified || 0),
				permissions,
				points: Number((row as any).points || 0),
				experience: Number((row as any).experience || 0),
				level: Number((row as any).level || 1),
			};
		};

		const requireVerifiedUser = async (payload: UserPayload): Promise<UserPayload> => {
			const user = await loadAccessUser(payload);
			if (Number(user.verified || 0) !== 1) throw new Error('EmailVerificationRequired');
			return user;
		};

		const escapeEmailHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;',
		}[ch] || ch));

		const sendVerificationEmail = async (email: string, username: string, token: string) => {
			const baseUrl = getBaseUrl().replace(/\/+$/, '');
			const verifyLink = `${baseUrl}/api/verify?token=${encodeURIComponent(token)}`;
			const senderEmail = `noreply@${new URL(baseUrl).hostname}`;
			const emailHtml = `
				<h1>欢迎加入 ForumForge，${escapeEmailHtml(username)}！</h1>
				<p>请点击下方链接验证您的邮箱地址。验证后才能发帖、评论、点赞、签到和上传媒体。</p>
				<p><a href="${escapeEmailHtml(verifyLink)}">验证邮箱</a></p>
				<p>如果按钮无法点击，请复制以下链接到浏览器打开：</p>
				<p>${escapeEmailHtml(verifyLink)}</p>
				<p>如果您未请求此操作，请忽略此邮件。</p>
			`;
			await sendEmail(email, '请验证您的邮箱', emailHtml, env, senderEmail);
		};

		const logAuditEvent = async (
			action: string,
			resourceType: string,
			resourceId: string,
			details: Record<string, unknown> = {},
			userId: number | string | null = null
		) => {
			try {
				await db.prepare(
					`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
					 VALUES (?, ?, ?, ?, ?, ?)`
				).bind(
					userId ? Number(userId) : null,
					action,
					resourceType,
					resourceId,
					JSON.stringify(details),
					request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'system'
				).run();
			} catch (e) {
				console.error('[Audit Log Error]', e);
			}
		};

		const canViewPostByLevel = (viewer: UserPayload | SiteUser | null | undefined, post: { author_id?: unknown; min_view_level?: unknown }): boolean => {
			const required = Math.max(0, Number(post.min_view_level || 0));
			if (required <= 0) return true;
			if (!viewer) return false;
			if (Number((viewer as any).id) === Number(post.author_id)) return true;
			if (canAdmin(viewer as UserPayload, 'posts') || canAdmin(viewer as UserPayload, 'moderation')) return true;
			return Number((viewer as any).level || 0) >= required;
		};

		const usernameFromEmail = async (emailValue: string): Promise<string> => {
			const local = String(emailValue || '').split('@')[0] || 'user';
			const base = (local.replace(/[^\w\u4e00-\u9fff-]/g, '').slice(0, 18) || 'user').trim();
			for (let i = 0; i < 80; i++) {
				const candidate = i === 0 ? base : `${base.slice(0, 16)}${i}`;
				if (isVisuallyEmpty(candidate) || hasInvisibleCharacters(candidate) || hasControlCharacters(candidate) || hasRestrictedKeywords(candidate)) continue;
				const row = await db.prepare('SELECT id FROM users WHERE username = ?').bind(candidate).first<{ id: number }>();
				if (!row) return candidate;
			}
			return `user${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
		};

		const authenticateAdmin = async (req: Request, permission: AdminPermissionKey): Promise<UserPayload> => {
			const payload = await loadAccessUser(await authenticate(req));
			if (!canAdmin(payload, permission)) throw new Error('Forbidden');
			return payload;
		};

		// Helper to handle errors
		const handleError = (e: any) => {
			const errString = String(e);
			if (errString.includes('Unauthorized') || errString.includes('Invalid Token')) {
				return jsonResponse({ error: 'Unauthorized' }, 401);
			}
			if (errString.includes('Forbidden')) {
				return jsonResponse({ error: 'Forbidden' }, 403);
			}
			if (errString.includes('EmailVerificationRequired')) {
				return jsonResponse({ error: '请先验证邮箱后再操作。', code: 'EMAIL_NOT_VERIFIED' }, 403);
			}
			return jsonResponse({ error: errString }, 500);
		};

		const pluginRowToManifest = (row: DBPlugin, includeShare = false) => {
			const base = getBaseUrl().replace(/\/$/, '');
			const id = row.slug || row.id;
			const manifest: Record<string, any> = {
				protocol: 'forumforge-plugin-v1',
				id,
				slug: id,
				name: row.name,
				description: row.description || '',
				version: row.version || '1.0.0',
				author: row.author || '',
				homepage: row.homepage || '',
				icon: row.icon || 'Puzzle',
				type: row.type || 'system',
				css: row.css || '',
				html: row.html || '',
				js: row.js || '',
				headHtml: row.head_html || '',
				blockTypes: parseJsonValue(row.block_types, []),
				i18n: parseJsonValue(row.i18n, {}),
				configSchema: parseJsonValue(row.config_schema, {}),
				config: parseJsonValue(row.config, {}),
				permissions: parseJsonValue(row.permissions, []),
				tags: parseJsonValue(row.tags, []),
			};
			if (includeShare && row.share_token) {
				const manifestUrl = `${base}/api/plugins/${encodeURIComponent(id)}/manifest.json`;
				manifest.share = {
					protocol: 'forumforge-plugin-share-v1',
					token: row.share_token,
					notifyUrl: `${base}/api/plugins/${encodeURIComponent(id)}/notify-install`,
					installUrl: `${base}/admin/plugins?install=${encodeURIComponent(manifestUrl)}`,
					manifestUrl,
					notifyEnabled: row.share_notify !== 0,
				};
			}
			return manifest;
		};

		const upsertPluginManifest = async (manifest: any, sourceUrl = '') => {
			await db.prepare(
				`INSERT INTO plugins (
					id, slug, name, description, version, enabled, config, author, homepage, icon, type,
					css, html, js, head_html, block_types, i18n, config_schema, permissions, tags, source_url, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
				ON CONFLICT(id) DO UPDATE SET
					slug = excluded.slug,
					name = excluded.name,
					description = excluded.description,
					version = excluded.version,
					config = excluded.config,
					author = excluded.author,
					homepage = excluded.homepage,
					icon = excluded.icon,
					type = excluded.type,
					css = excluded.css,
					html = excluded.html,
					js = excluded.js,
					head_html = excluded.head_html,
					block_types = excluded.block_types,
					i18n = excluded.i18n,
					config_schema = excluded.config_schema,
					permissions = excluded.permissions,
					tags = excluded.tags,
					source_url = excluded.source_url,
					updated_at = CURRENT_TIMESTAMP`
			).bind(
				manifest.id,
				manifest.slug,
				manifest.name,
				manifest.description,
				manifest.version,
				manifest.enabled,
				manifest.config,
				manifest.author,
				manifest.homepage,
				manifest.icon,
				manifest.type,
				manifest.css,
				manifest.html,
				manifest.js,
				manifest.head_html,
				manifest.block_types,
				manifest.i18n,
				manifest.config_schema,
				manifest.permissions,
				manifest.tags,
				sourceUrl || manifest.source_url || ''
			).run();
		};

		const normalizeTagName = (value: unknown) => {
			const name = String(value || '').replace(/^#+/, '').trim();
			if (!name) return '';
			return name.replace(/\s+/g, ' ');
		};

		const parseTagIds = (value: unknown) => {
			if (!Array.isArray(value)) return [];
			const ids = value
				.map((v) => Number(v))
				.filter((v) => Number.isInteger(v) && v > 0);
			return Array.from(new Set(ids)).slice(0, 8);
		};

		const validateTagIds = async (tagIds: number[]) => {
			if (tagIds.length === 0) return true;
			const placeholders = tagIds.map(() => '?').join(',');
			const { results } = await db.prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`).bind(...tagIds).all();
			return (results || []).length === tagIds.length;
		};

		const syncPostTags = async (postId: number | string, tagIds: number[]) => {
			await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(postId).run();
			for (const tagId of tagIds) {
				await db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagId).run();
			}
		};

		const attachTagsToPosts = async <T extends { id: number | string }>(posts: T[]) => {
			if (!posts.length) return posts.map((post) => ({ ...post, tags: [] }));
			const ids = posts.map((post) => Number(post.id)).filter((id) => Number.isInteger(id));
			if (!ids.length) return posts.map((post) => ({ ...post, tags: [] }));
			const locale = requestLocale();
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			const placeholders = ids.map(() => '?').join(',');
			const { results } = await db.prepare(
				`SELECT pt.post_id,
				        t.id,
				        COALESCE(tn.value, tf.value, t.name) AS name
				 FROM post_tags pt
				 JOIN tags t ON t.id = pt.tag_id
				 LEFT JOIN translations tn ON tn.scope = 'tag:' || t.id AND tn.key = 'name' AND tn.locale = ?
				 LEFT JOIN translations tf ON tf.scope = 'tag:' || t.id AND tf.key = 'name' AND tf.locale = ?
				 WHERE pt.post_id IN (${placeholders})
				 ORDER BY name ASC`
			).bind(locale, fallback, ...ids).all();
			const byPost = new Map<number, Array<{ id: number; name: string }>>();
			for (const row of (results || []) as any[]) {
				const postId = Number(row.post_id);
				const list = byPost.get(postId) || [];
				list.push({ id: Number(row.id), name: String(row.name) });
				byPost.set(postId, list);
			}
			return posts.map((post) => ({ ...post, tags: byPost.get(Number(post.id)) || [] }));
		};

		const getCurrentSiteUser = async (): Promise<SiteUser | null> => {
			try {
				const payload = await authenticate(request);
				const user = await db.prepare(
					'SELECT id, email, username, role, verified, avatar_url, email_notifications, show_public_posts, points, experience, level, last_checkin_date, created_at FROM users WHERE id = ?'
				).bind(payload.id).first<SiteUser>();
				if (!user) return null;
				(user as any).permissions = (await loadAccessUser(payload)).permissions;
				const unread = await db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').bind(payload.id).first<DBCount>();
				(user as any).unread_count = Number(unread?.count || 0);
				return user;
			} catch {
				return null;
			}
		};

		const settingNumber = async (key: string, fallback: number) => {
			const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<DBSetting>();
			const value = Number(row?.value);
			return Number.isFinite(value) ? value : fallback;
		};

		const getLevelSettings = async () => {
			const [maxLevel, baseExperience, growth] = await Promise.all([
				settingNumber(LEVEL_SETTING_KEYS.maxLevel, DEFAULT_LEVEL_SETTINGS.maxLevel),
				settingNumber(LEVEL_SETTING_KEYS.baseExperience, DEFAULT_LEVEL_SETTINGS.baseExperience),
				settingNumber(LEVEL_SETTING_KEYS.growth, DEFAULT_LEVEL_SETTINGS.growth),
			]);
			return normalizeLevelSettings({ maxLevel, baseExperience, growth });
		};

		const awardUserProgress = async (
			userId: number,
			source: ProgressSource,
			context: { postId?: number | string | null; commentId?: number | string | null; meta?: Record<string, unknown> } = {}
		) => {
			const keys = PROGRESS_REWARD_KEYS[source];
			const defaults = DEFAULT_PROGRESS_REWARDS[source];
			const [pointsDelta, xpDelta] = await Promise.all([
				settingNumber(keys.points, defaults.points),
				settingNumber(keys.experience, defaults.experience),
			]);
			const row = await db.prepare('SELECT points, experience FROM users WHERE id = ?').bind(userId).first<DBUser>();
			const points = Math.max(0, Number(row?.points || 0) + pointsDelta);
			const experience = Math.max(0, Number(row?.experience || 0) + xpDelta);
			const level = levelFromExperience(experience, await getLevelSettings());
			await db.prepare('UPDATE users SET points = ?, experience = ?, level = ? WHERE id = ?').bind(points, experience, level, userId).run();
			if (pointsDelta !== 0 || xpDelta !== 0) {
				await db.prepare(
					`INSERT INTO user_progress_logs (user_id, source, points_delta, experience_delta, post_id, comment_id, meta)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				).bind(
					userId,
					source,
					pointsDelta,
					xpDelta,
					context.postId || null,
					context.commentId || null,
					JSON.stringify(context.meta || {})
				).run();
			}
			return { points, experience, level, points_delta: pointsDelta, experience_delta: xpDelta };
		};

		const createNotification = async (
			userId: number | string | null | undefined,
			type: string,
			title: string,
			body: string,
			context: { postId?: number | string | null; commentId?: number | string | null; meta?: Record<string, unknown> } = {}
		) => {
			const targetUserId = Number(userId || 0);
			if (!targetUserId || !type) return;
			await db.prepare(
				`INSERT INTO notifications (user_id, type, title, body, post_id, comment_id, meta)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			).bind(
				targetUserId,
				type,
				title.slice(0, 120),
				body.slice(0, 500),
				context.postId || null,
				context.commentId || null,
				JSON.stringify(context.meta || {})
			).run();
		};

		const getSiteCategories = async (viewer?: Pick<UserPayload | SiteUser, 'role'> & { permissions?: unknown } | null): Promise<SiteCategory[]> => {
			const locale = requestLocale();
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			const includeAdminOnly = viewer ? canAdmin(viewer, 'categories') || canAdmin(viewer, 'posts') : false;
			const { results } = await db.prepare(
				`SELECT categories.id,
				        COALESCE(name_t.value, name_f.value, categories.name) AS name,
				        COALESCE(desc_t.value, desc_f.value, categories.description) AS description,
				        COALESCE(hero_t.value, hero_f.value, categories.hero_title) AS hero_title,
				        COALESCE(hero_desc_t.value, hero_desc_f.value, categories.hero_description) AS hero_description,
				        categories.icon_url AS icon_url,
				        categories.enabled AS enabled,
				        categories.admin_only AS admin_only,
				        categories.sort_order AS sort_order,
				        COUNT(posts.id) as post_count
				 FROM categories
				 LEFT JOIN posts ON posts.category_id = categories.id AND COALESCE(posts.status, 'approved') = 'approved'
				 LEFT JOIN translations name_t ON name_t.scope = 'category:' || categories.id AND name_t.key = 'name' AND name_t.locale = ?
				 LEFT JOIN translations name_f ON name_f.scope = 'category:' || categories.id AND name_f.key = 'name' AND name_f.locale = ?
				 LEFT JOIN translations desc_t ON desc_t.scope = 'category:' || categories.id AND desc_t.key = 'description' AND desc_t.locale = ?
				 LEFT JOIN translations desc_f ON desc_f.scope = 'category:' || categories.id AND desc_f.key = 'description' AND desc_f.locale = ?
				 LEFT JOIN translations hero_t ON hero_t.scope = 'category:' || categories.id AND hero_t.key = 'hero_title' AND hero_t.locale = ?
				 LEFT JOIN translations hero_f ON hero_f.scope = 'category:' || categories.id AND hero_f.key = 'hero_title' AND hero_f.locale = ?
				 LEFT JOIN translations hero_desc_t ON hero_desc_t.scope = 'category:' || categories.id AND hero_desc_t.key = 'hero_description' AND hero_desc_t.locale = ?
				 LEFT JOIN translations hero_desc_f ON hero_desc_f.scope = 'category:' || categories.id AND hero_desc_f.key = 'hero_description' AND hero_desc_f.locale = ?
				 WHERE COALESCE(categories.enabled, 1) = 1
				   AND (? = 1 OR COALESCE(categories.admin_only, 0) = 0)
				 GROUP BY categories.id
				 ORDER BY COALESCE(categories.sort_order, categories.id * 10) ASC, categories.created_at ASC, categories.id ASC`
			).bind(locale, fallback, locale, fallback, locale, fallback, locale, fallback, includeAdminOnly ? 1 : 0).all();
			return (results || []) as unknown as SiteCategory[];
		};

		const getSiteTags = async (): Promise<SiteTag[]> => {
			const locale = requestLocale();
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			const { results } = await db.prepare(
				`SELECT tags.id,
				        COALESCE(name_t.value, name_f.value, tags.name) AS name,
				        COUNT(post_tags.post_id) as post_count
				 FROM tags
				 LEFT JOIN post_tags ON post_tags.tag_id = tags.id
				 LEFT JOIN translations name_t ON name_t.scope = 'tag:' || tags.id AND name_t.key = 'name' AND name_t.locale = ?
				 LEFT JOIN translations name_f ON name_f.scope = 'tag:' || tags.id AND name_f.key = 'name' AND name_f.locale = ?
				 GROUP BY tags.id
				 ORDER BY name ASC`
			).bind(locale, fallback).all();
			return (results || []) as unknown as SiteTag[];
		};

		const applyLocalizedCategoriesToPosts = <T extends { category_id?: number | string | null; category_name?: string | null }>(posts: T[], categories: SiteCategory[]) => {
			const byId = new Map(categories.map((category) => [String(category.id), category.name]));
			return posts.map((post) => {
				const localizedName = post.category_id !== null && post.category_id !== undefined ? byId.get(String(post.category_id)) : '';
				return localizedName ? { ...post, category_name: localizedName } : post;
			});
		};

		const renderMaintenancePage = (settings: Record<string, string>) => {
			const escapePageHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#039;',
			}[ch] || ch));
			const title = settings.maintenance_title || '站点维护中';
			const message = settings.maintenance_message || '我们正在升级服务，请稍后再回来。';
			const until = settings.maintenance_until || '';
			const untilMs = until ? Date.parse(until) : NaN;
			const countdown = Number.isFinite(untilMs) ? `<div class="countdown" data-until="${untilMs}">--:--:--</div>` : '';
			return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${escapePageHtml(title)} - ForumForge</title>
	<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:#0d1117;color:#e6edf3}
*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 20% 0,rgba(88,166,255,.2),transparent 30%),radial-gradient(circle at 80% 100%,rgba(63,185,80,.12),transparent 34%),#0d1117}
.card{width:min(620px,calc(100vw - 32px));border:1px solid rgba(88,166,255,.28);border-radius:24px;background:linear-gradient(180deg,rgba(18,28,43,.92),rgba(13,17,23,.96));box-shadow:0 30px 90px rgba(0,0,0,.42);padding:34px}
.kicker{color:#79c0ff;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.bar{width:88px;height:5px;border-radius:999px;background:linear-gradient(90deg,#58a6ff,#3fb950);margin:0 0 20px}
h1{font-size:34px;line-height:1.1;margin:10px 0 12px}.msg{color:#b8c7da;font-size:16px;line-height:1.8;white-space:pre-wrap}.countdown{margin-top:22px;border:1px solid rgba(88,166,255,.22);border-radius:16px;background:rgba(88,166,255,.08);padding:16px 18px;font-size:30px;font-weight:900;letter-spacing:.08em;text-align:center}
	</style>
</head>
<body>
	<main class="card">
		<div class="bar"></div>
		<div class="kicker">ForumForge Maintenance</div>
		<h1>${escapePageHtml(title)}</h1>
		<div class="msg">${escapePageHtml(message)}</div>
		${countdown}
	</main>
	<script>
const box=document.querySelector('[data-until]');
function tick(){if(!box)return;const ms=Number(box.dataset.until)-Date.now();if(ms<=0){box.textContent='即将恢复';return;}const s=Math.floor(ms/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;box.textContent=(d?d+'天 ':'')+[h,m,sec].map(v=>String(v).padStart(2,'0')).join(':');}
tick();setInterval(tick,1000);
	</script>
</body>
</html>`, {
				status: 503,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-store',
					'Retry-After': '300',
				}
			});
		};

		const isMaintenanceBypassPath = () =>
			url.pathname.startsWith('/admin') ||
			url.pathname.startsWith('/api/admin') ||
			url.pathname.startsWith('/api/login') ||
			url.pathname.startsWith('/api/config') ||
			url.pathname.startsWith('/api/i18n') ||
			url.pathname.startsWith('/oauth/') ||
			url.pathname === '/login' ||
			url.pathname.startsWith('/r2/') ||
			url.pathname.startsWith('/assets/') ||
			url.pathname === '/favicon.ico' ||
			url.pathname === '/world.json';

		if (!isMaintenanceBypassPath() && !url.pathname.includes('.')) {
			const rows = await db.prepare("SELECT key, value FROM settings WHERE key IN ('maintenance_enabled', 'maintenance_title', 'maintenance_message', 'maintenance_until')").all();
			const map: Record<string, string> = {};
			for (const row of (rows.results || []) as any[]) map[String(row.key)] = String(row.value || '');
			if (map.maintenance_enabled === '1') {
				if (method === 'GET' && !url.pathname.startsWith('/api/')) return renderMaintenancePage(map);
				return jsonResponse({ error: map.maintenance_title || '站点维护中', code: 'MAINTENANCE' }, 503);
			}
		}

		const idCodecSetting = await db.prepare("SELECT value FROM settings WHERE key = 'id_codec_secret'").first<DBSetting>().catch(() => null);
		const runtimeEnvForLinks = {
			...(env as any),
			ID_CODEC_SECRET: String(idCodecSetting?.value || (env as any).ID_CODEC_SECRET || '').trim(),
		};

		const getAllCategoryCopy = async (totalPosts?: number): Promise<SiteCategory> => {
			const locale = requestLocale();
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			const [translations, systemTranslations, iconSetting] = await Promise.all([
				loadLocalizedMaps(['category:all']),
				getSystemTranslations(locale),
				db.prepare("SELECT value FROM settings WHERE key = 'all_category_icon_url'").first<DBSetting>(),
			]);
			const map = translations.get('category:all') || {};
			const value = (key: string, fallbackValue: string) =>
				map[key]?.[locale] || map[key]?.[fallback] || map[key]?.['zh-CN'] || map[key]?.['en-US'] || fallbackValue;
			const count = totalPosts ?? Number(await db.prepare("SELECT COUNT(*) AS count FROM posts WHERE COALESCE(status, 'approved') = 'approved'").first<number>('count') || 0);
			return {
				id: 'all' as unknown as number,
				name: value('name', systemTranslations['nav.allPosts'] || (locale === 'zh-CN' ? '全部' : 'All')),
				description: value('description', locale === 'zh-CN' ? '全部论坛帖子。' : 'All forum posts.'),
				hero_title: value('hero_title', systemTranslations['index.hero.title'] || (locale === 'zh-CN' ? '高密度图文讨论流' : 'Media-first forum feed')),
				hero_description: value('hero_description', systemTranslations['index.hero.desc'] || (locale === 'zh-CN' ? '快速扫读图文、视频和长文讨论。' : 'Scan posts fast. Media stays clear.')),
				icon_url: iconSetting?.value || '',
				post_count: count,
			};
		};

		const shouldRecordVisit = (response: Response) =>
			method === 'GET' &&
			response.status >= 200 &&
			response.status < 400 &&
			!url.pathname.startsWith('/api/') &&
			!url.pathname.startsWith('/admin') &&
			!url.pathname.startsWith('/r2/') &&
			!url.pathname.includes('.');

		const cleanupVisitEvents = async () => {
			const [daysRow, maxRowsRow] = await Promise.all([
				db.prepare("SELECT value FROM settings WHERE key = 'visit_log_retention_days'").first<DBSetting>(),
				db.prepare("SELECT value FROM settings WHERE key = 'visit_log_max_rows'").first<DBSetting>(),
			]);
			const days = Math.max(0, Math.min(3650, Math.floor(Number(daysRow?.value || 90) || 0)));
			const maxRows = Math.max(0, Math.min(10000000, Math.floor(Number(maxRowsRow?.value || 100000) || 0)));
			if (days > 0) {
				await db.prepare("DELETE FROM visit_events WHERE created_at < datetime('now', ?)").bind(`-${days} days`).run();
			}
			if (maxRows > 0) {
				await db.prepare(
					`DELETE FROM visit_events
					 WHERE id IN (
					  SELECT id FROM visit_events
					  ORDER BY created_at DESC, id DESC
					  LIMIT -1 OFFSET ?
					 )`
				).bind(maxRows).run();
			}
		};

		const recordVisit = async () => {
			const payload = await authenticate(request).catch(() => null);
			const postPathMatch = url.pathname.match(/^\/posts\/([0-9A-Za-z]+)(?:\/edit)?$/);
			const postPathId = postPathMatch ? decodePublicId(postPathMatch[1], runtimeEnvForLinks) : null;
			const canonicalPath = postPathId ? `/posts/${postPathId}` : url.pathname;
			const country = String((request as any).cf?.country || request.headers.get('cf-ipcountry') || 'XX').slice(0, 8).toUpperCase();
			const ip = String(request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 96);
			const userAgent = String(request.headers.get('User-Agent') || '').slice(0, 500);
			const referer = String(request.headers.get('Referer') || '').slice(0, 500);
			await db.prepare(
				`INSERT INTO visit_events (path, country, ip, user_agent, referer, user_id, date_bucket)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			).bind(
				canonicalPath,
				country || 'XX',
				ip,
				userAgent,
				referer,
				payload?.id || null,
				new Date().toISOString().slice(0, 10)
			).run();
			if (Math.random() < 0.05) await cleanupVisitEvents();
		};


		const normalizeLocale = normalizeLocaleValue;

		const normalizeTranslationKey = (value: unknown) => {
			const key = String(value || '').trim();
			return /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/i.test(key) ? key : '';
		};

		const getEnabledLanguages = async () => {
			const { results } = await db.prepare(
				'SELECT code, name, native_name, enabled, sort_order FROM languages WHERE enabled = 1 ORDER BY sort_order ASC, code ASC'
			).all();
			return results || [];
		};

		const getSystemTranslations = async (locale: string) => {
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			const { results } = await db.prepare(
				`SELECT key,
				        COALESCE(
				          MAX(CASE WHEN locale = ? THEN NULLIF(value, '') END),
				          MAX(CASE WHEN locale = ? THEN NULLIF(value, '') END),
				          key
				        ) AS value
				   FROM translations
				  WHERE scope = 'system' AND locale IN (?, ?)
				  GROUP BY key`
			).bind(locale, fallback, locale, fallback).all();
			const map: Record<string, string> = {};
			for (const row of (results || []) as any[]) {
				map[String(row.key)] = String(row.value || row.key);
			}
			return map;
		};

		const loadLocalizedMaps = async (scopes: string[]) => {
			if (!scopes.length) return new Map<string, Record<string, Record<string, string>>>();
			const placeholders = scopes.map(() => '?').join(',');
			const { results } = await db.prepare(
				`SELECT scope, key, locale, value FROM translations WHERE scope IN (${placeholders}) ORDER BY scope, key, locale`
			).bind(...scopes).all();
			const map = new Map<string, Record<string, Record<string, string>>>();
			for (const row of (results || []) as any[]) {
				const scope = String(row.scope || '');
				const key = String(row.key || '');
				const locale = String(row.locale || '');
				if (!scope || !key || !locale) continue;
				const scopeMap = map.get(scope) || {};
				scopeMap[key] = scopeMap[key] || {};
				scopeMap[key][locale] = String(row.value || '');
				map.set(scope, scopeMap);
			}
			return map;
		};

		const saveLocalizedFields = async (scope: string, localized: unknown, allowedFields: string[], fallbacks: Record<string, string> = {}) => {
			const safeScope = String(scope || '').trim();
			if (!safeScope || safeScope.length > 80) return;
			const source = localized && typeof localized === 'object' ? localized as Record<string, unknown> : {};
			const stmt = db.prepare(
				`INSERT INTO translations (scope, key, locale, value, updated_at)
				 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
				 ON CONFLICT(scope, key, locale) DO UPDATE SET
				   value = excluded.value,
				   updated_at = CURRENT_TIMESTAMP`
			);
			const batch = [];
			for (const field of allowedFields) {
				const values = source[field] && typeof source[field] === 'object'
					? source[field] as Record<string, unknown>
					: {};
				for (const [fallbackLocale, fallbackValue] of Object.entries(fallbacks)) {
					if (fallbackValue && values[fallbackLocale] === undefined) values[fallbackLocale] = fallbackValue;
				}
				for (const [localeRaw, value] of Object.entries(values)) {
					const locale = normalizeLocale(localeRaw);
					const key = normalizeTranslationKey(field);
					if (!locale || !key) continue;
					batch.push(stmt.bind(safeScope, key, locale, String(value || '').slice(0, 3000)));
				}
			}
			if (batch.length) await db.batch(batch);
		};

		const requireAdminPage = async () => {
			try {
				const userPayload = await loadAccessUser(await authenticate(request));
				if (!canAdmin(userPayload, adminPermissionForPath(url.pathname))) return null;
				return userPayload;
			} catch {
				return null;
			}
		};

		const adminRouteResponse = await renderAdminRoute({
			method,
			url,
			env: runtimeEnvForLinks as Env,
			db,
			getAdminUser: requireAdminPage,
			clearAuthCookie,
			getBaseUrl,
			requestLocale,
			getEnabledLanguages,
			loadLocalizedMaps,
			getAllCategoryCopy,
		});
		if (adminRouteResponse) return adminRouteResponse;
		const oauthResponse = await handleOAuthRequest({
			request,
			url,
			method,
			env,
			db,
			security,
			authCookie,
			getBaseUrl,
		});
		if (oauthResponse) return oauthResponse;
		const siteRouteResponse = await renderSiteRoute({
			method,
			url,
			env: runtimeEnvForLinks,
			db,
			getCurrentSiteUser,
			getSiteCategories,
			getSiteTags,
			getAllCategoryCopy,
			clearAuthCookie,
			settingNumber,
			getOAuthProviders: () => loadOAuthPublicProviders(db, env, getBaseUrl),
			attachTagsToPosts,
			applyLocalizedCategoriesToPosts,
		});
		if (siteRouteResponse) {
			if (shouldRecordVisit(siteRouteResponse)) {
				ctx.waitUntil(recordVisit().catch((err) => console.warn('Failed to record visit event', err)));
			}
			return siteRouteResponse;
		}


        const publicPaths = [
            '/api/config', '/api/login', '/api/register', '/api/verify', 
            '/api/auth/forgot-password', '/api/auth/reset-password', '/api/verify-email-change',
             // Static/Public GETs
            '/api/posts', '/api/categories', '/api/tags', '/api/plugins', '/api/users', '/api/i18n'
        ];
        
        // Relax check for public GETs that don't need nonce
        const isPublicGet = method === 'GET' && (
            publicPaths.includes(url.pathname) || 
            url.pathname.match(/^\/api\/posts\/\d+$/) || 
            url.pathname.match(/^\/api\/posts\/\d+\/comments$/)
        );

		let apiAdminUser: UserPayload | null = null;
		if (url.pathname.startsWith('/api/admin/')) {
			try {
				apiAdminUser = await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
			} catch (e) {
				return handleError(e);
			}
		}

        // However, user specifically asked for "Replay protection for sensitive operations".
        // We will apply strict checks for mutation methods (POST, PUT, DELETE)
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
             const validation = await security.validateRequest(request);
             if (!validation.valid) {
                 return jsonResponse({ error: validation.error || 'Security check failed' }, 400);
             }
        }

		const publicApiResponse = await handlePublicApi({
			request,
			url,
			method,
			env,
			db,
			jsonResponse,
			handleError,
			requestLocale,
			normalizeLocale,
			getEnabledLanguages,
			getSystemTranslations,
			loadLocalizedMaps,
		});
		if (publicApiResponse) return publicApiResponse;

		const adminI18nApiResponse = await handleAdminI18nApi({
			request,
			url,
			method,
			db,
			jsonResponse,
			handleError,
			apiAdminUser,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			normalizeLocale,
			normalizeTranslationKey,
		});
		if (adminI18nApiResponse) return adminI18nApiResponse;

		const pluginApiResponse = await handlePluginApi({
			request,
			url,
			method,
			db,
			jsonResponse,
			handleError,
			apiAdminUser,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			pluginRowToManifest,
			upsertPluginManifest,
			getBaseUrl,
		});
		if (pluginApiResponse) return pluginApiResponse;

		const adminSettingsApiResponse = await handleAdminSettingsApi({
			request,
			url,
			method,
			db,
			jsonResponse,
			handleError,
			apiAdminUser,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			normalizeLocale,
			saveLocalizedFields,
		});
		if (adminSettingsApiResponse) return adminSettingsApiResponse;

		const checkTurnstile = async (reqBody: any, ip: string) => {
			if (isLocalRequest(url)) return true;
			const setting = await db.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first<DBSetting>();
			const dbEnabled = setting && setting.value === '1';
			const siteKey = (env as any).TURNSTILE_SITE_KEY;
			const secretKey = (env as any).TURNSTILE_SECRET_KEY;
			const fullyConfigured = dbEnabled && siteKey && secretKey;
			if (!fullyConfigured) return true;
			const token = reqBody['cf-turnstile-response'];
			if (!token) return false;
			return verifyTurnstile(token, ip, secretKey);
		};
		const mediaApiResponse = await handleMediaApi({
			request,
			url,
			method,
			env,
			db,
			jsonResponse,
			handleError,
			apiAdminUser,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			authenticate,
			loadAccessUser,
			requireVerifiedUser,
			getBaseUrl,
		});
		if (mediaApiResponse) return mediaApiResponse;

		// --- AUTH ROUTES ---

		// POST /api/login
		if (url.pathname === '/api/login' && method === 'POST') {
			try {
				const body = await request.json() as any;
				
				// Turnstile Check
				const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
				if (!(await checkTurnstile(body, ip))) {
					return jsonResponse({ error: 'Turnstile verification failed' }, 403);
				}

				const { email, password } = body;
				if (!email || !password) {
					return jsonResponse({ error: 'Missing email or password' }, 400);
				}

				const user = await db
					.prepare('SELECT * FROM users WHERE email = ?')
					.bind(email)
					.first<DBUser>();
				if (!user) {
					return jsonResponse({ error: 'Username or Password Error' }, 401);
				}

				const passwordHash = await hashPassword(password);
				if (user.password !== passwordHash) {
					return jsonResponse({ error: 'Username or Password Error' }, 401);
				}

				const { token, jti, expiresAt } = await security.generateToken({
					id: user.id,
					role: user.role || 'user',
					email: user.email
				});

				await db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, user.id, expiresAt).run();
				await security.logAudit(user.id, 'LOGIN', 'user', String(user.id), { email }, request);

				return jsonResponse({
					token,
					user: {
						id: user.id,
						email: user.email,
						username: user.username,
						avatar_url: user.avatar_url,
						role: user.role || 'user',
						verified: user.verified === 1,
						email_notifications: user.email_notifications === 1,
						show_public_posts: user.show_public_posts !== 0
					}
				}, 200, { 'Set-Cookie': authCookie(token, expiresAt) });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/user/profile
		if (url.pathname === '/api/user/profile' && method === 'POST') {
			try {
				const userPayload = await authenticate(request);
				const body = await request.json() as any;
				const { username, avatar_url, email_notifications, show_public_posts } = body;
				
				const user_id = userPayload.id;

				if (username) {
					if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
					if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
					if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
					if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
					if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);
					
					// Check Uniqueness
					const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, user_id).first<{id:number}>();
					if (existingUser) {
						return jsonResponse({ error: 'Username already taken' }, 409);
					}
				}

				// Fetch current user
				const currentUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first<DBUser>();
			if (!currentUser) return jsonResponse({ error: 'User not found' }, 404);
				if (!currentUser) return jsonResponse({ error: 'User not found' }, 404);

				let newUsername = currentUser.username;
				if (username !== undefined) {
					newUsername = username;
				}

				let newAvatarUrl = currentUser.avatar_url;
				if (avatar_url !== undefined) {
					if (avatar_url === '' || avatar_url === null) {
						// Generate Identicon
						newAvatarUrl = await generateIdenticon(String(user_id));
					} else {
						if (avatar_url.length > 500) return jsonResponse({ error: 'Avatar URL too long (Max 500 chars)' }, 400);
						if (!/^https?:\/\//i.test(avatar_url) && !avatar_url.startsWith('data:image/svg+xml')) return jsonResponse({ error: 'Invalid Avatar URL (Must start with http:// or https://)' }, 400);
						newAvatarUrl = avatar_url;
					}
				}

				let newEmailNotif = currentUser.email_notifications;
				if (email_notifications !== undefined) {
					newEmailNotif = email_notifications ? 1 : 0;
				}
				let newShowPublicPosts = currentUser.show_public_posts ?? 1;
				if (show_public_posts !== undefined) {
					newShowPublicPosts = show_public_posts ? 1 : 0;
				}

				await db.prepare('UPDATE users SET username = ?, avatar_url = ?, email_notifications = ?, show_public_posts = ? WHERE id = ?')
					.bind(newUsername, newAvatarUrl, newEmailNotif, newShowPublicPosts, user_id).run();

			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
				return jsonResponse({
					success: true,
					user: {
						id: user.id,
						email: user.email,
						username: user.username,
						avatar_url: user.avatar_url,
						role: user.role || 'user',
						email_notifications: user.email_notifications === 1,
						show_public_posts: user.show_public_posts !== 0
					}
				});
			} catch (e) {
				return handleError(e);
			}
		}

		if (url.pathname === '/api/user/checkin' && method === 'POST') {
			try {
				const userPayload = await requireVerifiedUser(await authenticate(request));
				const today = new Date().toISOString().slice(0, 10);
				const user = await db.prepare('SELECT last_checkin_date FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
				if (user?.last_checkin_date === today) return jsonResponse({ error: 'Already checked in today' }, 400);
				const progress = await awardUserProgress(userPayload.id, 'checkin');
				await db.prepare('UPDATE users SET last_checkin_date = ? WHERE id = ?').bind(today, userPayload.id).run();
				await security.logAudit(userPayload.id, 'DAILY_CHECKIN', 'user', String(userPayload.id), progress, request);
				return jsonResponse({ success: true, last_checkin_date: today, ...progress });
			} catch (e) {
				return handleError(e);
			}
		}

		if (url.pathname === '/api/user/resend-verification' && method === 'POST') {
			try {
				const userPayload = await authenticate(request);
				const user = await db.prepare('SELECT id, email, username, verified FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
				if (!user) return jsonResponse({ error: 'User not found' }, 404);
				if (Number(user.verified || 0) === 1) return jsonResponse({ success: true, message: '邮箱已验证。' });
				const token = generateToken();
				await db.prepare('UPDATE users SET verification_token = ? WHERE id = ?').bind(token, user.id).run();
				await sendVerificationEmail(user.email, user.username || user.email, token);
				return jsonResponse({ success: true, message: '验证邮件已发送。' });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/user/notifications
		if (url.pathname === '/api/user/notifications' && method === 'GET') {
			try {
				const userPayload = await authenticate(request);
				const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
				const [itemsRes, unreadRow] = await Promise.all([
					db.prepare(
						`SELECT id, type, title, body, post_id, comment_id, is_read, created_at
						   FROM notifications
						  WHERE user_id = ?
						  ORDER BY created_at DESC
						  LIMIT ?`
					).bind(userPayload.id, limit).all(),
					db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').bind(userPayload.id).first<DBCount>()
				]);
				const items = ((itemsRes.results || []) as any[]).map((item) => ({
					...item,
					url: item.post_id ? `${publicPostPath(item.post_id, runtimeEnvForLinks)}${item.comment_id ? `#comment-${item.comment_id}` : ''}` : '/me'
				}));
				return jsonResponse({ items, unread_count: Number(unreadRow?.count || 0) });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/user/notifications/read
		if (url.pathname === '/api/user/notifications/read' && method === 'POST') {
			try {
				const userPayload = await authenticate(request);
				const body = await request.json().catch(() => ({})) as any;
				const ids = Array.isArray(body.ids)
					? body.ids.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, 100)
					: [];
				if (!ids.length) {
					await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').bind(userPayload.id).run();
				} else {
					for (const id of ids) {
						await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?').bind(userPayload.id, id).run();
					}
				}
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/user/delete
		if (url.pathname === '/api/user/delete' && method === 'POST') {
			try {
				const userPayload = await authenticate(request);
				const body = await request.json() as any;
				const { password } = body;
				
				if (!password) return jsonResponse({ error: 'Missing credentials' }, 400);

				const user_id = userPayload.id;

				const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first<DBUser>();
				if (!user) return jsonResponse({ error: 'User not found' }, 404);

				// Verify Password (Double check for sensitive delete op)
				const passwordHash = await hashPassword(password);
				if (user.password !== passwordHash) {
					return jsonResponse({ error: 'Invalid password' }, 401);
				}

				// Delete User and Data
				
				// 1. Delete images (Avatar + Post images)
				const posts: any = await db.prepare('SELECT content FROM posts WHERE author_id = ?').bind(user_id).all();
				const deletionPromises: Promise<any>[] = [];
				
				if (user.avatar_url) {
					deletionPromises.push(deleteImage(env as unknown as S3Env, user.avatar_url, user_id));
				}
				
				if (posts.results) {
					for (const post of posts.results) {
						const imageUrls = extractImageUrls(post.content as string);
						imageUrls.forEach(url => deletionPromises.push(deleteImage(env as unknown as S3Env, url, user_id)));
					}
				}
				
				if (deletionPromises.length > 0) {
					 ctx.waitUntil(Promise.all(deletionPromises).catch(err => console.error('Failed to delete user images', err)));
				}

				// 2. Delete likes/comments ON user's posts (Cascade manually)
				await db.prepare('DELETE FROM likes WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(user_id).run();
				await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?) OR comment_id IN (SELECT id FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?))').bind(user_id, user_id).run();
				await db.prepare('DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(user_id).run();
				await db.prepare('DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(user_id).run();

				// 3. Delete user's activity
				await db.prepare('DELETE FROM likes WHERE user_id = ?').bind(user_id).run();
				await db.prepare('DELETE FROM user_progress_logs WHERE user_id = ?').bind(user_id).run();
				await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id IN (SELECT id FROM comments WHERE author_id = ?)').bind(user_id).run();
				await db.prepare('DELETE FROM comments WHERE author_id = ?').bind(user_id).run();
				
				// 4. Delete posts and user
				await db.prepare('DELETE FROM posts WHERE author_id = ?').bind(user_id).run();
				await db.prepare('DELETE FROM users WHERE id = ?').bind(user_id).run();
				
				await security.logAudit(userPayload.id, 'DELETE_ACCOUNT', 'user', String(user_id), {}, request);

				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/auth/forgot-password
		if (url.pathname === '/api/auth/forgot-password' && method === 'POST') {
			try {
				const body = await request.json() as any;

				// Turnstile Check
				const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
				if (!(await checkTurnstile(body, ip))) {
					return jsonResponse({ error: 'Turnstile verification failed' }, 403);
				}

				const { email } = body;
				if (!email) return jsonResponse({ error: 'Missing email' }, 400);

				const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
				if (!user) return jsonResponse({ success: true }); // Silent fail

				const token = generateToken();
				const expires = Date.now() + 3600000; // 1 hour

				await db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
					.bind(token, expires, user.id).run();

				const baseUrl = getBaseUrl();
				const resetLink = `${baseUrl}/reset?token=${token}`;
				
				const emailHtml = `
					<h1>密码重置请求</h1>
					<p>请点击下方链接重置您的密码：</p>
					<a href="${resetLink}">重置密码</a>
					<p>如果您未请求此操作，请忽略此邮件。</p>
					<p>此链接将在 1 小时后失效。</p>
				`;

				ctx.waitUntil(sendEmail(email, '密码重置请求', emailHtml, env).catch(console.error));
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /auth/reset-password
		if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
			try {
				const body = await request.json() as any;

				// Turnstile Check
				const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
				if (!(await checkTurnstile(body, ip))) {
					return jsonResponse({ error: 'Turnstile verification failed' }, 403);
				}

				const { token } = body;
				const new_password = body.new_password || body.password;
				if (!token || !new_password) return jsonResponse({ error: 'Missing parameters' }, 400);

				if (new_password.length < 8 || new_password.length > 16) return jsonResponse({ error: 'Password must be 8-16 characters' }, 400);

				// Verify token
				const user = await db.prepare('SELECT * FROM users WHERE reset_token = ?').bind(token).first<DBUser>();
				if (!user) return jsonResponse({ error: 'Invalid token' }, 400);
				if (!user.reset_token_expires || Date.now() > user.reset_token_expires) return jsonResponse({ error: 'Token expired' }, 400);

				const passwordHash = await hashPassword(new_password);
				await db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
					.bind(passwordHash, user.id).run();

				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/user/change-email
		if (url.pathname === '/api/user/change-email' && method === 'POST') {
			try {
				const userPayload = await authenticate(request);
				const body = await request.json() as any;
				const { new_email } = body; 
				
				if (!new_email) return jsonResponse({ error: 'Missing parameters' }, 400);
				
				if (new_email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
				
				const user_id = userPayload.id;

const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first<DBUser>();
				if (!user) return jsonResponse({ error: 'User not found' }, 404);

				// Check if email already exists
				const exists = await db.prepare('SELECT id FROM users WHERE email = ?').bind(new_email).first();
				if (exists) return jsonResponse({ error: 'Email already in use' }, 400);

				const token = generateToken();
				const baseUrl = getBaseUrl();
				const verifyLink = `${baseUrl}/api/verify-email-change?token=${token}`;
				const emailHtml = `
					<h1>确认更换邮箱</h1>
					<p>请点击下方链接确认将您的邮箱更换为 ${new_email}：</p>
					<a href="${verifyLink}">确认更换</a>
				`;

				try {
					await sendEmail(new_email, '确认更换邮箱', emailHtml, env);
				} catch (e) {
					console.error('[Email Change Error]', e);
					return jsonResponse({ error: '确认邮件发送失败，请检查邮件服务配置后重试。' }, 503);
				}

				await db.prepare('UPDATE users SET pending_email = ?, email_change_token = ? WHERE id = ?')
					.bind(new_email, token, user.id).run();
				
				await security.logAudit(userPayload.id, 'CHANGE_EMAIL_INIT', 'user', String(user_id), { new_email }, request);
				return jsonResponse({ success: true, message: '确认邮件已发送，请前往新邮箱完成绑定。' });
			} catch (e) {
				return handleError(e);
			}
		}

		if (url.pathname === '/api/user/set-password' && method === 'POST') {
			try {
				const userPayload = await authenticate(request);
				const body = await request.json() as any;
				const password = String(body.password || body.new_password || '');
				const passwordConfirm = String(body.password_confirm || body.confirm_password || '');
				const oldPassword = String(body.old_password || body.current_password || '');
				if (password.length < 8 || password.length > 64) return jsonResponse({ error: 'Password must be 8-64 characters' }, 400);
				if (password !== passwordConfirm) return jsonResponse({ error: 'New passwords do not match' }, 400);
				const user = await db.prepare('SELECT id, password FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
				if (!user) return jsonResponse({ error: 'User not found' }, 404);
				const hasLocalPassword = !!String(user.password || '').trim();
				if (hasLocalPassword) {
					const oldPasswordHash = await hashPassword(oldPassword);
					if (user.password !== oldPasswordHash) return jsonResponse({ error: 'Old password is incorrect' }, 401);
				}
				const passwordHash = await hashPassword(password);
				await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(passwordHash, userPayload.id).run();
				await security.logAudit(userPayload.id, 'SET_PASSWORD', 'user', String(userPayload.id), {}, request);
				return jsonResponse({ success: true, message: '密码已设置。' });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/verify-email-change
		if (url.pathname === '/api/verify-email-change' && method === 'GET') {
			const token = url.searchParams.get('token');
			if (!token) return new Response('Missing token', { status: 400 });

			try {
const user = await db.prepare('SELECT * FROM users WHERE email_change_token = ?').bind(token).first<DBUser>();
				if (!user) return new Response('Invalid token', { status: 400 });

				await db.prepare('UPDATE users SET email = ?, verified = 1, pending_email = NULL, email_change_token = NULL WHERE id = ?')
					.bind(user.pending_email, user.id).run();

				return Response.redirect(`${getBaseUrl()}/?email_changed=true`, 302);
			} catch (e) {
				return new Response('Failed', { status: 500 });
			}
		}

		// POST /api/admin/users/:id/update (Admin direct update)
		if (url.pathname.match(/^\/api\/admin\/users\/\d+\/update$/) && method === 'POST') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const { password, email, username, avatar_url, role, verified } = body;

				if (password && (password.length < 8 || password.length > 64)) return jsonResponse({ error: 'Password must be 8-64 characters' }, 400);

				if (password) {
					const hash = await hashPassword(password);
					await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hash, id).run();
				}
				if (email) {
					if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
					await db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, id).run();
				}
				if (role !== undefined) {
					const nextRole = sanitizeRole(role);
					if (!nextRole) return jsonResponse({ error: 'Invalid role' }, 400);
					const roleRow = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(nextRole).first<{ role: string }>();
					if (!roleRow) return jsonResponse({ error: 'Role not found' }, 400);
					const target = await db.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<DBUser>();
					if (!target) return jsonResponse({ error: 'User not found' }, 404);
					if (target.role === 'admin' && nextRole !== 'admin') {
						const adminCount = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first<DBCount>();
						if ((adminCount?.count || 0) <= 1) return jsonResponse({ error: 'At least one administrator is required' }, 400);
					}
					await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(nextRole, id).run();
				}
				if (verified !== undefined) {
					await db.prepare('UPDATE users SET verified = ?, verification_token = CASE WHEN ? = 1 THEN NULL ELSE verification_token END WHERE id = ?').bind(verified ? 1 : 0, verified ? 1 : 0, id).run();
				}
				if (avatar_url !== undefined) {
					// Allow clearing avatar with empty string or null -> Force Regenerate Default
					if (!avatar_url) {
						// Reset to Default
						const identicon = await generateIdenticon(String(id));
						await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(identicon, id).run();
					} else {
						if (avatar_url.length > 500) return jsonResponse({ error: 'Avatar URL too long (Max 500 chars)' }, 400);
						if (!/^https?:\/\//i.test(avatar_url) && !avatar_url.startsWith('data:image/svg+xml')) return jsonResponse({ error: 'Invalid Avatar URL' }, 400);
						await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatar_url, id).run();
					}

					// Notify Avatar Change
					const notifyAvatar = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_avatar_change'").first<DBSetting>();
					if (notifyAvatar && notifyAvatar.value === '1') {
						const user = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{email:string;username:string}>();
						if (user) {
							const emailHtml = `
								<h1>头像已更新</h1>
								<p>您的头像已被管理员更新。</p>
							`;
							ctx.waitUntil(sendEmail(user.email, '您的头像已更新', emailHtml, env).catch(console.error));
						}
					}
				}
				if (username) {
					if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
					if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
					if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
					if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
					
					await db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, id).run();

					// Notify user about username change
					const notifyUsername = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_username_change'").first<DBSetting>();
					if (notifyUsername && notifyUsername.value === '1') {
						const user = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{email:string;username:string}>();
						if (user) {
							const emailHtml = `
								<h1>用户名已修改</h1>
								<p>您的用户名已被管理员修改为 <strong>${username}</strong>。</p>
								<p>如有疑问，请联系管理员。</p>
							`;
							ctx.waitUntil(sendEmail(user.email, '您的用户名已修改', emailHtml, env).catch(console.error));
						}
					}
				}
				
				await security.logAudit(userPayload.id, 'ADMIN_UPDATE_USER', 'user', id, { username, email, avatar_url, role, verified, passwordChanged: !!password }, request);

				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/permissions (Create role)
		if (url.pathname === '/api/admin/permissions' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				const body = await request.json() as any;
				const role = sanitizeRole(body.role);
				if (!role) return jsonResponse({ error: 'Invalid role' }, 400);
				const exists = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(role).first<{ role: string }>();
				if (exists) return jsonResponse({ error: 'Role already exists' }, 409);
				const permissions = normalizePermissions(body.permissions || []);
				await db.prepare(
					`INSERT INTO role_permissions (role, permissions, updated_at)
					 VALUES (?, ?, CURRENT_TIMESTAMP)`
				).bind(role, JSON.stringify(permissions)).run();
				await security.logAudit(userPayload.id, 'CREATE_ROLE', 'role', role, { permissions }, request);
				return jsonResponse({ success: true, role, permissions }, 201);
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/permissions/:role
		if (url.pathname.match(/^\/api\/admin\/permissions\/[^/]+$/) && method === 'PUT') {
			const role = sanitizeRole(decodeURIComponent(url.pathname.split('/').pop() || ''));
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				if (!role) return jsonResponse({ error: 'Invalid role' }, 400);
				if (role === 'admin') return jsonResponse({ error: 'Admin role is locked' }, 400);
				const exists = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(role).first<{ role: string }>();
				if (!exists) return jsonResponse({ error: 'Role not found' }, 404);
				const body = await request.json() as any;
				const permissions = normalizePermissions(body.permissions);
				await db.prepare(
					`INSERT INTO role_permissions (role, permissions, updated_at)
					 VALUES (?, ?, CURRENT_TIMESTAMP)
					 ON CONFLICT(role) DO UPDATE SET
					   permissions = excluded.permissions,
					   updated_at = CURRENT_TIMESTAMP`
				).bind(role, JSON.stringify(permissions)).run();
				await security.logAudit(userPayload.id, 'UPDATE_ROLE_PERMISSIONS', 'role', role, { permissions }, request);
				return jsonResponse({ success: true, role, permissions });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/permissions/:role
		if (url.pathname.match(/^\/api\/admin\/permissions\/[^/]+$/) && method === 'DELETE') {
			const role = sanitizeRole(decodeURIComponent(url.pathname.split('/').pop() || ''));
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				if (!role) return jsonResponse({ error: 'Invalid role' }, 400);
				if (isBuiltinRole(role)) return jsonResponse({ error: 'Built-in roles cannot be deleted' }, 400);
				const countRow = await db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').bind(role).first<DBCount>();
				if ((countRow?.count || 0) > 0) return jsonResponse({ error: 'Role still has users' }, 400);
				await db.prepare('DELETE FROM role_permissions WHERE role = ?').bind(role).run();
				await security.logAudit(userPayload.id, 'DELETE_ROLE', 'role', role, {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/categories
		if (url.pathname === '/api/categories' && method === 'GET') {
			try {
				let viewer: UserPayload | null = null;
				try {
					viewer = await loadAccessUser(await authenticate(request));
				} catch {}
				return jsonResponse(await getSiteCategories(viewer));
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/tags
		if (url.pathname === '/api/tags' && method === 'GET') {
			try {
				return jsonResponse(await getSiteTags());
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/tags
		if (url.pathname === '/api/admin/tags' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const name = normalizeTagName(body.name);
				if (!name) return jsonResponse({ error: 'Missing name' }, 400);
				if (name.length > 20) return jsonResponse({ error: 'Tag name too long (Max 20 chars)' }, 400);
				if (hasControlCharacters(name) || hasInvisibleCharacters(name)) return jsonResponse({ error: 'Tag name contains invalid characters' }, 400);
				
				const result = await db.prepare('INSERT INTO tags (name) VALUES (?)').bind(name).run();
				const tagId = result.meta?.last_row_id || result.meta?.last_row_id === 0 ? Number(result.meta.last_row_id) : 0;
				if (tagId) {
					const locale = normalizeLocale(body.locale) || 'zh-CN';
					const localized = body.localized && typeof body.localized === 'object' ? body.localized : { name: { [locale]: name } };
					await saveLocalizedFields(`tag:${tagId}`, localized, ['name'], { [locale]: name });
				}
				await security.logAudit(userPayload.id, 'CREATE_TAG', 'tag', name, {}, request);
				return jsonResponse({ success: result.success, id: tagId || undefined });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/tags/bulk-delete
		if (url.pathname === '/api/admin/tags/bulk-delete' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as { ids?: unknown };
				const ids = Array.isArray(body.ids)
					? Array.from(new Set(body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 500)
					: [];
				if (!ids.length) return jsonResponse({ error: 'Missing tag ids' }, 400);

				let deleted = 0;
				for (const id of ids) {
					await db.prepare('DELETE FROM post_tags WHERE tag_id = ?').bind(id).run();
					const result = await db.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();
					deleted += Number(result.meta?.changes || 0);
				}
				await security.logAudit(userPayload.id, 'BULK_DELETE_TAGS', 'tag', ids.join(','), { deleted }, request);
				return jsonResponse({ success: true, deleted });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/tags/:id
		if (url.pathname.match(/^\/api\/admin\/tags\/\d+$/) && method === 'PUT') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const name = normalizeTagName(body.name);
				if (!name) return jsonResponse({ error: 'Missing name' }, 400);
				if (name.length > 20) return jsonResponse({ error: 'Tag name too long (Max 20 chars)' }, 400);
				if (hasControlCharacters(name) || hasInvisibleCharacters(name)) return jsonResponse({ error: 'Tag name contains invalid characters' }, 400);
				
				await db.prepare('UPDATE tags SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, id).run();
				const locale = normalizeLocale(body.locale) || 'zh-CN';
				const localized = body.localized && typeof body.localized === 'object' ? body.localized : { name: { [locale]: name } };
				await saveLocalizedFields(`tag:${id}`, localized, ['name'], { [locale]: name });
				await security.logAudit(userPayload.id, 'UPDATE_TAG', 'tag', id, { name }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/tags/:id
		if (url.pathname.match(/^\/api\/admin\/tags\/\d+$/) && method === 'DELETE') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				await db.prepare('DELETE FROM post_tags WHERE tag_id = ?').bind(id).run();
				await db.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();
				await security.logAudit(userPayload.id, 'DELETE_TAG', 'tag', id, {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/categories
		if (url.pathname === '/api/admin/categories' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const { name, description = '', hero_title = '', hero_description = '', icon_url = '' } = body;
				const enabled = body.enabled === false || body.enabled === 0 || body.enabled === '0' ? 0 : 1;
				const adminOnly = body.admin_only === true || body.admin_only === 1 || body.admin_only === '1' ? 1 : 0;
				if (!name) return jsonResponse({ error: 'Missing name' }, 400);
				const nextSortOrder = (await db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM categories').first<number>('next_order')) || 10;
				
				const result = await db.prepare('INSERT INTO categories (name, description, hero_title, hero_description, icon_url, enabled, admin_only, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(name, description, hero_title, hero_description, String(icon_url || '').trim(), enabled, adminOnly, nextSortOrder).run();
				const categoryId = result.meta?.last_row_id || result.meta?.last_row_id === 0 ? Number(result.meta.last_row_id) : 0;
				if (categoryId) {
					const locale = normalizeLocale(body.locale) || 'zh-CN';
					const localized = body.localized && typeof body.localized === 'object' ? body.localized : {
						name: { [locale]: name },
						description: { [locale]: description },
						hero_title: { [locale]: hero_title },
						hero_description: { [locale]: hero_description },
					};
					await saveLocalizedFields(`category:${categoryId}`, localized, ['name', 'description', 'hero_title', 'hero_description'], {
						[locale]: '',
					});
				}
				await security.logAudit(userPayload.id, 'CREATE_CATEGORY', 'category', name, {}, request);
				return jsonResponse({ success: result.success, id: categoryId || undefined });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/categories/reorder
		if (url.pathname === '/api/admin/categories/reorder' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				const body = await request.json() as any;
				const rawIds = Array.isArray(body.ids) ? body.ids : [];
				const ids = rawIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
				if (!ids.length || ids.length !== new Set(ids).size) return jsonResponse({ error: 'Invalid category order' }, 400);
				const existing = await db.prepare(
					`SELECT id FROM categories WHERE id IN (${ids.map(() => '?').join(',')})`
				).bind(...ids).all();
				if ((existing.results || []).length !== ids.length) return jsonResponse({ error: 'Category not found' }, 404);
				const update = db.prepare('UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
				await db.batch(ids.map((id: number, index: number) => update.bind((index + 1) * 10, id)));
				await security.logAudit(userPayload.id, 'REORDER_CATEGORIES', 'category', 'all', { ids }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/categories/all
		if (url.pathname === '/api/admin/categories/all' && method === 'PUT') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const locale = normalizeLocale(body.locale) || 'zh-CN';
				const name = String(body.name || '').trim().slice(0, 80);
				if (!name) return jsonResponse({ error: 'Missing name' }, 400);
				const iconUrl = String(body.icon_url || '').trim();
				const localized = body.localized && typeof body.localized === 'object' ? body.localized : {
					name: { [locale]: name },
					description: { [locale]: String(body.description || '').trim().slice(0, 240) },
					hero_title: { [locale]: String(body.hero_title || '').trim().slice(0, 120) },
					hero_description: { [locale]: String(body.hero_description || '').trim().slice(0, 500) },
				};
				await saveLocalizedFields('category:all', localized, ['name', 'description', 'hero_title', 'hero_description'], {
					[locale]: '',
				});
				await db.prepare("INSERT INTO settings (key, value) VALUES ('all_category_icon_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(iconUrl).run();
				await security.logAudit(userPayload.id, 'UPDATE_SYSTEM_CATEGORY', 'category', 'all', { name }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/categories/:id
		if (url.pathname.match(/^\/api\/admin\/categories\/\d+$/) && method === 'PUT') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const { name, description = '', hero_title = '', hero_description = '', icon_url = '' } = body;
				const enabled = body.enabled === false || body.enabled === 0 || body.enabled === '0' ? 0 : 1;
				const adminOnly = body.admin_only === true || body.admin_only === 1 || body.admin_only === '1' ? 1 : 0;
				if (!name) return jsonResponse({ error: 'Missing name' }, 400);
				
				await db.prepare('UPDATE categories SET name = ?, description = ?, hero_title = ?, hero_description = ?, icon_url = ?, enabled = ?, admin_only = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, description, hero_title, hero_description, String(icon_url || '').trim(), enabled, adminOnly, id).run();
				const locale = normalizeLocale(body.locale) || 'zh-CN';
				const localized = body.localized && typeof body.localized === 'object' ? body.localized : {
					name: { [locale]: name },
					description: { [locale]: description },
					hero_title: { [locale]: hero_title },
					hero_description: { [locale]: hero_description },
				};
				await saveLocalizedFields(`category:${id}`, localized, ['name', 'description', 'hero_title', 'hero_description'], {
					[locale]: '',
				});
				await security.logAudit(userPayload.id, 'UPDATE_CATEGORY', 'category', id, { name, description, hero_title }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/categories/:id
		if (url.pathname.match(/^\/api\/admin\/categories\/\d+$/) && method === 'DELETE') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				// Check if there are posts in this category
				const count = await db.prepare('SELECT COUNT(*) as count FROM posts WHERE category_id = ?').bind(id).first<number>('count');
				if ((count ?? 0) > 0) {
					return jsonResponse({ error: 'Cannot delete category with existing posts' }, 400);
				}
				
				await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
				await security.logAudit(userPayload.id, 'DELETE_CATEGORY', 'category', id, {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// --- ADMIN ROUTES ---

		// GET /api/admin/stats
		if (url.pathname === '/api/admin/stats' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const [userCount, postCount, commentCount, topPosts, catStats, newUsers] = await Promise.all([
					db.prepare('SELECT COUNT(*) as count FROM users').first<number>('count'),
					db.prepare('SELECT COUNT(*) as count FROM posts').first<number>('count'),
					db.prepare('SELECT COUNT(*) as count FROM comments').first<number>('count'),
					db.prepare('SELECT p.id, p.title, p.view_count, u.username as author_name FROM posts p LEFT JOIN users u ON p.author_id = u.id ORDER BY p.view_count DESC LIMIT 10').all(),
					db.prepare('SELECT c.id, c.name, COUNT(p.id) as post_count FROM categories c LEFT JOIN posts p ON p.category_id = c.id GROUP BY c.id ORDER BY post_count DESC').all(),
					db.prepare('SELECT id, username, created_at, avatar_url FROM users ORDER BY created_at DESC LIMIT 5').all()
				]);
				
				return jsonResponse({
					users: userCount,
					posts: postCount,
					comments: commentCount,
					top_posts: topPosts.results || [],
					category_stats: catStats.results || [],
					newest_users: newUsers.results || []
				});
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/admin/users
		if (url.pathname === '/api/admin/users' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const { results } = await db.prepare('SELECT id, email, username, role, permissions, verified, created_at, avatar_url FROM users ORDER BY created_at DESC').all();
				return jsonResponse(results);
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/users
		if (url.pathname === '/api/admin/users' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const email = String(body.email || '').trim().toLowerCase();
				const username = String(body.username || '').trim();
				const password = String(body.password || '');
				const role = sanitizeRole(body.role || 'user') || 'user';
				const verified = body.verified ? 1 : 0;

				if (!email || !username || !password) return jsonResponse({ error: 'Missing email, username or password' }, 400);
				if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
				if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
				if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
				if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
				if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
				if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);
				if (password.length < 8 || password.length > 64) return jsonResponse({ error: 'Password must be 8-64 characters' }, 400);
				const roleRow = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(role).first<{ role: string }>();
				if (!roleRow) return jsonResponse({ error: 'Role not found' }, 400);

				const existing = await db.prepare('SELECT email, username FROM users WHERE email = ? OR username = ?').bind(email, username).first<DBUserEmail & { username: string }>();
				if (existing) {
					if (existing.email === email) return jsonResponse({ error: 'Email already exists' }, 409);
					return jsonResponse({ error: 'Username already taken' }, 409);
				}

				const passwordHash = await hashPassword(password);
				const token = verified ? null : generateToken();
				const result = await db.prepare(
					'INSERT INTO users (email, username, password, role, permissions, verified, verification_token, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
				).bind(email, username, passwordHash, role, JSON.stringify([]), verified, token, username).run();
				const newUserId = result.meta?.last_row_id;
				if (newUserId) {
					const identicon = await generateIdenticon(String(newUserId));
					await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(identicon, newUserId).run();
				}

				await security.logAudit(userPayload.id, 'ADMIN_CREATE_USER', 'user', String(newUserId || email), { email, username, role, verified }, request);
				return jsonResponse({ success: true, id: newUserId }, 201);
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/users/:id/verify (Manual Verify)
		if (url.pathname.match(/^\/api\/admin\/users\/\d+\/verify$/) && method === 'POST') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const { success } = await db.prepare('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?').bind(id).run();
				await security.logAudit(userPayload.id, 'MANUAL_VERIFY_USER', 'user', id, {}, request);

				// Notification
				const setting = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_manual_verify'").first<DBSetting>();
				if (setting && setting.value === '1') {
					const user = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{email:string;username:string}>();
					if (!user) throw new Error('User unexpectedly missing');
					const emailHtml = `
						<h1>账户已验证</h1>
						<p>您的账户 (用户名: <strong>${user.username}</strong>) 已通过管理员手动验证。</p>
						<p>您现在可以登录并使用所有功能。</p>
					`;
					ctx.waitUntil(sendEmail(user.email as string, '您的账户已通过验证', emailHtml, env).catch(console.error));
				}

				return jsonResponse({ success });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/users/:id/resend (Resend Verification Email)
		if (url.pathname.match(/^\/api\/admin\/users\/\d+\/resend$/) && method === 'POST') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DBUser>();
				if (!user) return jsonResponse({ error: 'User not found' }, 404);
				if (user.verified) return jsonResponse({ error: 'User already verified' }, 400);

				// Generate new token if needed, or use existing
				let token = user.verification_token;
				if (!token) {
					token = generateToken();
					await db.prepare('UPDATE users SET verification_token = ? WHERE id = ?').bind(token, id).run();
				}

				const baseUrl = getBaseUrl();
				const verifyLink = `${baseUrl}/api/verify?token=${token}`;
				const emailHtml = `
					<h1>欢迎加入论坛，${user.username}！</h1>
					<p>请点击下方链接验证您的邮箱地址：</p>
					<a href="${verifyLink}">验证邮箱</a>
					<p>如果您未请求此操作，请忽略此邮件。</p>
				`;

				ctx.waitUntil(
					sendEmail(user.email, '请验证您的邮箱', emailHtml, env)
						.catch(err => console.error('[Background Email Error]', err))
				);
				
				await security.logAudit(userPayload.id, 'RESEND_VERIFY_EMAIL', 'user', id, {}, request);

				return jsonResponse({ success: true, message: '验证邮件已发送' });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/users/:id
		if (url.pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
			const id = url.pathname.split('/').pop();
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				// 0. Delete user avatar and post images
				const user = await db.prepare('SELECT avatar_url FROM users WHERE id = ?').bind(id).first<{avatar_url?: string}>();
				const posts = await db.prepare('SELECT content FROM posts WHERE author_id = ?').bind(id).all();
				
				const deletionPromises: Promise<any>[] = [];
				if (user && user.avatar_url) {
					deletionPromises.push(deleteImage(env as unknown as S3Env, user.avatar_url, id));
				}
				if (posts.results) {
					for (const post of posts.results) {
						const imageUrls = extractImageUrls(post.content as string);
						imageUrls.forEach(url => deletionPromises.push(deleteImage(env as unknown as S3Env, url, id)));
					}
				}
				if (deletionPromises.length > 0) {
					ctx.waitUntil(Promise.all(deletionPromises).catch(err => console.error('Failed to delete user images', err)));
				}

				// 1. Delete likes and comments ON the user's posts (to avoid orphans)
				await db.prepare('DELETE FROM likes WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(id).run();
				await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?) OR comment_id IN (SELECT id FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?))').bind(id, id).run();
				await db.prepare('DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(id).run();
				await db.prepare('DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(id).run();

				// 2. Delete the user's own activity (likes and comments they made)
				await db.prepare('DELETE FROM likes WHERE user_id = ?').bind(id).run();
				await db.prepare('DELETE FROM user_progress_logs WHERE user_id = ?').bind(id).run();
				await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id IN (SELECT id FROM comments WHERE author_id = ?)').bind(id).run();
				await db.prepare('DELETE FROM comments WHERE author_id = ?').bind(id).run();

				// 3. Delete the user's posts
				await db.prepare('DELETE FROM posts WHERE author_id = ?').bind(id).run();

				// 4. Finally, delete the user
				const userToDelete = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first();
				await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
				
				await security.logAudit(userPayload.id, 'ADMIN_DELETE_USER', 'user', String(id), {}, request);

				// Notification
				if (userToDelete) {
					const setting = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_user_delete'").first();
					if (setting && setting.value === '1') {
						const emailHtml = `
							<h1>账户已删除</h1>
							<p>您的账户 (用户名: <strong>${userToDelete.username}</strong>) 已被管理员删除。</p>
							<p>如果您认为这是误操作，请联系管理员。</p>
						`;
						ctx.waitUntil(sendEmail(userToDelete.email as string, '您的账户已被删除', emailHtml, env).catch(console.error));
					}
				}

				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/posts/bulk-delete
		if (url.pathname === '/api/admin/posts/bulk-delete' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				const { ids } = await request.json() as { ids: number[] };
				if (!ids || !Array.isArray(ids) || ids.length === 0) return jsonResponse({ error: 'Missing post ids' }, 400);

				for (const id of ids) {
					const post = await db.prepare('SELECT content, author_id FROM posts WHERE id = ?').bind(id).first();
					if (post) {
						const imageUrls = extractImageUrls(post.content as string);
						if (imageUrls.length > 0) {
							ctx.waitUntil(Promise.all(imageUrls.map(url => deleteImage(env as unknown as S3Env, url, post.author_id as number))).catch(err => console.error('Failed to delete post images', err)));
						}
					}
					await db.prepare('DELETE FROM likes WHERE post_id = ?').bind(id).run();
					await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)').bind(id, id).run();
					await db.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run();
					await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
					await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
				}
				await security.logAudit(userPayload.id, 'ADMIN_BULK_DELETE_POSTS', 'post', ids.join(','), {}, request);
				return jsonResponse({ success: true, deleted: ids.length });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/posts/:id
		if (url.pathname.startsWith('/api/admin/posts/') && method === 'DELETE') {
			const id = url.pathname.split('/').pop();
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				// Delete images in post
				const post = await db.prepare('SELECT content, author_id FROM posts WHERE id = ?').bind(id).first();
				if (post) {
					const imageUrls = extractImageUrls(post.content as string);
					if (imageUrls.length > 0) {
						ctx.waitUntil(Promise.all(imageUrls.map(url => deleteImage(env as unknown as S3Env, url, post.author_id as number))).catch(err => console.error('Failed to delete post images', err)));
					}
				}

				await db.prepare('DELETE FROM likes WHERE post_id = ?').bind(id).run();
				await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)').bind(id, id).run();
				await db.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run();
				await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
				await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
				
				await security.logAudit(userPayload.id, 'ADMIN_DELETE_POST', 'post', String(id), {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/comments/:id
		if (url.pathname.match(/^\/api\/admin\/comments\/\d+$/) && method === 'PUT') {
			const id = url.pathname.split('/').pop();
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const content = String(body.content || '');
				if (!content || content.length > 3000) return jsonResponse({ error: 'Content too long' }, 400);
				if (isVisuallyEmpty(content)) return jsonResponse({ error: 'Comment cannot be empty' }, 400);
				if (hasInvisibleCharacters(content)) return jsonResponse({ error: 'Comment contains invalid invisible characters' }, 400);
				if (hasControlCharacters(content)) return jsonResponse({ error: 'Comment contains invalid control characters' }, 400);

				const existing = await db.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first<{ id: number }>();
				if (!existing) return jsonResponse({ error: 'Comment not found' }, 404);

				await db.prepare('UPDATE comments SET content = ? WHERE id = ?').bind(content.trim(), id).run();
				await security.logAudit(userPayload.id, 'ADMIN_UPDATE_COMMENT', 'comment', String(id), { content_length: content.length }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/moderation/:type/:id
		if (url.pathname.match(/^\/api\/admin\/moderation\/(post|comment)\/\d+$/) && method === 'POST') {
			const [, type, id] = url.pathname.match(/^\/api\/admin\/moderation\/(post|comment)\/(\d+)$/) || [];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, 'moderation');
				const body = await request.json() as any;
				const nextStatus = String(body.status || '') === 'rejected' ? 'rejected' : 'approved';
				const reason = nextStatus === 'rejected' ? String(body.reason || '').trim().slice(0, 500) : '';
				let moderatedPostId: number | string | null = null;
				if (type === 'post') {
					const post = await db.prepare('SELECT id, author_id, title, status FROM posts WHERE id = ?').bind(id).first<{ id: number; author_id: number; title?: string; status?: string }>();
					if (!post) return jsonResponse({ error: 'Post not found' }, 404);
					moderatedPostId = post.id;
					await db.prepare('UPDATE posts SET status = ?, rejection_reason = ? WHERE id = ?').bind(nextStatus, reason, id).run();
					if (nextStatus === 'approved' && post.status !== 'approved') {
						await awardUserProgress(Number(post.author_id), 'create_post', { postId: id });
					}
					await createNotification(Number(post.author_id), nextStatus === 'approved' ? 'post_approved' : 'post_rejected', nextStatus === 'approved' ? '帖子已通过审核' : '帖子被拒绝', nextStatus === 'approved' ? `《${post.title || '帖子'}》已发布。` : reason || '你的帖子未通过审核。', { postId: id });
					await security.logAudit(userPayload.id, 'MODERATE_POST', 'post', String(id), { status: nextStatus, reason }, request);
				} else {
					const comment = await db.prepare('SELECT id, author_id, post_id, parent_id, status FROM comments WHERE id = ?').bind(id).first<{ id: number; author_id: number; post_id: number; parent_id?: number | null; status?: string }>();
					if (!comment) return jsonResponse({ error: 'Comment not found' }, 404);
					moderatedPostId = comment.post_id;
					await db.prepare('UPDATE comments SET status = ?, rejection_reason = ? WHERE id = ?').bind(nextStatus, reason, id).run();
					if (nextStatus === 'approved' && comment.status !== 'approved') {
						const post = await db.prepare('SELECT author_id, title FROM posts WHERE id = ?').bind(comment.post_id).first<{ author_id: number; title?: string }>();
						await awardUserProgress(Number(comment.author_id), 'reply_post', { postId: comment.post_id, commentId: id });
						if (post && Number(post.author_id) !== Number(comment.author_id)) {
							await awardUserProgress(Number(post.author_id), 'post_replied', { postId: comment.post_id, commentId: id, meta: { reply_author_id: comment.author_id } });
							await createNotification(Number(post.author_id), 'post_replied', '帖子收到新回复', `《${post.title || '帖子'}》有新的回复。`, { postId: comment.post_id, commentId: id });
						}
						if (comment.parent_id) {
							const parent = await db.prepare('SELECT author_id FROM comments WHERE id = ?').bind(comment.parent_id).first<{ author_id: number }>();
							if (parent && Number(parent.author_id) !== Number(comment.author_id)) {
								await createNotification(Number(parent.author_id), 'comment_replied', '你的回复收到回复', '有人回复了你的评论。', { postId: comment.post_id, commentId: id, meta: { parent_comment_id: comment.parent_id } });
							}
						}
					}
					await createNotification(Number(comment.author_id), nextStatus === 'approved' ? 'comment_approved' : 'comment_rejected', nextStatus === 'approved' ? '评论已通过审核' : '评论被拒绝', nextStatus === 'approved' ? '你的评论已显示。' : reason || '你的评论未通过审核。', { postId: comment.post_id, commentId: id });
					await security.logAudit(userPayload.id, 'MODERATE_COMMENT', 'comment', String(id), { status: nextStatus, reason }, request);
				}
				return jsonResponse({ success: true, status: nextStatus, url: moderatedPostId ? publicPostPath(moderatedPostId, runtimeEnvForLinks) : undefined });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/moderation/bulk-status
		if (url.pathname === '/api/admin/moderation/bulk-status' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, 'moderation');
				const body = await request.json() as any;
				const nextStatus = String(body.status || '') === 'rejected' ? 'rejected' : 'approved';
				const reason = nextStatus === 'rejected' ? String(body.reason || '').trim().slice(0, 500) : '';
				const items = Array.isArray(body.items)
					? body.items
						.map((item: any) => ({ type: String(item.type || ''), id: Number(item.id) }))
						.filter((item: any) => (item.type === 'post' || item.type === 'comment') && Number.isInteger(item.id) && item.id > 0)
						.slice(0, 500)
					: [];
				if (!items.length) return jsonResponse({ error: 'Missing moderation items' }, 400);
				let updated = 0;
				for (const item of items) {
					if (item.type === 'post') {
						const post = await db.prepare('SELECT id, author_id, title, status FROM posts WHERE id = ?').bind(item.id).first<{ id: number; author_id: number; title?: string; status?: string }>();
						if (!post) continue;
						await db.prepare('UPDATE posts SET status = ?, rejection_reason = ? WHERE id = ?').bind(nextStatus, reason, item.id).run();
						if (nextStatus === 'approved' && post.status !== 'approved') {
							await awardUserProgress(Number(post.author_id), 'create_post', { postId: item.id });
						}
						await createNotification(Number(post.author_id), nextStatus === 'approved' ? 'post_approved' : 'post_rejected', nextStatus === 'approved' ? '帖子已通过审核' : '帖子被拒绝', nextStatus === 'approved' ? `《${post.title || '帖子'}》已发布。` : reason || '你的帖子未通过审核。', { postId: item.id });
						updated++;
					} else {
						const comment = await db.prepare('SELECT id, author_id, post_id, parent_id, status FROM comments WHERE id = ?').bind(item.id).first<{ id: number; author_id: number; post_id: number; parent_id?: number | null; status?: string }>();
						if (!comment) continue;
						await db.prepare('UPDATE comments SET status = ?, rejection_reason = ? WHERE id = ?').bind(nextStatus, reason, item.id).run();
						if (nextStatus === 'approved' && comment.status !== 'approved') {
							const post = await db.prepare('SELECT author_id, title FROM posts WHERE id = ?').bind(comment.post_id).first<{ author_id: number; title?: string }>();
							await awardUserProgress(Number(comment.author_id), 'reply_post', { postId: comment.post_id, commentId: item.id });
							if (post && Number(post.author_id) !== Number(comment.author_id)) {
								await awardUserProgress(Number(post.author_id), 'post_replied', { postId: comment.post_id, commentId: item.id, meta: { reply_author_id: comment.author_id } });
								await createNotification(Number(post.author_id), 'post_replied', '帖子收到新回复', `《${post.title || '帖子'}》有新的回复。`, { postId: comment.post_id, commentId: item.id });
							}
							if (comment.parent_id) {
								const parent = await db.prepare('SELECT author_id FROM comments WHERE id = ?').bind(comment.parent_id).first<{ author_id: number }>();
								if (parent && Number(parent.author_id) !== Number(comment.author_id)) {
									await createNotification(Number(parent.author_id), 'comment_replied', '你的回复收到回复', '有人回复了你的评论。', { postId: comment.post_id, commentId: item.id, meta: { parent_comment_id: comment.parent_id } });
								}
							}
						}
						await createNotification(Number(comment.author_id), nextStatus === 'approved' ? 'comment_approved' : 'comment_rejected', nextStatus === 'approved' ? '评论已通过审核' : '评论被拒绝', nextStatus === 'approved' ? '你的评论已显示。' : reason || '你的评论未通过审核。', { postId: comment.post_id, commentId: item.id });
						updated++;
					}
				}
				await security.logAudit(userPayload.id, 'BULK_MODERATION_STATUS', 'moderation', String(updated), { status: nextStatus, requested: items.length, reason }, request);
				return jsonResponse({ success: true, status: nextStatus, count: updated });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/moderation/bulk-delete
		if (url.pathname === '/api/admin/moderation/bulk-delete' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, 'moderation');
				const body = await request.json() as any;
				const items = Array.isArray(body.items)
					? body.items
						.map((item: any) => ({ type: String(item.type || ''), id: Number(item.id) }))
						.filter((item: any) => (item.type === 'post' || item.type === 'comment') && Number.isInteger(item.id) && item.id > 0)
						.slice(0, 500)
					: [];
				if (!items.length) return jsonResponse({ error: 'Missing moderation items' }, 400);
				let deleted = 0;
				for (const item of items) {
					if (item.type === 'post') {
						const post = await db.prepare('SELECT content, author_id FROM posts WHERE id = ?').bind(item.id).first();
						if (!post) continue;
						const imageUrls = extractImageUrls(post.content as string);
						if (imageUrls.length > 0) ctx.waitUntil(Promise.all(imageUrls.map(url => deleteImage(env as unknown as S3Env, url, post.author_id as number))).catch(err => console.error('Failed to delete post images', err)));
						await db.prepare('DELETE FROM likes WHERE post_id = ?').bind(item.id).run();
						await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)').bind(item.id, item.id).run();
						await db.prepare('DELETE FROM comments WHERE post_id = ?').bind(item.id).run();
						await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(item.id).run();
						await db.prepare('DELETE FROM posts WHERE id = ?').bind(item.id).run();
						deleted++;
					} else {
						const tree = await db.prepare(`
							WITH RECURSIVE comment_tree(id, depth) AS (
								SELECT id, 0 FROM comments WHERE id = ?
								UNION ALL
								SELECT c.id, comment_tree.depth + 1
								FROM comments c
								JOIN comment_tree ON c.parent_id = comment_tree.id
							)
							SELECT id FROM comment_tree ORDER BY depth DESC
						`).bind(item.id).all<{ id: number }>();
						if (!(tree.results || []).length) continue;
						for (const row of tree.results || []) {
							await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id = ?').bind(row.id).run();
							await db.prepare('DELETE FROM comments WHERE id = ?').bind(row.id).run();
						}
						deleted++;
					}
				}
				await security.logAudit(userPayload.id, 'BULK_MODERATION_DELETE', 'moderation', String(deleted), { requested: items.length }, request);
				return jsonResponse({ success: true, count: deleted });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/moderation/:type/:id
		if (url.pathname.match(/^\/api\/admin\/moderation\/(post|comment)\/\d+$/) && method === 'DELETE') {
			const [, type, id] = url.pathname.match(/^\/api\/admin\/moderation\/(post|comment)\/(\d+)$/) || [];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				if (type === 'post') {
					const post = await db.prepare('SELECT content, author_id FROM posts WHERE id = ?').bind(id).first();
					if (post) {
						const imageUrls = extractImageUrls(post.content as string);
						if (imageUrls.length > 0) ctx.waitUntil(Promise.all(imageUrls.map(url => deleteImage(env as unknown as S3Env, url, post.author_id as number))).catch(err => console.error('Failed to delete post images', err)));
					}
					await db.prepare('DELETE FROM likes WHERE post_id = ?').bind(id).run();
					await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)').bind(id, id).run();
					await db.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run();
					await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
					await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
					await security.logAudit(userPayload.id, 'MODERATION_DELETE_POST', 'post', String(id), {}, request);
				} else {
					const tree = await db.prepare(`
						WITH RECURSIVE comment_tree(id, depth) AS (
							SELECT id, 0 FROM comments WHERE id = ?
							UNION ALL
							SELECT c.id, comment_tree.depth + 1
							FROM comments c
							JOIN comment_tree ON c.parent_id = comment_tree.id
						)
						SELECT id FROM comment_tree ORDER BY depth DESC
					`).bind(id).all<{ id: number }>();
					for (const row of tree.results || []) {
						await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id = ?').bind(row.id).run();
						await db.prepare('DELETE FROM comments WHERE id = ?').bind(row.id).run();
					}
					await security.logAudit(userPayload.id, 'MODERATION_DELETE_COMMENT', 'comment', String(id), {}, request);
				}
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/comments/bulk-delete
		if (url.pathname === '/api/admin/comments/bulk-delete' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as { ids?: unknown };
				const ids = Array.isArray(body.ids)
					? Array.from(new Set(body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 500)
					: [];
				if (!ids.length) return jsonResponse({ error: 'Missing comment ids' }, 400);

				let deleted = 0;
				for (const rootId of ids) {
					const tree = await db.prepare(`
						WITH RECURSIVE comment_tree(id, depth) AS (
							SELECT id, 0 FROM comments WHERE id = ?
							UNION ALL
							SELECT c.id, comment_tree.depth + 1
							FROM comments c
							JOIN comment_tree ON c.parent_id = comment_tree.id
						)
						SELECT id FROM comment_tree ORDER BY depth DESC
					`).bind(rootId).all<{ id: number }>();
					const treeIds = tree.results?.map((row) => row.id) || [];
					for (const commentId of treeIds) {
						await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id = ?').bind(commentId).run();
						await db.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
						deleted += 1;
					}
				}
				await security.logAudit(userPayload.id, 'ADMIN_BULK_DELETE_COMMENTS', 'comment', ids.join(','), { deleted }, request);
				return jsonResponse({ success: true, deleted });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/comments/:id
		if (url.pathname.match(/^\/api\/admin\/comments\/\d+$/) && method === 'DELETE') {
			const id = url.pathname.split('/').pop();
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const tree = await db.prepare(`
					WITH RECURSIVE comment_tree(id, depth) AS (
						SELECT id, 0 FROM comments WHERE id = ?
						UNION ALL
						SELECT c.id, comment_tree.depth + 1
						FROM comments c
						JOIN comment_tree ON c.parent_id = comment_tree.id
					)
					SELECT id FROM comment_tree ORDER BY depth DESC
				`).bind(id).all<{ id: number }>();
				for (const row of tree.results || []) {
					await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id = ?').bind(row.id).run();
					await db.prepare('DELETE FROM comments WHERE id = ?').bind(row.id).run();
				}
				
				await security.logAudit(userPayload.id, 'ADMIN_DELETE_COMMENT', 'comment', String(id), {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/posts/:id/pin
		if (url.pathname.match(/^\/api\/admin\/posts\/\d+\/pin$/) && method === 'POST') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const { pinned } = body;
				await db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?').bind(pinned ? 1 : 0, id).run();
				
				await security.logAudit(userPayload.id, 'ADMIN_PIN_POST', 'post', id, { pinned }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/posts/:id/category-pin
		if (url.pathname.match(/^\/api\/admin\/posts\/\d+\/category-pin$/) && method === 'POST') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const { pinned } = body;
				await db.prepare('UPDATE posts SET is_category_pinned = ? WHERE id = ?').bind(pinned ? 1 : 0, id).run();
				
				await security.logAudit(userPayload.id, 'ADMIN_CATEGORY_PIN_POST', 'post', id, { pinned }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/posts/:id/move
		if (url.pathname.match(/^\/api\/admin\/posts\/\d+\/move$/) && method === 'POST') {
			const id = url.pathname.split('/')[4];
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));

				const body = await request.json() as any;
				const { category_id } = body;
				
				// Validate category exists if provided
				if (category_id) {
					const category = await db.prepare('SELECT id FROM categories WHERE id = ?').bind(category_id).first();
					if (!category) return jsonResponse({ error: 'Category not found' }, 404);
				}

				await db.prepare('UPDATE posts SET category_id = ? WHERE id = ?').bind(category_id || null, id).run();
				
				await security.logAudit(userPayload.id, 'ADMIN_MOVE_POST', 'post', id, { category_id }, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/admin/cleanup/analyze
		if (url.pathname === '/api/admin/cleanup/analyze' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
                                
				// 1. List all S3 objects
				const allKeys = await listAllKeys(env as unknown as S3Env);
				
				// 2. Gather used URLs
				const usedKeys = new Set<string>();

				// Users avatars
				const users = await db.prepare('SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL').all();
				for (const u of users.results) {
					const uUrl = u.avatar_url as string;
					const key = uUrl ? getKeyFromUrl(env as unknown as S3Env, uUrl) : null;
					if (key) usedKeys.add(key);
				}

				// Posts images
				const posts = await db.prepare('SELECT content FROM posts').all();
				for (const p of posts.results) {
					const urls = extractImageUrls(p.content as string);
					for (const uUrl of urls) {
						const key = uUrl ? getKeyFromUrl(env as unknown as S3Env, uUrl) : null;
						if (key) usedKeys.add(key);
					}
				}

				// 3. Find orphans
				const orphans = allKeys.filter(key => !usedKeys.has(key));

				return jsonResponse({ 
					total_files: allKeys.length,
					used_files: usedKeys.size,
					orphaned_files: orphans.length,
					orphans: orphans
				});

			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/cleanup/execute
		if (url.pathname === '/api/admin/cleanup/execute' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				
				const body = await request.json() as any;
				const { orphans } = body;
				
				if (!orphans || !Array.isArray(orphans)) return jsonResponse({ error: 'Invalid parameters' }, 400);

				const deletePromises = orphans.map(key => deleteImage(env as unknown as S3Env, key));
				
				ctx.waitUntil(Promise.all(deletePromises).catch(err => console.error('Cleanup failed', err)));
				
				return jsonResponse({ success: true, message: `Deletion of ${orphans.length} files started` });
			} catch (e) {
				return handleError(e);
			}
		}

		// --- END ADMIN ROUTES ---

		// TEST: Email Debug
		if (url.pathname === '/api/test-email' && method === 'POST') {
			try {
				const body = await request.json() as any;
				const { to } = body;
				if (!to) return jsonResponse({ error: '缺少收件人地址' }, 400);

				console.log('[DEBUG] Starting test email to:', to);
				await sendEmail(to, '测试邮件', '<h1>你好</h1><p>这是一封测试邮件。</p>', env);
				console.log('[DEBUG] Test email sent successfully');
				
				return jsonResponse({ success: true, message: '邮件已发送' });
			} catch (e) {
				console.error('[DEBUG] Test email failed:', e);
				return handleError(e);
			}
		}

		// AUTH: Register
		if (url.pathname === '/api/register' && method === 'POST') {
			try {
				const body = await request.json() as any;

				// Turnstile Check
				const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
				if (!(await checkTurnstile(body, ip))) {
					return jsonResponse({ error: 'Turnstile verification failed' }, 403);
				}

				const { email, password } = body;
				if (!email || !password) {
					return jsonResponse({ error: 'Missing email or password' }, 400);
				}

				if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
				const username = await usernameFromEmail(email);
				if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
				if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
				if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
				if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
				if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);

				if (password.length < 8 || password.length > 16) return jsonResponse({ error: 'Password must be 8-16 characters' }, 400);

				const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
				if (existingEmail) return jsonResponse({ error: 'Email already exists' }, 409);

				const passwordHash = await hashPassword(password);
				const verificationToken = generateToken();

				const { success, meta } = await db.prepare(
					'INSERT INTO users (email, username, password, role, verified, verification_token) VALUES (?, ?, ?, "user", ?, ?)'
				).bind(email, username, passwordHash, 0, verificationToken).run();

				let userId = Number(meta?.last_row_id || 0);
				if (success) {
					// Generate Default Avatar (Identicon)
					// Use ID if available, otherwise fallback to Username
					if (userId) {
						const identicon = await generateIdenticon(String(userId));
						await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(identicon, userId).run();
					} else {
						const row = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
						userId = Number(row?.id || 0);
						// Fallback if ID retrieval fails (rare in D1)
						const identicon = await generateIdenticon(username);
						// We don't have ID easily without query, but we can update by username or just skip
						await db.prepare('UPDATE users SET avatar_url = ? WHERE username = ?').bind(identicon, username).run();
					}
					if (userId) {
						await createNotification(
							userId,
							'email_verification',
							'请验证邮箱',
							'验证后才能发帖、评论、点赞、签到和上传帖子媒体。',
							{ meta: { href: '/settings', email } }
						);
						ctx.waitUntil((async () => {
							try {
								await sendVerificationEmail(email, username, verificationToken);
							} catch (e) {
								console.error('[Registration Email Error]', e);
								await logAuditEvent('email.verification_failed', 'user', String(userId), {
									email,
									error: e instanceof Error ? e.message : String(e || 'Unknown error'),
								}, userId);
							}
						})());
					}
				}

				const { token, jti, expiresAt } = await security.generateToken({
					id: userId,
					role: 'user',
					email
				});
				if (userId) {
					await db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, userId, expiresAt).run();
					await logAuditEvent('REGISTER', 'user', String(userId), { email }, userId);
				}
				return jsonResponse({
					success,
					message: '注册成功，请前往铃铛通知或邮箱完成验证。',
					token,
					redirect: '/'
				}, 201, { 'Set-Cookie': authCookie(token, expiresAt) });
			} catch (e: any) {
				if (e.message && e.message.includes('UNIQUE constraint failed')) {
					return jsonResponse({ error: 'Email already exists' }, 409);
				}
				return handleError(e);
			}
		}

		// AUTH: Verify Email
		if (url.pathname === '/api/verify' && method === 'GET') {
			const token = url.searchParams.get('token');
			if (!token) {
				return new Response('缺少 token', { status: 400 });
			}

			try {
				const result = await db.prepare(
					'UPDATE users SET verified = 1, verification_token = NULL WHERE verification_token = ? AND COALESCE(verified, 0) = 0'
				).bind(token).run();

				if (Number(result.meta?.changes || 0) > 0) {
					return Response.redirect(`${getBaseUrl().replace(/\/+$/, '')}/login?verified=true`, 302);
				} else {
					return new Response('token 无效或已过期', { status: 400 });
				}
			} catch (e) {
				return new Response('验证失败', { status: 500 });
			}
		}

		// GET /users
		if (url.pathname === '/api/users' && method === 'GET') {
			try {
				const { results } = await db.prepare(
					'SELECT id, email, username, created_at FROM users'
				).all();
				return jsonResponse(results);
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/user/likes (Get all post IDs liked by user)
		if (url.pathname === '/api/user/likes' && method === 'GET') {
			try {
				const userPayload = await authenticate(request);
				const { results } = await db.prepare('SELECT post_id FROM likes WHERE user_id = ?').bind(userPayload.id).all();
				return jsonResponse(results.map((r: any) => r.post_id));
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /posts
		if (url.pathname === '/api/posts' && method === 'GET') {
			try {
				const limit = parseInt(url.searchParams.get('limit') || '20');
				const offset = parseInt(url.searchParams.get('offset') || '0');
				const categoryId = url.searchParams.get('category_id');
				const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
				const sortByRaw = (url.searchParams.get('sort_by') || 'time').trim().toLowerCase();
				const sortDirRaw = (url.searchParams.get('sort_dir') || 'desc').trim().toLowerCase();
				const sortDir = sortDirRaw === 'asc' ? 'ASC' : 'DESC';
				let viewer: UserPayload | null = null;
				try {
					viewer = await loadAccessUser(await authenticate(request));
				} catch {}
				const includeAdminOnly = viewer ? canAdmin(viewer, 'posts') || canAdmin(viewer, 'categories') : false;
				
				let query = `SELECT 
                        posts.*, 
                        users.username as author_name, 
                        users.avatar_url as author_avatar,
                        users.role as author_role,
                        categories.name as category_name,
                        categories.admin_only as admin_only,
                        (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
                        (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND COALESCE(comments.status, 'approved') = 'approved') as comment_count
                     FROM posts 
                     JOIN users ON posts.author_id = users.id 
                     LEFT JOIN categories ON posts.category_id = categories.id`;
                
                let countQuery = `SELECT COUNT(*) as total FROM posts LEFT JOIN categories ON posts.category_id = categories.id`;

                const params: any[] = [];
                const countParams: any[] = [];
				const conditions: string[] = [
					`COALESCE(posts.status, 'approved') = 'approved'`,
					`(posts.category_id IS NULL OR (COALESCE(categories.enabled, 1) = 1 AND (? = 1 OR COALESCE(categories.admin_only, 0) = 0)))`
				];
				params.push(includeAdminOnly ? 1 : 0);
				countParams.push(includeAdminOnly ? 1 : 0);

                if (categoryId) {
                    if (categoryId === 'uncategorized') {
						conditions.push(`posts.category_id IS NULL`);
                    } else {
						conditions.push(`posts.category_id = ?`);
                        params.push(categoryId);
                        countParams.push(categoryId);
                    }
                }

				if (q) {
					conditions.push(`(posts.title LIKE ? OR posts.content LIKE ?)`);
					const like = `%${q}%`;
					params.push(like, like);
					countParams.push(like, like);
				}

				if (conditions.length) {
					query += ` WHERE ${conditions.join(' AND ')}`;
					countQuery += ` WHERE ${conditions.join(' AND ')}`;
				}

				const sortExpr =
					sortByRaw === 'likes'
						? `like_count ${sortDir}`
						: sortByRaw === 'comments'
							? `comment_count ${sortDir}`
							: sortByRaw === 'views'
							? `posts.view_count ${sortDir}`
								: `posts.created_at ${sortDir}`;

				const apiPinSortExpr = categoryId && categoryId !== 'uncategorized'
					? 'is_pinned DESC, COALESCE(is_category_pinned, 0) DESC'
					: 'is_pinned DESC';
                query += ` ORDER BY ${apiPinSortExpr}, ${sortExpr}, posts.created_at DESC LIMIT ? OFFSET ?`;
                params.push(limit, offset);
				
				const [postsResult, countResult] = await Promise.all([
                    db.prepare(query).bind(...params).all(),
                    db.prepare(countQuery).bind(...countParams).first()
                ]);

				const apiCategories = await getSiteCategories(viewer);
				const postsWithTags = await attachTagsToPosts(applyLocalizedCategoriesToPosts((postsResult.results || []) as any[], apiCategories));
				const safePosts = postsWithTags.map((post: any) => canViewPostByLevel(viewer, post)
					? post
					: { ...post, content: '', locked: true, comment_count: 0 });
				return jsonResponse({
                    posts: safePosts,
                    total: countResult ? countResult.total : 0
                });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/posts/:id
		if (url.pathname.match(/^\/api\/posts\/\d+$/) && method === 'GET') {
			const postId = url.pathname.split('/')[3];
			try {
				const post = await db.prepare(
					`SELECT 
                        posts.*, 
                        users.username as author_name, 
                        users.avatar_url as author_avatar,
                        users.role as author_role,
                        categories.name as category_name,
                        (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
                        (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND COALESCE(comments.status, 'approved') = 'approved') as comment_count
                     FROM posts 
                     JOIN users ON posts.author_id = users.id 
                     LEFT JOIN categories ON posts.category_id = categories.id
                     WHERE posts.id = ? AND COALESCE(posts.status, 'approved') = 'approved' AND (posts.category_id IS NULL OR COALESCE(categories.enabled, 1) = 1)`
				).bind(postId).first();
				let viewer: UserPayload | null = null;
				try {
					viewer = await loadAccessUser(await authenticate(request));
				} catch {}
				if (!post) return jsonResponse({ error: 'Post not found' }, 404);
				if (Number((post as any).admin_only || 0) !== 0 && !(viewer && (canAdmin(viewer, 'posts') || canAdmin(viewer, 'categories')))) return jsonResponse({ error: 'Post not found' }, 404);
				if (!canViewPostByLevel(viewer, post as any)) return jsonResponse({ error: 'Level required to view this post' }, 403);

				try {
					await db.prepare('UPDATE posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?').bind(postId).run();
					(post as any).view_count = Number((post as any).view_count || 0) + 1;
				} catch {}
				
				// Check like status if user_id provided
				const userId = url.searchParams.get('user_id');
				if (userId) {
					const like = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, userId).first();
					(post as any).liked = !!like;
				}

				const apiCategories = await getSiteCategories(viewer);
				const [postWithTags] = await attachTagsToPosts(applyLocalizedCategoriesToPosts([post as any], apiCategories));
				return jsonResponse(postWithTags);
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/posts/:id
		if (url.pathname.match(/^\/api\/posts\/\d+$/) && method === 'PUT') {
			const postId = url.pathname.split('/')[3];
			try {
				const userPayload = await requireVerifiedUser(await authenticate(request));
				const body = await request.json() as any;
				const { title, content, category_id } = body; // user_id not needed from body
				const minViewLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_view_level || 0) || 0)));
				const minCommentLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_comment_level || 0) || 0)));
				const tagIds = parseTagIds(body.tag_ids);

				if (!title || !content) {
					return jsonResponse({ error: 'Missing parameters' }, 400);
				}

				if (isVisuallyEmpty(title) || isVisuallyEmpty(content)) return jsonResponse({ error: 'Title or content cannot be empty' }, 400);

				if (hasInvisibleCharacters(title) || hasInvisibleCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid invisible characters' }, 400);

				// Check ownership or admin
				const post = await db.prepare('SELECT author_id, status, rejection_reason FROM posts WHERE id = ?').bind(postId).first<any>();
				if (!post) return jsonResponse({ error: 'Post not found' }, 404);

				// Use userPayload for RBAC
				const isAdminEdit = canAdmin(userPayload, 'posts');
				if (Number(post.author_id) !== Number(userPayload.id) && !isAdminEdit) {
					return jsonResponse({ error: 'Unauthorized' }, 403);
				}

				// Validate Lengths
				if (title.length > 30) return jsonResponse({ error: 'Title too long (Max 30 chars)' }, 400);
				if (content.length > 3000) return jsonResponse({ error: 'Content too long (Max 3000 chars)' }, 400);
				if (hasControlCharacters(title) || hasControlCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid control characters' }, 400);

				// Validate Category
				if (category_id) {
					const category = await db.prepare('SELECT id FROM categories WHERE id = ? AND COALESCE(enabled, 1) = 1 AND (? = 1 OR COALESCE(admin_only, 0) = 0)').bind(category_id, isAdminEdit ? 1 : 0).first();
					if (!category) return jsonResponse({ error: 'Category not found' }, 400);
				}
				if (!(await validateTagIds(tagIds))) return jsonResponse({ error: 'Tag not found' }, 400);

				let nextStatus = String(post.status || 'approved');
				let nextRejectReason = String(post.rejection_reason || '');
				if (!isAdminEdit) {
					const moderation = await db.prepare("SELECT value FROM settings WHERE key = 'moderation_posts_default'").first<DBSetting>();
					nextStatus = moderation?.value === 'pending' ? 'pending' : 'approved';
					nextRejectReason = '';
				}
				await db.prepare(
					'UPDATE posts SET title = ?, content = ?, category_id = ?, min_view_level = ?, min_comment_level = ?, status = ?, rejection_reason = ? WHERE id = ?'
				).bind(title.trim(), content.trim(), category_id || null, minViewLevel, minCommentLevel, nextStatus, nextStatus === 'rejected' ? nextRejectReason : '', postId).run();
				await syncPostTags(postId, tagIds);
				if (!isAdminEdit && nextStatus === 'pending') {
					await createNotification(userPayload.id, 'post_resubmitted', '帖子已重新提交', '你的帖子修改后已重新提交审核。', { postId });
				}
				if (!isAdminEdit && String(post.status || 'approved') !== 'approved' && nextStatus === 'approved') {
					await awardUserProgress(userPayload.id, 'create_post', { postId });
				}
				
				await security.logAudit(userPayload.id, 'UPDATE_POST', 'post', postId, { title_length: title.length, tag_ids: tagIds, status: nextStatus }, request);

				return jsonResponse({ success: true, status: nextStatus });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/posts/:id (User delete own post)
		if (url.pathname.match(/^\/api\/posts\/\d+$/) && method === 'DELETE') {
			const id = url.pathname.split('/')[3];
			try {
				const userPayload = await authenticate(request);
				
				// Check ownership
				const post = await db.prepare('SELECT author_id, content FROM posts WHERE id = ?').bind(id).first();
				if (!post) return jsonResponse({ error: 'Post not found' }, 404);
				
				if (post.author_id !== userPayload.id) {
					return jsonResponse({ error: 'Unauthorized' }, 403);
				}

				// Delete images in post
				const imageUrls = extractImageUrls(post.content as string);
				if (imageUrls.length > 0) {
					ctx.waitUntil(Promise.all(imageUrls.map(url => deleteImage(env as unknown as S3Env, url, userPayload.id))).catch(err => console.error('Failed to delete post images', err)));
				}

				await db.prepare('DELETE FROM likes WHERE post_id = ?').bind(id).run();
				await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)').bind(id, id).run();
				await db.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run();
				await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
				await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
				
				await security.logAudit(userPayload.id, 'DELETE_POST', 'post', id, {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/posts/:id/comments
		if (url.pathname.match(/^\/api\/posts\/\d+\/comments$/) && method === 'POST') {
			const postId = url.pathname.split('/')[3];
			try {
				const userPayload = await requireVerifiedUser(await authenticate(request));
				const body = await request.json() as any;
				const { content, parent_id } = body;

				if (!content || String(content).length > 3000) return jsonResponse({ error: 'Content too long' }, 400);
				if (isVisuallyEmpty(String(content))) return jsonResponse({ error: 'Comment cannot be empty' }, 400);

				const setting = await db.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first<DBSetting>();
				if (setting && setting.value === '1') {
					if (!(await checkTurnstile(body, request.headers.get('CF-Connecting-IP') || '127.0.0.1'))) {
						return jsonResponse({ error: 'Turnstile verification failed' }, 403);
					}
				}

				const post = await db.prepare("SELECT id, author_id, min_comment_level FROM posts WHERE id = ? AND COALESCE(status, 'approved') = 'approved'").bind(postId).first<{ id: number; author_id: number; min_comment_level?: number }>();
				if (!post) return jsonResponse({ error: 'Post not found' }, 404);
				const minCommentLevel = Math.max(0, Number(post.min_comment_level || 0));
				const canCommentByLevel = Number(post.author_id) === Number(userPayload.id) || canAdmin(userPayload, 'comments') || Number((userPayload as any).level || 0) >= minCommentLevel;
				if (!canCommentByLevel) return jsonResponse({ error: `Level ${minCommentLevel} required to comment` }, 403);

				let parentComment: { id: number; author_id: number; post_id: number } | null = null;
				// Verify parent comment exists if parent_id is provided
				if (parent_id) {
					parentComment = await db.prepare('SELECT id, author_id, post_id FROM comments WHERE id = ? AND post_id = ? AND COALESCE(status, \'approved\') = \'approved\'').bind(parent_id, postId).first<{ id: number; author_id: number; post_id: number }>();
					if (!parentComment) return jsonResponse({ error: 'Parent comment not found' }, 404);
				}

				const moderation = await db.prepare("SELECT value FROM settings WHERE key = 'moderation_comments_default'").first<DBSetting>();
				const commentStatus = userPayload.role === 'admin' || moderation?.value !== 'pending' ? 'approved' : 'pending';
				const { meta } = await db.prepare(
					'INSERT INTO comments (post_id, author_id, content, parent_id, status) VALUES (?, ?, ?, ?, ?)'
				).bind(postId, userPayload.id, content, parent_id || null, commentStatus).run();
				const commentId = meta.last_row_id;
				if (commentStatus === 'approved') await awardUserProgress(userPayload.id, 'reply_post', { postId, commentId });
				if (commentStatus === 'approved' && Number(post.author_id) !== Number(userPayload.id)) {
					await awardUserProgress(Number(post.author_id), 'post_replied', { postId, commentId, meta: { reply_author_id: userPayload.id } });
					await createNotification(Number(post.author_id), 'post_replied', '帖子收到新回复', '你的帖子有新的回复。', { postId, commentId });
				}
				if (commentStatus === 'approved' && parentComment && Number(parentComment.author_id) !== Number(userPayload.id)) {
					await createNotification(Number(parentComment.author_id), 'comment_replied', '你的回复收到回复', '有人回复了你的评论。', { postId, commentId, meta: { parent_comment_id: parentComment.id } });
				}
				if (commentStatus === 'pending') {
					await createNotification(userPayload.id, 'comment_pending', '评论等待审核', '你的评论已提交，管理员审核后会显示。', { postId, commentId });
				}

				return jsonResponse({ success: true, id: commentId, status: commentStatus }, 201);
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/posts/:id/comments
		if (url.pathname.match(/^\/api\/posts\/\d+\/comments$/) && method === 'GET') {
			const postId = url.pathname.split('/')[3];
			try {
				const post = await db.prepare("SELECT id, author_id, min_view_level FROM posts WHERE id = ? AND COALESCE(status, 'approved') = 'approved'").bind(postId).first<{ id: number; author_id: number; min_view_level?: number }>();
				if (!post) return jsonResponse({ error: 'Post not found' }, 404);
				let viewer: UserPayload | null = null;
				try {
					viewer = await loadAccessUser(await authenticate(request));
				} catch {}
				if (!canViewPostByLevel(viewer, post)) return jsonResponse({ error: 'Level required to view comments' }, 403);
				const { results } = await db.prepare(
					`SELECT comments.*, users.username, users.avatar_url, users.role 
                     FROM comments 
                     JOIN users ON comments.author_id = users.id 
                     WHERE post_id = ? AND COALESCE(comments.status, 'approved') = 'approved'
                     ORDER BY created_at ASC`
				).bind(postId).all();
				return jsonResponse(results);
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/comments/:id
		if (url.pathname.match(/^\/api\/comments\/\d+$/) && method === 'DELETE') {
			const id = url.pathname.split('/').pop();
			try {
				const userPayload = await loadAccessUser(await authenticate(request));
				
				// Fetch comment to check ownership
				const comment = await db.prepare('SELECT author_id FROM comments WHERE id = ?').bind(id).first();
				
				if (!comment) return jsonResponse({ error: 'Comment not found' }, 404);

				// Allow deletion if user is author OR admin
				if (comment.author_id !== userPayload.id && !canAdmin(userPayload, 'comments')) {
					return jsonResponse({ error: 'Unauthorized' }, 403);
				}

				// Delete the comment AND its children (orphans prevention)
				await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id = ? OR comment_id IN (SELECT id FROM comments WHERE parent_id = ?)').bind(id, id).run();
				await db.prepare('DELETE FROM comments WHERE parent_id = ?').bind(id).run();
				await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
				
				await security.logAudit(userPayload.id, 'DELETE_COMMENT', 'comment', String(id), {}, request);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/posts/:id/like
		if (url.pathname.match(/^\/api\/posts\/\d+\/like$/) && method === 'POST') {
			const postId = url.pathname.split('/')[3];
			try {
				const userPayload = await requireVerifiedUser(await authenticate(request));
				const userId = userPayload.id;

				// Toggle like
				const existing = await db.prepare(
					'SELECT id FROM likes WHERE post_id = ? AND user_id = ?'
				).bind(postId, userId).first();

				if (existing) {
					await db.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
					const likeCount = await db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').bind(postId).first<number>('count');
					return jsonResponse({ liked: false, like_count: Number(likeCount || 0) });
				} else {
					await db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').bind(postId, userId).run();
					const likeCount = await db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').bind(postId).first<number>('count');
					return jsonResponse({ liked: true, like_count: Number(likeCount || 0) });
				}
			} catch (e) {
				return handleError(e);
			}
		}
		
		// GET /api/posts/:id/like-status
		if (url.pathname.match(/^\/api\/posts\/\d+\/like-status$/) && method === 'GET') {
			const postId = url.pathname.split('/')[3];
			
			try {
				const userPayload = await authenticate(request);
				const existing = await db.prepare(
					'SELECT id FROM likes WHERE post_id = ? AND user_id = ?'
				).bind(postId, userPayload.id).first();
				return jsonResponse({ liked: !!existing });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /posts (Protected - in real app check token)
		if (url.pathname === '/api/posts' && method === 'POST') {
			try {
				const userPayload = await requireVerifiedUser(await authenticate(request));
				const body = await request.json() as any;

				// Turnstile Check
				const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
				if (!(await checkTurnstile(body, ip))) {
					return jsonResponse({ error: 'Turnstile verification failed' }, 403);
				}

				const { title, content: rawContent, category_id } = body;
				const minViewLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_view_level || 0) || 0)));
				const minCommentLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_comment_level || 0) || 0)));
				const tagIds = parseTagIds(body.tag_ids);
				let content = rawContent;
				
				if (!title || !content) {
					return jsonResponse({ error: 'Missing title or content' }, 400);
				}
				
				// --- Input Sanitization & Validation (Sync with Frontend) ---
				if (isVisuallyEmpty(title) || isVisuallyEmpty(content)) return jsonResponse({ error: 'Title or content cannot be empty' }, 400);
				
				if (hasInvisibleCharacters(title) || hasInvisibleCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid invisible characters' }, 400);

				// Validate Lengths
				if (title.length > 30) return jsonResponse({ error: 'Title too long (Max 30 chars)' }, 400);
				if (content.length > 3000) return jsonResponse({ error: 'Content too long (Max 3000 chars)' }, 400);

				if (hasControlCharacters(title) || hasControlCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid control characters' }, 400);

				// HTML Escape Content (Backend Enforcement)
				content = content
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;')
					.replace(/'/g, '&#039;');
				
				// Escape Title as well just in case
				const safeTitle = title
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;')
					.replace(/'/g, '&#039;');

				// Validate Category
				if (category_id) {
					const category = await db.prepare('SELECT id FROM categories WHERE id = ? AND COALESCE(enabled, 1) = 1 AND (? = 1 OR COALESCE(admin_only, 0) = 0)').bind(category_id, canAdmin(userPayload, 'posts') ? 1 : 0).first();
					if (!category) return jsonResponse({ error: 'Category not found' }, 400);
				}
				if (!(await validateTagIds(tagIds))) return jsonResponse({ error: 'Tag not found' }, 400);

				const moderation = await db.prepare("SELECT value FROM settings WHERE key = 'moderation_posts_default'").first<DBSetting>();
				const postStatus = userPayload.role === 'admin' || moderation?.value !== 'pending' ? 'approved' : 'pending';
				const { success, meta } = await db.prepare(
					'INSERT INTO posts (author_id, title, content, category_id, min_view_level, min_comment_level, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
				).bind(userPayload.id, safeTitle.trim(), content.trim(), category_id || null, minViewLevel, minCommentLevel, postStatus).run();
				const newPostId = meta?.last_row_id;
				if (success && newPostId) await syncPostTags(newPostId, tagIds);
				if (success && postStatus === 'approved') await awardUserProgress(userPayload.id, 'create_post', { postId: newPostId });
				if (success && newPostId && postStatus === 'pending') await createNotification(userPayload.id, 'post_pending', '帖子等待审核', '你的帖子已提交，管理员审核后会发布。', { postId: newPostId });
				
				await security.logAudit(userPayload.id, 'CREATE_POST', 'post', String(newPostId || 'new'), { title_length: safeTitle.length, tag_ids: tagIds, status: postStatus }, request);

				return jsonResponse({ success, id: newPostId, status: postStatus, url: newPostId ? publicPostPath(newPostId, runtimeEnvForLinks) : undefined }, 201);
			} catch (e) {
				return handleError(e);
			}
		}

		return new Response('Not Found', { status: 404 });
	}
};










