import { canAdmin } from '../admin/permissions';
import type { DBCount } from '../db/types';
import type { UserPayload } from '../core/security';
import { decodePublicId, publicPostPath } from '../core/id-codec';
import { DEFAULT_LEVEL_SETTINGS, LEVEL_SETTING_KEYS, normalizeLevelSettings } from '../gamification/progress';
import { DEFAULT_VIDEO_EMBED_DOMAINS, normalizeVideoEmbedDomains, serializeVideoEmbedDomains } from '../site/markdown';
import { getPluginResourceByRef, resourcePluginForType } from '../api/plugin-resources';
import {
	renderAuthPage,
	renderHomePage,
	renderMyContentPage,
	renderNewPostPage,
	renderPluginResourcePage,
	renderPostPage,
	renderPublicUserPage,
	renderSettingsPageSite,
	siteHtmlResponse,
	type SiteBrand,

	type SiteCategory,
	type SiteLanguage,
	type SitePost,
	type SiteTag,
	type SiteUser,
} from '../site/ssr';

export type SiteRouteContext = {
	method: string;
	url: URL;
	db: D1Database;
	env?: Partial<Env> | Record<string, unknown>;
	getCurrentSiteUser: () => Promise<SiteUser | null>;
	getSiteCategories: (viewer?: SiteUser | UserPayload | null) => Promise<SiteCategory[]>;
	getSiteTags: () => Promise<SiteTag[]>;
	getAllCategoryCopy: (totalPosts?: number) => Promise<SiteCategory>;
	clearAuthCookie: () => string;
	settingNumber: (key: string, fallback: number) => Promise<number>;
	requestLocale: () => string;
	getEnabledLanguages: () => Promise<SiteLanguage[]>;
	getSiteBrand: () => Promise<SiteBrand>;
	getOAuthProviders?: () => Promise<Array<{ id: string; label: string }>>;
	attachTagsToPosts: <T extends { id: number | string }>(posts: T[]) => Promise<Array<T & { tags: Array<{ id: number; name: string }> }>>;
	applyLocalizedCategoriesToPosts: <T extends { category_id?: number | string | null; category_name?: string | null }>(posts: T[], categories: SiteCategory[]) => T[];
};

const VIDEO_EMBED_DOMAINS_KV_KEY = 'settings:video_embed_domains';

