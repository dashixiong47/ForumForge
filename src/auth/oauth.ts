import type { Security } from '../core/security';
import { hashPassword } from '../core/password';
import { generateIdenticon } from '../utils/identicon';
import type { DBSetting, DBUser } from '../db/types';

export const OAUTH_PROVIDER_IDS = ['google', 'github', 'epic'] as const;
export type OAuthProviderId = typeof OAUTH_PROVIDER_IDS[number];

export type OAuthPublicProvider = {
	id: OAuthProviderId;
	label: string;
};

type OAuthProviderMeta = {
	label: string;
	envPrefix: string;
	authUrl: string;
	tokenUrl: string;
	userUrl: string;
	scope: string;
};

type OAuthConfig = OAuthProviderMeta & {
	id: OAuthProviderId;
	enabled: boolean;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
};

type OAuthProfile = {
	provider: OAuthProviderId;
	providerUserId: string;
	email: string;
	username: string;
	avatarUrl: string;
	raw: unknown;
};

type OAuthContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	security: Security;
	authCookie: (token: string, expiresAt: number) => string;
	getBaseUrl: () => string;
};

const PROVIDERS: Record<OAuthProviderId, OAuthProviderMeta> = {
	google: {
		label: 'Google',
		envPrefix: 'GOOGLE',
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
		scope: 'openid email profile',
	},
	github: {
		label: 'GitHub',
		envPrefix: 'GITHUB',
		authUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		userUrl: 'https://api.github.com/user',
		scope: 'read:user user:email',
	},
	epic: {
		label: 'Epic',
		envPrefix: 'EPIC',
		authUrl: 'https://www.epicgames.com/id/authorize',
		tokenUrl: 'https://api.epicgames.dev/epic/oauth/v2/token',
		userUrl: 'https://api.epicgames.dev/epic/oauth/v2/userInfo',
		scope: 'openid profile email',
	},
};

const OAUTH_STATE_COOKIE = 'ff_oauth_state';

function envValue(env: Env, key: string): string {
	return String((env as any)[key] || '').trim();
}

async function settingValue(db: D1Database, key: string): Promise<string> {
	const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<DBSetting>();
	return String(row?.value || '').trim();
}

function oauthBaseUrl(env: Env, getBaseUrl: () => string): string {
	return (envValue(env, 'OAUTH_REDIRECT_BASE') || getBaseUrl()).replace(/\/+$/, '');
}

async function loadOAuthConfig(db: D1Database, env: Env, getBaseUrl: () => string, id: OAuthProviderId): Promise<OAuthConfig> {
	const meta = PROVIDERS[id];
	const prefix = meta.envPrefix;
	const enabled = (await settingValue(db, `oauth_${id}_enabled`)) === '1';
	const clientId = await settingValue(db, `oauth_${id}_client_id`) || envValue(env, `${prefix}_CLIENT_ID`);
	const clientSecret = await settingValue(db, `oauth_${id}_client_secret`) || envValue(env, `${prefix}_CLIENT_SECRET`);
	return {
		id,
		...meta,
		enabled,
		clientId,
		clientSecret,
		redirectUri: `${oauthBaseUrl(env, getBaseUrl)}/oauth/${id}/callback`,
	};
}

export async function loadOAuthPublicProviders(db: D1Database, env: Env, getBaseUrl: () => string): Promise<OAuthPublicProvider[]> {
	const configs = await Promise.all(OAUTH_PROVIDER_IDS.map((id) => loadOAuthConfig(db, env, getBaseUrl, id)));
	return configs
		.filter((config) => config.enabled)
		.map((config) => ({ id: config.id, label: config.label }));
}

function getCookieValue(request: Request, name: string): string {
	const cookie = request.headers.get('Cookie') || '';
	for (const part of cookie.split(';')) {
		const [rawKey, ...rawValue] = part.trim().split('=');
		if (rawKey === name) return decodeURIComponent(rawValue.join('=') || '');
	}
	return '';
}

