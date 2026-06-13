import type { Security } from '../core/security';
import type { DBCount, DBUser } from '../db/types';
import { verifyPassword, hashPassword, hashPasswordSimple, generateToken, clampIterations, PBKDF2_DEFAULT } from '../core/password';
import { hasControlCharacters, hasInvisibleCharacters, hasRestrictedKeywords, isVisuallyEmpty } from '../core/validation';
import { generateIdenticon } from '../utils/identicon';
import { sendEmail } from '../integrations/smtp';
import { buildRegistrationOtpEmail, buildResetPasswordEmail } from '../emails/templates';
import type { EmailLocale } from '../emails/templates';
import type { JsonResponse } from './types';
import { kvEmailCooldown } from '../core/kv';

export type AuthApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	executionCtx: ExecutionContext;
	security: Security;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	authCookie: (token: string, expiresAt: number) => string;
	getBaseUrl: () => string;
	checkTurnstile: (body: any, ip: string) => Promise<boolean>;
	sendVerificationEmail: (email: string, username: string, token: string, locale?: string) => Promise<void>;
	createNotification: (targetUserId: number | string, type: string, title: string, body: string, options?: any) => Promise<void>;
	logAuditEvent: (action: string, resourceType: string, resourceId: string, details?: Record<string, unknown>, userId?: number | string | null) => Promise<void>;
	usernameFromEmail: (emailValue: string) => Promise<string>;
};

