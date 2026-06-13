import { decodePublicId, encodePublicId } from '../core/id-codec';
import type { ApiContext } from './types';

export type PluginResourceRow = {
	id: number;
	plugin_id: string;
	type: string;
	author_id: number;
	post_id?: number | null;
	title: string;
	payload: string;
	payload_size?: number | null;
	storage_provider?: string | null;
	storage_key?: string | null;
	meta: string;
	created_at?: string;
	updated_at?: string;
};

const MAX_RESOURCE_PAYLOAD = 1024 * 1024;

function normalizeResourceType(value: unknown): string {
	const type = String(value || '').trim().toLowerCase();
	return /^[a-z0-9][a-z0-9-]{1,62}$/.test(type) ? type : '';
}

function normalizeResourceRef(value: unknown): string {
	const ref = String(value || '').trim();
	return /^[0-9A-Za-z]{1,96}$/.test(ref) ? ref : '';
}

export async function resourcePluginForType(db: D1Database, type: string): Promise<{ enabled: boolean; pluginId: string }> {
	const rows = await db.prepare(
		`SELECT id, enabled, resource_types
		   FROM plugins
		  WHERE resource_types IS NOT NULL AND resource_types != '' AND COALESCE(deleted_at, 0) = 0`
	).all<{ id: string; enabled?: number; resource_types?: string }>().catch(() => ({ results: [] as any[] }));
	for (const row of (rows.results || []) as Array<{ id: string; enabled?: number; resource_types?: string }>) {
		try {
			const types = JSON.parse(row.resource_types || '[]');
			if (Array.isArray(types) && types.map(String).includes(type)) {
				return { enabled: Number(row.enabled) === 1, pluginId: row.id };
			}
		} catch {}
	}
	return { enabled: false, pluginId: '' };
}