function stateCookie(url: URL, value: string, maxAge: number): string {
	const secure = url.protocol === 'https:' ? '; Secure' : '';
	return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/oauth; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function clearStateCookie(url: URL): string {
	return stateCookie(url, '', 0);
}

function redirect(location: string, headers: HeadersInit = {}): Response {
	return new Response(null, { status: 302, headers: { Location: location, ...headers } });
}

function normalizeProvider(pathname: string, action: 'start' | 'callback'): OAuthProviderId | null {
	const match = pathname.match(/^\/oauth\/([^/]+)\/([^/]+)$/);
	if (!match || match[2] !== action) return null;
	const id = match[1] as OAuthProviderId;
	return OAUTH_PROVIDER_IDS.includes(id) ? id : null;
}

function basicAuth(clientId: string, clientSecret: string): string {
	return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function postToken(config: OAuthConfig, params: URLSearchParams): Promise<any> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/x-www-form-urlencoded',
	};
	if (config.id === 'github') {
		params.set('client_id', config.clientId);
		params.set('client_secret', config.clientSecret);
	} else if (config.id === 'epic') {
		headers.Authorization = basicAuth(config.clientId, config.clientSecret);
	} else {
		params.set('client_id', config.clientId);
		params.set('client_secret', config.clientSecret);
	}
	const res = await fetch(config.tokenUrl, { method: 'POST', headers, body: params });
	const data = await res.json().catch(() => ({})) as any;
	if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'OAuth token exchange failed');
	return data;
}

