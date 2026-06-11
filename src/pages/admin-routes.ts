import {
	adminHtmlResponse,
	renderAdminDashboard,
	renderAdminCategories,
	renderAdminComments,
	renderAdminI18n,
	renderAdminLoginRedirect,
	renderAdminLogs,
	renderAdminMedia,
	renderAdminModeration,
	renderAdminPermissions,
	renderAdminPosts,
	renderAdminPlugins,
	renderAdminTags,
	renderAdminUsers,
	renderPluginEditor,
	renderSettingsPage,
	renderSimpleAdminTable,
} from '../admin/ssr';
import { normalizePermissions, normalizeRole } from '../admin/permissions';
import type { DBCount, DBPlugin, DBSetting } from '../db/types';
import { escapeHtml } from '../utils/html';
import { extractMediaUrls, mediaTypeFromValue } from '../utils/media';
import { hydrateBuiltinPluginRow, normalizePluginId } from '../plugins/registry';
import { PROGRESS_REWARD_KEYS } from '../gamification/progress';
import { getKeyFromUrl, getPublicUrl, listAllKeys, type S3Env } from '../integrations/s3';
import type { UserPayload } from '../core/security';
import type { SiteCategory } from '../site/ssr';

export type AdminRouteContext = {
	method: string;
	url: URL;
	env: Env;
	db: D1Database;
	getAdminUser: () => Promise<UserPayload | null>;
	clearAuthCookie: () => string;
	getBaseUrl: () => string;
	requestLocale: () => string;
	getEnabledLanguages: () => Promise<any[]>;
	loadLocalizedMaps: (scopes: string[]) => Promise<Map<string, Record<string, Record<string, string>>>>;
	getAllCategoryCopy: (totalPosts?: number) => Promise<SiteCategory>;
};

