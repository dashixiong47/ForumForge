import type { Security, UserPayload } from '../core/security';
import { adminPermissionForApiPath } from '../admin/permissions';
import { deleteImage, listAllKeys, getKeyFromUrl, type S3Env } from '../integrations/s3';
import { extractImageUrls } from '../utils/media';
import { hasControlCharacters, hasInvisibleCharacters, isVisuallyEmpty } from '../core/validation';
import { decodePublicId, publicPostPath } from '../core/id-codec';

// Admin content API routes (badges, posts, comments, moderation, cleanup),
// extracted from index.ts fetch handler. Returns a Response when a route
// matches, or null so the caller can continue to the next route group.
export type AdminContentApiDeps = {
	db: D1Database;
	env: Env;
	url: URL;
	method: string;
	request: Request;
	executionCtx: ExecutionContext;
	security: Security;
	apiAdminUser: UserPayload | null;
	jsonResponse: (data: any, status?: number, extraHeaders?: HeadersInit) => Response;
	handleError: (e: any) => Response;
	authenticateAdmin: (req: Request, permission: any) => Promise<UserPayload>;
	createNotification: (...args: any[]) => Promise<any>;
	awardUserProgress: (...args: any[]) => Promise<any>;
	notifyBadgeChange: (...args: any[]) => Promise<any>;
	ensureBadgeDefinitionDescription: () => Promise<any>;
	invalidatePublicContent: (reason?: string) => any;
	runtimeEnvForLinks: any;
};

