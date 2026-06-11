import type { DBCount } from '../db/types';
import type { UserPayload } from '../core/security';
import type { JsonResponse } from './types';

export type AdminI18nApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	executionCtx: ExecutionContext;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	apiAdminUser: UserPayload | null;
	authenticateAdminForPath: () => Promise<UserPayload>;
	normalizeLocale: (value: unknown) => string;
	normalizeTranslationKey: (value: unknown) => string;
};

export async function handleAdminI18nApi(ctx: AdminI18nApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		env,
		db,
		executionCtx,
		jsonResponse,
		handleError,
		apiAdminUser,
		authenticateAdminForPath,
		normalizeLocale,
		normalizeTranslationKey,
	} = ctx;

	const invalidateI18nKv = () => {
		const kv = env.CACHE;
		executionCtx.waitUntil((async () => {
			const list = await kv.list({ prefix: 'i18n:system:' });
			await Promise.all([kv.delete('i18n:languages'), ...list.keys.map((k) => kv.delete(k.name))]);
		})().catch(() => {}));
	};
		if (url.pathname === '/api/admin/i18n' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const [languagesRes, translationsRes] = await Promise.all([
					db.prepare('SELECT code, name, native_name, enabled, sort_order, created_at, updated_at FROM languages ORDER BY sort_order ASC, code ASC').all(),
					db.prepare('SELECT scope, key, locale, value, updated_at FROM translations ORDER BY scope ASC, key ASC, locale ASC').all()
				]);
				return jsonResponse({
					languages: languagesRes.results || [],
					translations: translationsRes.results || []
				});
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/i18n/languages
		if (url.pathname === '/api/admin/i18n/languages' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const body = await request.json() as any;
				const code = normalizeLocale(body.code);
				const name = String(body.name || '').trim();
				const nativeName = String(body.native_name || body.nativeName || name).trim();
				const enabled = body.enabled === undefined ? 1 : (body.enabled ? 1 : 0);
				const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 100;
				if (!code || !name || !nativeName) return jsonResponse({ error: 'Invalid language' }, 400);
				await db.prepare(
					`INSERT INTO languages (code, name, native_name, enabled, sort_order, updated_at)
					 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
					 ON CONFLICT(code) DO UPDATE SET
					   name = excluded.name,
					   native_name = excluded.native_name,
					   enabled = excluded.enabled,
					   sort_order = excluded.sort_order,
					   updated_at = CURRENT_TIMESTAMP`
				).bind(code, name, nativeName, enabled, sortOrder).run();
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/i18n/languages/:code
		if (url.pathname.match(/^\/api\/admin\/i18n\/languages\/[^/]+$/) && method === 'DELETE') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const code = normalizeLocale(decodeURIComponent(url.pathname.split('/').pop() || ''));
				if (!code) return jsonResponse({ error: 'Invalid language' }, 400);
				const count = await db.prepare('SELECT COUNT(*) as count FROM languages WHERE enabled = 1').first<DBCount>();
				if ((count?.count || 0) <= 1) return jsonResponse({ error: 'At least one language is required' }, 400);
				await db.prepare('UPDATE languages SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE code = ?').bind(code).run();
				invalidateI18nKv();
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// PUT /api/admin/i18n/translations
		if (url.pathname === '/api/admin/i18n/translations' && method === 'PUT') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const body = await request.json() as any;
				const entries = Array.isArray(body.entries) ? body.entries.slice(0, 1000) : [];
				if (!entries.length) return jsonResponse({ success: true, count: 0 });
				const stmt = db.prepare(
					`INSERT INTO translations (scope, key, locale, value, updated_at)
					 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
					 ON CONFLICT(scope, key, locale) DO UPDATE SET
					   value = excluded.value,
					   updated_at = CURRENT_TIMESTAMP`
				);
				const batch = [];
				for (const entry of entries) {
					const scope = String(entry.scope || 'system').trim() || 'system';
					const key = normalizeTranslationKey(entry.key);
					const locale = normalizeLocale(entry.locale);
					if (!key || !locale || scope.length > 40) continue;
					batch.push(stmt.bind(scope, key, locale, String(entry.value || '')));
				}
				if (batch.length) {
					await db.batch(batch);
					invalidateI18nKv();
				}
				return jsonResponse({ success: true, count: batch.length });
			} catch (e) {
				return handleError(e);
			}
		}

		// DELETE /api/admin/i18n/translations/:scope/:key
		if (url.pathname.match(/^\/api\/admin\/i18n\/translations\/[^/]+\/[^/]+$/) && method === 'DELETE') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const parts = url.pathname.split('/');
				const scope = decodeURIComponent(parts[5] || 'system');
				const key = normalizeTranslationKey(decodeURIComponent(parts[6] || ''));
				if (!key) return jsonResponse({ error: 'Invalid key' }, 400);
				await db.prepare('DELETE FROM translations WHERE scope = ? AND key = ?').bind(scope, key).run();
				invalidateI18nKv();
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/i18n/ai-translate
		if (url.pathname === '/api/admin/i18n/ai-translate' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();
				const body = await request.json() as any;
				const apiKey = String(body.apiKey || '').trim();
				const model = String(body.model || 'deepseek-v4-flash').trim();
				const sourceLocale = normalizeLocale(body.sourceLocale) || 'en-US';
				const targetLocale = normalizeLocale(body.targetLocale) || 'zh-CN';
				type AiTranslationItem = { index: number; scope: string; key: string; text: string };
				const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
				if (!apiKey) return jsonResponse({ error: 'API Key is required' }, 400);
				if (!items.length) return jsonResponse({ translations: [] });

				const compactItems: AiTranslationItem[] = items.map((item: any, index: number) => ({
					index,
					scope: String(item.scope || 'system').slice(0, 40),
					key: normalizeTranslationKey(item.key) || String(item.key || '').slice(0, 120),
					text: String(item.text || '').slice(0, 4000),
				})).filter((item: AiTranslationItem) => item.text);
				if (!compactItems.length) return jsonResponse({ translations: [] });

				const isOpenAI = /^(gpt|o[0-9]|chatgpt)/i.test(model);
				const endpoint = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
				const prompt = [
					`Translate UI strings from ${sourceLocale} to ${targetLocale}.`,
					'Return only JSON in this exact shape: {"translations":[{"index":0,"value":"..."}]}.',
					'Preserve placeholders, variables, HTML tags, markdown syntax, punctuation intent and line breaks.',
					'Do not add explanations.',
					JSON.stringify(compactItems.map((item: AiTranslationItem) => ({
						index: item.index,
						scope: item.scope,
						key: item.key,
						text: item.text,
					})))
				].join('\n');
				const response = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model,
						messages: [
							{ role: 'system', content: 'You are a precise localization assistant. Output valid compact JSON only.' },
							{ role: 'user', content: prompt },
						],
						temperature: 0.2,
						response_format: { type: 'json_object' },
					}),
				});
				const result = await response.json().catch(() => ({})) as any;
				if (!response.ok) {
					return jsonResponse({ error: result?.error?.message || `AI request failed: ${response.status}` }, 502);
				}
				const content = String(result?.choices?.[0]?.message?.content || '').trim();
				let parsed: any = {};
				try {
					parsed = JSON.parse(content);
				} catch {
					return jsonResponse({ error: 'AI returned invalid JSON' }, 502);
				}
				const byIndex = new Map<number, string>();
				for (const item of Array.isArray(parsed.translations) ? parsed.translations : []) {
					byIndex.set(Number(item.index), String(item.value || ''));
				}
				return jsonResponse({
					translations: compactItems.map((item: AiTranslationItem) => ({
						scope: item.scope,
						key: item.key,
						value: byIndex.get(item.index) || '',
					}))
				});
			} catch (e) {
				return handleError(e);
			}
		}


	return null;
}