export async function handleAuthApi(ctx: AuthApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		env,
		db,
		executionCtx,
		security,
		jsonResponse,
		handleError,
		authCookie,
		getBaseUrl,
		checkTurnstile,
		sendVerificationEmail,
		createNotification,
		logAuditEvent,
		usernameFromEmail,
	} = ctx;

	const siteInfo = async () => {
		const baseUrl = getBaseUrl().replace(/\/+$/, '');
		const siteNameRow = await db.prepare("SELECT value FROM settings WHERE key='site_name'").first<{ value: string }>().catch(() => null);
		const siteName = String(siteNameRow?.value || 'ForumForge').trim() || 'ForumForge';
		const senderEmail = `noreply@${new URL(baseUrl).hostname}`;
		return { baseUrl, siteName, senderEmail };
	};
	const emailLocaleFrom = (raw?: string): EmailLocale => {
		const value = String(raw || request.headers.get('Accept-Language') || '').toLowerCase();
		return value.startsWith('zh') || value.includes('zh-') ? 'zh' : 'en';
	};
	const registerCodeKey = (email: string) => `register-email:${email}`;

	if (url.pathname === '/api/login' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) {
				return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const { email, password } = body;
			if (!email || !password) return jsonResponse({ error: 'Missing email or password' }, 400);

			const user = await db.prepare('SELECT * FROM users WHERE email = ? AND COALESCE(deleted_at, 0) = 0').bind(email).first<DBUser>();
			if (!user) return jsonResponse({ error: 'Username or Password Error' }, 401);
			if (Number((user as any).disabled_until || 0) > Math.floor(Date.now() / 1000)) return jsonResponse({ error: 'Account disabled' }, 403);

			const verify = await verifyPassword(password, user.password || '');
			if (!verify.ok) return jsonResponse({ error: 'Username or Password Error' }, 401);
			// Lazy-upgrade legacy or old-format hash to current PBKDF2 in the background (only when PBKDF2 enabled)
			if (verify.shouldUpgrade) {
				executionCtx.waitUntil(
					Promise.all([
						db.prepare("SELECT value FROM settings WHERE key = 'pbkdf2_enabled'").first<{ value: string }>(),
						db.prepare("SELECT value FROM settings WHERE key = 'pbkdf2_iterations'").first<{ value: string }>(),
					])
						.then(async ([enabledRow, iterRow]) => {
							if (enabledRow?.value === '0') return;
							const hash = await hashPassword(password, clampIterations(parseInt(iterRow?.value || '') || PBKDF2_DEFAULT));
							await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hash, user.id).run();
						})
						.catch(() => {}),
				);
			}

			const { token, jti, expiresAt } = await security.generateToken({
				id: user.id,
				role: user.role || 'user',
				email: user.email
			});

			await db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, user.id, expiresAt).run();
			await security.logAudit(user.id, 'LOGIN', 'user', String(user.id), { email }, request);

			return jsonResponse({
				token,
				user: {
					id: user.id,
					email: user.email,
					username: user.username,
					avatar_url: user.avatar_url,
					role: user.role || 'user',
					verified: user.verified === 1,
					email_notifications: user.email_notifications === 1,
					show_public_posts: user.show_public_posts !== 0
				}
			}, 200, { 'Set-Cookie': authCookie(token, expiresAt) });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/auth/forgot-password' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) {
				return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const { email, locale: resetLocale } = body;
			if (!email) return jsonResponse({ error: 'Missing email' }, 400);

			if (env.CACHE) {
				const wait = await kvEmailCooldown(env.CACHE, 'forgot', email, 60).catch(() => 0);
				if (wait > 0) return jsonResponse({ error: `请等待 ${wait} 秒后再重新发送。`, cooldown: wait }, 429);
			}

			const user = await db.prepare('SELECT id FROM users WHERE email = ? AND COALESCE(deleted_at, 0) = 0').bind(email).first<{ id: number }>();
			if (!user) return jsonResponse({ success: true });

			const token = generateToken();
			const expires = Date.now() + 3600000;
			await db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').bind(token, expires, user.id).run();

			const resetLink = `${getBaseUrl()}/reset?token=${token}`;
			const resetEmailLocale: EmailLocale = String(resetLocale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
			const siteNameRow = await db.prepare("SELECT value FROM settings WHERE key='site_name'").first<{value:string}>().catch(() => null);
			const siteName = siteNameRow?.value || 'ForumForge';
			const { subject: resetSubject, html: resetHtml } = buildResetPasswordEmail({
				locale: resetEmailLocale,
				resetLink,
				siteName,
				siteUrl: getBaseUrl(),
			});
			executionCtx.waitUntil(sendEmail(email, resetSubject, resetHtml, env).catch(console.error));
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) {
				return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const { token } = body;
			const newPassword = body.new_password || body.password;
			if (!token || !newPassword) return jsonResponse({ error: 'Missing parameters' }, 400);
			if (newPassword.length < 8 || newPassword.length > 16) return jsonResponse({ error: 'Password must be 8-16 characters' }, 400);

			const user = await db.prepare('SELECT * FROM users WHERE reset_token = ? AND COALESCE(deleted_at, 0) = 0').bind(token).first<DBUser>();
			if (!user) return jsonResponse({ error: 'Invalid token' }, 400);
			if (!user.reset_token_expires || Date.now() > user.reset_token_expires) return jsonResponse({ error: 'Token expired' }, 400);

			const [pbkdf2EnabledRow, iterRow] = await Promise.all([
				db.prepare("SELECT value FROM settings WHERE key = 'pbkdf2_enabled'").first<{ value: string }>(),
				db.prepare("SELECT value FROM settings WHERE key = 'pbkdf2_iterations'").first<{ value: string }>(),
			]);
			const pbkdf2On = pbkdf2EnabledRow?.value !== '0';
			const passwordHash = pbkdf2On
				? await hashPassword(newPassword, clampIterations(parseInt(iterRow?.value || '') || PBKDF2_DEFAULT))
				: await hashPasswordSimple(newPassword);
			await db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').bind(passwordHash, user.id).run();
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/register/send-code' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) {
				return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const email = String(body.email || '').trim().toLowerCase();
			const locale = String(body.locale || '');
			if (!email) return jsonResponse({ error: 'Missing email' }, 400);
			if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);

			if (env.CACHE) {
				const wait = await kvEmailCooldown(env.CACHE, 'regcode', email, 60).catch(() => 0);
				if (wait > 0) return jsonResponse({ error: `请等待 ${wait} 秒后再重新发送。`, cooldown: wait }, 429);
			}

			const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
			if (existingEmail) return jsonResponse({ error: 'Email already exists' }, 409);

			const code = String(Math.floor(100000 + Math.random() * 900000));
			const expires = Date.now() + 10 * 60 * 1000;
			await env.CACHE.put(registerCodeKey(email), JSON.stringify({ code, expires_at: expires, attempts: 0 }), { expirationTtl: 600 });

			const { baseUrl, siteName, senderEmail } = await siteInfo();
			const emailLocale: EmailLocale = emailLocaleFrom(locale);
			const { subject, html } = buildRegistrationOtpEmail({ locale: emailLocale, code, targetEmail: email, siteName, siteUrl: baseUrl });
			try {
				await sendEmail(email, subject, html, env, senderEmail);
			} catch (e) {
				await env.CACHE.delete(registerCodeKey(email)).catch(() => {});
				return jsonResponse({ error: '验证码发送失败，请检查邮箱地址后重试。' }, 503);
			}

			await logAuditEvent('REGISTER_CODE_SENT', 'email', email, { email }, null);
			return jsonResponse({ success: true, message: '验证码已发送，请查收邮件。' });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/register' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const email = String(body.email || '').trim().toLowerCase();
			const { password } = body;
			const code = String(body.code || '').trim();
			if (!email || !password || !code) return jsonResponse({ error: 'Missing email, password or code' }, 400);
			if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);
			if (!/^\d{6}$/.test(code)) return jsonResponse({ error: '验证码格式不正确。' }, 400);

			const username = await usernameFromEmail(email);
			if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
			if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
			if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
			if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
			if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);
			if (password.length < 8 || password.length > 16) return jsonResponse({ error: 'Password must be 8-16 characters' }, 400);

			const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
			if (existingEmail) return jsonResponse({ error: 'Email already exists' }, 409);

			const otp = await env.CACHE.get(registerCodeKey(email), 'json') as { code?: string; expires_at?: number; attempts?: number } | null;
			if (!otp) return jsonResponse({ error: '请先发送验证码。' }, 400);
			if (Date.now() > Number(otp.expires_at || 0)) {
				await env.CACHE.delete(registerCodeKey(email)).catch(() => {});
				return jsonResponse({ error: '验证码已过期，请重新发送。' }, 400);
			}
			if (String(otp.code || '').trim() !== code) {
				await env.CACHE.put(registerCodeKey(email), JSON.stringify({ ...otp, attempts: Number(otp.attempts || 0) + 1 }), { expirationTtl: 600 }).catch(() => {});
				return jsonResponse({ error: '验证码错误。' }, 400);
			}

			const [pbkdf2EnabledRow2, iterRow2] = await Promise.all([
				db.prepare("SELECT value FROM settings WHERE key = 'pbkdf2_enabled'").first<{ value: string }>(),
				db.prepare("SELECT value FROM settings WHERE key = 'pbkdf2_iterations'").first<{ value: string }>(),
			]);
			const pbkdf2On2 = pbkdf2EnabledRow2?.value !== '0';
			const passwordHash = pbkdf2On2
				? await hashPassword(password, clampIterations(parseInt(iterRow2?.value || '') || PBKDF2_DEFAULT))
				: await hashPasswordSimple(password);
			const { success, meta } = await db.prepare(
				'INSERT INTO users (email, username, password, role, verified, verification_token) VALUES (?, ?, ?, "user", ?, ?)'
			).bind(email, username, passwordHash, 1, null).run();

			let userId = Number(meta?.last_row_id || 0);
			if (success) {
				await env.CACHE.delete(registerCodeKey(email)).catch(() => {});
				if (userId) {
					const identicon = await generateIdenticon(String(userId));
					await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(identicon, userId).run();
				} else {
					const row = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
					userId = Number(row?.id || 0);
					const identicon = await generateIdenticon(username);
					await db.prepare('UPDATE users SET avatar_url = ? WHERE username = ?').bind(identicon, username).run();
				}
				if (userId) {
					await createNotification(
						userId,
						'welcome',
						'注册完成',
						'邮箱已验证，欢迎开始发帖、评论和上传媒体。',
						{ meta: { href: '/', email } }
					);
				}
			}

			const { token, jti, expiresAt } = await security.generateToken({ id: userId, role: 'user', email });
			if (userId) {
				await db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, userId, expiresAt).run();
				await logAuditEvent('REGISTER', 'user', String(userId), { email }, userId);
			}
			return jsonResponse({
				success,
				message: '注册成功，已完成邮箱验证。',
				token,
				redirect: '/'
			}, 201, { 'Set-Cookie': authCookie(token, expiresAt) });
		} catch (e: any) {
			if (e.message && e.message.includes('UNIQUE constraint failed')) return jsonResponse({ error: 'Email already exists' }, 409);
			return handleError(e);
		}
	}

	if (url.pathname === '/api/verify' && method === 'GET') {
		const token = url.searchParams.get('token');
		if (!token) return new Response('缺少 token', { status: 400 });

		try {
			const result = await db.prepare(
				'UPDATE users SET verified = 1, verification_token = NULL WHERE verification_token = ? AND COALESCE(verified, 0) = 0'
			).bind(token).run();

			if (Number(result.meta?.changes || 0) > 0) {
				return Response.redirect(`${getBaseUrl().replace(/\/+$/, '')}/login?verified=true`, 302);
			}
			return new Response('token 无效或已过期', { status: 400 });
		} catch {
			return new Response('验证失败', { status: 500 });
		}
	}

	return null;
}
