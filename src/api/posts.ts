import type { Security, UserPayload } from '../core/security';
import type { DBSetting } from '../db/types';
import { canAdmin } from '../admin/permissions';
import { hasControlCharacters, hasInvisibleCharacters, isVisuallyEmpty } from '../core/validation';
import { extractImageUrls } from '../utils/media';
import { deleteImage, type S3Env } from '../integrations/s3';
import { publicPostPath } from '../core/id-codec';
import type { JsonResponse } from './types';

export type PostsApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	executionCtx: ExecutionContext;
	security: Security;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	authenticate: (request: Request) => Promise<UserPayload>;
	loadAccessUser: (payload: UserPayload) => Promise<UserPayload>;
	requireVerifiedUser: (payload: UserPayload) => Promise<UserPayload>;
	checkTurnstile: (body: any, ip: string) => Promise<boolean>;
	canViewPostByLevel: (viewer: any, post: { author_id?: unknown; min_view_level?: unknown }) => boolean;
	getSiteCategories: (viewer?: any) => Promise<any[]>;
	applyLocalizedCategoriesToPosts: <T extends { category_id?: number | string | null; category_name?: string | null }>(posts: T[], categories: any[]) => T[];
	attachTagsToPosts: <T extends { id: number | string }>(posts: T[]) => Promise<Array<T & { tags: Array<{ id: number; name: string }> }>>;
	awardUserProgress: (userId: number, source: any, options?: any) => Promise<any>;
	createNotification: (targetUserId: number | string, type: string, title: string, body: string, options?: any) => Promise<void>;
	runtimeEnvForLinks: Env;
};

const parseTagIds = (value: unknown) => {
	if (!Array.isArray(value)) return [];
	const ids = value.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
	return Array.from(new Set(ids)).slice(0, 8);
};

