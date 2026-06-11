export function safeJsonString(value: unknown, fallback: unknown): string {
	try {
		if (typeof value === 'string') JSON.parse(value);
		return typeof value === 'string' ? value : JSON.stringify(value ?? fallback);
	} catch {
		return JSON.stringify(fallback);
	}
}

export function parseJsonValue<T>(value: unknown, fallback: T): T {
	try {
		if (typeof value !== 'string' || !value.trim()) return fallback;
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}
