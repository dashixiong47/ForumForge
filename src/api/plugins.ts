import type { DBPlugin } from '../db/types';
import { comparePluginVersion, hydrateBuiltinPluginRow, normalizePluginConfigSchema, normalizePluginId, normalizePluginManifest, validatePluginConfig } from '../plugins/registry';
import { parseJsonValue, safeJsonString } from '../utils/json';
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

function sanitizeBadgeKeyPart(value: unknown): string {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function fieldValue(item: any, key: string): string {
	if (!key || !item || typeof item !== 'object') return '';
	return String(item[key] ?? '').trim();
}

function badgeKeyForItem(map: NonNullable<ReturnType<typeof normalizePluginConfigSchema>['fields'][number]['badgeDefinitions']>, item: any): string {
	const rawKey = fieldValue(item, map.keyField || 'key');
	const keyPart = sanitizeBadgeKeyPart(rawKey);
	return keyPart ? `${map.keyPrefix || ''}${keyPart}`.slice(0, 128) : '';
}

async function migratePluginBadgeDefinitionKeys(db: D1Database, pluginId: string, configSchema: unknown, oldConfig: unknown, newConfig: unknown) {
	const schema = normalizePluginConfigSchema(configSchema);
	const oldCfg = oldConfig && typeof oldConfig === 'object' && !Array.isArray(oldConfig) ? oldConfig as Record<string, any> : {};
	const newCfg = newConfig && typeof newConfig === 'object' && !Array.isArray(newConfig) ? newConfig as Record<string, any> : {};
	for (const field of schema.fields) {
		const map = field.badgeDefinitions;
		if (!map) continue;
		const oldList = Array.isArray(oldCfg[field.key]) ? oldCfg[field.key] : [];
		const newList = Array.isArray(newCfg[field.key]) ? newCfg[field.key] : [];
		const oldByLabel = new Map<string, string>();
		for (const item of oldList) {
			const label = fieldValue(item, map.labelField || 'name').toLowerCase();
			const badgeKey = badgeKeyForItem(map, item);
			if (label && badgeKey) oldByLabel.set(label, badgeKey);
		}
		for (const item of newList) {
			const label = fieldValue(item, map.labelField || 'name').toLowerCase();
			const nextKey = badgeKeyForItem(map, item);
			const prevKey = label ? oldByLabel.get(label) : '';
			if (!prevKey || !nextKey || prevKey === nextKey) continue;
			await db.batch([
				db.prepare(`UPDATE user_badges
				              SET badge_key = ?
				            WHERE plugin_id = ? AND badge_key = ?
				              AND NOT EXISTS (
				                SELECT 1 FROM user_badges newer
				                 WHERE newer.user_id = user_badges.user_id
				                   AND newer.plugin_id = user_badges.plugin_id
				                   AND newer.badge_key = ?
				              )`).bind(nextKey, pluginId, prevKey, nextKey),
				db.prepare('DELETE FROM user_badges WHERE plugin_id = ? AND badge_key = ?').bind(pluginId, prevKey),
				db.prepare(`UPDATE badge_definitions
				              SET badge_key = ?
				            WHERE plugin_id = ? AND badge_key = ?
				              AND NOT EXISTS (
				                SELECT 1 FROM badge_definitions newer
				                 WHERE newer.plugin_id = badge_definitions.plugin_id
				                   AND newer.badge_key = ?
				              )`).bind(nextKey, pluginId, prevKey, nextKey),
				db.prepare('DELETE FROM badge_definitions WHERE plugin_id = ? AND badge_key = ?').bind(pluginId, prevKey),
			]);
		}
	}
}

async function syncPluginBadgeDefinitions(db: D1Database, pluginId: string, configSchema: unknown, config: unknown) {
	try { await db.prepare("ALTER TABLE badge_definitions ADD COLUMN description TEXT DEFAULT ''").run(); } catch {}
	try { await db.prepare('ALTER TABLE badge_definitions ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1').run(); } catch {}
	const schema = normalizePluginConfigSchema(configSchema);
	const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, any> : {};
	const stmts: D1PreparedStatement[] = [];
	for (const field of schema.fields) {
		const map = field.badgeDefinitions;
		if (!map) continue;
		const list = Array.isArray(cfg[field.key]) ? cfg[field.key] : [];
		for (const item of list) {
			if (!item || typeof item !== 'object') continue;
			const rawKey = fieldValue(item, map.keyField || 'key');
			const badgeKey = badgeKeyForItem(map, item);
			if (!badgeKey) continue;
			const baseLabel = fieldValue(item, map.labelField || 'name') || rawKey;
			const label = `${baseLabel}${map.labelSuffix || ''}`.slice(0, 100);
			const description = (fieldValue(item, map.descriptionField || '') || map.defaultDescription || '').slice(0, 500);
			const icon = (fieldValue(item, map.iconField || '') || map.defaultIcon || '').slice(0, 500);
			const color = (fieldValue(item, map.colorField || '') || map.defaultColor || '').slice(0, 32);
			stmts.push(db.prepare(
				`INSERT INTO badge_definitions (plugin_id, badge_key, label, description, icon, color, enabled)
				 VALUES (?, ?, ?, ?, ?, ?, 1)
				 ON CONFLICT(plugin_id, badge_key) DO UPDATE SET
				   label = CASE WHEN badge_definitions.label = '' OR badge_definitions.label = badge_definitions.badge_key THEN excluded.label ELSE badge_definitions.label END,
				   description = CASE WHEN badge_definitions.description = '' THEN excluded.description ELSE badge_definitions.description END,
				   icon = CASE WHEN badge_definitions.icon = '' THEN excluded.icon ELSE badge_definitions.icon END,
				   color = CASE WHEN badge_definitions.color = '' THEN excluded.color ELSE badge_definitions.color END`
			).bind(pluginId, badgeKey, label, description, icon, color));
		}
	}
	if (stmts.length) await db.batch(stmts);
}

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
					`SELECT id, slug, name, description, version, enabled, config, author, homepage, icon, type, css, html, js, head_html, block_types, resource_types, i18n, config_schema, permissions, tags
					   FROM plugins
					  WHERE enabled = 1 AND COALESCE(deleted_at, 0) = 0
					  ORDER BY name ASC`
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
					'SELECT * FROM plugins WHERE (id = ? OR slug = ?) AND COALESCE(deleted_at, 0) = 0'
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
					'SELECT id, slug, share_token, share_notify FROM plugins WHERE (id = ? OR slug = ?) AND COALESCE(deleted_at, 0) = 0'
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
					'SELECT * FROM plugins WHERE COALESCE(deleted_at, 0) = 0 ORDER BY name ASC'
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
				await syncPluginBadgeDefinitions(db, result.manifest.id, result.manifest.config_schema, parseJsonValue(result.manifest.config, {}));
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
					"SELECT id, slug, name, version, source_url FROM plugins WHERE source_url IS NOT NULL AND source_url != '' AND COALESCE(deleted_at, 0) = 0 ORDER BY name ASC"
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
				const existing = await db.prepare('SELECT * FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<DBPlugin>();
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
				await syncPluginBadgeDefinitions(db, result.manifest.id, result.manifest.config_schema, parseJsonValue(result.manifest.config, {}));
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
				const existing = await db.prepare('SELECT * FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<DBPlugin>();
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
				await syncPluginBadgeDefinitions(db, result.manifest.id, result.manifest.config_schema, parseJsonValue(result.manifest.config, {}));
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
				if (enabled) {
					const row = await db.prepare('SELECT config_schema, config FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<DBPlugin>();
					if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
					const checked = validatePluginConfig(row.config_schema || '{}', parseJsonValue(row.config, {}), { requireRequired: true });
					if (!checked.ok) return jsonResponse({ error: checked.error, field: checked.field, code: 'PLUGIN_CONFIG_REQUIRED' }, 400);
					await syncPluginBadgeDefinitions(db, id, row.config_schema || '{}', checked.config);
				}
				const result = await db.prepare(
					'UPDATE plugins SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
				).bind(enabled, id).run();
				return jsonResponse({ success: result.success });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/plugins/:id/config
		if (url.pathname.match(/^\/api\/admin\/plugins\/[^/]+\/config$/) && method === 'PUT') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const id = normalizePluginId(decodeURIComponent(url.pathname.split('/')[4] || ''));
				if (!id) return jsonResponse({ error: 'Invalid plugin id' }, 400);
				const row = await db.prepare('SELECT id, config_schema, config FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<DBPlugin>();
				if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
				const body = await request.json().catch(() => ({})) as any;
				const checked = validatePluginConfig(row.config_schema || '{}', body.config || body || {}, { requireRequired: true });
				if (!checked.ok) return jsonResponse({ error: checked.error, field: checked.field, code: 'PLUGIN_CONFIG_REQUIRED' }, 400);
				await migratePluginBadgeDefinitionKeys(db, id, row.config_schema || '{}', parseJsonValue(row.config, {}), checked.config);
				await db.prepare('UPDATE plugins SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(safeJsonString(checked.config, {}), id).run();
				await syncPluginBadgeDefinitions(db, id, row.config_schema || '{}', checked.config);
				return jsonResponse({ success: true, config: checked.config });
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
				await db.prepare('UPDATE plugins SET enabled = 0, deleted_at = ?, deleted_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(Math.floor(Date.now() / 1000), userPayload.id, id).run();
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
				const rawRow = await db.prepare('SELECT * FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<DBPlugin>();
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
				let row = await db.prepare('SELECT * FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<DBPlugin>();
				if (!row) return jsonResponse({ error: 'Plugin not found' }, 404);
				if (!row.share_token) {
					const token = crypto.randomUUID();
					await db.prepare('UPDATE plugins SET share_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(token, id).run();
					row = { ...row, share_token: token };
				}
				const base = getBaseUrl().replace(/\/$/, '');
				const pluginSlug = row.slug || row.id;
				const manifestUrl = `${base}/api/plugins/${encodeURIComponent(pluginSlug)}/manifest.json?token=${encodeURIComponent(row.share_token || '')}`;
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
				const row = await db.prepare('SELECT share_notify FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(id).first<{ share_notify: number }>();
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

