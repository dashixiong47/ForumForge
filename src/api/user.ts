import type { Security, UserPayload } from '../core/security';
import type { DBCount, DBSetting, DBUser } from '../db/types';
import { hashPassword, generateToken } from '../core/password';
import { hasControlCharacters, hasInvisibleCharacters, hasRestrictedKeywords, isVisuallyEmpty } from '../core/validation';
import { generateIdenticon } from '../utils/identicon';
import { sendEmail } from '../integrations/smtp';
import { buildEmailOtpEmail } from '../emails/templates';
import type { EmailLocale } from '../emails/templates';
import { publicPostPath } from '../core/id-codec';
import type { JsonResponse } from './types';

export type UserApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	executionCtx: ExecutionContext;
	security: Security;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	authenticate: (request: Request) => Promise<UserPayload>;
	loadAccessUser: (payload: UserPayload) => Promise<UserPayload>;
	requireVerifiedUser: (payload: UserPayload) => Promise<UserPayload>;
	awardUserProgress: (userId: number, source: any, options?: any) => Promise<any>;
	sendVerificationEmail: (email: string, username: string, token: string) => Promise<void>;
	createNotification: (targetUserId: number | string, type: string, title: string, body: string, options?: any) => Promise<void>;
	getBaseUrl: () => string;
	runtimeEnvForLinks: Env;
};

