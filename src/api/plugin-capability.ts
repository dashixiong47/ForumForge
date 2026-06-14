import type { UserPayload } from '../core/security';

// Block private/internal IP ranges and localhost to prevent SSRF
function isAllowedFetchUrl(rawUrl: string): boolean {
	try {
		const u = new URL(rawUrl);
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
		const h = u.hostname;
		if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
		if (/^169\.254\./.test(h)) return false; // link-local / CF metadata
		if (/^10\./.test(h)) return false;
		if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
		if (/^192\.168\./.test(h)) return false;
		if (h.endsWith('.internal') || h.endsWith('.local')) return false;
		return true;
	} catch {
		return false;
	}
}

function sanitizeKey(s: string): string {
	return String(s || '').replace(/[^a-zA-Z0-9_:.-]/g, '').slice(0, 128);
}

function sanitizeCollection(s: string): string {
	return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export type CapabilityContext = {
	pluginId: string;
	capabilityPath: string;
	method: string;
	request: Request;
	db: D1Database;
	authenticate: (req: Request) => Promise<UserPayload>;
	jsonResponse: (data: any, status?: number) => Response;
	handleError: (e: any) => Response;
};

export async function handlePluginCapability(ctx: CapabilityContext): Promise<Response | null> {
	const { pluginId, capabilityPath, method, request, db, authenticate, jsonResponse, handleError } = ctx;
	const ensureBadgeDefinitionDescription = async () => {
		try {
			await db.prepare("ALTER TABLE badge_definitions ADD COLUMN description TEXT DEFAULT ''").run();
		} catch {
			// Existing databases may already have the column.
		}
	};
	const createBadgeNotification = async (targetUserId: number, type: string, title: string, body: string, badgeKey: string) => {
		await db.prepare(
			`INSERT INTO notifications (user_id, type, title, body, meta)
			 VALUES (?, ?, ?, ?, ?)`
		).bind(
			targetUserId,
			type,
			title.slice(0, 120),
			body.slice(0, 500),
			JSON.stringify({ plugin_id: pluginId, badge_key: badgeKey })
		).run();
	};

	// Verify plugin is enabled
	const pluginRow = await db
		.prepare('SELECT enabled, config FROM plugins WHERE id = ? AND COALESCE(deleted_at, 0) = 0')
		.bind(pluginId)
		.first<{ enabled: number; config: string }>()
		.catch(() => null);
	if (!pluginRow?.enabled) return null;

	let config: Record<string, any> = {};
	try { config = JSON.parse(pluginRow.config || '{}'); } catch {}

	// ── GET /capability/me ─────────────────────────────────────────────────────
	if (capabilityPath === '/me' && method === 'GET') {
		try {
			const user = await authenticate(request);
			const row = await db
				.prepare('SELECT id, username, role, level, points, experience FROM users WHERE id = ?')
				.bind(user.id)
				.first<any>();
			if (!row) return jsonResponse({ error: 'User not found' }, 404);
			return jsonResponse({ id: row.id, username: row.username, role: row.role, level: row.level ?? 1, points: row.points ?? 0, experience: row.experience ?? 0 });
		} catch (e) {
			return handleError(e);
		}
	}

	// ── POST /capability/fetch ─────────────────────────────────────────────────
	// Proxy an external HTTP request on behalf of the plugin, injecting
	// credentials from plugin config without exposing them to the client.
	if (capabilityPath === '/fetch' && method === 'POST') {
		try {
			const body = await request.json().catch(() => null) as any;
			if (!body?.url || typeof body.url !== 'string') {
				return jsonResponse({ error: 'url is required' }, 400);
			}
			if (!isAllowedFetchUrl(body.url)) {
				return jsonResponse({ error: 'URL not allowed' }, 400);
			}

			const fetchMethod = String(body.method || 'GET').toUpperCase();
			if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(fetchMethod)) {
				return jsonResponse({ error: 'Method not allowed' }, 400);
			}

			const fetchHeaders: Record<string, string> = {
				'User-Agent': 'ForumForge-Plugin/1.0',
			};

			// Allow plugin to pass explicit headers (non-sensitive)
			if (body.headers && typeof body.headers === 'object') {
				const blocked = new Set(['host', 'cf-connecting-ip', 'x-forwarded-for', 'authorization', 'cookie']);
				for (const [k, v] of Object.entries(body.headers as Record<string, unknown>)) {
					if (typeof v === 'string' && !blocked.has(k.toLowerCase())) {
						fetchHeaders[k] = v;
					}
				}
			}

			// Inject config values as credentials — the plugin JS specifies which
			// config KEY to use, but never sees the actual value.
			const inject = body.inject_config || {};
			if (inject.cookie && typeof inject.cookie === 'string' && config[inject.cookie]) {
				fetchHeaders['Cookie'] = `${inject.cookie}=${config[inject.cookie]}`;
			}
			if (inject.bearer && typeof inject.bearer === 'string' && config[inject.bearer]) {
				fetchHeaders['Authorization'] = `Bearer ${config[inject.bearer]}`;
			}
			if (Array.isArray(inject.headers)) {
				for (const h of inject.headers as any[]) {
					if (h?.name && h?.key && typeof config[h.key] === 'string') {
						fetchHeaders[String(h.name)] = config[h.key];
					}
				}
			}

			const fetchInit: RequestInit = { method: fetchMethod, headers: fetchHeaders };
			if (body.body !== undefined && fetchMethod !== 'GET') {
				fetchInit.body = typeof body.body === 'string' ? body.body : JSON.stringify(body.body);
			}

			const resp = await fetch(body.url, fetchInit);
			const responseBody = await resp.text();
			// Limit response body to 512 KB
			const truncated = responseBody.length > 524288;

			return jsonResponse({
				ok: resp.ok,
				status: resp.status,
				body: truncated ? responseBody.slice(0, 524288) : responseBody,
				truncated,
			});
		} catch (e) {
			return handleError(e);
		}
	}

	// ── /capability/db ─────────────────────────────────────────────────────────
	// Typed key-value store per plugin. Each record is keyed by
	// (plugin_id, scope, user_id, collection, item_key).
	// scope='user'   → data is per-user (user_id = caller)
	// scope='shared' → global plugin data (admin only for write, any user can read)
	if (capabilityPath === '/db') {
		try {
			let user: UserPayload | null = null;
			try { user = await authenticate(request); } catch {}

			const body = method === 'POST' ? await request.json().catch(() => ({})) as any : {};
			const op: string = String(body.op || 'get');
			const collection = sanitizeCollection(body.collection || '');
			const key = sanitizeKey(body.key || '');
			const scope: 'user' | 'shared' = body.scope === 'shared' ? 'shared' : 'user';
			const allUsers = body.all_users === true && user?.role === 'admin';
			const storeOps = new Set(['get', 'set', 'delete', 'list']);

			if (storeOps.has(op) && !collection) return jsonResponse({ error: 'collection is required' }, 400);

			// Shared scope writes require admin; reads are allowed for all authenticated users
			if (scope === 'shared' && (op === 'set' || op === 'delete')) {
				if (user?.role !== 'admin') return jsonResponse({ error: 'Admin required' }, 403);
			}
			if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

			// user_id: 0 represents shared/global scope (avoids NULL uniqueness issues in SQLite)
			const userId = scope === 'user' ? user.id : 0;

			if (op === 'get') {
				if (!key) return jsonResponse({ error: 'key is required' }, 400);
				const row = await db
					.prepare('SELECT value FROM plugin_store WHERE plugin_id = ? AND user_id = ? AND collection = ? AND item_key = ?')
					.bind(pluginId, userId, collection, key)
					.first<{ value: string }>();
				if (!row) return jsonResponse({ value: null, found: false });
				let parsed: unknown = row.value;
				try { parsed = JSON.parse(row.value); } catch {}
				return jsonResponse({ value: parsed, found: true });
			}

			if (op === 'set') {
				if (!key) return jsonResponse({ error: 'key is required' }, 400);
				const value = JSON.stringify(body.value ?? null);
				await db
					.prepare(
						`INSERT INTO plugin_store (plugin_id, user_id, collection, item_key, value, updated_at)
						 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
						 ON CONFLICT(plugin_id, user_id, collection, item_key)
						 DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
					)
					.bind(pluginId, userId, collection, key, value)
					.run();
				return jsonResponse({ success: true });
			}

			if (op === 'delete') {
				if (!key) return jsonResponse({ error: 'key is required' }, 400);
				await db
					.prepare('DELETE FROM plugin_store WHERE plugin_id = ? AND user_id = ? AND collection = ? AND item_key = ?')
					.bind(pluginId, userId, collection, key)
					.run();
				return jsonResponse({ success: true });
			}

			if (op === 'list') {
				const limit = Math.min(Number(body.limit) || 50, 200);
				const page = Math.max(Number(body.page) || 1, 1);
				const offset = (page - 1) * limit;
				const keyPrefix = body.key_prefix ? sanitizeKey(body.key_prefix) : '';

				// When all_users=true (admin), list across all user_ids for this collection
				const crossUser = allUsers;
				const baseBinds: unknown[] = crossUser
					? [pluginId, collection]
					: [pluginId, userId, collection];
				const userFilter = crossUser
					? 'plugin_id = ? AND collection = ?'
					: 'plugin_id = ? AND user_id = ? AND collection = ?';
				const prefixClause = keyPrefix ? ' AND item_key LIKE ?' : '';
				if (keyPrefix) baseBinds.push(keyPrefix + '%');

				const [countRes, dataRes] = await db.batch([
					db.prepare(`SELECT COUNT(*) as cnt FROM plugin_store WHERE ${userFilter}${prefixClause}`)
						.bind(...baseBinds),
					db.prepare(`SELECT user_id, item_key, value, created_at, updated_at FROM plugin_store WHERE ${userFilter}${prefixClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
						.bind(...baseBinds, limit, offset),
				]);

				const total = (countRes.results?.[0] as any)?.cnt ?? 0;
				const items = (dataRes.results ?? []).map((row: any) => {
					let value: unknown = row.value;
					try { value = JSON.parse(row.value); } catch {}
					return { user_id: row.user_id, key: row.item_key, value, created_at: row.created_at, updated_at: row.updated_at };
				});

				return jsonResponse({ items, total, page, limit });
			}

			if (op === 'grant_badge') {
				if (user?.role !== 'admin') return jsonResponse({ error: 'Admin required' }, 403);
				const targetUserId = Number(body.target_user_id);
				if (!targetUserId) return jsonResponse({ error: 'target_user_id is required' }, 400);
				const badgeKey = sanitizeKey(body.badge_key || '');
				if (!badgeKey) return jsonResponse({ error: 'badge_key is required' }, 400);
				const label = String(body.label || badgeKey).slice(0, 100);
				const description = String(body.description || '').slice(0, 500);
				const color = String(body.color || '').slice(0, 32);
				const icon = String(body.icon || body.image || body.image_url || '').slice(0, 500);
				await ensureBadgeDefinitionDescription();
				await db.batch([
					db.prepare(`INSERT INTO user_badges (user_id, plugin_id, badge_key, label, description, color, icon, granted_by)
					            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					            ON CONFLICT(user_id, plugin_id, badge_key)
					            DO UPDATE SET label=excluded.label, description=excluded.description, color=excluded.color, icon=excluded.icon, granted_by=excluded.granted_by, granted_at=CURRENT_TIMESTAMP`)
						.bind(targetUserId, pluginId, badgeKey, label, description, color, icon, user.id),
					db.prepare(`INSERT INTO badge_definitions (plugin_id, badge_key, label, description, icon, color)
					            VALUES (?, ?, ?, ?, ?, ?)
					            ON CONFLICT(plugin_id, badge_key) DO NOTHING`)
						.bind(pluginId, badgeKey, label, description, icon, color),
				]);
				await createBadgeNotification(targetUserId, 'badge_granted', '获得新勋章', `你获得了勋章「${label}」。`, badgeKey);
				return jsonResponse({ success: true });
			}

			if (op === 'revoke_badge') {
				if (user?.role !== 'admin') return jsonResponse({ error: 'Admin required' }, 403);
				const targetUserId = Number(body.target_user_id);
				const badgeKey = sanitizeKey(body.badge_key || '');
				if (!targetUserId || !badgeKey) return jsonResponse({ error: 'target_user_id and badge_key are required' }, 400);
				const row = await db
					.prepare(`SELECT COALESCE(NULLIF(bd.label,''), ub.label, ub.badge_key) AS label
					            FROM user_badges ub
					            LEFT JOIN badge_definitions bd ON bd.plugin_id = ub.plugin_id AND bd.badge_key = ub.badge_key
					           WHERE ub.user_id = ? AND ub.plugin_id = ? AND ub.badge_key = ?`)
					.bind(targetUserId, pluginId, badgeKey)
					.first<{ label: string }>();
				await db
					.prepare('DELETE FROM user_badges WHERE user_id = ? AND plugin_id = ? AND badge_key = ?')
					.bind(targetUserId, pluginId, badgeKey)
					.run();
				await createBadgeNotification(targetUserId, 'badge_revoked', '勋章已撤销', `管理员已撤销你的勋章「${row?.label || badgeKey}」。`, badgeKey);
				return jsonResponse({ success: true });
			}

			return jsonResponse({ error: `Unknown op: ${op}` }, 400);
		} catch (e) {
			return handleError(e);
		}
	}

	return null;
}