function textSize(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function publicResourceId(id: unknown, env: Env): string {
	return encodePublicId(id, env);
}

function numericResourceId(ref: string, env: Env): number {
	return decodePublicId(ref, env) || 0;
}

function r2KeyFor(type: string, pluginId: string, publicId: string): string {
	return `plugin-resources/${pluginId}/${type}/${publicId}.txt`;
}

async function storePayload(env: Env, type: string, pluginId: string, numericId: number, payload: string) {
	const bucket = (env as any).BUCKET as R2Bucket | undefined;
	const size = textSize(payload);
	if (!bucket) return { payload, storageProvider: 'd1', storageKey: '', payloadSize: size };
	const publicId = publicResourceId(numericId, env);
	const key = r2KeyFor(type, pluginId, publicId);
	await bucket.put(key, payload, {
		httpMetadata: { contentType: 'text/plain; charset=utf-8' },
		customMetadata: { plugin_id: pluginId, type, resource_id: publicId },
	});
	return { payload: '', storageProvider: 'r2', storageKey: key, payloadSize: size };
}

async function readPayload(env: Env, row: PluginResourceRow): Promise<string> {
	const provider = String(row.storage_provider || '').trim().toLowerCase();
	const key = String(row.storage_key || '').trim();
	if (provider === 'r2' && key) {
		const bucket = (env as any).BUCKET as R2Bucket | undefined;
		if (!bucket) throw new Error('R2 bucket is not configured');
		const obj = await bucket.get(key);
		if (!obj) throw new Error('Resource object not found');
		return await obj.text();
	}
	return String(row.payload || '');
}

export async function getPluginResourceByRef(env: Env, db: D1Database, type: string, ref: string): Promise<(PluginResourceRow & { publicId: string; resolvedPayload: string; parsedMeta: Record<string, any> }) | null> {
	const safeType = normalizeResourceType(type);
	const safeRef = normalizeResourceRef(ref);
	const numericId = numericResourceId(safeRef, env);
	if (!safeType || !safeRef || !numericId) return null;
	const row = await db.prepare(
		`SELECT id, plugin_id, type, author_id, post_id, title, payload, payload_size, storage_provider, storage_key, meta, created_at, updated_at
		   FROM plugin_resources
		  WHERE id = ? AND type = ?`
	).bind(numericId, safeType).first<PluginResourceRow>();
	if (!row) return null;
	let meta: Record<string, any> = {};
	try { meta = JSON.parse(row.meta || '{}') || {}; } catch {}
	return {
		...row,
		publicId: publicResourceId(row.id, env),
		resolvedPayload: await readPayload(env, row),
		parsedMeta: meta,
	};
}

export async function createPluginResource(env: Env, db: D1Database, input: {
	type: string;
	pluginId: string;
	authorId: number;
	postId?: number | null;
	title: string;
	payload: string;
	meta?: Record<string, any>;
}) {
	const type = normalizeResourceType(input.type);
	const pluginId = String(input.pluginId || '').trim();
	const payload = String(input.payload || '').trim().slice(0, MAX_RESOURCE_PAYLOAD);
	if (!type || !pluginId) throw new Error('Unsupported resource type');
	if (!payload) throw new Error('Resource payload is required');
	const row = await db.prepare(
		`INSERT INTO plugin_resources (plugin_id, type, author_id, post_id, title, payload, payload_size, storage_provider, storage_key, meta)
		 VALUES (?, ?, ?, ?, ?, '', ?, '', '', ?)`
	).bind(
		pluginId,
		type,
		input.authorId,
		input.postId ? Number(input.postId) : null,
		input.title,
		textSize(payload),
		JSON.stringify(input.meta || {})
	).run();
	const numericId = Number(row.meta.last_row_id || 0);
	const publicId = publicResourceId(numericId, env);
	try {
		const stored = await storePayload(env, type, pluginId, numericId, payload);
		await db.prepare(
			`UPDATE plugin_resources
			    SET payload = ?,
			        storage_provider = ?,
			        storage_key = ?,
			        payload_size = ?,
			        updated_at = CURRENT_TIMESTAMP
			  WHERE id = ?`
		).bind(stored.payload, stored.storageProvider, stored.storageKey, stored.payloadSize, numericId).run();
		return {
			id: publicId,
			type,
			title: input.title,
			payload,
			data: payload,
			meta: input.meta || {},
			storage: stored.storageProvider,
			payload_size: stored.payloadSize,
		};
	} catch (e) {
		await db.prepare('DELETE FROM plugin_resources WHERE id = ?').bind(numericId).run().catch(() => null);
		throw e;
	}
}

export async function handlePluginResourceApi(ctx: ApiContext): Promise<Response | null> {
	const { request, url, method, env, db, authenticate, jsonResponse, handleError } = ctx;
	const match = url.pathname.match(/^\/api\/plugin-resources\/([a-z0-9-]+)(?:\/([0-9A-Za-z]{1,96}))?$/);
	if (!match) return null;

	const type = normalizeResourceType(match[1]);
	const ref = match[2] || '';
	const typeGate = await resourcePluginForType(db, type);
	if (!type || !typeGate.pluginId || !typeGate.enabled) return jsonResponse({ error: 'Not found' }, 404);

	if (!ref && method === 'POST') {
		try {
			if (!authenticate) return jsonResponse({ error: 'Unauthorized' }, 401);
			const userPayload = await authenticate(request);
			if (!userPayload) return jsonResponse({ error: 'Unauthorized' }, 401);
			const body = await request.json() as any;
			const postId = Number(body.post_id || 0);
			if (!Number.isInteger(postId) || postId <= 0) {
				return jsonResponse({ error: 'post_id is required for resource upload' }, 400);
			}
			const post = await db.prepare('SELECT author_id FROM posts WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(postId).first<{ author_id?: number }>();
			if (!post) return jsonResponse({ error: 'Post not found' }, 404);
			if (Number(post.author_id || 0) !== Number(userPayload.id) && userPayload.role !== 'admin') {
				return jsonResponse({ error: 'Unauthorized' }, 403);
			}
			const title = String(body.title || '').trim().slice(0, 200) || type;
			const payload = String(body.payload ?? body.data ?? '').trim().slice(0, MAX_RESOURCE_PAYLOAD);
			const meta = body && typeof body.meta === 'object' && body.meta ? body.meta : {};
			const created = await createPluginResource(env, db, {
				type,
				pluginId: typeGate.pluginId,
				authorId: userPayload.id,
				postId,
				title,
				payload,
				meta,
			});
			return jsonResponse(created, 201);
		} catch (e) {
			return handleError(e);
		}
	}

	if (ref && (method === 'GET' || method === 'HEAD')) {
		const accept = String(request.headers.get('Accept') || '').toLowerCase();
		if (accept.includes('text/html') && !accept.includes('application/json')) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: `/plugin-resources/${encodeURIComponent(type)}/${encodeURIComponent(ref)}`,
					'Cache-Control': 'no-store',
				},
			});
		}
		if (method === 'HEAD') {
			return new Response(null, {
				status: 204,
				headers: { 'Cache-Control': 'private, max-age=60' },
			});
		}
		try {
			const row = await getPluginResourceByRef(env, db, type, ref);
			if (!row || row.plugin_id !== typeGate.pluginId) return jsonResponse({ error: 'Not found' }, 404);
			return jsonResponse({
				id: row.publicId,
				type: row.type,
				plugin_id: row.plugin_id,
				title: row.title,
				payload: row.resolvedPayload,
				data: row.resolvedPayload,
				meta: row.parsedMeta,
				storage: row.storage_provider || (row.payload ? 'd1' : ''),
				payload_size: row.payload_size || textSize(row.resolvedPayload),
				created_at: row.created_at,
				updated_at: row.updated_at,
			});
		} catch (e) {
			return handleError(e);
		}
	}

	return jsonResponse({ error: 'Not found' }, 404);
}
