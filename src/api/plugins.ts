import type { DBPlugin } from '../db/types';
import { comparePluginVersion, hydrateBuiltinPluginRow, normalizePluginId, normalizePluginManifest } from '../plugins/registry';
import type { UserPayload } from '../core/security';
import type { JsonResponse } from './types';

export type PluginApiContext = {
	request: Request;
	url: URL;
	method: string;
	db: D1Database;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	apiAdminUser: UserPayload | null;
	authenticateAdminForPath: () => Promise<UserPayload>;
	pluginRowToManifest: (row: DBPlugin, includeShare?: boolean) => Record<string, any>;
	upsertPluginManifest: (manifest: any, sourceUrl?: string) => Promise<void>;
	getBaseUrl: () => string;
};

export async function handlePluginApi(ctx: PluginApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		db,
		jsonResponse,
		handleError,
		apiAdminUser,
		authenticateAdminForPath,
		pluginRowToManifest,
		upsertPluginManifest,
		getBaseUrl,
	} = ctx;
		if (url.pathname === '/api/plugins' && method === 'GET') {
			try {
				const { results } = await db.prepare(
					'SELECT id, slug, name, description, version, enabled, config, author, homepage, icon, type, css, html, js, head_html, block_types, i18n, config_schema, permissions, tags FROM plugins WHERE enabled = 1 ORDER BY name ASC'
				).all();
				return jsonResponse(((results || []) as unknown as DBPlugin[]).map((row) => pluginRowToManifest(row)));
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/plugins/:id/manifest.json
		if (url.pathname.match(/^\/api\/plugins\/[^/]+\/manifest\.json$/) && method === 'GET') {
			try {
				const parts = url.pathname.split('/');
				const id = normalizePluginId(decodeURIComponent(parts[3] || ''));
				if (!id) return jsonResponse({ error: 'Invalid plugin id' }, 400);
				const row = await db.prepare(
					'SELECT * FROM plugins WHERE id = ? OR slug = ?'
				).bind(id, id).first<DBPlugin>();
				if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
				return jsonResponse(pluginRowToManifest(row, true));
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/plugins/:id/notify-install
		if (url.pathname.match(/^\/api\/plugins\/[^/]+\/notify-install$/) && method === 'POST') {
			try {
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[3] || ''));
				const body = await request.json().catch(() => ({})) as any;
				const token = String(body.token || url.searchParams.get('token') || '').trim();
				const row = await db.prepare(
					'SELECT id, slug, share_token, share_notify FROM plugins WHERE id = ? OR slug = ?'
				).bind(id, id).first<DBPlugin>();
				if (!row || !row.share_token || row.share_token !== token || row.share_notify === 0) {
					return jsonResponse({ ok: false }, 202);
				}
				await db.prepare(
					`INSERT INTO plugin_share_events (plugin_id, plugin_slug, token, event_type, source_url, installer_origin, installer_user_agent, ip, country)
					 VALUES (?, ?, ?, 'install', ?, ?, ?, ?, ?)`
				).bind(
					row.id,
					row.slug || row.id,
					token,
					String(body.sourceUrl || ''),
					String(body.installerOrigin || request.headers.get('Origin') || ''),
					request.headers.get('User-Agent') || '',
					request.headers.get('CF-Connecting-IP') || '',
					request.headers.get('CF-IPCountry') || ''
				).run();
				return jsonResponse({ ok: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/admin/plugins
		if (url.pathname === '/api/admin/plugins' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const { results } = await db.prepare(
					'SELECT * FROM plugins ORDER BY name ASC'
				).all();
				const installs = await db.prepare(
					'SELECT plugin_id, COUNT(*) AS count FROM plugin_share_events GROUP BY plugin_id'
				).all();
				const installMap = new Map(((installs.results || []) as any[]).map((row) => [String(row.plugin_id), Number(row.count || 0)]));
				return jsonResponse(((results || []) as unknown as DBPlugin[]).map((row) => ({
					...row,
					manifest: pluginRowToManifest(row, true),
					install_count: installMap.get(row.id) || 0,
				})));
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/plugins
		if (url.pathname === '/api/admin/plugins' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const body = await request.json() as any;
				const result = normalizePluginManifest(body);
				if (!result.ok) return jsonResponse({ error: result.error }, 400);
				await upsertPluginManifest(result.manifest, result.manifest.source_url);
				return jsonResponse({ success: true, plugin: result.manifest }, 201);
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/plugins/fetch-manifest
		if (url.pathname === '/api/admin/plugins/fetch-manifest' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const body = await request.json() as any;
				const manifestUrl = String(body.url || '').trim();
				if (!/^https?:\/\//i.test(manifestUrl)) return jsonResponse({ error: 'Invalid manifest URL' }, 400);
				const response = await fetch(manifestUrl, {
					headers: { Accept: 'application/json' },
					signal: AbortSignal.timeout(5000),
				});
				if (!response.ok) return jsonResponse({ error: `Fetch failed: ${response.status}` }, 400);
				const raw = await response.json();
				const result = normalizePluginManifest({ ...(raw as any), sourceUrl: manifestUrl });
				if (!result.ok) return jsonResponse({ error: result.error }, 400);
				return jsonResponse({ manifest: { ...result.manifest, share: (raw as any)?.share || null } });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/plugins/check-updates
		if (url.pathname === '/api/admin/plugins/check-updates' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const { results } = await db.prepare(
					"SELECT id, slug, name, version, source_url FROM plugins WHERE source_url IS NOT NULL AND source_url != '' ORDER BY name ASC"
				).all();
				const rows = (results || []) as unknown as DBPlugin[];
				const updates = await Promise.all(
					rows.map(async (row) => {
						try {
							const response = await fetch(row.source_url || '', {
								headers: { Accept: 'application/json' },
								signal: AbortSignal.timeout(5000),
							});
							if (!response.ok) return { id: row.id, name: row.name, ok: false, error: `HTTP ${response.status}` };
							const raw = await response.json();
							const normalized = normalizePluginManifest({ ...(raw as any), sourceUrl: row.source_url });
							if (!normalized.ok) return { id: row.id, name: row.name, ok: false, error: normalized.error };
							const remote = normalized.manifest;
							return {
								id: row.id,
								name: row.name,
								ok: true,
								currentVersion: row.version || '0.0.0',
								remoteVersion: remote.version || '0.0.0',
								hasUpdate: comparePluginVersion(remote.version, row.version) > 0,
								sourceUrl: row.source_url,
							};
						} catch (error: any) {
							return { id: row.id, name: row.name, ok: false, error: String(error?.message || error) };
						}
					}),
				);
				return jsonResponse({ updates });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/plugins/:id/update-from-url
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+\/update-from-url$/) && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				const existing = await db.prepare('SELECT * FROM plugins WHERE id = ?').bind(id).first<DBPlugin>();
				if (!existing) return jsonResponse({ error: 'Plugin not found' }, 404);
				if (!existing.source_url) return jsonResponse({ error: 'Plugin has no source URL' }, 400);
				const response = await fetch(existing.source_url, {
					headers: { Accept: 'application/json' },
					signal: AbortSignal.timeout(5000),
				});
				if (!response.ok) return jsonResponse({ error: `Fetch failed: ${response.status}` }, 400);
				const raw = await response.json();
				const result = normalizePluginManifest({
					...(raw as any),
					id: existing.id,
					slug: existing.slug || existing.id,
					enabled: existing.enabled,
					sourceUrl: existing.source_url,
				});
				if (!result.ok) return jsonResponse({ error: result.error }, 400);
				await upsertPluginManifest(result.manifest, existing.source_url);
				return jsonResponse({ success: true, plugin: result.manifest });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/plugins/:id
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+$/) && method === 'PUT') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				const existing = await db.prepare('SELECT * FROM plugins WHERE id = ?').bind(id).first<DBPlugin>();
				if (!existing) return jsonResponse({ error: 'Plugin not found' }, 404);
				const body = await request.json() as any;
				const result = normalizePluginManifest({
					...pluginRowToManifest(existing),
					...body,
					id: existing.id,
					slug: existing.slug || existing.id,
					enabled: body.enabled === undefined ? existing.enabled : body.enabled,
				});
				if (!result.ok) return jsonResponse({ error: result.error }, 400);
				await upsertPluginManifest(result.manifest, result.manifest.source_url);
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/plugins/:id/toggle
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+\/toggle$/) && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = decodeURIComponent(url.pathname.split('/')[4] || '');
				const body = await request.json() as any;
				const enabled = body.enabled ? 1 : 0;
				const result = await db.prepare(
					'UPDATE plugins SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
				).bind(enabled, id).run();
				return jsonResponse({ success: result.success });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/plugins/:id
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+$/) && method === 'DELETE') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				if (!id) return jsonResponse({ error: 'Invalid plugin id' }, 400);
				await db.prepare('DELETE FROM plugins WHERE id = ?').bind(id).run();
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/admin/plugins/:id/manifest
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+\/manifest$/) && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				const rawRow = await db.prepare('SELECT * FROM plugins WHERE id = ?').bind(id).first<DBPlugin>();
				const row = rawRow ? hydrateBuiltinPluginRow(rawRow) : null;
				if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
				return jsonResponse(pluginRowToManifest(row, true));
			} catch (e) {
				return handleError(e);
			}
		}

		// GET /api/admin/plugins/:id/share
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+\/share$/) && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				let row = await db.prepare('SELECT * FROM plugins WHERE id = ?').bind(id).first<DBPlugin>();
				if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
				if (!row.share_token) {
					const token = crypto.randomUUID();
					await db.prepare('UPDATE plugins SET share_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(token, id).run();
					row = { ...row, share_token: token };
				}
				const base = getBaseUrl().replace(/\/$/, '');
				const pluginSlug = row.slug || row.id;
				const manifestUrl = `${base}/api/plugins/${encodeURIComponent(pluginSlug)}/manifest.json`;
				return jsonResponse({
					installUrl: `${base}/admin/plugins?install=${encodeURIComponent(manifestUrl)}`,
					manifestUrl,
					notifyUrl: `${base}/api/plugins/${encodeURIComponent(pluginSlug)}/notify-install`,
					token: row.share_token,
					shareNotify: row.share_notify !== 0,
				});
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/plugins/:id/share-notify
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+\/share-notify$/) && method === 'PUT') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				const row = await db.prepare('SELECT share_notify FROM plugins WHERE id = ?').bind(id).first<{ share_notify: number }>();
				if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
				const next = row.share_notify === 0 ? 1 : 0;
				await db.prepare('UPDATE plugins SET share_notify = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(next, id).run();
				return jsonResponse({ success: true, shareNotify: next === 1 });
			} catch (e) {
				return handleError(e);
			}
		}


	return null;
}