export async function renderSiteRoute(ctx: SiteRouteContext): Promise<Response | null> {
	const {
		method,
		url,
		db,
		env,
		getCurrentSiteUser,
		getSiteCategories,
		getSiteTags,
		getAllCategoryCopy,
		clearAuthCookie,
		settingNumber,
		requestLocale,
		getEnabledLanguages,
		getSiteBrand,
		getOAuthProviders,
		attachTagsToPosts,
		applyLocalizedCategoriesToPosts,
	} = ctx;
			if (method !== 'GET' && method !== 'HEAD') return null;
			if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/r2/')) return null;

			if (url.pathname === '/logout') {
				return new Response(null, {
					status: 302,
					headers: {
						Location: '/login',
						'Set-Cookie': clearAuthCookie(),
						'Cache-Control': 'no-store',
					},
				});
			}

			if (url.pathname === '/login') return siteHtmlResponse(renderAuthPage('login', '', getOAuthProviders ? await getOAuthProviders() : [], await getSiteBrand()));
			if (url.pathname === '/register') return siteHtmlResponse(renderAuthPage('register', '', getOAuthProviders ? await getOAuthProviders() : [], await getSiteBrand()));
			if (url.pathname === '/forgot') return siteHtmlResponse(renderAuthPage('forgot', '', [], await getSiteBrand()));
			if (url.pathname === '/reset') return siteHtmlResponse(renderAuthPage('reset', url.searchParams.get('token') || '', [], await getSiteBrand()));

			const user = await getCurrentSiteUser();
			const categories = await getSiteCategories(user);
			const brand = await getSiteBrand();
			const getLevelSettings = async () => normalizeLevelSettings({
				maxLevel: await settingNumber(LEVEL_SETTING_KEYS.maxLevel, DEFAULT_LEVEL_SETTINGS.maxLevel),
				baseExperience: await settingNumber(LEVEL_SETTING_KEYS.baseExperience, DEFAULT_LEVEL_SETTINGS.baseExperience),
				growth: await settingNumber(LEVEL_SETTING_KEYS.growth, DEFAULT_LEVEL_SETTINGS.growth),
			});
			const settingBool = async (key: string, fallback: boolean) => {
				const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value?: string }>().catch(() => null);
				return row?.value == null ? fallback : row.value !== '0';
			};
			const currentLocale = requestLocale();
			const getVideoEmbedDomains = async () => {
				const fallback = DEFAULT_VIDEO_EMBED_DOMAINS;
				const kv = (env as any)?.CACHE as KVNamespace | undefined;
				const cached = kv ? await kv.get(VIDEO_EMBED_DOMAINS_KV_KEY).catch(() => null) : null;
				if (cached != null) return normalizeVideoEmbedDomains(cached);
				const row = await db.prepare("SELECT value FROM settings WHERE key = 'video_embed_domains'").first<{ value?: string }>().catch(() => null);
				const serialized = row?.value || serializeVideoEmbedDomains(fallback);
				if (kv) await kv.put(VIDEO_EMBED_DOMAINS_KV_KEY, serialized, { expirationTtl: 300 }).catch(() => {});
				return normalizeVideoEmbedDomains(serialized);
			};
			const canUsePostI18n = async () => (await settingBool('posts_i18n_enabled', true)) || !!(user && canAdmin(user as any, 'posts'));
			const localizedPostColumns = (enabled: boolean) => enabled
				? `posts.*, COALESCE(NULLIF(pt.title, ''), posts.title) as title, COALESCE(NULLIF(pt.content, ''), posts.content) as content,`
				: `posts.*,`;
			const localizedPostJoin = (enabled: boolean) => enabled ? `LEFT JOIN post_translations pt ON pt.post_id = posts.id AND pt.locale = ?` : '';
			const localizedPostParams = (enabled: boolean) => enabled ? [currentLocale] : [];

			const resourceViewerMatch = url.pathname.match(/^\/plugin-resources\/([a-z0-9-]+)\/([0-9A-Za-z]{1,96})$/)
				|| url.pathname.match(/^\/blueprints\/([0-9A-Za-z]{1,96})$/);
			if (resourceViewerMatch) {
				const type = resourceViewerMatch.length === 3 ? resourceViewerMatch[1] : 'blueprint';
				const ref = resourceViewerMatch.length === 3 ? resourceViewerMatch[2] : resourceViewerMatch[1];
				const typeGate = await resourcePluginForType(db, type);
				if (!typeGate.pluginId || !typeGate.enabled) {
					return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>资源不存在</h1>'), 404);
				}
				const row = await getPluginResourceByRef(env as Env, db, type, ref);
				if (!row || row.plugin_id !== typeGate.pluginId) {
					return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>资源不存在</h1>'), 404);
				}
				return siteHtmlResponse(renderPluginResourcePage({
					user,
					brand,
					categories,
					type,
					id: row.publicId,
					title: row.title || type,
					height: Number((row.parsedMeta || {}).height || 0) || 980,
				}));
			}

			if (url.pathname === '/settings') {
				if (!user) return new Response(null, { status: 302, headers: { Location: '/login' } });
				const oauthCount = await db.prepare('SELECT COUNT(*) AS count FROM oauth_accounts WHERE user_id = ?').bind(user.id).first<DBCount>().catch(() => ({ count: 0 }) as DBCount);
				user.oauth_count = Number(oauthCount?.count || 0);
				const levelSettings = await getLevelSettings();
				return siteHtmlResponse(renderSettingsPageSite({ user, categories, brand, levelSettings }));
			}

			if (url.pathname === '/me') {
				if (!user) return new Response(null, { status: 302, headers: { Location: '/login' } });
				const safePage = (name: string) => Math.max(1, Math.min(999, Number(url.searchParams.get(name) || 1) || 1));
				const pageSize = Math.max(5, Math.min(30, Number(url.searchParams.get('pageSize') || 10) || 10));
				const activeTab = ['posts', 'drafts', 'replies', 'level', 'notifications'].includes(String(url.searchParams.get('tab') || ''))
					? String(url.searchParams.get('tab')) as 'posts' | 'drafts' | 'replies' | 'level' | 'notifications'
					: 'posts';
				const postsPage = safePage('posts_page');
				const draftsPage = safePage('drafts_page');
				const repliesPage = safePage('replies_page');
				const levelPage = safePage('level_page');
				const notificationsPage = safePage('notifications_page');
				const localizePosts = await canUsePostI18n();
				const [postsRes, postsCount, draftsRes, draftsCount, commentsRes, commentsCount, progressRes, progressCount, notificationsRes, notificationsCount] = await Promise.all([
					db.prepare(
						`SELECT ${localizedPostColumns(localizePosts)} categories.name as category_name,
							(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND COALESCE(comments.status, 'approved') = 'approved' AND COALESCE(comments.deleted_at, 0) = 0) as comment_count
						 FROM posts
						 LEFT JOIN categories ON posts.category_id = categories.id
						 ${localizedPostJoin(localizePosts)}
						 WHERE posts.author_id = ?
						   AND COALESCE(posts.status, 'approved') <> 'draft'
						   AND COALESCE(posts.deleted_at, 0) = 0
						 ORDER BY posts.created_at DESC
						 LIMIT ? OFFSET ?`
					).bind(...localizedPostParams(localizePosts), user.id, pageSize, (postsPage - 1) * pageSize).all(),
					db.prepare("SELECT COUNT(*) AS count FROM posts WHERE author_id = ? AND COALESCE(status, 'approved') <> 'draft' AND COALESCE(deleted_at, 0) = 0").bind(user.id).first<DBCount>(),
					db.prepare(
						`SELECT ${localizedPostColumns(localizePosts)} categories.name as category_name
						 FROM posts
						 LEFT JOIN categories ON posts.category_id = categories.id
						 ${localizedPostJoin(localizePosts)}
						 WHERE posts.author_id = ?
						   AND COALESCE(posts.status, 'approved') = 'draft'
						   AND COALESCE(posts.deleted_at, 0) = 0
						 ORDER BY posts.created_at DESC
						 LIMIT ? OFFSET ?`
					).bind(...localizedPostParams(localizePosts), user.id, pageSize, (draftsPage - 1) * pageSize).all(),
					db.prepare("SELECT COUNT(*) AS count FROM posts WHERE author_id = ? AND COALESCE(status, 'approved') = 'draft' AND COALESCE(deleted_at, 0) = 0").bind(user.id).first<DBCount>(),
					db.prepare(
						`SELECT comments.*, ${localizePosts ? "COALESCE(NULLIF(pt.title, ''), posts.title)" : 'posts.title'} as post_title
						 FROM comments
						 JOIN posts ON posts.id = comments.post_id
						 ${localizedPostJoin(localizePosts)}
						 WHERE comments.author_id = ?
						   AND COALESCE(comments.deleted_at, 0) = 0
						   AND COALESCE(posts.deleted_at, 0) = 0
						 ORDER BY comments.created_at DESC
						 LIMIT ? OFFSET ?`
					).bind(...localizedPostParams(localizePosts), user.id, pageSize, (repliesPage - 1) * pageSize).all(),
					db.prepare('SELECT COUNT(*) AS count FROM comments WHERE author_id = ? AND COALESCE(deleted_at, 0) = 0').bind(user.id).first<DBCount>(),
					db.prepare(
						`SELECT user_progress_logs.*, ${localizePosts ? "COALESCE(NULLIF(pt.title, ''), posts.title)" : 'posts.title'} as post_title
						 FROM user_progress_logs
						 LEFT JOIN posts ON posts.id = user_progress_logs.post_id
						 ${localizedPostJoin(localizePosts)}
						 WHERE user_progress_logs.user_id = ?
						 ORDER BY user_progress_logs.created_at DESC
						 LIMIT ? OFFSET ?`
					).bind(...localizedPostParams(localizePosts), user.id, pageSize, (levelPage - 1) * pageSize).all(),
					db.prepare('SELECT COUNT(*) AS count FROM user_progress_logs WHERE user_id = ?').bind(user.id).first<DBCount>(),
					db.prepare(
						`SELECT id, type, title, body, post_id, comment_id, is_read, created_at
						 FROM notifications
						 WHERE user_id = ?
						 ORDER BY created_at DESC, id DESC
						 LIMIT ? OFFSET ?`
					).bind(user.id, pageSize, (notificationsPage - 1) * pageSize).all(),
					db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?').bind(user.id).first<DBCount>(),
				]);
				const posts = await attachTagsToPosts(applyLocalizedCategoriesToPosts((postsRes.results || []) as any[], categories));
				const drafts = await attachTagsToPosts(applyLocalizedCategoriesToPosts((draftsRes.results || []) as any[], categories));
				const notifications = ((notificationsRes.results || []) as any[]).map((item) => ({
					...item,
					url: `/me?tab=notifications#notification-${item.id}`,
					target_url: item.post_id ? `${publicPostPath(item.post_id, env)}${item.comment_id ? `#comment-${item.comment_id}` : ''}` : '',
				}));
				return siteHtmlResponse(renderMyContentPage({
					user,
					env,
					brand,
					categories,
					posts: posts as unknown as SitePost[],
					drafts: drafts as unknown as SitePost[],
					comments: (commentsRes.results || []) as any[],
					progressLogs: (progressRes.results || []) as any[],
					notifications,
					activeTab,
					levelSettings: await getLevelSettings(),
					pagination: {
						posts: { page: postsPage, pageSize, total: Number(postsCount?.count || 0) },
						drafts: { page: draftsPage, pageSize, total: Number(draftsCount?.count || 0) },
						replies: { page: repliesPage, pageSize, total: Number(commentsCount?.count || 0) },
						level: { page: levelPage, pageSize, total: Number(progressCount?.count || 0) },
						notifications: { page: notificationsPage, pageSize, total: Number(notificationsCount?.count || 0) },
					},
				}));
			}

			if (url.pathname === '/new-post') {
				if (!user) return new Response(null, { status: 302, headers: { Location: '/login' } });
				const tags = await getSiteTags();
				const [maxTitleRow, maxContentRow] = await Promise.all([
					db.prepare("SELECT value FROM settings WHERE key = 'max_title_length'").first<{ value: string }>(),
					db.prepare("SELECT value FROM settings WHERE key = 'max_content_length'").first<{ value: string }>(),
				]);
				const maxTitleLength = Math.max(10, Math.min(500, parseInt(maxTitleRow?.value || '') || 100));
				const maxContentLength = Math.max(100, Math.min(100000, parseInt(maxContentRow?.value || '') || 3000));
				return siteHtmlResponse(renderNewPostPage({
					user,
					env,
					brand,
					categories,
					tags,
					languages: await getEnabledLanguages(),
					locale: currentLocale,
					postI18nEnabled: await canUsePostI18n(),
					videoEmbedDomains: await getVideoEmbedDomains(),
					maxTitleLength,
					maxContentLength,
				} as any));
			}

			const userMatch = url.pathname.match(/^\/users\/([0-9A-Za-z]+)$/) || url.pathname.match(/^\/u\/([0-9A-Za-z]+)$/);
			if (userMatch) {
				const profileId = decodePublicId(userMatch[1], env);
				if (!profileId) return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>用户不存在</h1>'), 404);
				const profile = await db.prepare(
					`SELECT id, email, username, role, verified, avatar_url, email_notifications, show_public_posts, points, experience, level, last_checkin_date, created_at
					 FROM users
					 WHERE id = ? AND COALESCE(deleted_at, 0) = 0`
				).bind(profileId).first<SiteUser>();
				if (!profile) return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>用户不存在</h1>'), 404);
				const pageSize = 12;
				const page = Math.max(1, Math.min(999, Number(url.searchParams.get('page') || 1) || 1));
				const showPosts = Number(profile.show_public_posts ?? 1) !== 0 || Number(user?.id || 0) === Number(profile.id) || user?.role === 'admin';
				const includeAdminOnlyProfilePosts = user ? canAdmin(user as any, 'posts') || canAdmin(user as any, 'categories') : false;
				const localizeProfilePosts = await canUsePostI18n();
				const [postCount, commentCount, postsResult] = await Promise.all([
					showPosts
						? db.prepare(
							`SELECT COUNT(*) AS count
							   FROM posts
							   LEFT JOIN categories ON posts.category_id = categories.id
							  WHERE posts.author_id = ?
							    AND COALESCE(posts.status, 'approved') = 'approved'
							    AND COALESCE(posts.deleted_at, 0) = 0
							    AND (posts.category_id IS NULL OR (COALESCE(categories.enabled, 1) = 1 AND (? = 1 OR COALESCE(categories.admin_only, 0) = 0)))`
						).bind(profile.id, includeAdminOnlyProfilePosts ? 1 : 0).first<DBCount>()
						: Promise.resolve({ count: 0 } as DBCount),
					db.prepare("SELECT COUNT(*) AS count FROM comments WHERE author_id = ? AND COALESCE(status, 'approved') = 'approved' AND COALESCE(deleted_at, 0) = 0").bind(profile.id).first<DBCount>(),
					showPosts
						? db.prepare(
							`SELECT ${localizedPostColumns(localizeProfilePosts)}
								users.username as author_name,
								users.avatar_url as author_avatar,
								users.role as author_role,
								users.points as author_points,
								users.experience as author_experience,
								users.level as author_level,
								categories.name as category_name,
								(SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
								(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND COALESCE(comments.status, 'approved') = 'approved' AND COALESCE(comments.deleted_at, 0) = 0) as comment_count
							 FROM posts
							 JOIN users ON posts.author_id = users.id
							 LEFT JOIN categories ON posts.category_id = categories.id
							 ${localizedPostJoin(localizeProfilePosts)}
							 WHERE posts.author_id = ?
							   AND COALESCE(posts.status, 'approved') = 'approved'
							   AND COALESCE(posts.deleted_at, 0) = 0
							   AND (posts.category_id IS NULL OR (COALESCE(categories.enabled, 1) = 1 AND (? = 1 OR COALESCE(categories.admin_only, 0) = 0)))
							 ORDER BY posts.created_at DESC
							 LIMIT ? OFFSET ?`
						).bind(...localizedPostParams(localizeProfilePosts), profile.id, includeAdminOnlyProfilePosts ? 1 : 0, pageSize, (page - 1) * pageSize).all()
						: Promise.resolve({ results: [] } as any),
				]);
				const posts = showPosts ? await attachTagsToPosts(applyLocalizedCategoriesToPosts((postsResult.results || []) as any[], categories)) : [];
				return siteHtmlResponse(renderPublicUserPage({
					profile,
					viewer: user,
					env,
					brand,
					categories,
					posts: posts as unknown as SitePost[],
					showPosts,
					postCount: Number(postCount?.count || 0),
					commentCount: Number(commentCount?.count || 0),
					pagination: { page, pageSize, total: Number(postCount?.count || 0) },
					levelSettings: await getLevelSettings(),
				}));
			}

			const editMatch = url.pathname.match(/^\/posts\/([0-9A-Za-z]+)\/edit$/);
			if (editMatch) {
				if (!user) return new Response(null, { status: 302, headers: { Location: '/login' } });
				const postId = decodePublicId(editMatch[1], env);
				if (!postId) return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>帖子不存在</h1>'), 404);
				const post = await db.prepare(
					`SELECT posts.*, categories.name as category_name
					 FROM posts
					 LEFT JOIN categories ON posts.category_id = categories.id
					 WHERE posts.id = ? AND COALESCE(posts.deleted_at, 0) = 0`
				).bind(postId).first<SitePost>();
				if (!post) return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>帖子不存在</h1>'), 404);
				if (!canAdmin(user as any, 'posts') && Number(post.author_id) !== Number(user.id)) {
					return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>无权限编辑</h1>'), 403);
				}
				const [postWithTags] = await attachTagsToPosts(applyLocalizedCategoriesToPosts([post as any], categories));
				const translationsRes = await db.prepare('SELECT locale, title, content, updated_at FROM post_translations WHERE post_id = ?').bind(postId).all();
				(postWithTags as any).translations = Object.fromEntries(((translationsRes.results || []) as any[]).map((row) => [row.locale, row]));
				const tags = await getSiteTags();
				const [maxTitleRowE, maxContentRowE] = await Promise.all([
					db.prepare("SELECT value FROM settings WHERE key = 'max_title_length'").first<{ value: string }>(),
					db.prepare("SELECT value FROM settings WHERE key = 'max_content_length'").first<{ value: string }>(),
				]);
				const maxTitleLengthE = Math.max(10, Math.min(500, parseInt(maxTitleRowE?.value || '') || 100));
				const maxContentLengthE = Math.max(100, Math.min(100000, parseInt(maxContentRowE?.value || '') || 3000));
				return siteHtmlResponse(renderNewPostPage({
					user,
					env,
					brand,
					categories,
					tags,
					post: postWithTags as unknown as SitePost,
					languages: await getEnabledLanguages(),
					locale: currentLocale,
					postI18nEnabled: await canUsePostI18n(),
					videoEmbedDomains: await getVideoEmbedDomains(),
					maxTitleLength: maxTitleLengthE,
					maxContentLength: maxContentLengthE,
				} as any));
			}

			const postMatch = url.pathname.match(/^\/posts\/([0-9A-Za-z]+)$/) || url.pathname.match(/^\/post\/([0-9A-Za-z]+)$/);
			const queryPostId = url.pathname === '/post' ? url.searchParams.get('id') : '';
			if (postMatch || queryPostId) {
				const postId = decodePublicId(postMatch ? postMatch[1] : queryPostId, env);
				if (!postId) return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>帖子不存在</h1>'), 404);
				const localizePost = await canUsePostI18n();
				const post = await db.prepare(
					`SELECT
						${localizedPostColumns(localizePost)}
						users.username as author_name,
						users.avatar_url as author_avatar,
						users.role as author_role,
						users.points as author_points,
						users.experience as author_experience,
						users.level as author_level,
						categories.name as category_name,
						categories.admin_only as admin_only,
						(SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
						(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND COALESCE(comments.status, 'approved') = 'approved' AND COALESCE(comments.deleted_at, 0) = 0) as comment_count
					 FROM posts
					 JOIN users ON posts.author_id = users.id
					 LEFT JOIN categories ON posts.category_id = categories.id
					 ${localizedPostJoin(localizePost)}
					 WHERE posts.id = ?`
				).bind(...localizedPostParams(localizePost), postId).first<SitePost>();
				if (!post) return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>帖子不存在</h1>'), 404);
				const postStatus = String((post as any).status || 'approved');
				const canPreviewPending = user ? (() => {
					const accessUser = user as unknown as UserPayload;
					return Number((post as any).author_id) === Number(user.id) || canAdmin(accessUser, 'posts') || canAdmin(accessUser, 'moderation');
				})() : false;
				if (postStatus !== 'approved' && !canPreviewPending) {
					return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>帖子不存在</h1>'), 404);
				}
				if (Number((post as any).admin_only || 0) !== 0 && !(user && (canAdmin(user as any, 'posts') || canAdmin(user as any, 'categories')))) {
					return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>帖子不存在</h1>'), 404);
				}
				if (postStatus === 'approved') {
					try {
						await db.prepare('UPDATE posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?').bind(postId).run();
						(post as any).view_count = Number((post as any).view_count || 0) + 1;
					} catch {}
				}
				const [postWithTags] = await attachTagsToPosts(applyLocalizedCategoriesToPosts([post as any], categories));
				const comments = await db.prepare(
					`SELECT comments.*, users.username, users.avatar_url, users.role, users.points, users.experience, users.level
					 FROM comments
					 JOIN users ON comments.author_id = users.id
						 WHERE post_id = ? AND COALESCE(comments.status, 'approved') = 'approved' AND COALESCE(comments.deleted_at, 0) = 0
					 ORDER BY created_at ASC`
				).bind(postId).all();
				return siteHtmlResponse(renderPostPage({
					user,
					env,
					brand,
					categories,
					post: postWithTags as unknown as SitePost,
					comments: (comments.results || []) as any[],
					videoEmbedDomains: await getVideoEmbedDomains(),
				}));
			}

			if (url.pathname === '/') {
				const pageSize = 30;
				const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
				const offset = (page - 1) * pageSize;
				const categoryId = url.searchParams.get('category_id') || '';
				const q = (url.searchParams.get('q') || '').trim();
				const sortBy = (url.searchParams.get('sort_by') || 'time').toLowerCase();
				const localizePosts = await canUsePostI18n();
				const includeAdminOnly = user ? canAdmin(user as any, 'posts') || canAdmin(user as any, 'categories') : false;
				const conditions: string[] = [
					"COALESCE(posts.status, 'approved') = 'approved'",
					"COALESCE(posts.deleted_at, 0) = 0",
					"(posts.category_id IS NULL OR (COALESCE(categories.enabled, 1) = 1 AND (? = 1 OR COALESCE(categories.admin_only, 0) = 0)))"
				];
				const params: any[] = [includeAdminOnly ? 1 : 0];
				const countParams: any[] = [includeAdminOnly ? 1 : 0];
				if (categoryId) {
					conditions.push('posts.category_id = ?');
					params.push(categoryId);
					countParams.push(categoryId);
				}
				if (q) {
					conditions.push(localizePosts ? '(posts.title LIKE ? OR posts.content LIKE ? OR pt.title LIKE ? OR pt.content LIKE ?)' : '(posts.title LIKE ? OR posts.content LIKE ?)');
					const like = `%${q}%`;
					params.push(...(localizePosts ? [like, like, like, like] : [like, like]));
					countParams.push(...(localizePosts ? [like, like, like, like] : [like, like]));
				}
				const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
				const sortExpr = sortBy === 'comments'
					? 'comment_count DESC'
					: sortBy === 'views'
						? 'posts.view_count DESC'
						: 'posts.created_at DESC';
				const pinSortExpr = categoryId && categoryId !== 'uncategorized'
					? 'posts.is_pinned DESC, COALESCE(posts.is_category_pinned, 0) DESC'
					: 'posts.is_pinned DESC';
				const [postsResult, countResult] = await Promise.all([
					db.prepare(
						`SELECT
							${localizedPostColumns(localizePosts)}
							users.username as author_name,
							users.avatar_url as author_avatar,
							users.role as author_role,
							users.points as author_points,
							users.experience as author_experience,
							users.level as author_level,
							categories.name as category_name,
							(SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
							(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND COALESCE(comments.status, 'approved') = 'approved' AND COALESCE(comments.deleted_at, 0) = 0) as comment_count
						 FROM posts
						 JOIN users ON posts.author_id = users.id
						 LEFT JOIN categories ON posts.category_id = categories.id
						 ${localizedPostJoin(localizePosts)}
						 ${where}
						 ORDER BY ${pinSortExpr}, ${sortExpr}, posts.created_at DESC
						 LIMIT ? OFFSET ?`
					).bind(...localizedPostParams(localizePosts), ...params, pageSize, offset).all(),
					db.prepare(`SELECT COUNT(*) as total FROM posts LEFT JOIN categories ON posts.category_id = categories.id ${localizedPostJoin(localizePosts)} ${where}`).bind(...localizedPostParams(localizePosts), ...countParams).first<{ total: number }>(),
				]);
				const posts = await attachTagsToPosts(applyLocalizedCategoriesToPosts((postsResult.results || []) as any[], categories));
				const allCategory = await getAllCategoryCopy(Number(countResult?.total || 0));
				return siteHtmlResponse(renderHomePage({
					user,
					env,
					brand,
					categories,
					allCategory,
					posts: posts as unknown as SitePost[],
					total: Number(countResult?.total || 0),
					page,
					pageSize,
					activeCategory: categoryId,
					q,
					sortBy,
					levelSettings: await getLevelSettings(),
				}));
			}

			return siteHtmlResponse(renderAuthPage('login', '', [], brand).replace('<h1>登录</h1>', '<h1>页面不存在</h1>'), 404);
}