export async function handleAdminContentApi(deps: AdminContentApiDeps): Promise<Response | null> {
	const { db, env, url, method, request, executionCtx, security, apiAdminUser, jsonResponse, handleError, authenticateAdmin, createNotification, awardUserProgress, notifyBadgeChange, ensureBadgeDefinitionDescription, invalidatePublicContent, runtimeEnvForLinks } = deps;

		// GET /api/admin/badge-defs — 勋章定义分页列表
		if (url.pathname === '/api/admin/badge-defs' && method === 'GET') {
			try {
				if (!apiAdminUser) return jsonResponse({ error: 'Unauthorized' }, 401);
				await ensureBadgeDefinitionDescription();
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = 20;
				const offset = (page - 1) * pageSize;
				const [countRes, dataRes] = await db.batch([
					db.prepare(`SELECT COUNT(*) as cnt
						FROM badge_definitions bd
						JOIN plugins p ON p.id=bd.plugin_id AND p.enabled=1 AND COALESCE(p.deleted_at,0)=0`),
					db.prepare(`SELECT bd.id, bd.plugin_id, bd.badge_key, bd.label, bd.description, bd.icon, bd.color, bd.enabled,
						COUNT(ub.id) as user_count
						FROM badge_definitions bd
						JOIN plugins p ON p.id=bd.plugin_id AND p.enabled=1 AND COALESCE(p.deleted_at,0)=0
						LEFT JOIN user_badges ub ON ub.plugin_id=bd.plugin_id AND ub.badge_key=bd.badge_key
						GROUP BY bd.id ORDER BY bd.plugin_id, bd.badge_key LIMIT ? OFFSET ?`).bind(pageSize, offset),
				]);
				return jsonResponse({ items: dataRes.results || [], total: (countRes.results?.[0] as any)?.cnt ?? 0, page, pageSize });
			} catch (e) { return handleError(e); }
		}

		// PATCH /api/admin/badges/:id/toggle — 切换启用状态
		const badgeToggleMatch = url.pathname.match(/^\/api\/admin\/badges\/(\d+)\/toggle$/);
		if (badgeToggleMatch && method === 'PATCH') {
			try {
				if (!apiAdminUser) return jsonResponse({ error: 'Unauthorized' }, 401);
				await ensureBadgeDefinitionDescription();
				const badgeId = Number(badgeToggleMatch[1]);
				await db.prepare('UPDATE badge_definitions SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=?').bind(badgeId).run();
				const row = await db.prepare('SELECT enabled FROM badge_definitions WHERE id=?').bind(badgeId).first<{ enabled: number }>();
				return jsonResponse({ success: true, enabled: row?.enabled ?? 1 });
			} catch (e) {
				return handleError(e);
			}
		}

		// PATCH|DELETE /api/admin/badges/:id — 修改勋章定义
		const badgeMgmtMatch = url.pathname.match(/^\/api\/admin\/badges\/(\d+)$/);
		if (badgeMgmtMatch && (method === 'PATCH' || method === 'DELETE')) {
			try {
				if (!apiAdminUser) return jsonResponse({ error: 'Unauthorized' }, 401);
				await ensureBadgeDefinitionDescription();
				const badgeId = Number(badgeMgmtMatch[1]);
				if (method === 'PATCH') {
					const body = await request.json().catch(() => ({})) as any;
					const label = String(body.label || '').slice(0, 100);
					const icon = String(body.icon || '').slice(0, 500);
					const color = String(body.color || '').slice(0, 32);
					const description = String(body.description || '').slice(0, 500);
					await db.prepare('UPDATE badge_definitions SET label=?, description=?, icon=?, color=? WHERE id=?').bind(label, description, icon, color, badgeId).run();
				} else {
					await db.prepare('DELETE FROM badge_definitions WHERE id=?').bind(badgeId).run();
				}
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/admin/badge-users — 用户勋章列表（按用户分组摘要 or 指定用户明细）
		if (url.pathname === '/api/admin/badge-users' && method === 'GET') {
			try {
				if (!apiAdminUser) return jsonResponse({ error: 'Unauthorized' }, 401);
				await ensureBadgeDefinitionDescription();
				const search = (url.searchParams.get('q') || '').trim();
				const userId = Number(url.searchParams.get('user_id') || 0);
				if (userId) {
					// 指定用户的所有勋章明细
					const rows = await db.prepare(
						`SELECT ub.id, ub.user_id, ub.plugin_id, ub.badge_key,
						        COALESCE(NULLIF(bd.label,''), ub.label) AS label,
						        COALESCE(NULLIF(bd.color,''), ub.color) AS color,
						        COALESCE(NULLIF(bd.icon,''), ub.icon) AS icon,
						        COALESCE(NULLIF(bd.description,''), ub.description) AS description,
						        ub.enabled, ub.granted_at, u.username
						 FROM user_badges ub
						 JOIN users u ON u.id = ub.user_id
						 JOIN plugins p ON p.id = ub.plugin_id AND p.enabled = 1 AND COALESCE(p.deleted_at, 0) = 0
						 LEFT JOIN badge_definitions bd ON bd.plugin_id=ub.plugin_id AND bd.badge_key=ub.badge_key
						 WHERE ub.user_id = ? AND COALESCE(u.deleted_at,0)=0
						 ORDER BY ub.granted_at ASC`
					).bind(userId).all();
					return jsonResponse({ items: rows.results || [] });
				}
				// 按用户分组摘要（每个用户一行，带勋章列表）
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = 20;
				const offset = (page - 1) * pageSize;
				const [countRes, dataRes] = await db.batch([
					search
						? db.prepare(`SELECT COUNT(DISTINCT ub.user_id) as cnt
							FROM user_badges ub
							JOIN users u ON u.id=ub.user_id
							JOIN plugins p ON p.id=ub.plugin_id AND p.enabled=1 AND COALESCE(p.deleted_at,0)=0
							WHERE COALESCE(u.deleted_at,0)=0 AND u.username LIKE ?`).bind(`%${search}%`)
						: db.prepare(`SELECT COUNT(DISTINCT ub.user_id) as cnt
							FROM user_badges ub
							JOIN users u ON u.id=ub.user_id
							JOIN plugins p ON p.id=ub.plugin_id AND p.enabled=1 AND COALESCE(p.deleted_at,0)=0
							WHERE COALESCE(u.deleted_at,0)=0`),
					search
						? db.prepare(`SELECT u.id as user_id, u.username, COUNT(ub.id) as badge_count
							FROM user_badges ub JOIN users u ON u.id=ub.user_id
							JOIN plugins p ON p.id=ub.plugin_id AND p.enabled=1 AND COALESCE(p.deleted_at,0)=0
							WHERE COALESCE(u.deleted_at,0)=0 AND u.username LIKE ?
							GROUP BY u.id ORDER BY u.username LIMIT ? OFFSET ?`).bind(`%${search}%`, pageSize, offset)
						: db.prepare(`SELECT u.id as user_id, u.username, COUNT(ub.id) as badge_count
							FROM user_badges ub JOIN users u ON u.id=ub.user_id
							JOIN plugins p ON p.id=ub.plugin_id AND p.enabled=1 AND COALESCE(p.deleted_at,0)=0
							WHERE COALESCE(u.deleted_at,0)=0
							GROUP BY u.id ORDER BY u.username LIMIT ? OFFSET ?`).bind(pageSize, offset),
				]);
				return jsonResponse({ items: dataRes.results || [], total: (countRes.results?.[0] as any)?.cnt ?? 0, page, pageSize });
			} catch (e) { return handleError(e); }
		}

		// PATCH /api/admin/badge-users/:id/toggle — 切换该用户该勋章的启用
		const badgeUserToggleMatch = url.pathname.match(/^\/api\/admin\/badge-users\/(\d+)\/toggle$/);
		if (badgeUserToggleMatch && method === 'PATCH') {
			try {
				if (!apiAdminUser) return jsonResponse({ error: 'Unauthorized' }, 401);
				const id = Number(badgeUserToggleMatch[1]);
				const before = await db.prepare('SELECT enabled FROM user_badges WHERE id=?').bind(id).first<{ enabled: number }>();
				const nextEnabled = Number(before?.enabled || 0) === 1 ? 0 : 1;
				await notifyBadgeChange(
					id,
					nextEnabled ? 'badge_enabled' : 'badge_disabled',
					nextEnabled ? '勋章已启用' : '勋章已禁用',
					nextEnabled ? '管理员已重新启用你的勋章' : '管理员已禁用你的勋章'
				);
				await db.prepare('UPDATE user_badges SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=?').bind(id).run();
				const row = await db.prepare('SELECT enabled FROM user_badges WHERE id=?').bind(id).first<{ enabled: number }>();
				return jsonResponse({ success: true, enabled: row?.enabled ?? 1 });
			} catch (e) { return handleError(e); }
		}

		// DELETE /api/admin/badge-users/:id — 撤销（删除）用户勋章记录
		const badgeUserDeleteMatch = url.pathname.match(/^\/api\/admin\/badge-users\/(\d+)$/);
		if (badgeUserDeleteMatch && method === 'DELETE') {
			try {
				if (!apiAdminUser) return jsonResponse({ error: 'Unauthorized' }, 401);
				const id = Number(badgeUserDeleteMatch[1]);
				await notifyBadgeChange(id, 'badge_revoked', '勋章已撤销', '管理员已撤销你的勋章');
				await db.prepare('DELETE FROM user_badges WHERE id=?').bind(id).run();
				return jsonResponse({ success: true });
			} catch (e) { return handleError(e); }
		}

		// POST /api/admin/posts/bulk-delete
		if (url.pathname === '/api/admin/posts/bulk-delete' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdmin(request, adminPermissionForApiPath(url.pathname));
				const { ids } = await request.json() as { ids: number[] };
				if (!ids || !Array.isArray(ids) || ids.length === 0) return jsonResponse({ error: 'Missing post ids' }, 400);

				const now = Math.floor(Date.now() / 1000);
				for (const id of ids) {
					await db.prepare('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE post_id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, id).run();
					await db.prepare('UPDATE posts SET deleted_at = ?, deleted_by = ? WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, id).run();
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

				const now = Math.floor(Date.now() / 1000);
				await db.prepare('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE post_id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, id).run();
				await db.prepare('UPDATE posts SET deleted_at = ?, deleted_by = ? WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, id).run();
				
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
						const post = await db.prepare('SELECT id FROM posts WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(item.id).first();
						if (!post) continue;
						const now = Math.floor(Date.now() / 1000);
						await db.prepare('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE post_id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, item.id).run();
						await db.prepare('UPDATE posts SET deleted_at = ?, deleted_by = ? WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, item.id).run();
						deleted++;
					} else {
						const now = Math.floor(Date.now() / 1000);
						const changed = await db.prepare(`
							WITH RECURSIVE comment_tree(id, depth) AS (
								SELECT id, 0 FROM comments WHERE id = ?
								UNION ALL
								SELECT c.id, comment_tree.depth + 1
								FROM comments c
								JOIN comment_tree ON c.parent_id = comment_tree.id
							)
							UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id IN (SELECT id FROM comment_tree) AND COALESCE(deleted_at, 0) = 0
						`).bind(item.id, now, userPayload.id).run();
						if (!changed.success) continue;
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
					const now = Math.floor(Date.now() / 1000);
					await db.prepare('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE post_id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, id).run();
					await db.prepare('UPDATE posts SET deleted_at = ?, deleted_by = ? WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userPayload.id, id).run();
					await security.logAudit(userPayload.id, 'MODERATION_DELETE_POST', 'post', String(id), {}, request);
				} else {
					const now = Math.floor(Date.now() / 1000);
					await db.prepare(`
						WITH RECURSIVE comment_tree(id, depth) AS (
							SELECT id, 0 FROM comments WHERE id = ?
							UNION ALL
							SELECT c.id, comment_tree.depth + 1
							FROM comments c
							JOIN comment_tree ON c.parent_id = comment_tree.id
						)
						UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id IN (SELECT id FROM comment_tree) AND COALESCE(deleted_at, 0) = 0
					`).bind(id, now, userPayload.id).run();
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
					const now = Math.floor(Date.now() / 1000);
					const result = await db.prepare(`
						WITH RECURSIVE comment_tree(id, depth) AS (
							SELECT id, 0 FROM comments WHERE id = ?
							UNION ALL
							SELECT c.id, comment_tree.depth + 1
							FROM comments c
							JOIN comment_tree ON c.parent_id = comment_tree.id
						)
						UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id IN (SELECT id FROM comment_tree) AND COALESCE(deleted_at, 0) = 0
					`).bind(rootId, now, userPayload.id).run();
					deleted += Number((result.meta as any)?.changes || 0);
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

				const now = Math.floor(Date.now() / 1000);
				await db.prepare(`
					WITH RECURSIVE comment_tree(id, depth) AS (
						SELECT id, 0 FROM comments WHERE id = ?
						UNION ALL
						SELECT c.id, comment_tree.depth + 1
						FROM comments c
						JOIN comment_tree ON c.parent_id = comment_tree.id
					)
					UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id IN (SELECT id FROM comment_tree) AND COALESCE(deleted_at, 0) = 0
				`).bind(id, now, userPayload.id).run();
				
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
				
				executionCtx.waitUntil(Promise.all(deletePromises).catch(err => console.error('Cleanup failed', err)));
				
				return jsonResponse({ success: true, message: `Deletion of ${orphans.length} files started` });
			} catch (e) {
				return handleError(e);
			}
		}

	return null;
}
