export function readStringEnv(env: Env, key: string): string {
	const value = (env as any)[key];
	return typeof value === 'string' ? value.trim() : '';
}

export function isLocalRequest(url: URL): boolean {
	const host = url.hostname.toLowerCase();
	return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export async function isSmtpConfigured(env: any): Promise<boolean> {
	if (env.EMAIL || env.SEND_EMAIL || env.MAIL) return true;
	if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) return true;
	if (env.SMTP_FROM) return true;
	if (env.RESEND_KEY) return true;
	try {
		const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'smtp_host' AND value != ''").first();
		return !!row;
	} catch {
		return false;
	}
}
