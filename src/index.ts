
import { sendEmail } from './integrations/smtp';
import { buildVerificationEmail } from './emails/templates';
import type { EmailLocale } from './emails/templates';
import { uploadImage, deleteImage, listAllKeys, getPublicUrl, getKeyFromUrl, S3Env } from './integrations/s3';
import { Security, UserPayload } from './core/security';
import type { SiteCategory, SiteTag, SiteUser } from './site/ssr';
import type { DBCount, DBPlugin, DBSetting, DBUser, PostAuthorInfo } from './db/types';
import { parseJsonValue } from './utils/json';
import { DEFAULT_LEVEL_SETTINGS, DEFAULT_PROGRESS_REWARDS, LEVEL_SETTING_KEYS, levelFromExperience, normalizeLevelSettings, PROGRESS_REWARD_KEYS, ProgressSource } from './gamification/progress';
import { extractImageUrls } from './utils/media';
import {
	AdminPermissionKey,
	adminPermissionForApiPath,
	adminPermissionForPath,
	canAdmin,
	normalizePermissions,
	normalizeRole,
	permissionsForUser,
} from './admin/permissions';
import { normalizePluginId } from './plugins/registry';
import { renderSiteRoute } from './pages/site-routes';
import { renderAdminRoute } from './pages/admin-routes';
import { siteHtmlResponse, type SiteBrand } from './site/ssr';
import { handlePublicApi } from './api/public';
import { handlePluginApi } from './api/plugins';
import { handleAdminSettingsApi } from './api/admin-settings';
import { handleAdminI18nApi } from './api/admin-i18n';
import { handleMediaApi } from './api/media';
import { handleAuthApi } from './api/auth';
import { handleUserApi } from './api/user';
import { handlePostsApi } from './api/posts';
import { handleTaxonomyApi } from './api/taxonomy';
import { handleAdminUsersApi } from './api/admin-users';
import { verifyTurnstile } from './core/turnstile';
import { hasControlCharacters, hasInvisibleCharacters, hasRestrictedKeywords, isVisuallyEmpty } from './core/validation';
import { ensureBootstrap } from './services/bootstrap';
import { FALLBACK_LOCALE, normalizeLocaleValue, pickLocaleFromAcceptLanguage } from './core/locale';
import { decodePublicId, publicPostPath } from './core/id-codec';
import { handleOAuthRequest, loadOAuthPublicProviders } from './auth/oauth';
import { isLocalRequest } from './core/env';
import { CATEGORY_ICONS } from './assets/category-icons';
import {
	kvDeleteSettings, kvDeleteCategories, kvGetCategories, kvSetCategories,
	kvGetAllSettings, kvSetAllSettings, kvCheckRateLimit,
	kvGetTags, kvSetTags, kvDeleteTags,
	kvGetUser, kvSetUser,
	kvGetLanguages, kvSetLanguages, kvGetSystemTranslations, kvSetSystemTranslations, kvDeleteI18n,
	kvIncrementViewCount, kvDrainViewCounts,
} from './core/kv';

const WORLD_MAP_R2_KEY = 'static/world.json';
const READ_CACHE_TTL_MS = 30_000;
const HOME_CACHE_TTL_SECONDS = 300;
const HOME_CACHE_STALE_SECONDS = 900;
const HOME_RENDER_CACHE_TTL_MS = HOME_CACHE_TTL_SECONDS * 1000;
const HOME_CACHE_SEARCHES = ['', '?sort_by=time', '?sort_by=comments', '?sort_by=views'];

type CacheEntry<T> = {
	expiresAt: number;
	value: T;
};

const readCache = new Map<string, CacheEntry<unknown>>();

async function cachedRead<T>(key: string, loader: () => Promise<T>, ttlMs = READ_CACHE_TTL_MS): Promise<T> {
	const now = Date.now();
	const cached = readCache.get(key) as CacheEntry<T> | undefined;
	if (cached && cached.expiresAt > now) return cached.value;
	const value = await loader();
	if (readCache.size > 512) readCache.clear();
	readCache.set(key, { expiresAt: now + ttlMs, value });
	return value;
}

