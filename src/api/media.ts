import { extractMediaUrls, mediaTypeFromValue } from '../utils/media';
import { deleteImage, getKeyFromUrl, getPublicUrl, listAllKeys, uploadImage, type S3Env } from '../integrations/s3';
import type { UserPayload } from '../core/security';
import { canAdmin } from '../admin/permissions';
import type { JsonResponse } from './types';

export type MediaApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	apiAdminUser: UserPayload | null;
	authenticateAdminForPath: () => Promise<UserPayload>;
	authenticate: (request: Request) => Promise<UserPayload>;
	loadAccessUser: (payload: UserPayload) => Promise<UserPayload>;
	requireVerifiedUser: (payload: UserPayload) => Promise<UserPayload>;
	getBaseUrl: () => string;
};

export async function handleMediaApi(ctx: MediaApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		env,
		db,
		jsonResponse,
		handleError,
		apiAdminUser,
		authenticateAdminForPath,
		authenticate,
		loadAccessUser,
		requireVerifiedUser,
		getBaseUrl,
	} = ctx;
		if (url.pathname === '/api/admin/media' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();

				const includePosts = url.searchParams.get('includePosts') === '1';
				const page = Math.max(1, Number(url.searchParams.get('page') || 1));
				const pageSize = Math.min(60, Math.max(12, Number(url.searchParams.get('pageSize') || 24)));
				const r2KeyUrlApi = (key: string) => getPublicUrl(
					env as unknown as S3Env,
					key,
					(env as any).BUCKET ? `${getBaseUrl()}/r2` : undefined
				);

				const loadAdminMediaApi = async () => {
					const offset = (page - 1) * pageSize;
					const [rowsRes, postsRes, allKeys] = await Promise.all([
						db.prepare(
							`SELECT m.*, p.title AS post_title
							   FROM media_assets m
							   LEFT JOIN posts p ON p.id = m.post_id
							  WHERE m.scope IN (${includePosts ? "'system', 'post'" : "'system'"})
							  ORDER BY m.created_at DESC, m.id DESC`
						).all(),
						includePosts ? db.prepare(
							`SELECT id, title, author_id, content, created_at
							   FROM posts
							  ORDER BY created_at DESC
							  LIMIT 1000`
						).all() : Promise.resolve({ results: [] } as any),
						listAllKeys(env as unknown as S3Env).catch(() => [])
					]);
					const items: any[] = [...((rowsRes.results || []) as any[])];
					const known = new Set(items.map((item) => item.key || getKeyFromUrl(env as unknown as S3Env, item.url) || item.url));
					for (const key of (allKeys || [])) {
						const isSystemKey = /(^|\/)system\/media\//.test(key);
						const isPostKey = /(^|\/)usr\/[^/]+\/post\//.test(key);
						if ((!includePosts && !isSystemKey) || (includePosts && !isSystemKey && !isPostKey)) continue;
						if (known.has(key)) continue;
						known.add(key);
						items.push({
							id: null,
							scope: isSystemKey ? 'system' : 'post',
							owner_id: null,
							post_id: null,
							post_title: '',
							key,
							url: r2KeyUrlApi(key),
							filename: key.split('/').pop() || 'media',
							mime_type: '',
							size_bytes: 0,
							media_type: mediaTypeFromValue('', key),
							source: 'bucket-scan',
							created_at: '',
						});
					}
					for (const post of (postsRes.results || []) as any[]) {
						for (const mediaUrl of extractMediaUrls(String(post.content || ''))) {
							const key = getKeyFromUrl(env as unknown as S3Env, mediaUrl) || mediaUrl;
							if (!key || known.has(key)) continue;
							known.add(key);
							items.push({
								id: null,
								scope: 'post',
								owner_id: post.author_id,
								post_id: post.id,
								post_title: post.title,
								key,
								url: mediaUrl,
								filename: key.split('/').pop() || 'media',
								mime_type: '',
								size_bytes: 0,
								media_type: mediaTypeFromValue('', mediaUrl),
								source: 'post-scan',
								created_at: post.created_at,
							});
						}
					}
					items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
					return { includePosts, page, pageSize, total: items.length, items: items.slice(offset, offset + pageSize) };
				};

				return jsonResponse(await loadAdminMediaApi());
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/media/:id
		if (url.pathname.match(/^\/api\/admin\/media\/\d+$/) && method === 'DELETE') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = Number(url.pathname.split('/').pop());
				const row = await db.prepare('SELECT id, scope, url FROM media_assets WHERE id = ?').bind(id).first<{ id: number; scope: string; url: string }>();
				if (!row) return jsonResponse({ error: 'Media not found' }, 404);
				if (row.scope !== 'system') return jsonResponse({ error: 'Only system media can be deleted here' }, 400);
				await deleteImage(env as unknown as S3Env, row.url);
				await db.prepare('DELETE FROM media_assets WHERE id = ?').bind(id).run();
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}
		

		// POST /api/upload (media upload)
		if (url.pathname === '/api/upload' && method === 'POST') {
			try {
				const user = await authenticate(request);
				
				const formData = await request.formData();
				const file = formData.get('file');
				const userId = user.id.toString(); // Use verified user ID
				const postId = formData.get('post_id') || 'general';
				const type = formData.get('type') || 'post';
				const uploadType = type === 'avatar' || type === 'system' ? type : 'post';

				if (!file || !(file instanceof File)) {
					return jsonResponse({ error: 'No file uploaded' }, 400);
				}

				if (uploadType === 'system') {
					const accessUser = await loadAccessUser(user);
					if (!canAdmin(accessUser, 'media')) {
						return jsonResponse({ error: 'Only administrators can upload system media' }, 403);
					}
				} else if (uploadType === 'post') {
					await requireVerifiedUser(user);
				}

				const isAvatar = uploadType === 'avatar';
				const isImage = file.type.startsWith('image/');
				const isVideo = file.type.startsWith('video/');

				if (isAvatar && !isImage) {
					return jsonResponse({ error: 'Only images are allowed for avatars' }, 400);
				}

				if (!isImage && !isVideo) {
					return jsonResponse({ error: 'Only images and videos are allowed' }, 400);
				}

				const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
				if (file.size > maxSize) {
					return jsonResponse({ error: `File size too large (Max ${isVideo ? '50MB' : '5MB'})` }, 400);
				}

				const imageKey = await uploadImage(env as unknown as S3Env, file, userId, postId.toString(), uploadType);
				const publicBase = (env as any).BUCKET ? `${getBaseUrl()}/r2` : undefined;
				const imageUrl = getPublicUrl(env as unknown as S3Env, imageKey, publicBase);
				if (uploadType === 'post' || uploadType === 'system') {
					await db.prepare(
						`INSERT INTO media_assets (scope, owner_id, post_id, key, url, filename, mime_type, size_bytes, media_type, source, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upload', CURRENT_TIMESTAMP)
						 ON CONFLICT(key) DO UPDATE SET
						   url = excluded.url,
						   filename = excluded.filename,
						   mime_type = excluded.mime_type,
						   size_bytes = excluded.size_bytes,
						   media_type = excluded.media_type,
						   updated_at = CURRENT_TIMESTAMP`
					).bind(
						uploadType,
						Number(userId),
						uploadType === 'post' && postId !== 'general' ? Number(postId) || null : null,
						imageKey,
						imageUrl,
						file.name,
						file.type || '',
						file.size,
						mediaTypeFromValue(file.type || '', imageKey)
					).run();
				}
				return jsonResponse({ success: true, url: imageUrl });
			} catch (e) {
				console.error('Upload error:', e);
				return handleError(e); // 401/403 will be caught here if auth fails
			}
		}


	return null;
}


