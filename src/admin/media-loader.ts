import { getKeyFromUrl, getPublicUrl, listAllKeys, type S3Env } from '../integrations/s3';
import { extractMediaUrls, mediaTypeFromValue } from '../utils/media';

// Admin media aggregation (D1 assets + R2 bucket scan + legacy post scan).
// Extracted from admin-routes.ts renderAdminRoute().
export async function loadAdminMedia(env: Env, db: D1Database, getBaseUrl: () => string, includePosts: boolean, page: number, pageSize: number, query = '', type = '') {
	const r2KeyUrl = (key: string) => getPublicUrl(env as unknown as S3Env, key, (env as any).BUCKET ? `${getBaseUrl()}/r2` : undefined);
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
}
