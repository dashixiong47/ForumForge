const PBKDF2_PREFIX = 'pbkdf2:';
export const PBKDF2_MAX = 100_000;
export const PBKDF2_MIN = 10_000;
export const PBKDF2_DEFAULT = 100_000;

export function clampIterations(n: number): number {
	return Math.max(PBKDF2_MIN, Math.min(PBKDF2_MAX, Math.floor(n) || PBKDF2_DEFAULT));
}

// Stores: pbkdf2:{iterations}:{salt_hex}:{hash_hex}
export async function hashPassword(password: string, iterations = PBKDF2_DEFAULT): Promise<string> {
	const iters = clampIterations(iterations);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derivePbkdf2(password, salt, iters);
	return `${PBKDF2_PREFIX}${iters}:${bufToHex(salt)}:${bufToHex(new Uint8Array(hash))}`;
}

// Returns ok + shouldUpgrade (true when password needs re-hashing: legacy SHA-256 or old PBKDF2 format without embedded iterations)
export async function verifyPassword(
	input: string,
	stored: string,
): Promise<{ ok: boolean; shouldUpgrade: boolean }> {
	if (stored.startsWith(PBKDF2_PREFIX)) {
		const rest = stored.slice(PBKDF2_PREFIX.length);
		const parts = rest.split(':');
		let iterations: number, saltHex: string, expectedHash: string, oldFormat: boolean;
		if (parts.length === 3) {
			// Current format: pbkdf2:{iterations}:{salt}:{hash}
			iterations = clampIterations(parseInt(parts[0]) || PBKDF2_DEFAULT);
			saltHex = parts[1];
			expectedHash = parts[2];
			oldFormat = false;
		} else {
			// Previous format without iterations: pbkdf2:{salt}:{hash}
			iterations = PBKDF2_DEFAULT;
			saltHex = parts[0];
			expectedHash = parts[1];
			oldFormat = true;
		}
		const actual = bufToHex(new Uint8Array(await derivePbkdf2(input, hexToBuf(saltHex), iterations)));
		const ok = timingSafeEqual(actual, expectedHash);
		return { ok, shouldUpgrade: ok && oldFormat };
	}
	// Legacy SHA-256 (no salt) — always upgrade on success
	const legacyHash = await sha256Hex(input);
	const ok = timingSafeEqual(legacyHash, stored);
	return { ok, shouldUpgrade: ok };
}

// SHA-256 only (no salt) — matches legacy hash format; use when PBKDF2 is disabled
export async function hashPasswordSimple(password: string): Promise<string> {
	return sha256Hex(password);
}

export function generateToken(): string {
	return crypto.randomUUID();
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
}

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return bufToHex(new Uint8Array(digest));
}

function bufToHex(buf: Uint8Array): string {
	return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
	const arr = new Uint8Array(hex.length / 2);
	for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return arr;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
