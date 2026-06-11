// KV key constants
export const KV_BOOTSTRAP_KEY = 'bootstrap:version';
export const KV_SETTINGS_KEY = 'settings:all';
export const KV_CATEGORIES_PREFIX = 'categories:';
export const KV_RATE_LIMIT_PREFIX = 'rl:';

// TTLs in seconds
export const KV_SETTINGS_TTL = 300;
export const KV_CATEGORIES_TTL = 60;
export const KV_BOOTSTRAP_TTL = 86400;

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
