export async function hashPassword(password: string): Promise<string> {
	const bytes = new TextEncoder().encode(password);
	const digest = await crypto.subtle.digest({ name: 'SHA-256' }, bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function generateToken(): string {
	return crypto.randomUUID();
}