export async function renderAdminRoute(ctx: AdminRouteContext): Promise<Response | null> {
	const {
		method,
		url,
		env,
		db,
		getAdminUser,
		clearAuthCookie,
		getBaseUrl,
		requestLocale,
		getEnabledLanguages,
		loadLocalizedMaps,
		getAllCategoryCopy,
	} = ctx;
	if ((method !== 'GET' && method !== 'HEAD') || (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/'))) return null;
			if (url.pathname === '/admin/logout') {
				return adminHtmlResponse('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/login"><p>Signed out.</p>', 302, {
					Location: '/login',
					'Set-Cookie': clearAuthCookie(),
				});
			}
			const userPayload = await getAdminUser();
			if (!userPayload) return renderAdminLoginRedirect();

			const r2KeyUrl = (key: string) => getPublicUrl(
				env as unknown as S3Env,
				key,
				(env as any).BUCKET ? `${getBaseUrl()}/r2` : undefined
			);

			const loadAdminMedia = async (includePosts: boolean, page: number, pageSize: number, query = '', type = '') => {
				type MediaRow = {
					id?: number | null;
					scope: string;
					owner_id?: number | null;
					post_id?: number | null;
					post_title?: string;
					key: string;
					url: string;
					filename: string;
					mime_type: string;
					size_bytes: number;
					media_type: string;
					source: string;
					created_at: string;
				};
				const [assetRows, legacyPosts, allKeys] = await Promise.all([
					db.prepare(
						`SELECT m.*, p.title AS post_title
						   FROM media_assets m
						   LEFT JOIN posts p ON p.id = m.post_id
						  WHERE m.scope IN (${includePosts ? "'system', 'post'" : "'system'"})
						  ORDER BY m.created_at DESC, m.id DESC`
					).all(),
					includePosts ? db.prepare(
						`SELECT p.id, p.title, p.author_id, p.content, p.created_at
						   FROM posts p
						  ORDER BY p.created_at DESC
						  LIMIT 1000`
					).all() : Promise.resolve({ results: [] } as any),
					listAllKeys(env as unknown as S3Env).catch(() => [])
				]);
				const items: MediaRow[] = ((assetRows.results || []) as any[]).map((row) => ({
					...row,
					id: row.id ?? null,
					scope: String(row.scope || 'post'),
					filename: String(row.filename || row.key || ''),
					size_bytes: Number(row.size_bytes || 0),
					media_type: String(row.media_type || mediaTypeFromValue(row.mime_type || '', row.url || row.key)),
					source: String(row.source || 'upload'),
					created_at: String(row.created_at || ''),
				}));
				const known = new Set(items.map((item) => item.key || getKeyFromUrl(env as unknown as S3Env, item.url) || item.url));
				for (const key of (allKeys || [])) {
					const isSystemKey = /(^|\/)system\/media\//.test(key);
					const isPostKey = /(^|\/)usr\/[^/]+\/post\//.test(key);
					if ((!includePosts && !isSystemKey) || (includePosts && !isSystemKey && !isPostKey)) continue;
					if (known.has(key)) continue;
					known.add(key);
					const filename = (() => {
						try { return decodeURIComponent(key.split('/').pop() || 'media'); } catch { return key.split('/').pop() || 'media'; }
					})();
					items.push({
						id: null,
						scope: isSystemKey ? 'system' : 'post',
						owner_id: null,
						post_id: null,
						post_title: '',
						key,
						url: r2KeyUrl(key),
						filename,
						mime_type: '',
						size_bytes: 0,
						media_type: mediaTypeFromValue('', key),
						source: 'bucket-scan',
						created_at: '',
					});
				}
				for (const post of (legacyPosts.results || []) as any[]) {
					for (const mediaUrl of extractMediaUrls(String(post.content || ''))) {
						const key = getKeyFromUrl(env as unknown as S3Env, mediaUrl) || mediaUrl;
						if (!key || known.has(key)) continue;
						known.add(key);
						const decodedName = (() => {
							try {
								const last = key.split('/').pop() || 'media';
								return decodeURIComponent(last);
							} catch {
								return key.split('/').pop() || 'media';
							}
						})();
						items.push({
							id: null,
							scope: 'post',
							owner_id: Number(post.author_id || 0),
							post_id: Number(post.id || 0),
							post_title: String(post.title || ''),
							key,
							url: mediaUrl,
							filename: decodedName,
							mime_type: '',
							size_bytes: 0,
							media_type: mediaTypeFromValue('', mediaUrl),
							source: 'post-scan',
							created_at: String(post.created_at || ''),
						});
					}
				}
				const needle = query.trim().toLowerCase();
				const mediaType = type.trim().toLowerCase();
				const filtered = items.filter((item) => {
					const matchesQuery = !needle || [
						item.filename,
						item.key,
						item.url,
						item.post_title,
						item.mime_type,
						item.media_type,
						item.source,
						item.scope,
					].some((value) => String(value || '').toLowerCase().includes(needle));
					const matchesType = !mediaType || String(item.media_type || '').toLowerCase() === mediaType;
					return matchesQuery && matchesType;
				});
				filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
				const offset = (page - 1) * pageSize;
				return {
					includePosts,
					query,
					type,
					page,
					pageSize,
					total: filtered.length,
					items: filtered.slice(offset, offset + pageSize)
				};
			};

			if (url.pathname === '/admin') {
				const [users, posts, comments, plugins, topPosts, catStats, newUsers, visits7, countries7, visits30, device30, topPaths30, latestVisits] = await Promise.all([
					db.prepare('SELECT COUNT(*) as count FROM users').first<DBCount>(),
					db.prepare('SELECT COUNT(*) as count FROM posts').first<DBCount>(),
					db.prepare('SELECT COUNT(*) as count FROM comments').first<DBCount>(),
					db.prepare('SELECT COUNT(*) as count FROM plugins').first<DBCount>(),
					db.prepare('SELECT id, title, view_count FROM posts ORDER BY view_count DESC LIMIT 8').all(),
					db.prepare(
						`SELECT COALESCE(c.name, '未分类') AS name, COUNT(p.id) AS count
						   FROM posts p
						   LEFT JOIN categories c ON c.id = p.category_id
						  GROUP BY COALESCE(c.name, '未分类')
						  ORDER BY count DESC`
					).all(),
					db.prepare('SELECT username, email, created_at FROM users ORDER BY created_at DESC LIMIT 8').all(),
					db.prepare(
						`SELECT date_bucket AS day, COUNT(*) AS visits, COUNT(DISTINCT NULLIF(ip, '')) AS visitors
						   FROM visit_events
						  WHERE date_bucket >= date('now', '-6 days')
						  GROUP BY date_bucket
						  ORDER BY date_bucket ASC`
					).all(),
					db.prepare(
						`SELECT country, COUNT(*) AS visits
						   FROM visit_events
						  WHERE date_bucket >= date('now', '-6 days')
						  GROUP BY country
						  ORDER BY visits DESC
						  LIMIT 30`
					).all(),
					db.prepare(
						`SELECT COUNT(*) AS visits,
						        COUNT(DISTINCT NULLIF(ip, '')) AS visitors,
						        COUNT(DISTINCT country) AS countries
						   FROM visit_events
						  WHERE date_bucket >= date('now', '-29 days')`
					).first<any>(),
					db.prepare(
						`SELECT
						 CASE
						  WHEN lower(user_agent) LIKE '%mobile%' OR lower(user_agent) LIKE '%android%' OR lower(user_agent) LIKE '%iphone%' THEN 'Mobile'
						  WHEN lower(user_agent) LIKE '%bot%' OR lower(user_agent) LIKE '%spider%' OR lower(user_agent) LIKE '%crawler%' THEN 'Bot'
						  ELSE 'Desktop'
						 END AS device,
						 COUNT(*) AS visits
						 FROM visit_events
						 WHERE date_bucket >= date('now', '-29 days')
						 GROUP BY device
						 ORDER BY visits DESC`
					).all(),
					db.prepare(
						`SELECT v.path, p.title AS post_title, COUNT(*) AS visits, COUNT(DISTINCT NULLIF(v.ip, '')) AS visitors
						   FROM visit_events v
						   LEFT JOIN posts p ON v.path LIKE '/posts/%' AND p.id = CAST(substr(v.path, 8) AS INTEGER)
						  WHERE date_bucket >= date('now', '-29 days')
						  GROUP BY v.path, p.title
						  ORDER BY visits DESC
						  LIMIT 8`
					).all(),
					db.prepare(
						`SELECT v.path, p.title AS post_title, v.country, v.ip, v.created_at
						   FROM visit_events v
						   LEFT JOIN posts p ON v.path LIKE '/posts/%' AND p.id = CAST(substr(v.path, 8) AS INTEGER)
						  ORDER BY v.created_at DESC
						  LIMIT 10`
					).all()
				]);
				const locale = requestLocale();
				const zh = locale.toLowerCase().startsWith('zh');
				const routeLabels: Record<string, string> = zh ? {
					'/': '首页',
					'/new-post': '发布新帖',
					'/settings': '个人设置',
					'/me': '我的内容',
					'/login': '登录',
					'/register': '注册',
					'/forgot-password': '找回密码',
					'/admin': '管理后台',
					'/admin/posts': '帖子管理',
					'/admin/comments': '评论管理',
					'/admin/moderation': '审核管理',
					'/admin/users': '用户管理',
					'/admin/categories': '分类管理',
					'/admin/tags': '标签管理',
					'/admin/media': '媒体管理',
					'/admin/plugins': '插件管理',
					'/admin/i18n': '翻译管理',
					'/admin/logs': '日志管理',
					'/admin/settings': '站点设置',
					'/admin/permissions': '权限管理',
				} : {
					'/': 'Home',
					'/new-post': 'New post',
					'/settings': 'Profile settings',
					'/me': 'My content',
					'/login': 'Login',
					'/register': 'Register',
					'/forgot-password': 'Password reset',
					'/admin': 'Admin dashboard',
					'/admin/posts': 'Post management',
					'/admin/comments': 'Comment management',
					'/admin/moderation': 'Review queue',
					'/admin/users': 'User management',
					'/admin/categories': 'Category management',
					'/admin/tags': 'Tag management',
					'/admin/media': 'Media library',
					'/admin/plugins': 'Plugin management',
					'/admin/i18n': 'Translation management',
					'/admin/logs': 'Log management',
					'/admin/settings': 'Site settings',
					'/admin/permissions': 'Permission management',
				};
				const displayPath = (row: any) => {
					const path = String(row.path || '/');
					const postTitle = String(row.post_title || '').trim();
					if (postTitle) return postTitle;
					if (routeLabels[path]) return routeLabels[path];
					const postMatch = path.match(/^\/posts\/(\d+)/);
					if (postMatch) return zh ? `帖子 #${postMatch[1]}` : `Post #${postMatch[1]}`;
					if (path.startsWith('/admin/plugins/') && path.endsWith('/editor')) return zh ? '插件编辑器' : 'Plugin editor';
					return path;
				};
				const topPathRows = (topPaths30.results || []).map((row: any) => ({
					...row,
					raw_path: row.path,
					page_title: displayPath(row),
				}));
				const latestVisitRows = (latestVisits.results || []).map((row: any) => ({
					...row,
					raw_path: row.path,
					page_title: displayPath(row),
				}));
				return adminHtmlResponse(renderAdminDashboard(userPayload, {
					user_count: users?.count || 0,
					post_count: posts?.count || 0,
					comment_count: comments?.count || 0,
					plugin_count: plugins?.count || 0,
					top_posts: topPosts.results || [],
					category_stats: catStats.results || [],
					newest_users: newUsers.results || [],
					analytics: {
						visits_7d: visits7.results || [],
						countries_7d: countries7.results || [],
						visits_30d: visits30 || {},
						device_30d: device30.results || [],
						top_paths_30d: topPathRows,
						latest_visits: latestVisitRows,
					},
				}));
			}

			if (url.pathname === '/admin/plugins') {
				const [pluginsRes, installsRes] = await Promise.all([
					db.prepare('SELECT * FROM plugins ORDER BY name ASC').all(),
					db.prepare('SELECT plugin_id, COUNT(*) AS count FROM plugin_share_events GROUP BY plugin_id').all()
				]);
				const installMap = new Map(((installsRes.results || []) as any[]).map((row) => [String(row.plugin_id), Number(row.count || 0)]));
				const plugins = ((pluginsRes.results || []) as unknown as DBPlugin[]).map((rawRow) => {
					const row = hydrateBuiltinPluginRow(rawRow);
					return {
					...row,
					install_count: installMap.get(row.id) || 0,
				};
				});
				return adminHtmlResponse(renderAdminPlugins(userPayload, plugins));
			}

			const pluginEditorMatch = url.pathname.match(/^\/admin\/plugins\/([^/]+)\/editor$/);
			if (pluginEditorMatch) {
				const id = normalizePluginId(decodeURIComponent(pluginEditorMatch[1] || ''));
				const foundPlugin = await db.prepare('SELECT * FROM plugins WHERE id = ? OR slug = ?').bind(id, id).first<DBPlugin>();
				const plugin = foundPlugin ? hydrateBuiltinPluginRow(foundPlugin) : null;
				if (!plugin) {
					return adminHtmlResponse(renderSimpleAdminTable(
						userPayload,
						'plugins',
						'插件不存在',
						'没有找到这个插件。',
						[{ label: 'ID', key: 'admin.table.id' }],
						[[escapeHtml(id)]],
						'暂无数据',
						{ titleKey: 'admin.plugins.notFoundTitle', subtitleKey: 'admin.plugins.notFoundSubtitle', emptyKey: 'common.none' }
					), 404);
				}
				return adminHtmlResponse(renderPluginEditor(userPayload, plugin));
			}

			if (url.pathname === '/admin/i18n') {
				return adminHtmlResponse('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/admin/translations"><p>Redirecting to translation management...</p>', 302, {
					Location: '/admin/translations',
				});
			}

			if (url.pathname === '/admin/translations') {
				const [languagesRes, translationsRes] = await Promise.all([
					db.prepare('SELECT code, name, native_name, enabled, sort_order, created_at, updated_at FROM languages ORDER BY sort_order ASC, code ASC').all(),
					db.prepare('SELECT scope, key, locale, value, updated_at FROM translations ORDER BY scope ASC, key ASC, locale ASC').all()
				]);
				return adminHtmlResponse(renderAdminI18n(userPayload, {
					languages: languagesRes.results || [],
					translations: translationsRes.results || [],
				}));
			}

			if (url.pathname === '/admin/logs') {
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get('pageSize') || 50)));
				const offset = (page - 1) * pageSize;
				const q = String(url.searchParams.get('q') || '').trim();
				const action = String(url.searchParams.get('action') || '').trim();
				const resourceType = String(url.searchParams.get('resourceType') || '').trim();
				const where: string[] = [];
				const params: any[] = [];
				if (q) {
					const like = `%${q}%`;
					where.push('(l.action LIKE ? OR l.resource_type LIKE ? OR l.resource_id LIKE ? OR l.details LIKE ? OR l.ip_address LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
					params.push(like, like, like, like, like, like, like);
				}
				if (action) {
					where.push('l.action LIKE ?');
					params.push(`%${action}%`);
				}
				if (resourceType) {
					where.push('l.resource_type LIKE ?');
					params.push(`%${resourceType}%`);
				}
				const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
				const [logs, countRow] = await Promise.all([
					db.prepare(
						`SELECT l.*, u.username, u.email
						   FROM audit_logs l
						   LEFT JOIN users u ON u.id = l.user_id
						   ${whereSql}
						  ORDER BY l.created_at DESC, l.id DESC
						  LIMIT ? OFFSET ?`
					).bind(...params, pageSize, offset).all(),
					db.prepare(
						`SELECT COUNT(*) AS total
						   FROM audit_logs l
						   LEFT JOIN users u ON u.id = l.user_id
						   ${whereSql}`
					).bind(...params).first<{ total: number }>()
				]);
				return adminHtmlResponse(renderAdminLogs(userPayload, {
					logs: (logs.results || []) as any[],
					page,
					pageSize,
					total: Number(countRow?.total || 0),
					q,
					action,
					resourceType,
				}));
			}

			if (url.pathname === '/admin/media') {
				const includePosts = url.searchParams.get('includePosts') === '1';
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(60, Math.max(12, Number(url.searchParams.get('pageSize') || 24)));
				const query = url.searchParams.get('q') || '';
				const type = url.searchParams.get('type') || '';
				const data = await loadAdminMedia(includePosts, page, pageSize, query, type);
				return adminHtmlResponse(renderAdminMedia(userPayload, data, env));
			}

			if (url.pathname === '/admin/tags') {
				const [tagsRes, languages] = await Promise.all([
					db.prepare(
					`SELECT t.id, t.name, t.created_at, t.updated_at, COUNT(pt.post_id) as post_count
					   FROM tags t
					   LEFT JOIN post_tags pt ON pt.tag_id = t.id
					  GROUP BY t.id
					  ORDER BY t.name ASC`
					).all(),
					getEnabledLanguages()
				]);
				const tags = (tagsRes.results || []) as any[];
				const localized = await loadLocalizedMaps(tags.map((row) => `tag:${row.id}`));
				return adminHtmlResponse(renderAdminTags(userPayload, {
					tags: tags.map((row) => ({ ...row, localized: localized.get(`tag:${row.id}`) || {} })),
					languages: languages as any[],
				}));
			}

			if (url.pathname === '/admin/categories') {
				const [categoriesRes, languages] = await Promise.all([
					db.prepare(
					`SELECT c.id, c.name, c.description, c.hero_title, c.hero_description, c.icon_url, c.enabled, c.admin_only, c.sort_order, c.created_at, COUNT(p.id) AS post_count
					   FROM categories c
					   LEFT JOIN posts p ON p.category_id = c.id
					  GROUP BY c.id, c.name, c.description, c.hero_title, c.hero_description, c.icon_url, c.enabled, c.admin_only, c.sort_order, c.created_at
					  ORDER BY COALESCE(c.sort_order, c.id * 10) ASC, c.created_at ASC, c.id ASC`
					).all(),
					getEnabledLanguages()
				]);
				const categories = (categoriesRes.results || []) as any[];
				const allCategory = await getAllCategoryCopy();
				const localized = await loadLocalizedMaps(['category:all', ...categories.map((row) => `category:${row.id}`)]);
				return adminHtmlResponse(renderAdminCategories(userPayload, {
					categories: [
						{ ...allCategory, localized: localized.get('category:all') || {} },
						...categories.map((row) => ({ ...row, localized: localized.get(`category:${row.id}`) || {} })),
					],
					languages: languages as any[],
				}));
			}

			if (url.pathname === '/admin/users') {
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
				const offset = (page - 1) * pageSize;
				const [users, countRow, roleRows] = await Promise.all([
					db.prepare('SELECT id, email, username, role, permissions, verified, created_at, avatar_url, points, experience, level FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(pageSize, offset).all(),
					db.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>(),
					db.prepare('SELECT role FROM role_permissions').all()
				]);
				const roleOrder = new Map([['admin', 1], ['manager', 2], ['moderator', 3], ['user', 4]]);
				const roles = ((roleRows.results || []) as any[])
					.map((row) => ({ role: normalizeRole(row.role) }))
					.sort((a, b) => (roleOrder.get(a.role) || 9) - (roleOrder.get(b.role) || 9) || a.role.localeCompare(b.role));
				return adminHtmlResponse(renderAdminUsers(userPayload, {
					users: (users.results || []) as any[],
					roles,
					page,
					pageSize,
					total: Number(countRow?.total || 0),
				}));
			}

			if (url.pathname === '/admin/permissions') {
				const [roleRows, userRows] = await Promise.all([
					db.prepare('SELECT role, permissions FROM role_permissions').all(),
					db.prepare('SELECT role FROM users').all(),
				]);
				const counts = new Map<string, number>();
				for (const item of (userRows.results || []) as any[]) {
					const role = normalizeRole(item.role);
					counts.set(role, (counts.get(role) || 0) + 1);
				}
				const order = new Map([['admin', 1], ['manager', 2], ['moderator', 3], ['user', 4]]);
				const roles = ((roleRows.results || []) as any[])
					.map((row) => ({
						role: normalizeRole(row.role),
						permissions: normalizePermissions(row.permissions),
						user_count: counts.get(normalizeRole(row.role)) || 0,
					}))
					.sort((a, b) => (order.get(a.role) || 9) - (order.get(b.role) || 9) || a.role.localeCompare(b.role));
				return adminHtmlResponse(renderAdminPermissions(userPayload, { roles }));
			}

			if (url.pathname === '/admin/posts') {
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
				const offset = (page - 1) * pageSize;
				const locale = requestLocale();
				const fallbackLocale = locale === 'en-US' ? 'zh-CN' : 'en-US';
				const [posts, categories, countRow] = await Promise.all([
					db.prepare(
					`SELECT p.id, p.title, p.content, p.created_at, p.view_count, p.is_pinned, p.is_category_pinned, p.category_id, p.author_id,
					        u.username,
					        COALESCE(ct.value, cf.value, c.name) AS category_name,
					        COUNT(cm.id) AS comment_count
					   FROM posts p
					   JOIN users u ON u.id = p.author_id
					   LEFT JOIN categories c ON c.id = p.category_id
					   LEFT JOIN translations ct ON ct.scope = ('category:' || c.id) AND ct.key = 'name' AND ct.locale = ?
					   LEFT JOIN translations cf ON cf.scope = ('category:' || c.id) AND cf.key = 'name' AND cf.locale = ?
					   LEFT JOIN comments cm ON cm.post_id = p.id
					  GROUP BY p.id
					  ORDER BY p.created_at DESC
					  LIMIT ? OFFSET ?`
					).bind(locale, fallbackLocale, pageSize, offset).all(),
					db.prepare(
						`SELECT c.id, COALESCE(ct.value, cf.value, c.name) AS name
						   FROM categories c
						   LEFT JOIN translations ct ON ct.scope = ('category:' || c.id) AND ct.key = 'name' AND ct.locale = ?
						   LEFT JOIN translations cf ON cf.scope = ('category:' || c.id) AND cf.key = 'name' AND cf.locale = ?
						  ORDER BY COALESCE(c.sort_order, c.id * 10) ASC, c.created_at ASC, c.id ASC`
					).bind(locale, fallbackLocale).all(),
					db.prepare('SELECT COUNT(*) AS total FROM posts').first<{ total: number }>()
				]);
				return adminHtmlResponse(renderAdminPosts(userPayload, {
					posts: (posts.results || []) as any[],
					categories: (categories.results || []) as any[],
					page,
					pageSize,
					total: Number(countRow?.total || 0),
				}, env));
			}

			if (url.pathname === '/admin/comments') {
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
				const offset = (page - 1) * pageSize;
				const [comments, countRow] = await Promise.all([
				db.prepare(
					`SELECT cm.id, cm.content, cm.created_at, cm.parent_id, cm.post_id, u.username, p.title AS post_title
					   FROM comments cm
					   JOIN users u ON u.id = cm.author_id
					   JOIN posts p ON p.id = cm.post_id
					  ORDER BY cm.created_at DESC
					  LIMIT ? OFFSET ?`
				).bind(pageSize, offset).all(),
				db.prepare('SELECT COUNT(*) AS total FROM comments').first<{ total: number }>()
				]);
				return adminHtmlResponse(renderAdminComments(userPayload, {
					comments: (comments.results || []) as any[],
					page,
					pageSize,
					total: Number(countRow?.total || 0),
				}, env));
			}

			if (url.pathname === '/admin/moderation') {
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
				const offset = (page - 1) * pageSize;
				const status = ['pending', 'approved', 'rejected'].includes(String(url.searchParams.get('status') || '')) ? String(url.searchParams.get('status')) : 'pending';
				const [items, countRow, rejectReasonRow, rejectReasonsRow] = await Promise.all([
					db.prepare(
						`SELECT * FROM (
							SELECT 'post' AS type, p.id, p.title, p.content, p.status, p.created_at, p.author_id, NULL AS post_id, NULL AS post_title, u.username
							  FROM posts p JOIN users u ON u.id = p.author_id
							 WHERE COALESCE(p.status, 'approved') = ?
							UNION ALL
							SELECT 'comment' AS type, cm.id, p.title, cm.content, cm.status, cm.created_at, cm.author_id, cm.post_id, p.title AS post_title, u.username
							  FROM comments cm JOIN users u ON u.id = cm.author_id JOIN posts p ON p.id = cm.post_id
							 WHERE COALESCE(cm.status, 'approved') = ?
						) ORDER BY created_at DESC LIMIT ? OFFSET ?`
					).bind(status, status, pageSize, offset).all(),
					db.prepare(
						`SELECT
							(SELECT COUNT(*) FROM posts WHERE COALESCE(status, 'approved') = ?) +
							(SELECT COUNT(*) FROM comments WHERE COALESCE(status, 'approved') = ?) AS total`
					).bind(status, status).first<{ total: number }>(),
					db.prepare("SELECT value FROM settings WHERE key = 'moderation_default_reject_reason'").first<DBSetting>(),
					db.prepare("SELECT value FROM settings WHERE key = 'moderation_reject_reasons'").first<DBSetting>()
				]);
				return adminHtmlResponse(renderAdminModeration(userPayload, {
					items: (items.results || []) as any[],
					status,
					page,
					pageSize,
					total: Number(countRow?.total || 0),
					defaultRejectReason: rejectReasonRow?.value || '内容不符合社区规则，请修改后重新提交。',
					rejectReasons: rejectReasonsRow?.value || ''
				}, env));
			}

			if (url.pathname === '/admin/settings') {
				const settings = await db.prepare('SELECT key, value FROM settings').all();
				const config: Record<string, any> = {
					turnstile_enabled: false,
					notify_on_user_delete: false,
					notify_on_username_change: false,
					notify_on_avatar_change: false,
					notify_on_manual_verify: false,
					smtp_host: '',
					smtp_port: '',
					smtp_user: '',
					smtp_pass: '',
					smtp_from: '',
					smtp_from_name: '',
					maintenance_enabled: false,
					maintenance_title: '站点维护中',
					maintenance_message: '我们正在升级服务，请稍后再回来。',
					maintenance_until: '',
					site_name: 'ForumForge',
					site_tagline: 'Dense media discussion feed',
					site_icon_url: '',
					id_codec_secret: '',
					oauth_google_enabled: false,
					oauth_google_client_id: '',
					oauth_google_client_secret: '',
					oauth_github_enabled: false,
					oauth_github_client_id: '',
					oauth_github_client_secret: '',
					oauth_epic_enabled: false,
					oauth_epic_client_id: '',
					oauth_epic_client_secret: '',
					moderation_posts_default: 'approved',
					moderation_comments_default: 'approved',
					moderation_default_reject_reason: '内容不符合社区规则，请修改后重新提交。',
				};
				for (const keys of Object.values(PROGRESS_REWARD_KEYS)) {
					config[keys.points] = '';
					config[keys.experience] = '';
				}
				for (const row of (settings.results || []) as any[]) {
					const key = String(row.key);
					if (key.startsWith('smtp_') || (key.startsWith('maintenance_') && key !== 'maintenance_enabled') || key === 'site_icon_url' || key === 'site_name' || key === 'site_tagline' || key === 'id_codec_secret' || (key.startsWith('oauth_') && (key.endsWith('_client_id') || key.endsWith('_client_secret'))) || key.startsWith('reward_') || key.startsWith('moderation_') || key.startsWith('level_') || key.startsWith('visit_log_')) config[key] = String(row.value || '');
					else config[key] = row.value === '1';
				}
				const [languages, localized] = await Promise.all([
					getEnabledLanguages(),
					loadLocalizedMaps(['settings'])
				]);
				return adminHtmlResponse(renderSettingsPage(userPayload, {
					settings: config,
					languages: languages as any[],
					localized: localized.get('settings') || {}
				}));
			}

			return adminHtmlResponse(renderSimpleAdminTable(
				userPayload,
				'dashboard',
				'未找到页面',
				'这个后台页面还没有实现。',
				[{ label: '路径', key: 'admin.table.path' }],
				[[escapeHtml(url.pathname)]],
				'未找到页面',
				{ titleKey: 'admin.notFound.title', subtitleKey: 'admin.notFound.subtitle', emptyKey: 'admin.notFound.title' }
			), 404);
}