const escapeHtml = (value: unknown) => String(value || '')
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')
	.replace(/'/g, '&#039;');

export async function handlePostsApi(ctx: PostsApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		env,
		db,
		executionCtx,
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
		runtimeEnvForLinks,
	} = ctx;

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

			query += ` WHERE ${conditions.join(' AND ')}`;
			countQuery += ` WHERE ${conditions.join(' AND ')}`;

			const sortExpr =
				sortByRaw === 'likes'
					? `like_count ${sortDir}`
					: sortByRaw === 'comments'
						? `comment_count ${sortDir}`
						: sortByRaw === 'views'
							? `posts.view_count ${sortDir}`
							: `posts.created_at ${sortDir}`;
			const pinSortExpr = categoryId && categoryId !== 'uncategorized'
				? 'is_pinned DESC, COALESCE(is_category_pinned, 0) DESC'
				: 'is_pinned DESC';
			query += ` ORDER BY ${pinSortExpr}, ${sortExpr}, posts.created_at DESC LIMIT ? OFFSET ?`;
			params.push(limit, offset);

			const [postsResult, countResult] = await Promise.all([
				db.prepare(query).bind(...params).all(),
				db.prepare(countQuery).bind(...countParams).first<any>()
			]);
			const apiCategories = await getSiteCategories(viewer);
			const postsWithTags = await attachTagsToPosts(applyLocalizedCategoriesToPosts((postsResult.results || []) as any[], apiCategories));
			const safePosts = postsWithTags.map((post: any) => canViewPostByLevel(viewer, post)
				? post
				: { ...post, content: '', locked: true, comment_count: 0 });
			return jsonResponse({ posts: safePosts, total: countResult ? countResult.total : 0 });
		} catch (e) {
			return handleError(e);
		}
	}

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
			).bind(postId).first<any>();
			let viewer: UserPayload | null = null;
			try {
				viewer = await loadAccessUser(await authenticate(request));
			} catch {}
			if (!post) return jsonResponse({ error: 'Post not found' }, 404);
			if (Number(post.admin_only || 0) !== 0 && !(viewer && (canAdmin(viewer, 'posts') || canAdmin(viewer, 'categories')))) return jsonResponse({ error: 'Post not found' }, 404);
			if (!canViewPostByLevel(viewer, post)) return jsonResponse({ error: 'Level required to view this post' }, 403);

			try {
				await db.prepare('UPDATE posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?').bind(postId).run();
				post.view_count = Number(post.view_count || 0) + 1;
			} catch {}

			const userId = url.searchParams.get('user_id');
			if (userId) {
				const like = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, userId).first();
				post.liked = !!like;
			}

			const apiCategories = await getSiteCategories(viewer);
			const [postWithTags] = await attachTagsToPosts(applyLocalizedCategoriesToPosts([post], apiCategories));
			return jsonResponse(postWithTags);
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/posts\/\d+$/) && method === 'PUT') {
		const postId = url.pathname.split('/')[3];
		try {
			const userPayload = await requireVerifiedUser(await authenticate(request));
			const body = await request.json() as any;
			const { title, content, category_id } = body;
			const minViewLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_view_level || 0) || 0)));
			const minCommentLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_comment_level || 0) || 0)));
			const tagIds = parseTagIds(body.tag_ids);

			if (!title || !content) return jsonResponse({ error: 'Missing parameters' }, 400);
			if (isVisuallyEmpty(title) || isVisuallyEmpty(content)) return jsonResponse({ error: 'Title or content cannot be empty' }, 400);
			if (hasInvisibleCharacters(title) || hasInvisibleCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid invisible characters' }, 400);

			const post = await db.prepare('SELECT author_id, status, rejection_reason FROM posts WHERE id = ?').bind(postId).first<any>();
			if (!post) return jsonResponse({ error: 'Post not found' }, 404);

			const isAdminEdit = canAdmin(userPayload, 'posts');
			if (Number(post.author_id) !== Number(userPayload.id) && !isAdminEdit) return jsonResponse({ error: 'Unauthorized' }, 403);
			if (title.length > 30) return jsonResponse({ error: 'Title too long (Max 30 chars)' }, 400);
			if (content.length > 3000) return jsonResponse({ error: 'Content too long (Max 3000 chars)' }, 400);
			if (hasControlCharacters(title) || hasControlCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid control characters' }, 400);

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
			if (!isAdminEdit && nextStatus === 'pending') await createNotification(userPayload.id, 'post_resubmitted', '帖子已重新提交', '你的帖子修改后已重新提交审核。', { postId });
			if (!isAdminEdit && String(post.status || 'approved') !== 'approved' && nextStatus === 'approved') await awardUserProgress(userPayload.id, 'create_post', { postId });

			await security.logAudit(userPayload.id, 'UPDATE_POST', 'post', postId, { title_length: title.length, tag_ids: tagIds, status: nextStatus }, request);
			return jsonResponse({ success: true, status: nextStatus });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/posts\/\d+$/) && method === 'DELETE') {
		const id = url.pathname.split('/')[3];
		try {
			const userPayload = await authenticate(request);
			const post = await db.prepare('SELECT author_id, content FROM posts WHERE id = ?').bind(id).first<any>();
			if (!post) return jsonResponse({ error: 'Post not found' }, 404);
			if (post.author_id !== userPayload.id) return jsonResponse({ error: 'Unauthorized' }, 403);

			const imageUrls = extractImageUrls(post.content as string);
			if (imageUrls.length > 0) {
				executionCtx.waitUntil(Promise.all(imageUrls.map(url => deleteImage(env as unknown as S3Env, url, userPayload.id))).catch(err => console.error('Failed to delete post images', err)));
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
				if (!(await checkTurnstile(body, request.headers.get('CF-Connecting-IP') || '127.0.0.1'))) return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const post = await db.prepare("SELECT id, author_id, min_comment_level FROM posts WHERE id = ? AND COALESCE(status, 'approved') = 'approved'").bind(postId).first<{ id: number; author_id: number; min_comment_level?: number }>();
			if (!post) return jsonResponse({ error: 'Post not found' }, 404);
			const minCommentLevel = Math.max(0, Number(post.min_comment_level || 0));
			const canCommentByLevel = Number(post.author_id) === Number(userPayload.id) || canAdmin(userPayload, 'comments') || Number((userPayload as any).level || 0) >= minCommentLevel;
			if (!canCommentByLevel) return jsonResponse({ error: `Level ${minCommentLevel} required to comment` }, 403);

			let parentComment: { id: number; author_id: number; post_id: number } | null = null;
			if (parent_id) {
				parentComment = await db.prepare('SELECT id, author_id, post_id FROM comments WHERE id = ? AND post_id = ? AND COALESCE(status, \'approved\') = \'approved\'').bind(parent_id, postId).first<{ id: number; author_id: number; post_id: number }>();
				if (!parentComment) return jsonResponse({ error: 'Parent comment not found' }, 404);
			}

			const moderation = await db.prepare("SELECT value FROM settings WHERE key = 'moderation_comments_default'").first<DBSetting>();
			const commentStatus = userPayload.role === 'admin' || moderation?.value !== 'pending' ? 'approved' : 'pending';
			const { meta } = await db.prepare('INSERT INTO comments (post_id, author_id, content, parent_id, status) VALUES (?, ?, ?, ?, ?)').bind(postId, userPayload.id, content, parent_id || null, commentStatus).run();
			const commentId = meta.last_row_id;
			if (commentStatus === 'approved') await awardUserProgress(userPayload.id, 'reply_post', { postId, commentId });
			if (commentStatus === 'approved' && Number(post.author_id) !== Number(userPayload.id)) {
				await awardUserProgress(Number(post.author_id), 'post_replied', { postId, commentId, meta: { reply_author_id: userPayload.id } });
				await createNotification(Number(post.author_id), 'post_replied', '帖子收到新回复', '你的帖子有新的回复。', { postId, commentId });
			}
			if (commentStatus === 'approved' && parentComment && Number(parentComment.author_id) !== Number(userPayload.id)) {
				await createNotification(Number(parentComment.author_id), 'comment_replied', '你的回复收到回复', '有人回复了你的评论。', { postId, commentId, meta: { parent_comment_id: parentComment.id } });
			}
			if (commentStatus === 'pending') await createNotification(userPayload.id, 'comment_pending', '评论等待审核', '你的评论已提交，管理员审核后会显示。', { postId, commentId });
			return jsonResponse({ success: true, id: commentId, status: commentStatus }, 201);
		} catch (e) {
			return handleError(e);
		}
	}

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

	if (url.pathname.match(/^\/api\/comments\/\d+$/) && method === 'DELETE') {
		const id = url.pathname.split('/').pop();
		try {
			const userPayload = await loadAccessUser(await authenticate(request));
			const comment = await db.prepare('SELECT author_id FROM comments WHERE id = ?').bind(id).first<any>();
			if (!comment) return jsonResponse({ error: 'Comment not found' }, 404);
			if (comment.author_id !== userPayload.id && !canAdmin(userPayload, 'comments')) return jsonResponse({ error: 'Unauthorized' }, 403);
			await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id = ? OR comment_id IN (SELECT id FROM comments WHERE parent_id = ?)').bind(id, id).run();
			await db.prepare('DELETE FROM comments WHERE parent_id = ?').bind(id).run();
			await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
			await security.logAudit(userPayload.id, 'DELETE_COMMENT', 'comment', String(id), {}, request);
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/posts\/\d+\/like$/) && method === 'POST') {
		const postId = url.pathname.split('/')[3];
		try {
			const userPayload = await requireVerifiedUser(await authenticate(request));
			const existing = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, userPayload.id).first<any>();
			if (existing) {
				await db.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
				const likeCount = await db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').bind(postId).first<number>('count');
				return jsonResponse({ liked: false, like_count: Number(likeCount || 0) });
			}
			await db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').bind(postId, userPayload.id).run();
			const likeCount = await db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').bind(postId).first<number>('count');
			return jsonResponse({ liked: true, like_count: Number(likeCount || 0) });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/posts\/\d+\/like-status$/) && method === 'GET') {
		const postId = url.pathname.split('/')[3];
		try {
			const userPayload = await authenticate(request);
			const existing = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, userPayload.id).first();
			return jsonResponse({ liked: !!existing });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/posts' && method === 'POST') {
		try {
			const userPayload = await requireVerifiedUser(await authenticate(request));
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) return jsonResponse({ error: 'Turnstile verification failed' }, 403);

			const { title, content: rawContent, category_id } = body;
			const minViewLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_view_level || 0) || 0)));
			const minCommentLevel = Math.max(0, Math.min(999, Math.floor(Number(body.min_comment_level || 0) || 0)));
			const tagIds = parseTagIds(body.tag_ids);
			let content = rawContent;
			if (!title || !content) return jsonResponse({ error: 'Missing title or content' }, 400);
			if (isVisuallyEmpty(title) || isVisuallyEmpty(content)) return jsonResponse({ error: 'Title or content cannot be empty' }, 400);
			if (hasInvisibleCharacters(title) || hasInvisibleCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid invisible characters' }, 400);
			if (title.length > 30) return jsonResponse({ error: 'Title too long (Max 30 chars)' }, 400);
			if (content.length > 3000) return jsonResponse({ error: 'Content too long (Max 3000 chars)' }, 400);
			if (hasControlCharacters(title) || hasControlCharacters(content)) return jsonResponse({ error: 'Title or content contains invalid control characters' }, 400);

			content = escapeHtml(content);
			const safeTitle = escapeHtml(title);

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

	return null;
}
