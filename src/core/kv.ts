// KV key constants
export const KV_BOOTSTRAP_KEY = 'bootstrap:version';
export const KV_SETTINGS_KEY = 'settings:all';
export const KV_CATEGORIES_PREFIX = 'categories:';
export const KV_TAGS_PREFIX = 'tags:';
export const KV_USER_PREFIX = 'user:';
export const KV_I18N_LANG_KEY = 'i18n:languages';
export const KV_I18N_SYSTEM_PREFIX = 'i18n:system:';
export const KV_VIEWS_PREFIX = 'views:';
export const KV_RATE_LIMIT_PREFIX = 'rl:';

// TTLs in seconds
export const KV_BOOTSTRAP_TTL = 86400;
export const KV_SETTINGS_TTL = 300;
export const KV_CATEGORIES_TTL = 60;
export const KV_TAGS_TTL = 120;
export const KV_USER_TTL = 120;
export const KV_I18N_TTL = 1800;
export const KV_VIEWS_TTL = 86400; // safety expiry; drained every 5 min by Cron

export async function kvGetAllSettings(kv: KVNamespace): Promise<Record<string, string> | null> {
	return kv.get<Record<string, string>>(KV_SETTINGS_KEY, 'json');
}

export async function kvSetAllSettings(kv: KVNamespace, settings: Record<string, string>): Promise<void> {
	await kv.put(KV_SETTINGS_KEY, JSON.stringify(settings), { expirationTtl: KV_SETTINGS_TTL });
}

export async function kvDeleteSettings(kv: KVNamespace): Promise<void> {
	await kv.delete(KV_SETTINGS_KEY);
}

export async function kvGetCategories<T>(kv: KVNamespace, cacheKey: string): Promise<T | null> {
	return kv.get<T>(KV_CATEGORIES_PREFIX + cacheKey, 'json');
}

export async function kvSetCategories<T>(kv: KVNamespace, cacheKey: string, data: T): Promise<void> {
	await kv.put(KV_CATEGORIES_PREFIX + cacheKey, JSON.stringify(data), { expirationTtl: KV_CATEGORIES_TTL });
}

export async function kvDeleteCategories(kv: KVNamespace): Promise<void> {
	const list = await kv.list({ prefix: KV_CATEGORIES_PREFIX });
	if (list.keys.length > 0) {
		await Promise.all(list.keys.map((k) => kv.delete(k.name)));
	}
}

export async function kvGetTags<T>(kv: KVNamespace, cacheKey: string): Promise<T | null> {
	return kv.get<T>(KV_TAGS_PREFIX + cacheKey, 'json');
}

export async function kvSetTags<T>(kv: KVNamespace, cacheKey: string, data: T): Promise<void> {
	await kv.put(KV_TAGS_PREFIX + cacheKey, JSON.stringify(data), { expirationTtl: KV_TAGS_TTL });
}

export async function kvDeleteTags(kv: KVNamespace): Promise<void> {
	const list = await kv.list({ prefix: KV_TAGS_PREFIX });
	if (list.keys.length > 0) {
		await Promise.all(list.keys.map((k) => kv.delete(k.name)));
	}
}

export async function kvGetUser<T>(kv: KVNamespace, userId: number | string): Promise<T | null> {
	return kv.get<T>(KV_USER_PREFIX + userId, 'json');
}

export async function kvSetUser<T>(kv: KVNamespace, userId: number | string, data: T): Promise<void> {
	await kv.put(KV_USER_PREFIX + userId, JSON.stringify(data), { expirationTtl: KV_USER_TTL });
}

export async function kvDeleteUser(kv: KVNamespace, userId: number | string): Promise<void> {
	await kv.delete(KV_USER_PREFIX + userId);
}

export async function kvGetLanguages<T>(kv: KVNamespace): Promise<T | null> {
	return kv.get<T>(KV_I18N_LANG_KEY, 'json');
}

export async function kvSetLanguages<T>(kv: KVNamespace, data: T): Promise<void> {
	await kv.put(KV_I18N_LANG_KEY, JSON.stringify(data), { expirationTtl: KV_I18N_TTL });
}

export async function kvGetSystemTranslations<T>(kv: KVNamespace, locale: string): Promise<T | null> {
	return kv.get<T>(KV_I18N_SYSTEM_PREFIX + locale, 'json');
}

export async function kvSetSystemTranslations<T>(kv: KVNamespace, locale: string, data: T): Promise<void> {
	await kv.put(KV_I18N_SYSTEM_PREFIX + locale, JSON.stringify(data), { expirationTtl: KV_I18N_TTL });
}

export async function kvDeleteI18n(kv: KVNamespace): Promise<void> {
	const list = await kv.list({ prefix: KV_I18N_SYSTEM_PREFIX });
	await Promise.all([
		kv.delete(KV_I18N_LANG_KEY),
		...list.keys.map((k) => kv.delete(k.name)),
	]);
}

export async function kvIncrementViewCount(kv: KVNamespace, postId: number | string): Promise<void> {
	const key = KV_VIEWS_PREFIX + postId;
	const current = parseInt((await kv.get(key)) ?? '0');
	await kv.put(key, String(current + 1), { expirationTtl: KV_VIEWS_TTL });
}

// Reads all accumulated view counts, deletes the KV keys, returns {postId -> count}.
// Called by the Cron Trigger to flush to D1 in bulk.
export async function kvDrainViewCounts(kv: KVNamespace): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	const list = await kv.list({ prefix: KV_VIEWS_PREFIX });
	if (!list.keys.length) return result;

	await Promise.all(
		list.keys.map(async (k) => {
			const val = parseInt((await kv.get(k.name)) ?? '0');
			if (val > 0) result.set(k.name.slice(KV_VIEWS_PREFIX.length), val);
		}),
	);
	// Delete after reading; new increments after this point create fresh keys
	await Promise.all(list.keys.map((k) => kv.delete(k.name)));
	return result;
}

// Returns true if the request is allowed, false if rate-limited.
// Uses best-effort non-atomic increment — suitable for spam/brute-force prevention,
// not for billing-grade accuracy.
export async function kvCheckRateLimit(
	kv: KVNamespace,
	identifier: string,
	limit: number,
	windowSeconds: number,
): Promise<boolean> {
	const key = KV_RATE_LIMIT_PREFIX + identifier;
	const current = parseInt((await kv.get(key)) ?? '0');
	if (current >= limit) return false;
	await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
	return true;
}
