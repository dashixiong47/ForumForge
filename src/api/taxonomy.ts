import type { Security, UserPayload } from '../core/security';
import { hasControlCharacters, hasInvisibleCharacters } from '../core/validation';
import type { JsonResponse } from './types';

export type TaxonomyApiContext = {
	request: Request;
	url: URL;
	method: string;
	db: D1Database;
	security: Security;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	apiAdminUser: UserPayload | null;
	authenticate: (request: Request) => Promise<UserPayload>;
	loadAccessUser: (payload: UserPayload) => Promise<UserPayload>;
	authenticateAdminForPath: () => Promise<UserPayload>;
	normalizeLocale: (value: unknown) => string;
	saveLocalizedFields: (scope: string, localized: unknown, allowedFields: string[], fallbacks?: Record<string, string>) => Promise<void>;
	getSiteCategories: (viewer?: any) => Promise<any[]>;
	getSiteTags: () => Promise<any[]>;
	invalidatePublicContent?: (reason?: string) => void;
};

const normalizeTagName = (value: unknown) => {
	const name = String(value || '').replace(/^#+/, '').trim();
	if (!name) return '';
	return name.replace(/\s+/g, ' ');
};

export async function handleTaxonomyApi(ctx: TaxonomyApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		db,
		security,
		jsonResponse,
		handleError,
		apiAdminUser,
		authenticate,
		loadAccessUser,
		authenticateAdminForPath,
		normalizeLocale,
		saveLocalizedFields,
		getSiteCategories,
		getSiteTags,
		invalidatePublicContent,
	} = ctx;

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

	if (url.pathname === '/api/tags' && method === 'GET') {
		try {
			return jsonResponse(await getSiteTags());
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/tags' && method === 'POST') {
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			invalidatePublicContent?.('tag:create');
			return jsonResponse({ success: result.success, id: tagId || undefined });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/tags/bulk-delete' && method === 'POST') {
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			if (deleted) invalidatePublicContent?.('tag:bulk-delete');
			return jsonResponse({ success: true, deleted });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/tags\/\d+$/) && method === 'PUT') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			invalidatePublicContent?.('tag:update');
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/tags\/\d+$/) && method === 'DELETE') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
			await db.prepare('DELETE FROM post_tags WHERE tag_id = ?').bind(id).run();
			await db.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();
			await security.logAudit(userPayload.id, 'DELETE_TAG', 'tag', id, {}, request);
			invalidatePublicContent?.('tag:delete');
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/categories' && method === 'POST') {
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			invalidatePublicContent?.('category:create');
			return jsonResponse({ success: result.success, id: categoryId || undefined });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/categories/reorder' && method === 'POST') {
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			invalidatePublicContent?.('category:reorder');
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/categories/all' && method === 'PUT') {
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			invalidatePublicContent?.('category:all-update');
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/categories\/\d+$/) && method === 'PUT') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
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
			invalidatePublicContent?.('category:update');
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/categories\/\d+$/) && method === 'DELETE') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = apiAdminUser || await authenticateAdminForPath();
			const count = await db.prepare('SELECT COUNT(*) as count FROM posts WHERE category_id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<number>('count');
			if ((count ?? 0) > 0) {
				return jsonResponse({ error: 'Cannot delete category with existing posts' }, 400);
			}

			await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
			await security.logAudit(userPayload.id, 'DELETE_CATEGORY', 'category', id, {}, request);
			invalidatePublicContent?.('category:delete');
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	return null;
}