async function fetchJson(url: string, accessToken: string): Promise<any> {
	const res = await fetch(url, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${accessToken}`,
			'User-Agent': 'ForumForge',
		},
	});
	const data = await res.json().catch(() => ({})) as any;
	if (!res.ok) throw new Error(data.message || data.error_description || data.error || 'OAuth profile fetch failed');
	return data;
}

function safeEmail(provider: OAuthProviderId, providerUserId: string, email: unknown): string {
	const value = String(email || '').trim().toLowerCase();
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
	const slug = String(providerUserId || crypto.randomUUID()).replace(/[^a-z0-9]/gi, '').slice(0, 40) || crypto.randomUUID().replace(/-/g, '');
	return `${provider}-${slug}@oauth.local`;
}

function safeUsername(provider: OAuthProviderId, providerUserId: string, value: unknown): string {
	const raw = String(value || '').trim() || `${provider}_${String(providerUserId).slice(0, 8)}`;
	const cleaned = raw.replace(/[^\w\u4e00-\u9fff-]/g, '').slice(0, 20);
	return cleaned || `${provider}_${String(providerUserId).replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'user'}`;
}

async function fetchOAuthProfile(config: OAuthConfig, code: string): Promise<OAuthProfile> {
	const params = new URLSearchParams({
		code,
		redirect_uri: config.redirectUri,
		grant_type: 'authorization_code',
	});
	const token = await postToken(config, params);
	const profile = await fetchJson(config.userUrl, token.access_token);

	if (config.id === 'github') {
		let email = profile.email;
		if (!email) {
			const emails = await fetchJson('https://api.github.com/user/emails', token.access_token).catch(() => []);
			const primary = Array.isArray(emails) ? emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified) : null;
			email = primary?.email || '';
		}
		const id = String(profile.id || '');
		return {
			provider: config.id,
			providerUserId: id,
			email: safeEmail(config.id, id, email),
			username: safeUsername(config.id, id, profile.name || profile.login),
			avatarUrl: String(profile.avatar_url || ''),
			raw: profile,
		};
	}

	const id = String(profile.sub || profile.account_id || profile.id || '');
	return {
		provider: config.id,
		providerUserId: id,
		email: safeEmail(config.id, id, profile.email),
		username: safeUsername(config.id, id, profile.name || profile.preferred_username || profile.displayName || profile.email),
		avatarUrl: String(profile.picture || profile.avatar_url || ''),
		raw: profile,
	};
}

async function uniqueUsername(db: D1Database, wanted: string): Promise<string> {
	const base = wanted.slice(0, 18) || 'user';
	for (let i = 0; i < 50; i++) {
		const candidate = i === 0 ? base : `${base.slice(0, 16)}${i}`;
		const row = await db.prepare('SELECT id FROM users WHERE username = ?').bind(candidate).first<{ id: number }>();
		if (!row) return candidate;
	}
	return `user${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

async function findOrCreateOAuthUser(db: D1Database, profile: OAuthProfile): Promise<DBUser> {
	const account = await db
		.prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
		.bind(profile.provider, profile.providerUserId)
		.first<{ user_id: number }>();
	if (account) {
		const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(account.user_id).first<DBUser>();
		if (user) return user;
	}

	let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(profile.email).first<DBUser>();
	if (!user) {
		const username = await uniqueUsername(db, profile.username);
		const password = await hashPassword(`oauth:${profile.provider}:${profile.providerUserId}:${crypto.randomUUID()}`);
		const created = await db.prepare(
			`INSERT INTO users (email, username, password, role, verified, verification_token, avatar_url, nickname, email_notifications)
			 VALUES (?, ?, ?, 'user', 1, NULL, ?, ?, 1)`
		).bind(profile.email, username, password, profile.avatarUrl || '', username).run();
		const id = Number(created.meta?.last_row_id || 0);
		if (!id) throw new Error('OAuth user creation failed');
		if (!profile.avatarUrl) {
			await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(generateIdenticon(String(id)), id).run();
		}
		user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DBUser>();
	}
	if (!user) throw new Error('OAuth user lookup failed');

	await db.prepare(
		`INSERT OR REPLACE INTO oauth_accounts (user_id, provider, provider_user_id, email, profile_json, updated_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(user.id, profile.provider, profile.providerUserId, profile.email, JSON.stringify(profile.raw || {})).run();

	return user;
}

async function handleOAuthStart(ctx: OAuthContext, provider: OAuthProviderId): Promise<Response> {
	const config = await loadOAuthConfig(ctx.db, ctx.env, ctx.getBaseUrl, provider);
	if (!config.enabled || !config.clientId || !config.clientSecret) return redirect('/login?oauth=disabled');
	const state = `${provider}.${crypto.randomUUID()}`;
	const authUrl = new URL(config.authUrl);
	authUrl.searchParams.set('client_id', config.clientId);
	authUrl.searchParams.set('redirect_uri', config.redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', config.scope);
	authUrl.searchParams.set('state', state);
	if (provider === 'github') authUrl.searchParams.set('allow_signup', 'true');
	return redirect(authUrl.toString(), { 'Set-Cookie': stateCookie(ctx.url, state, 600), 'Cache-Control': 'no-store' });
}

async function handleOAuthCallback(ctx: OAuthContext, provider: OAuthProviderId): Promise<Response> {
	const expectedState = getCookieValue(ctx.request, OAUTH_STATE_COOKIE);
	const state = ctx.url.searchParams.get('state') || '';
	const code = ctx.url.searchParams.get('code') || '';
	if (!state || !expectedState || state !== expectedState || !state.startsWith(`${provider}.`)) {
		return redirect('/login?oauth=state', { 'Set-Cookie': clearStateCookie(ctx.url), 'Cache-Control': 'no-store' });
	}
	if (!code) return redirect('/login?oauth=missing_code', { 'Set-Cookie': clearStateCookie(ctx.url), 'Cache-Control': 'no-store' });
	try {
		const config = await loadOAuthConfig(ctx.db, ctx.env, ctx.getBaseUrl, provider);
		if (!config.enabled || !config.clientId || !config.clientSecret) return redirect('/login?oauth=disabled', { 'Set-Cookie': clearStateCookie(ctx.url) });
		const profile = await fetchOAuthProfile(config, code);
		if (!profile.providerUserId) throw new Error('OAuth profile has no stable id');
		const user = await findOrCreateOAuthUser(ctx.db, profile);
		if (!user.verified) {
			await ctx.db.prepare('UPDATE users SET verified = 1 WHERE id = ?').bind(user.id).run();
			user.verified = 1;
		}
		const { token, jti, expiresAt } = await ctx.security.generateToken({
			id: user.id,
			role: user.role || 'user',
			email: user.email,
		});
		await ctx.db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, user.id, expiresAt).run();
		await ctx.security.logAudit(user.id, 'OAUTH_LOGIN', 'user', String(user.id), { provider }, ctx.request);
		const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
		headers.append('Set-Cookie', ctx.authCookie(token, expiresAt));
		headers.append('Set-Cookie', clearStateCookie(ctx.url));
		return new Response(null, { status: 302, headers });
	} catch (error) {
		console.error('OAuth callback failed', error);
		return redirect('/login?oauth=failed', { 'Set-Cookie': clearStateCookie(ctx.url), 'Cache-Control': 'no-store' });
	}
}

export async function handleOAuthRequest(ctx: OAuthContext): Promise<Response | null> {
	if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return null;
	const startProvider = normalizeProvider(ctx.url.pathname, 'start');
	if (startProvider) return handleOAuthStart(ctx, startProvider);
	const callbackProvider = normalizeProvider(ctx.url.pathname, 'callback');
	if (callbackProvider) return handleOAuthCallback(ctx, callbackProvider);
	return null;
}
