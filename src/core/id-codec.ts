const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = BigInt(ALPHABET.length);

function hashSecret(secret: string): bigint {
	let hash = 1469598103934665603n;
	for (let i = 0; i < secret.length; i++) {
		hash ^= BigInt(secret.charCodeAt(i));
		hash = (hash * 1099511628211n) & 0xffffffffffffffffn;
	}
	return hash || 1n;
}

function toBase62(value: bigint): string {
	if (value === 0n) return '0';
	let n = value;
	let out = '';
	while (n > 0n) {
		out = ALPHABET[Number(n % BASE)] + out;
		n /= BASE;
	}
	return out;
}

function fromBase62(value: string): bigint | null {
	let n = 0n;
	for (const char of value) {
		const idx = ALPHABET.indexOf(char);
		if (idx < 0) return null;
		n = n * BASE + BigInt(idx);
	}
	return n;
}

function secretFor(env?: Partial<Env> | Record<string, unknown>): string {
	return String((env as any)?.ID_CODEC_SECRET || '').trim();
}

export function hasIdCodecSecret(env?: Partial<Env> | Record<string, unknown>): boolean {
	return secretFor(env).length >= 16;
}

export function encodePublicId(id: unknown, env?: Partial<Env> | Record<string, unknown>): string {
	const numeric = BigInt(Math.max(0, Math.floor(Number(id) || 0)));
	const secret = secretFor(env);
	if (!secret || secret.length < 16 || numeric <= 0n) return String(id || '');
	const salt = hashSecret(secret);
	return `p${toBase62((numeric << 32n) ^ (salt & 0xffffffffn))}`;
}

export function decodePublicId(value: unknown, env?: Partial<Env> | Record<string, unknown>): number | null {
	const raw = String(value || '').trim();
	if (!raw) return null;
	if (/^\d+$/.test(raw)) return Number(raw);
	const secret = secretFor(env);
	const encoded = raw.startsWith('p') ? raw.slice(1) : raw;
	if (!secret || secret.length < 16 || !/^[0-9A-Za-z]+$/.test(encoded)) return null;
	const decoded = fromBase62(encoded);
	if (decoded === null) return null;
	const salt = hashSecret(secret);
	const id = (decoded ^ (salt & 0xffffffffn)) >> 32n;
	if (id <= 0n || id > BigInt(Number.MAX_SAFE_INTEGER)) return null;
	return Number(id);
}

export function publicPostPath(id: unknown, env?: Partial<Env> | Record<string, unknown>): string {
	return `/posts/${encodePublicId(id, env)}`;
}

export function publicUserPath(id: unknown, env?: Partial<Env> | Record<string, unknown>): string {
	return `/users/${encodePublicId(id, env)}`;
}