function isCacheableHomeSearch(searchParams: URLSearchParams) {
	const allowedKeys = new Set(['sort_by', 'page']);
	for (const key of searchParams.keys()) {
		if (!allowedKeys.has(key)) return false;
	}
	const page = searchParams.get('page');
	const sortBy = searchParams.get('sort_by');
	return (!page || page === '1') && (!sortBy || sortBy === 'time' || sortBy === 'comments' || sortBy === 'views');
}

function homeCacheRequest(origin: string, locale: string, search = '') {
	return new Request(`${origin}/__ff-cache/home/${encodeURIComponent(locale)}${search || ''}`);
}

async function deleteHomeCacheVariants(origin: string, locales: string[], extraSearches: string[] = []) {
	const searches = Array.from(new Set([...HOME_CACHE_SEARCHES, ...extraSearches.filter(Boolean)]));
	await Promise.all(
		locales.flatMap((locale) =>
			searches.map((search) => caches.default.delete(homeCacheRequest(origin, locale, search)).catch(() => false))
		)
	);
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;

		if (url.pathname === '/assets/maps/world.json' && (method === 'GET' || method === 'HEAD')) {
			const mapHeaders = {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
				'CDN-Cache-Control': 'public, max-age=604800',
				'Vary': 'Accept-Encoding',
			};
			if (method === 'HEAD') return new Response(null, { headers: mapHeaders });

			const cacheKey = new Request(`${url.origin}/assets/maps/world.json`, { method: 'GET' });
			const cached = await caches.default.match(cacheKey);
			if (cached) return cached;

			const bucket = (env as any).BUCKET as R2Bucket | undefined;
			if (!bucket) return new Response('Not Found', { status: 404 });
			const obj = await bucket.get(WORLD_MAP_R2_KEY);
			if (!obj) return new Response('Not Found', { status: 404 });
			const response = new Response(obj.body, { headers: mapHeaders });
			ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch((e) => console.warn('world map cache failed', e)));
			return response;
		}

		if (url.pathname.startsWith('/assets/category-icons/') && (method === 'GET' || method === 'HEAD')) {
			const filename = url.pathname.split('/').pop() || '';
			const icon = Object.values(CATEGORY_ICONS).find((item) => item.filename === filename || item.path === url.pathname);
			if (!icon) return new Response('Not Found', { status: 404 });
			const headers = {
				'Content-Type': 'image/svg+xml; charset=utf-8',
				'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
				'CDN-Cache-Control': 'public, max-age=604800',
				'Vary': 'Accept-Encoding',
			};
			if (method === 'HEAD') return new Response(null, { headers });
			const cacheKey = new Request(`${url.origin}${icon.path}`, { method: 'GET' });
			const cached = await caches.default.match(cacheKey);
			if (cached) return cached;
			const response = new Response(icon.svg, { headers });
			ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch((e) => console.warn('category icon cache failed', e)));
			return response;
		}

		const getCookieValue = (req: Request, name: string) => {
			const cookie = req.headers.get('Cookie') || '';
			for (const part of cookie.split(';')) {
				const [rawKey, ...rawValue] = part.trim().split('=');
				if (rawKey === name) return decodeURIComponent(rawValue.join('=') || '');
			}
			return '';
		};

		if (!env.DB) {
			return Response.json({ error: 'D1 database binding DB is not configured' }, { status: 500 });
		}

		// D1 Read Replication: create a session so reads route to the nearest replica.
		// The stored bookmark (ff_db_bm cookie) ensures read-your-writes consistency after mutations.
		const _storedBookmark = getCookieValue(request, 'ff_db_bm');
		let _pendingBookmark: string | null = null;
		const _rawSession: D1Database = typeof (env.DB as any).withSession === 'function'
			? (env.DB as any).withSession(_storedBookmark || 'first-unconstrained')
			: env.DB;

		// Proxy captures txn_bookmark from every write result automatically.
		const db: D1Database = new Proxy(_rawSession as any, {
			get(target, prop: string) {
				if (prop === 'prepare') {
					return (sql: string) => {
						const stmt = target.prepare(sql);
						return new Proxy(stmt as any, {
							get(s, p: string) {
								if (p === 'run' || p === 'all') {
									return async (...a: any[]) => {
										const r = await s[p](...a);
										if (r?.meta?.txn_bookmark) _pendingBookmark = r.meta.txn_bookmark;
										return r;
									};
								}
								return typeof s[p] === 'function' ? s[p].bind(s) : s[p];
							},
						});
					};
				}
				if (prop === 'batch') {
					return async (stmts: any[]) => {
						const results = await target.batch(stmts);
						const bm = results?.[results.length - 1]?.meta?.txn_bookmark;
						if (bm) _pendingBookmark = bm;
						return results;
					};
				}
				return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
			},
		}) as D1Database;

		const kv = env.CACHE;

		// Per-request settings cache: loaded from KV on first call, falls back to D1.
		// Eliminates per-setting D1 round trips within a single request.
		let _settingsMap: Record<string, string> | null = null;
		const getSetting = async (key: string): Promise<string | null> => {
			if (!_settingsMap) {
				_settingsMap = await kvGetAllSettings(kv).catch(() => null);
				if (!_settingsMap) {
					const rows = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
					_settingsMap = Object.fromEntries((rows.results || []).map((r) => [r.key, r.value]));
					ctx.waitUntil(kvSetAllSettings(kv, _settingsMap).catch(() => {}));
				}
			}
			return _settingsMap[key] ?? null;
		};

		const requestLocale = () =>
			normalizeLocaleValue(getCookieValue(request, 'ff_locale')) ||
			pickLocaleFromAcceptLanguage(request.headers.get('Accept-Language')) ||
			FALLBACK_LOCALE;

		const isAnonymousRequest = !getCookieValue(request, 'ff_token');
		const cacheableAnonymousHome = method === 'GET' && url.pathname === '/' && isAnonymousRequest && isCacheableHomeSearch(url.searchParams);
		const homeEdgeCacheKey = cacheableAnonymousHome
			? homeCacheRequest(url.origin, requestLocale(), url.search || '')
			: null;
		if (homeEdgeCacheKey) {
			const edgeCachedHome = await caches.default.match(homeEdgeCacheKey).catch(() => null);
			if (edgeCachedHome) {
				const headers = new Headers(edgeCachedHome.headers);
				headers.set('X-FF-Cache', 'edge-hit-fast');
				headers.set('Server-Timing', 'ff;desc="home-edge-cache"');
				return new Response(edgeCachedHome.body, {
					status: edgeCachedHome.status,
					statusText: edgeCachedHome.statusText,
					headers,
				});
			}
		}

		// Helper function to get base URL
		const getBaseUrl = () => {
			// Priority: 1. Env var 2. X-Original-URL header 3. Request origin
			const baseUrl = (env as any).BASE_URL;
			if (baseUrl) {
				return baseUrl;
			}
			
			const xOriginalUrl = request.headers.get('X-Original-URL');
			if (xOriginalUrl) {
				return xOriginalUrl;
			}
			
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

		// Helper to return JSON response with CORS.
		// If a write happened on this request (_pendingBookmark is set), injects a short-lived
		// ff_db_bm cookie so the next read uses that bookmark and sees the write immediately.
		const jsonResponse = (data: any, status = 200, extraHeaders?: HeadersInit) => {
			const headers = new Headers({ ...corsHeaders, ...(extraHeaders as Record<string, string> || {}) });
			if (_pendingBookmark) {
				const secure = url.protocol === 'https:' ? '; Secure' : '';
				headers.append('Set-Cookie', `ff_db_bm=${encodeURIComponent(_pendingBookmark)}; HttpOnly; Path=/; Max-Age=60; SameSite=Lax${secure}`);
				_pendingBookmark = null;
			}
			return Response.json(data, { status, headers });
		};
		const publicJsonResponse = (data: any, status = 200, extraHeaders?: HeadersInit) => jsonResponse(data, status, {
			'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
			'CDN-Cache-Control': 'public, max-age=30',
			'Vary': 'Accept-Language, Cookie',
			...(extraHeaders || {}),
		});

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
			const cached = await kvGetUser<UserPayload>(kv, payload.id).catch(() => null);
			if (cached) return cached;

			const row = await db.prepare('SELECT id, email, role, verified, points, experience, level FROM users WHERE id = ?').bind(payload.id).first<DBUser>();
			if (!row) throw new Error('Unauthorized');
			const role = normalizeRole(row.role);
			let permissions = permissionsForUser({ role });
			if (role !== 'admin') {
				const roleRow = await db.prepare('SELECT permissions FROM role_permissions WHERE role = ?').bind(role).first<{ permissions: string }>();
				if (roleRow) permissions = normalizePermissions(roleRow.permissions);
			}
			const result: UserPayload = {
				id: Number(row.id),
				email: String(row.email || payload.email),
				role,
				verified: Number(row.verified || 0),
				permissions,
				points: Number((row as any).points || 0),
				experience: Number((row as any).experience || 0),
				level: Number((row as any).level || 1),
			};
			ctx.waitUntil(kvSetUser(kv, payload.id, result).catch(() => {}));
			return result;
		};

		const requireVerifiedUser = async (payload: UserPayload): Promise<UserPayload> => {
			const user = await loadAccessUser(payload);
			if (Number(user.verified || 0) !== 1) throw new Error('EmailVerificationRequired');
			return user;
		};

		const sendVerificationEmail = async (email: string, username: string, token: string, locale?: string) => {
			const baseUrl = getBaseUrl().replace(/\/+$/, '');
			const verifyLink = `${baseUrl}/api/verify?token=${encodeURIComponent(token)}`;
			const senderEmail = `noreply@${new URL(baseUrl).hostname}`;
			const siteNameRow = await env.DB.prepare("SELECT value FROM settings WHERE key='site_name'").first<{value:string}>().catch(() => null);
			const siteName = siteNameRow?.value || 'ForumForge';
			const emailLocale: EmailLocale = String(locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
			const { subject, html } = buildVerificationEmail({ locale: emailLocale, username, verifyLink, siteName, siteUrl: baseUrl });
			await sendEmail(email, subject, html, env, senderEmail);
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
					'SELECT id, email, username, role, verified, avatar_url, email_notifications, show_public_posts, points, experience, level, last_checkin_date, created_at, pending_email FROM users WHERE id = ?'
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
			const kvKey = `${locale}:${includeAdminOnly ? 1 : 0}`;
			return cachedRead(`site-categories:${kvKey}`, async () => {
				// KV layer: skip the complex D1 join when data is fresh
				const kvHit = await kvGetCategories<SiteCategory[]>(kv, kvKey).catch(() => null);
				if (kvHit) return kvHit;

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
				const data = (results || []) as unknown as SiteCategory[];
				ctx.waitUntil(kvSetCategories(kv, kvKey, data).catch(() => {}));
				return data;
			});
		};

		const getSiteTags = async (): Promise<SiteTag[]> => {
			const locale = requestLocale();
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			return cachedRead(`site-tags:${locale}`, async () => {
				const kvHit = await kvGetTags<SiteTag[]>(kv, locale).catch(() => null);
				if (kvHit) return kvHit;
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
				const data = (results || []) as unknown as SiteTag[];
				ctx.waitUntil(kvSetTags(kv, locale, data).catch(() => {}));
				return data;
			});
		};

		const applyLocalizedCategoriesToPosts = <T extends { category_id?: number | string | null; category_name?: string | null }>(posts: T[], categories: SiteCategory[]) => {
			const byId = new Map(categories.map((category) => [String(category.id), category.name]));
			return posts.map((post) => {
				const localizedName = post.category_id !== null && post.category_id !== undefined ? byId.get(String(post.category_id)) : '';
				return localizedName ? { ...post, category_name: localizedName } : post;
			});
		};

		const getSiteBrand = async (): Promise<SiteBrand> => {
			const [siteName, siteIconUrl] = await Promise.all([
				getSetting('site_name'),
				getSetting('site_icon_url'),
			]);
			return {
				siteName: siteName || 'ForumForge',
				siteIconUrl: siteIconUrl || '',
			};
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
			// getSetting loads all settings from KV (or D1) in one shot; individual key lookups are free after that.
			const [maintenanceEnabled, maintenanceTitle, maintenanceMessage, maintenanceUntil] = await Promise.all([
				getSetting('maintenance_enabled'),
				getSetting('maintenance_title'),
				getSetting('maintenance_message'),
				getSetting('maintenance_until'),
			]);
			if (maintenanceEnabled === '1') {
				const map = { maintenance_enabled: '1', maintenance_title: maintenanceTitle || '', maintenance_message: maintenanceMessage || '', maintenance_until: maintenanceUntil || '' };
				if (method === 'GET' && !url.pathname.startsWith('/api/')) return renderMaintenancePage(map);
				return jsonResponse({ error: maintenanceTitle || '站点维护中', code: 'MAINTENANCE' }, 503);
			}
		}

		const runtimeEnvForLinks = {
			...(env as any),
			ID_CODEC_SECRET: String((await getSetting('id_codec_secret')) || (env as any).ID_CODEC_SECRET || '').trim(),
		};

		const getAllCategoryCopy = async (totalPosts?: number): Promise<SiteCategory> => {
			const locale = requestLocale();
			const fallback = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
			const [translations, systemTranslations, iconSetting] = await Promise.all([
				loadLocalizedMaps(['category:all']),
				getSystemTranslations(locale),
				getSetting('all_category_icon_url'),
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
				icon_url: iconSetting || '',
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
			const [daysVal, maxRowsVal] = await Promise.all([
				getSetting('visit_log_retention_days'),
				getSetting('visit_log_max_rows'),
			]);
			const days = Math.max(0, Math.min(3650, Math.floor(Number(daysVal || 90) || 0)));
			const maxRows = Math.max(0, Math.min(10000000, Math.floor(Number(maxRowsVal || 100000) || 0)));
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
			return cachedRead('languages:enabled', async () => {
				const kvHit = await kvGetLanguages<any[]>(kv).catch(() => null);
				if (kvHit) return kvHit;
				const { results } = await db.prepare(
					'SELECT code, name, native_name, enabled, sort_order FROM languages WHERE enabled = 1 ORDER BY sort_order ASC, code ASC'
				).all();
				const data = results || [];
				ctx.waitUntil(kvSetLanguages(kv, data).catch(() => {}));
				return data;
			});
		};

		const getSystemTranslations = async (locale: string) => {
			return cachedRead(`i18n:system:${locale}`, async () => {
				const kvHit = await kvGetSystemTranslations<Record<string, string>>(kv, locale).catch(() => null);
				if (kvHit) return kvHit;
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
				for (const row of (results || []) as any[]) map[String(row.key)] = String(row.value || row.key);
				ctx.waitUntil(kvSetSystemTranslations(kv, locale, map).catch(() => {}));
				return map;
			});
		};

		const loadLocalizedMaps = async (scopes: string[]) => {
			if (!scopes.length) return new Map<string, Record<string, Record<string, string>>>();
			const cacheKey = `i18n:maps:${scopes.slice().sort().join('|')}`;
			return cachedRead(cacheKey, async () => {
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
			});
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

		const getPublicCacheLocales = async () => {
			const locales = new Set<string>([requestLocale(), FALLBACK_LOCALE, 'zh-CN', 'en-US'].map(normalizeLocale).filter(Boolean));
			try {
				for (const lang of await getEnabledLanguages()) {
					const code = normalizeLocale((lang as any).code);
					if (code) locales.add(code);
				}
			} catch {}
			return Array.from(locales);
		};

		const invalidatePublicContent = (reason = 'content') => {
			readCache.clear();
			_settingsMap = null;
			const isSettingsChange = reason.startsWith('settings');
			const isCategoryChange = reason.startsWith('category');
			const isTagChange = reason.startsWith('tag');
			ctx.waitUntil((async () => {
				const locales = await getPublicCacheLocales();
				await Promise.all([
					deleteHomeCacheVariants(url.origin, locales, [url.search || '']),
					isSettingsChange ? kvDeleteSettings(kv).catch(() => {}) : Promise.resolve(),
					isCategoryChange ? kvDeleteCategories(kv).catch(() => {}) : Promise.resolve(),
					isTagChange ? kvDeleteTags(kv).catch(() => {}) : Promise.resolve(),
				]);
			})().catch((err) => console.warn('Failed to invalidate public content cache', reason, err)));
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
		const siteRouteContext = {
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
			requestLocale,
			getEnabledLanguages,
			getSiteBrand,
			getOAuthProviders: () => loadOAuthPublicProviders(db, env, getBaseUrl),
			attachTagsToPosts,
			applyLocalizedCategoriesToPosts,
		};
		if (cacheableAnonymousHome) {
			const cachedHome = await cachedRead(`html:home:${requestLocale()}:${url.search}`, async () => {
				const response = await renderSiteRoute(siteRouteContext);
				if (!response || response.status !== 200) return null;
				return { status: response.status, html: await response.text() };
			}, HOME_RENDER_CACHE_TTL_MS);
			if (cachedHome) {
				const response = siteHtmlResponse(cachedHome.html, cachedHome.status, {
					'Cache-Control': `public, max-age=${HOME_CACHE_TTL_SECONDS}, stale-while-revalidate=${HOME_CACHE_STALE_SECONDS}`,
					'CDN-Cache-Control': `public, max-age=${HOME_CACHE_TTL_SECONDS}`,
					'Vary': 'Accept-Language, Cookie',
					'X-FF-Cache': 'rendered',
					'Server-Timing': 'ff;desc="home-render-cache"',
				});
				if (homeEdgeCacheKey) ctx.waitUntil(caches.default.put(homeEdgeCacheKey, response.clone()).catch(() => undefined));
				if (shouldRecordVisit(response)) {
					ctx.waitUntil(recordVisit().catch((err) => console.warn('Failed to record visit event', err)));
				}
				return response;
			}
		}

		const siteRouteResponse = await renderSiteRoute(siteRouteContext);
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
			jsonResponse: isAnonymousRequest && (url.pathname === '/api/config' || url.pathname === '/api/i18n') ? publicJsonResponse : jsonResponse,
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
			env,
			db,
			executionCtx: ctx,
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
			cache: env.CACHE,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			normalizeLocale,
			saveLocalizedFields,
			invalidatePublicContent,
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

		// Rate limiting for auth endpoints: prevent brute force and registration spam.
		// Limits are per-IP per minute; best-effort via KV (non-atomic but sufficient).
		if (method === 'POST') {
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			const rlPath = url.pathname;
			if (rlPath === '/api/login' || rlPath === '/api/register' || rlPath === '/api/auth/forgot-password') {
				const limit = rlPath === '/api/register' ? 5 : 20;
				const allowed = await kvCheckRateLimit(kv, `${rlPath}:${ip}`, limit, 60).catch(() => true);
				if (!allowed) return jsonResponse({ error: 'Too many requests, please try again later.' }, 429);
			}
		}

		const authApiResponse = await handleAuthApi({
			request,
			url,
			method,
			env,
			db,
			executionCtx: ctx,
			security,
			jsonResponse,
			handleError,
			authCookie,
			getBaseUrl,
			checkTurnstile,
			sendVerificationEmail,
			createNotification,
			logAuditEvent,
			usernameFromEmail,
		});
		if (authApiResponse) return authApiResponse;

		const userApiResponse = await handleUserApi({
			request,
			url,
			method,
			env,
			db,
			executionCtx: ctx,
			security,
			jsonResponse,
			handleError,
			authenticate,
			loadAccessUser,
			requireVerifiedUser,
			awardUserProgress,
			sendVerificationEmail,
			createNotification,
			getBaseUrl,
			runtimeEnvForLinks: runtimeEnvForLinks as Env,
		});
		if (userApiResponse) return userApiResponse;

		const postsApiResponse = await handlePostsApi({
			request,
			url,
			method,
			env,
			db,
			executionCtx: ctx,
			security,
			jsonResponse,
			handleError,
			authenticate,
			loadAccessUser,
			requireVerifiedUser,
			checkTurnstile,
			canViewPostByLevel,
			getSiteCategories,
			applyLocalizedCategoriesToPosts,
			attachTagsToPosts,
			awardUserProgress,
			createNotification,
			runtimeEnvForLinks: runtimeEnvForLinks as Env,
			invalidatePublicContent,
		});
		if (postsApiResponse) return postsApiResponse;

		const taxonomyApiResponse = await handleTaxonomyApi({
			request,
			url,
			method,
			db,
			security,
			jsonResponse: isAnonymousRequest && (url.pathname === '/api/categories' || url.pathname === '/api/tags') ? publicJsonResponse : jsonResponse,
			handleError,
			apiAdminUser,
			authenticate,
			loadAccessUser,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			normalizeLocale,
			saveLocalizedFields,
			getSiteCategories,
			getSiteTags,
			invalidatePublicContent,
		});
		if (taxonomyApiResponse) return taxonomyApiResponse;

		const adminUsersApiResponse = await handleAdminUsersApi({
			request,
			url,
			method,
			env,
			db,
			executionCtx: ctx,
			security,
			jsonResponse,
			handleError,
			apiAdminUser,
			authenticateAdminForPath: () => authenticateAdmin(request, adminPermissionForApiPath(url.pathname)),
			getBaseUrl,
		});
		if (adminUsersApiResponse) return adminUsersApiResponse;

		// --- ADMIN ROUTES ---

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
				invalidatePublicContent('admin:posts:bulk-delete');
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
				invalidatePublicContent('admin:post:delete');
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
				invalidatePublicContent('admin:comment:update');
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
				invalidatePublicContent(`moderation:${type}:${nextStatus}`);
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
				if (updated) invalidatePublicContent(`moderation:bulk-status:${nextStatus}`);
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
				if (deleted) invalidatePublicContent('moderation:bulk-delete');
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
				invalidatePublicContent(`moderation:${type}:delete`);
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
				if (deleted) invalidatePublicContent('admin:comments:bulk-delete');
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
				invalidatePublicContent('admin:comment:delete');
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
				invalidatePublicContent('admin:post:pin');
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
				invalidatePublicContent('admin:post:category-pin');
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
				invalidatePublicContent('admin:post:move');
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

		return new Response('Not Found', { status: 404 });
	},

	// Cron Trigger: flush accumulated KV view counts to D1 in batch every 5 minutes.
	// Eliminates per-view D1 writes; trades exact real-time counts for bulk efficiency.
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil((async () => {
			const counts = await kvDrainViewCounts(env.CACHE);
			if (!counts.size) return;
			const db = env.DB;
			const stmt = db.prepare('UPDATE posts SET view_count = COALESCE(view_count, 0) + ? WHERE id = ?');
			const batches: D1PreparedStatement[] = [];
			for (const [postId, count] of counts) {
				if (count > 0) batches.push(stmt.bind(count, Number(postId)));
			}
			// D1 batch allows max 100 statements; chunk if needed
			for (let i = 0; i < batches.length; i += 100) {
				await db.batch(batches.slice(i, i + 100));
			}
		})().catch((err) => console.error('View count flush failed', err)));
	},
};