export async function handleUserApi(ctx: UserApiContext): Promise<Response | null> {
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
		authenticate,
		loadAccessUser,
		requireVerifiedUser,
		awardUserProgress,
		sendVerificationEmail,
		createNotification,
		getBaseUrl,
		runtimeEnvForLinks,
	} = ctx;
	const emailLocaleFrom = (raw?: string): EmailLocale => {
		const value = String(raw || request.headers.get('Accept-Language') || '').toLowerCase();
		return value.startsWith('zh') || value.includes('zh-') ? 'zh' : 'en';
	};
	const emailBindCodeKey = (userId: number | string) => `email-bind:${userId}`;

	if (url.pathname === '/api/user/profile' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json() as any;
			const { username, avatar_url, email_notifications, show_public_posts } = body;
			const userId = userPayload.id;

			if (username) {
				if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
				if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
				if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
				if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
				if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);
				const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, userId).first<{id:number}>();
				if (existingUser) return jsonResponse({ error: 'Username already taken' }, 409);
			}

			const currentUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DBUser>();
			if (!currentUser) return jsonResponse({ error: 'User not found' }, 404);

			let newUsername = currentUser.username;
			if (username !== undefined) newUsername = username;

			let newAvatarUrl = currentUser.avatar_url;
			if (avatar_url !== undefined) {
				if (avatar_url === '' || avatar_url === null) {
					newAvatarUrl = await generateIdenticon(String(userId));
				} else {
					if (avatar_url.length > 500) return jsonResponse({ error: 'Avatar URL too long (Max 500 chars)' }, 400);
					if (!/^https?:\/\//i.test(avatar_url) && !avatar_url.startsWith('data:image/svg+xml')) return jsonResponse({ error: 'Invalid Avatar URL (Must start with http:// or https://)' }, 400);
					newAvatarUrl = avatar_url;
				}
			}

			let newEmailNotif = currentUser.email_notifications;
			if (email_notifications !== undefined) newEmailNotif = email_notifications ? 1 : 0;
			let newShowPublicPosts = currentUser.show_public_posts ?? 1;
			if (show_public_posts !== undefined) newShowPublicPosts = show_public_posts ? 1 : 0;

			await db.prepare('UPDATE users SET username = ?, avatar_url = ?, email_notifications = ?, show_public_posts = ? WHERE id = ?')
				.bind(newUsername, newAvatarUrl, newEmailNotif, newShowPublicPosts, userId).run();
			executionCtx.waitUntil(env.CACHE.delete(`user:${userId}`).catch(() => {}));

			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
			return jsonResponse({
				success: true,
				user: {
					id: user.id,
					email: user.email,
					username: user.username,
					avatar_url: user.avatar_url,
					role: user.role || 'user',
					email_notifications: user.email_notifications === 1,
					show_public_posts: user.show_public_posts !== 0
				}
			});
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/checkin' && method === 'POST') {
		try {
			const userPayload = await requireVerifiedUser(await authenticate(request));
			const today = new Date().toISOString().slice(0, 10);
			const user = await db.prepare('SELECT last_checkin_date FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
			if (user?.last_checkin_date === today) return jsonResponse({ error: 'Already checked in today' }, 400);
			const progress = await awardUserProgress(userPayload.id, 'checkin');
			await db.prepare('UPDATE users SET last_checkin_date = ? WHERE id = ?').bind(today, userPayload.id).run();
			await security.logAudit(userPayload.id, 'DAILY_CHECKIN', 'user', String(userPayload.id), progress, request);
			return jsonResponse({ success: true, last_checkin_date: today, ...progress });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/resend-verification' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const user = await db.prepare('SELECT id, email, username, verified FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
			if (Number(user.verified || 0) === 1) return jsonResponse({ success: true, message: '邮箱已验证。' });
			const token = generateToken();
			await db.prepare('UPDATE users SET verification_token = ? WHERE id = ?').bind(token, user.id).run();
			await sendVerificationEmail(user.email, user.username || user.email, token);
			return jsonResponse({ success: true, message: '验证邮件已发送。' });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/notifications' && method === 'GET') {
		try {
			const userPayload = await authenticate(request);
			const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
			const [itemsRes, unreadRow] = await Promise.all([
				db.prepare(
					`SELECT id, type, title, body, post_id, comment_id, is_read, created_at
					   FROM notifications
					  WHERE user_id = ?
					  ORDER BY created_at DESC
					  LIMIT ?`
				).bind(userPayload.id, limit).all(),
				db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').bind(userPayload.id).first<DBCount>()
			]);
			const items = ((itemsRes.results || []) as any[]).map((item) => ({
				...item,
				target_url: item.post_id ? `${publicPostPath(item.post_id, runtimeEnvForLinks)}${item.comment_id ? `#comment-${item.comment_id}` : ''}` : '',
				url: `/me?tab=notifications#notification-${item.id}`
			}));
			return jsonResponse({ items, unread_count: Number(unreadRow?.count || 0) });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/notifications/read' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json().catch(() => ({})) as any;
			const ids = Array.isArray(body.ids)
				? body.ids.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, 100)
				: [];
			if (!ids.length) {
				await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').bind(userPayload.id).run();
			} else {
				for (const id of ids) {
					await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?').bind(userPayload.id, id).run();
				}
			}
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/delete' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json() as any;
			const { password } = body;
			if (!password) return jsonResponse({ error: 'Missing credentials' }, 400);

			const userId = userPayload.id;
			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);

			const passwordHash = await hashPassword(password);
			if (user.password !== passwordHash) return jsonResponse({ error: 'Invalid password' }, 401);

			const now = Math.floor(Date.now() / 1000);
			await db.prepare('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?) AND COALESCE(deleted_at, 0) = 0').bind(now, userId, userId).run();
			await db.prepare('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE author_id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userId, userId).run();
			await db.prepare('UPDATE posts SET deleted_at = ?, deleted_by = ? WHERE author_id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userId, userId).run();
			await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
			await db.prepare('UPDATE users SET deleted_at = ?, deleted_by = ?, disabled_until = ?, disabled_reason = ? WHERE id = ? AND COALESCE(deleted_at, 0) = 0').bind(now, userId, now + 3650 * 86400, 'self_deleted', userId).run();

			await security.logAudit(userPayload.id, 'DELETE_ACCOUNT', 'user', String(userId), {}, request);
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/change-email' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json() as any;
			const { new_email } = body;
			if (!new_email) return jsonResponse({ error: 'Missing parameters' }, 400);
			if (new_email.length > 254) return jsonResponse({ error: 'Email too long' }, 400);

			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
			const currentEmail = String(user.email || '').trim().toLowerCase();
			const hasRealCurrentEmail = !!currentEmail && !currentEmail.endsWith('@oauth.local');
			if (hasRealCurrentEmail) {
				return jsonResponse({ error: '邮箱绑定后不能更换。' }, 400);
			}
			const oauth = await db.prepare('SELECT user_id FROM oauth_accounts WHERE user_id = ? LIMIT 1').bind(user.id).first<{ user_id: number }>().catch(() => null);
			if (!oauth) {
				return jsonResponse({ error: '只有第三方登录账号可以绑定邮箱。' }, 403);
			}

			if (user.email && user.email.toLowerCase() === new_email.toLowerCase()) {
				return jsonResponse({ error: '该邮箱已是您当前绑定的邮箱。' }, 400);
			}

			const exists = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(new_email, user.id).first();
			if (exists) return jsonResponse({ error: 'Email already in use' }, 400);

			const token = generateToken();
			const verifyLink = `${getBaseUrl()}/api/verify-email-change?token=${token}`;
			const emailHtml = `
				<h1>确认更换邮箱</h1>
				<p>请点击下方链接确认将您的邮箱更换为 ${new_email}：</p>
				<a href="${verifyLink}">确认更换</a>
			`;

			try {
				await sendEmail(new_email, '确认更换邮箱', emailHtml, env);
			} catch (e) {
				console.error('[Email Change Error]', e);
				return jsonResponse({ error: '确认邮件发送失败，请检查邮件服务配置后重试。' }, 503);
			}

			await db.prepare('UPDATE users SET pending_email = ?, email_change_token = ? WHERE id = ?').bind(new_email, token, user.id).run();
			await security.logAudit(userPayload.id, 'CHANGE_EMAIL_INIT', 'user', String(userPayload.id), { new_email }, request);
			return jsonResponse({ success: true, message: '确认邮件已发送，请前往新邮箱完成绑定。' });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/set-password' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json() as any;
			const password = String(body.password || body.new_password || '');
			const passwordConfirm = String(body.password_confirm || body.confirm_password || '');
			const oldPassword = String(body.old_password || body.current_password || '');
			if (password.length < 8 || password.length > 64) return jsonResponse({ error: 'Password must be 8-64 characters' }, 400);
			if (password !== passwordConfirm) return jsonResponse({ error: 'New passwords do not match' }, 400);
			const user = await db.prepare('SELECT id, password FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
			const hasLocalPassword = !!String(user.password || '').trim();
			if (hasLocalPassword) {
				const oldPasswordHash = await hashPassword(oldPassword);
				if (user.password !== oldPasswordHash) return jsonResponse({ error: 'Old password is incorrect' }, 401);
			}
			const passwordHash = await hashPassword(password);
			await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(passwordHash, userPayload.id).run();
			await security.logAudit(userPayload.id, 'SET_PASSWORD', 'user', String(userPayload.id), {}, request);
			return jsonResponse({ success: true, message: '密码已设置。' });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/verify-email-change' && method === 'GET') {
		const token = url.searchParams.get('token');
		if (!token) return new Response('Missing token', { status: 400 });
		try {
			const user = await db.prepare('SELECT * FROM users WHERE email_change_token = ?').bind(token).first<DBUser>();
			if (!user) return new Response('Invalid token', { status: 400 });
			await db.prepare('UPDATE users SET email = ?, verified = 1, pending_email = NULL, email_change_token = NULL WHERE id = ?').bind(user.pending_email, user.id).run();
			return Response.redirect(`${getBaseUrl()}/?email_changed=true`, 302);
		} catch {
			return new Response('Failed', { status: 500 });
		}
	}

	if (url.pathname === '/api/users' && method === 'GET') {
		try {
			const { results } = await db.prepare('SELECT id, email, username, created_at FROM users').all();
			return jsonResponse(results);
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/likes' && method === 'GET') {
		try {
			const userPayload = await authenticate(request);
			const { results } = await db.prepare('SELECT post_id FROM likes WHERE user_id = ?').bind(userPayload.id).all();
			return jsonResponse((results || []).map((r: any) => r.post_id));
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/send-email-code' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json() as any;
			const { new_email, locale } = body;
			if (!new_email) return jsonResponse({ error: 'Missing new_email' }, 400);
			if (new_email.length > 254) return jsonResponse({ error: 'Email too long' }, 400);
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) return jsonResponse({ error: '邮箱格式无效' }, 400);

			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);

			if (user.email && user.email.toLowerCase() === new_email.toLowerCase()) {
				return jsonResponse({ error: '该邮箱已是您当前绑定的邮箱。' }, 400);
			}
			const exists = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(new_email, user.id).first();
			if (exists) return jsonResponse({ error: 'Email already in use' }, 400);

			const code = String(Math.floor(100000 + Math.random() * 900000));
			const expires = Date.now() + 10 * 60 * 1000;
			await env.CACHE.put(emailBindCodeKey(user.id), JSON.stringify({ code, expires_at: expires, email: new_email }), { expirationTtl: 600 });

			const baseUrl = getBaseUrl().replace(/\/+$/, '');
			const siteNameRow = await db.prepare("SELECT value FROM settings WHERE key='site_name'").first<{value:string}>().catch(() => null);
			const siteName = siteNameRow?.value || 'ForumForge';
			const emailLocale: EmailLocale = emailLocaleFrom(locale);
			const { subject, html } = buildEmailOtpEmail({ locale: emailLocale, code, targetEmail: new_email, siteName, siteUrl: baseUrl });

			try {
				await sendEmail(new_email, subject, html, env);
			} catch (e) {
				await env.CACHE.delete(emailBindCodeKey(user.id)).catch(() => {});
				return jsonResponse({ error: '验证码发送失败，请检查邮箱地址后重试。' }, 503);
			}

			await security.logAudit(userPayload.id, 'SEND_EMAIL_CODE', 'user', String(userPayload.id), { new_email }, request);
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/user/verify-email-code' && method === 'POST') {
		try {
			const userPayload = await authenticate(request);
			const body = await request.json() as any;
			const { code } = body;
			if (!code) return jsonResponse({ error: 'Missing code' }, 400);

			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userPayload.id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
			const currentEmail = String(user.email || '').trim().toLowerCase();
			if (currentEmail && !currentEmail.endsWith('@oauth.local')) {
				return jsonResponse({ error: '邮箱绑定后不能更换。' }, 400);
			}
			const otp = await env.CACHE.get(emailBindCodeKey(user.id), 'json') as { code?: string; expires_at?: number; email?: string } | null;
			if (!otp) {
				return jsonResponse({ error: '请先发送验证码。' }, 400);
			}
			if (Date.now() > Number(otp.expires_at || 0)) {
				await env.CACHE.delete(emailBindCodeKey(user.id)).catch(() => {});
				return jsonResponse({ error: '验证码已过期，请重新发送。' }, 400);
			}
			if (String(otp.code || '').trim() !== String(code).trim()) {
				return jsonResponse({ error: '验证码错误。' }, 400);
			}

			const newEmail = String(otp.email || '').trim().toLowerCase();
			if (!newEmail) return jsonResponse({ error: '未找到待绑定邮箱，请重新发送验证码。' }, 400);
			const exists = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(newEmail, user.id).first();
			if (exists) return jsonResponse({ error: 'Email already in use' }, 400);

			await db.prepare('UPDATE users SET email = ?, verified = 1, pending_email = NULL, email_change_code = NULL, email_change_code_expires = NULL WHERE id = ?')
				.bind(newEmail, user.id).run();
			await env.CACHE.delete(emailBindCodeKey(user.id)).catch(() => {});
			executionCtx.waitUntil(env.CACHE.delete(`user:${user.id}`).catch(() => {}));

			await security.logAudit(userPayload.id, 'VERIFY_EMAIL_CODE', 'user', String(userPayload.id), { new_email: newEmail }, request);
			return jsonResponse({ success: true, new_email: newEmail });
		} catch (e) {
			return handleError(e);
		}
	}

	return null;
}
