import type { Security } from '../core/security';
import type { DBCount, DBUser } from '../db/types';
import { hashPassword, generateToken } from '../core/password';
import { hasControlCharacters, hasInvisibleCharacters, hasRestrictedKeywords, isVisuallyEmpty } from '../core/validation';
import { generateIdenticon } from '../utils/identicon';
import { sendEmail } from '../integrations/smtp';
import type { JsonResponse } from './types';

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
	sendVerificationEmail: (email: string, username: string, token: string) => Promise<void>;
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

	if (url.pathname === '/api/login' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) {
				return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const { email, password } = body;
			if (!email || !password) return jsonResponse({ error: 'Missing email or password' }, 400);

			const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DBUser>();
			if (!user) return jsonResponse({ error: 'Username or Password Error' }, 401);

			const passwordHash = await hashPassword(password);
			if (user.password !== passwordHash) return jsonResponse({ error: 'Username or Password Error' }, 401);

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

			const { email } = body;
			if (!email) return jsonResponse({ error: 'Missing email' }, 400);

			const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
			if (!user) return jsonResponse({ success: true });

			const token = generateToken();
			const expires = Date.now() + 3600000;
			await db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').bind(token, expires, user.id).run();

			const resetLink = `${getBaseUrl()}/reset?token=${token}`;
			const emailHtml = `
				<h1>密码重置请求</h1>
				<p>请点击下方链接重置您的密码：</p>
				<a href="${resetLink}">重置密码</a>
				<p>如果您未请求此操作，请忽略此邮件。</p>
				<p>此链接将在 1 小时后失效。</p>
			`;
			executionCtx.waitUntil(sendEmail(email, '密码重置请求', emailHtml, env).catch(console.error));
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

			const user = await db.prepare('SELECT * FROM users WHERE reset_token = ?').bind(token).first<DBUser>();
			if (!user) return jsonResponse({ error: 'Invalid token' }, 400);
			if (!user.reset_token_expires || Date.now() > user.reset_token_expires) return jsonResponse({ error: 'Token expired' }, 400);

			const passwordHash = await hashPassword(newPassword);
			await db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').bind(passwordHash, user.id).run();
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/register' && method === 'POST') {
		try {
			const body = await request.json() as any;
			const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
			if (!(await checkTurnstile(body, ip))) {
				return jsonResponse({ error: 'Turnstile verification failed' }, 403);
			}

			const { email, password } = body;
			if (!email || !password) return jsonResponse({ error: 'Missing email or password' }, 400);
			if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);

			const username = await usernameFromEmail(email);
			if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
			if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
			if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
			if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
			if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);
			if (password.length < 8 || password.length > 16) return jsonResponse({ error: 'Password must be 8-16 characters' }, 400);

			const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
			if (existingEmail) return jsonResponse({ error: 'Email already exists' }, 409);

			const passwordHash = await hashPassword(password);
			const verificationToken = generateToken();
			const { success, meta } = await db.prepare(
				'INSERT INTO users (email, username, password, role, verified, verification_token) VALUES (?, ?, ?, "user", ?, ?)'
			).bind(email, username, passwordHash, 0, verificationToken).run();

			let userId = Number(meta?.last_row_id || 0);
			if (success) {
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
						'email_verification',
						'请验证邮箱',
						'验证后才能发帖、评论、点赞、签到和上传帖子媒体。',
						{ meta: { href: '/settings', email } }
					);
					executionCtx.waitUntil((async () => {
						try {
							await sendVerificationEmail(email, username, verificationToken);
						} catch (e) {
							console.error('[Registration Email Error]', e);
							await logAuditEvent('email.verification_failed', 'user', String(userId), {
								email,
								error: e instanceof Error ? e.message : String(e || 'Unknown error'),
							}, userId);
						}
					})());
				}
			}

			const { token, jti, expiresAt } = await security.generateToken({ id: userId, role: 'user', email });
			if (userId) {
				await db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, userId, expiresAt).run();
				await logAuditEvent('REGISTER', 'user', String(userId), { email }, userId);
			}
			return jsonResponse({
				success,
				message: '注册成功，请前往铃铛通知或邮箱完成验证。',
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
