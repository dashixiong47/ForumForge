import type { Security, UserPayload } from '../core/security';
import type { DBCount, DBSetting, DBUser, DBUserEmail } from '../db/types';
import { isBuiltinRole, normalizePermissions, sanitizeRole } from '../admin/permissions';
import { hashPassword, generateToken } from '../core/password';
import { hasControlCharacters, hasInvisibleCharacters, hasRestrictedKeywords, isVisuallyEmpty } from '../core/validation';
import { sendEmail } from '../integrations/smtp';
import { deleteImage, type S3Env } from '../integrations/s3';
import { extractImageUrls } from '../utils/media';
import { generateIdenticon } from '../utils/identicon';
import type { JsonResponse } from './types';

export type AdminUsersApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	executionCtx: ExecutionContext;
	security: Security;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	apiAdminUser: UserPayload | null;
	authenticateAdminForPath: () => Promise<UserPayload>;
	getBaseUrl: () => string;
};

export async function handleAdminUsersApi(ctx: AdminUsersApiContext): Promise<Response | null> {
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
		apiAdminUser,
		authenticateAdminForPath,
		getBaseUrl,
	} = ctx;
	const adminUser = () => apiAdminUser || authenticateAdminForPath();

	if (url.pathname.match(/^\/api\/admin\/users\/\d+\/update$/) && method === 'POST') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = await adminUser();
			const body = await request.json() as any;
			const { password, email, username, avatar_url, role, verified } = body;

			if (password && (password.length < 8 || password.length > 64)) return jsonResponse({ error: 'Password must be 8-64 characters' }, 400);

			if (password) {
				const hash = await hashPassword(password);
				await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hash, id).run();
			}
			if (email) {
				if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
				await db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, id).run();
			}
			if (role !== undefined) {
				const nextRole = sanitizeRole(role);
				if (!nextRole) return jsonResponse({ error: 'Invalid role' }, 400);
				const roleRow = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(nextRole).first<{ role: string }>();
				if (!roleRow) return jsonResponse({ error: 'Role not found' }, 400);
				const target = await db.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<DBUser>();
				if (!target) return jsonResponse({ error: 'User not found' }, 404);
				if (target.role === 'admin' && nextRole !== 'admin') {
					const adminCount = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first<DBCount>();
					if ((adminCount?.count || 0) <= 1) return jsonResponse({ error: 'At least one administrator is required' }, 400);
				}
				await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(nextRole, id).run();
			}
			if (verified !== undefined) {
				await db.prepare('UPDATE users SET verified = ?, verification_token = CASE WHEN ? = 1 THEN NULL ELSE verification_token END WHERE id = ?').bind(verified ? 1 : 0, verified ? 1 : 0, id).run();
			}
			if (avatar_url !== undefined) {
				if (!avatar_url) {
					const identicon = await generateIdenticon(String(id));
					await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(identicon, id).run();
				} else {
					if (avatar_url.length > 500) return jsonResponse({ error: 'Avatar URL too long (Max 500 chars)' }, 400);
					if (!/^https?:\/\//i.test(avatar_url) && !avatar_url.startsWith('data:image/svg+xml')) return jsonResponse({ error: 'Invalid Avatar URL' }, 400);
					await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatar_url, id).run();
				}

				const notifyAvatar = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_avatar_change'").first<DBSetting>();
				if (notifyAvatar && notifyAvatar.value === '1') {
					const user = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{email:string;username:string}>();
					if (user) {
						const emailHtml = `
							<h1>头像已更新</h1>
							<p>您的头像已被管理员更新。</p>
						`;
						executionCtx.waitUntil(sendEmail(user.email, '您的头像已更新', emailHtml, env).catch(console.error));
					}
				}
			}
			if (username) {
				if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
				if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
				if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
				if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);

				await db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, id).run();

				const notifyUsername = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_username_change'").first<DBSetting>();
				if (notifyUsername && notifyUsername.value === '1') {
					const user = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{email:string;username:string}>();
					if (user) {
						const emailHtml = `
							<h1>用户名已修改</h1>
							<p>您的用户名已被管理员修改为 <strong>${username}</strong>。</p>
							<p>如有疑问，请联系管理员。</p>
						`;
						executionCtx.waitUntil(sendEmail(user.email, '您的用户名已修改', emailHtml, env).catch(console.error));
					}
				}
			}

			await security.logAudit(userPayload.id, 'ADMIN_UPDATE_USER', 'user', id, { username, email, avatar_url, role, verified, passwordChanged: !!password }, request);
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/permissions' && method === 'POST') {
		try {
			const userPayload = await adminUser();
			const body = await request.json() as any;
			const role = sanitizeRole(body.role);
			if (!role) return jsonResponse({ error: 'Invalid role' }, 400);
			const exists = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(role).first<{ role: string }>();
			if (exists) return jsonResponse({ error: 'Role already exists' }, 409);
			const permissions = normalizePermissions(body.permissions || []);
			await db.prepare(
				`INSERT INTO role_permissions (role, permissions, updated_at)
				 VALUES (?, ?, CURRENT_TIMESTAMP)`
			).bind(role, JSON.stringify(permissions)).run();
			await security.logAudit(userPayload.id, 'CREATE_ROLE', 'role', role, { permissions }, request);
			return jsonResponse({ success: true, role, permissions }, 201);
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/permissions\/[^/]+$/) && method === 'PUT') {
		const role = sanitizeRole(decodeURIComponent(url.pathname.split('/').pop() || ''));
		try {
			const userPayload = await adminUser();
			if (!role) return jsonResponse({ error: 'Invalid role' }, 400);
			if (role === 'admin') return jsonResponse({ error: 'Admin role is locked' }, 400);
			const exists = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(role).first<{ role: string }>();
			if (!exists) return jsonResponse({ error: 'Role not found' }, 404);
			const body = await request.json() as any;
			const permissions = normalizePermissions(body.permissions);
			await db.prepare(
				`INSERT INTO role_permissions (role, permissions, updated_at)
				 VALUES (?, ?, CURRENT_TIMESTAMP)
				 ON CONFLICT(role) DO UPDATE SET
				   permissions = excluded.permissions,
				   updated_at = CURRENT_TIMESTAMP`
			).bind(role, JSON.stringify(permissions)).run();
			await security.logAudit(userPayload.id, 'UPDATE_ROLE_PERMISSIONS', 'role', role, { permissions }, request);
			return jsonResponse({ success: true, role, permissions });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/permissions\/[^/]+$/) && method === 'DELETE') {
		const role = sanitizeRole(decodeURIComponent(url.pathname.split('/').pop() || ''));
		try {
			const userPayload = await adminUser();
			if (!role) return jsonResponse({ error: 'Invalid role' }, 400);
			if (isBuiltinRole(role)) return jsonResponse({ error: 'Built-in roles cannot be deleted' }, 400);
			const countRow = await db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').bind(role).first<DBCount>();
			if ((countRow?.count || 0) > 0) return jsonResponse({ error: 'Role still has users' }, 400);
			await db.prepare('DELETE FROM role_permissions WHERE role = ?').bind(role).run();
			await security.logAudit(userPayload.id, 'DELETE_ROLE', 'role', role, {}, request);
			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/stats' && method === 'GET') {
		try {
			await adminUser();
			const [userCount, postCount, commentCount, topPosts, catStats, newUsers] = await Promise.all([
				db.prepare('SELECT COUNT(*) as count FROM users').first<number>('count'),
				db.prepare('SELECT COUNT(*) as count FROM posts').first<number>('count'),
				db.prepare('SELECT COUNT(*) as count FROM comments').first<number>('count'),
				db.prepare('SELECT p.id, p.title, p.view_count, u.username as author_name FROM posts p LEFT JOIN users u ON p.author_id = u.id ORDER BY p.view_count DESC LIMIT 10').all(),
				db.prepare('SELECT c.id, c.name, COUNT(p.id) as post_count FROM categories c LEFT JOIN posts p ON p.category_id = c.id GROUP BY c.id ORDER BY post_count DESC').all(),
				db.prepare('SELECT id, username, created_at, avatar_url FROM users ORDER BY created_at DESC LIMIT 5').all()
			]);

			return jsonResponse({
				users: userCount,
				posts: postCount,
				comments: commentCount,
				top_posts: topPosts.results || [],
				category_stats: catStats.results || [],
				newest_users: newUsers.results || []
			});
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/users' && method === 'GET') {
		try {
			await adminUser();
			const { results } = await db.prepare('SELECT id, email, username, role, permissions, verified, created_at, avatar_url FROM users ORDER BY created_at DESC').all();
			return jsonResponse(results);
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/admin/users' && method === 'POST') {
		try {
			const userPayload = await adminUser();
			const body = await request.json() as any;
			const email = String(body.email || '').trim().toLowerCase();
			const username = String(body.username || '').trim();
			const password = String(body.password || '');
			const role = sanitizeRole(body.role || 'user') || 'user';
			const verified = body.verified ? 1 : 0;

			if (!email || !username || !password) return jsonResponse({ error: 'Missing email, username or password' }, 400);
			if (email.length > 50) return jsonResponse({ error: 'Email too long (Max 50 chars)' }, 400);
			if (username.length > 20) return jsonResponse({ error: 'Username too long (Max 20 chars)' }, 400);
			if (isVisuallyEmpty(username)) return jsonResponse({ error: 'Username cannot be empty' }, 400);
			if (hasInvisibleCharacters(username)) return jsonResponse({ error: 'Username contains invalid invisible characters' }, 400);
			if (hasControlCharacters(username)) return jsonResponse({ error: 'Username contains invalid control characters' }, 400);
			if (hasRestrictedKeywords(username)) return jsonResponse({ error: 'Username contains restricted keywords' }, 400);
			if (password.length < 8 || password.length > 64) return jsonResponse({ error: 'Password must be 8-64 characters' }, 400);
			const roleRow = await db.prepare('SELECT role FROM role_permissions WHERE role = ?').bind(role).first<{ role: string }>();
			if (!roleRow) return jsonResponse({ error: 'Role not found' }, 400);

			const existing = await db.prepare('SELECT email, username FROM users WHERE email = ? OR username = ?').bind(email, username).first<DBUserEmail & { username: string }>();
			if (existing) {
				if (existing.email === email) return jsonResponse({ error: 'Email already exists' }, 409);
				return jsonResponse({ error: 'Username already taken' }, 409);
			}

			const passwordHash = await hashPassword(password);
			const token = verified ? null : generateToken();
			const result = await db.prepare(
				'INSERT INTO users (email, username, password, role, permissions, verified, verification_token, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			).bind(email, username, passwordHash, role, JSON.stringify([]), verified, token, username).run();
			const newUserId = result.meta?.last_row_id;
			if (newUserId) {
				const identicon = await generateIdenticon(String(newUserId));
				await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(identicon, newUserId).run();
			}

			await security.logAudit(userPayload.id, 'ADMIN_CREATE_USER', 'user', String(newUserId || email), { email, username, role, verified }, request);
			return jsonResponse({ success: true, id: newUserId }, 201);
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/users\/\d+\/verify$/) && method === 'POST') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = await adminUser();
			const { success } = await db.prepare('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?').bind(id).run();
			await security.logAudit(userPayload.id, 'MANUAL_VERIFY_USER', 'user', id, {}, request);

			const setting = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_manual_verify'").first<DBSetting>();
			if (setting && setting.value === '1') {
				const user = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{email:string;username:string}>();
				if (!user) throw new Error('User unexpectedly missing');
				const emailHtml = `
					<h1>账户已验证</h1>
					<p>您的账户 (用户名: <strong>${user.username}</strong>) 已通过管理员手动验证。</p>
					<p>您现在可以登录并使用所有功能。</p>
				`;
				executionCtx.waitUntil(sendEmail(user.email as string, '您的账户已通过验证', emailHtml, env).catch(console.error));
			}

			return jsonResponse({ success });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.match(/^\/api\/admin\/users\/\d+\/resend$/) && method === 'POST') {
		const id = url.pathname.split('/')[4];
		try {
			const userPayload = await adminUser();
			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DBUser>();
			if (!user) return jsonResponse({ error: 'User not found' }, 404);
			if (user.verified) return jsonResponse({ error: 'User already verified' }, 400);

			let token = user.verification_token;
			if (!token) {
				token = generateToken();
				await db.prepare('UPDATE users SET verification_token = ? WHERE id = ?').bind(token, id).run();
			}

			const verifyLink = `${getBaseUrl()}/api/verify?token=${token}`;
			const emailHtml = `
				<h1>欢迎加入论坛，${user.username}！</h1>
				<p>请点击下方链接验证您的邮箱地址：</p>
				<a href="${verifyLink}">验证邮箱</a>
				<p>如果您未请求此操作，请忽略此邮件。</p>
			`;

			executionCtx.waitUntil(sendEmail(user.email, '请验证您的邮箱', emailHtml, env).catch(err => console.error('[Background Email Error]', err)));
			await security.logAudit(userPayload.id, 'RESEND_VERIFY_EMAIL', 'user', id, {}, request);
			return jsonResponse({ success: true, message: '验证邮件已发送' });
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
		const id = url.pathname.split('/').pop();
		try {
			const userPayload = await adminUser();
			const user = await db.prepare('SELECT avatar_url FROM users WHERE id = ?').bind(id).first<{avatar_url?: string}>();
			const posts = await db.prepare('SELECT content FROM posts WHERE author_id = ?').bind(id).all();

			const deletionPromises: Promise<any>[] = [];
			if (user && user.avatar_url) {
				deletionPromises.push(deleteImage(env as unknown as S3Env, user.avatar_url, id));
			}
			if (posts.results) {
				for (const post of posts.results) {
					const imageUrls = extractImageUrls(post.content as string);
					imageUrls.forEach(url => deletionPromises.push(deleteImage(env as unknown as S3Env, url, id)));
				}
			}
			if (deletionPromises.length > 0) {
				executionCtx.waitUntil(Promise.all(deletionPromises).catch(err => console.error('Failed to delete user images', err)));
			}

			await db.prepare('DELETE FROM likes WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(id).run();
			await db.prepare('UPDATE user_progress_logs SET post_id = NULL, comment_id = NULL WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?) OR comment_id IN (SELECT id FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?))').bind(id, id).run();
			await db.prepare('DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(id).run();
			await db.prepare('DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)').bind(id).run();
			await db.prepare('DELETE FROM likes WHERE user_id = ?').bind(id).run();
			await db.prepare('DELETE FROM user_progress_logs WHERE user_id = ?').bind(id).run();
			await db.prepare('UPDATE user_progress_logs SET comment_id = NULL WHERE comment_id IN (SELECT id FROM comments WHERE author_id = ?)').bind(id).run();
			await db.prepare('DELETE FROM comments WHERE author_id = ?').bind(id).run();
			await db.prepare('DELETE FROM posts WHERE author_id = ?').bind(id).run();

			const userToDelete = await db.prepare('SELECT email, username FROM users WHERE id = ?').bind(id).first<{ email: string; username: string }>();
			await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
			await security.logAudit(userPayload.id, 'ADMIN_DELETE_USER', 'user', String(id), {}, request);

			if (userToDelete) {
				const setting = await db.prepare("SELECT value FROM settings WHERE key = 'notify_on_user_delete'").first<DBSetting>();
				if (setting && setting.value === '1') {
					const emailHtml = `
						<h1>账户已删除</h1>
						<p>您的账户 (用户名: <strong>${userToDelete.username}</strong>) 已被管理员删除。</p>
						<p>如果您认为这是误操作，请联系管理员。</p>
					`;
					executionCtx.waitUntil(sendEmail(userToDelete.email, '您的账户已被删除', emailHtml, env).catch(console.error));
				}
			}

			return jsonResponse({ success: true });
		} catch (e) {
			return handleError(e);
		}
	}

	return null;
}
