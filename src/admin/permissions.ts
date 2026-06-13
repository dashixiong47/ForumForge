import type { DBUser } from '../db/types';
import { parseJsonValue } from '../utils/json';
import type { UserPayload } from '../core/security';

export const ADMIN_PERMISSION_KEYS = [
	'dashboard',
	'posts',
	'comments',
	'moderation',
	'users',
	'permissions',
	'categories',
	'tags',
	'media',
	'plugins',
	'translations',
	'logs',
	'settings',
] as const;

export type AdminPermissionKey = typeof ADMIN_PERMISSION_KEYS[number];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, AdminPermissionKey[]> = {
	admin: [...ADMIN_PERMISSION_KEYS],
	manager: ['dashboard', 'posts', 'comments', 'moderation', 'users', 'permissions', 'categories', 'tags', 'media', 'translations', 'logs', 'settings'],
	moderator: ['dashboard', 'posts', 'comments', 'moderation', 'media'],
	user: [],
};

const ADMIN_PAGE_PERMISSIONS: Record<string, AdminPermissionKey> = {
	'/admin': 'dashboard',
	'/admin/posts': 'posts',
	'/admin/comments': 'comments',
	'/admin/moderation': 'moderation',
	'/admin/users': 'users',
	'/admin/permissions': 'permissions',
	'/admin/categories': 'categories',
	'/admin/tags': 'tags',
	'/admin/media': 'media',
	'/admin/plugins': 'plugins',
	'/admin/translations': 'translations',
	'/admin/i18n': 'translations',
	'/admin/logs': 'logs',
	'/admin/settings': 'settings',
};

const ADMIN_API_PERMISSIONS: Array<[RegExp, AdminPermissionKey]> = [
	[/^\/api\/admin\/stats$/, 'dashboard'],
	[/^\/api\/admin\/users(?:\/|$)/, 'users'],
	[/^\/api\/admin\/permissions(?:\/|$)/, 'permissions'],
	[/^\/api\/admin\/categories(?:\/|$)/, 'categories'],
	[/^\/api\/admin\/tags(?:\/|$)/, 'tags'],
	[/^\/api\/admin\/media(?:\/|$)/, 'media'],
	[/^\/api\/admin\/plugins(?:\/|$)/, 'plugins'],
	[/^\/api\/admin\/i18n(?:\/|$)/, 'translations'],
	[/^\/api\/admin\/logs(?:\/|$)/, 'logs'],
	[/^\/api\/admin\/settings$/, 'settings'],
	[/^\/api\/admin\/posts(?:\/|$)/, 'posts'],
	[/^\/api\/admin\/comments(?:\/|$)/, 'comments'],
	[/^\/api\/admin\/moderation(?:\/|$)/, 'moderation'],
	[/^\/api\/admin\/cleanup(?:\/|$)/, 'settings'],
];

export function normalizeRole(value: unknown): string {
	const role = String(value || 'user').trim().toLowerCase();
	return sanitizeRole(role) || 'user';
}

export function sanitizeRole(value: unknown): string {
	const role = String(value || '').trim().toLowerCase();
	if (!role) return '';
	return /^[a-z][a-z0-9_-]{1,31}$/.test(role) ? role : '';
}

export function isBuiltinRole(role: string): boolean {
	return ['admin', 'user'].includes(role);
}

export function normalizePermissions(value: unknown): AdminPermissionKey[] {
	const raw = Array.isArray(value) ? value : parseJsonValue<unknown[]>(value, []);
	const set = new Set<AdminPermissionKey>();
	for (const item of raw || []) {
		const key = String(item || '').trim() as AdminPermissionKey;
		if (ADMIN_PERMISSION_KEYS.includes(key)) set.add(key);
	}
	return [...set];
}

export function permissionsForUser(user: Pick<DBUser | UserPayload, 'role'> & { permissions?: unknown }): AdminPermissionKey[] {
	const role = normalizeRole(user.role);
	if (role === 'admin') return [...ADMIN_PERMISSION_KEYS];
	const explicit = normalizePermissions(user.permissions);
	if (explicit.length || user.permissions !== undefined) return explicit;
	return [...(ROLE_DEFAULT_PERMISSIONS[role] || [])];
}

export function canAdmin(user: Pick<DBUser | UserPayload, 'role'> & { permissions?: unknown }, permission: AdminPermissionKey): boolean {
	return permissionsForUser(user).includes(permission);
}

export function adminPermissionForPath(pathname: string): AdminPermissionKey {
	if (pathname.match(/^\/admin\/plugins\/[^/]+\/editor$/)) return 'plugins';
	return ADMIN_PAGE_PERMISSIONS[pathname] || 'dashboard';
}

export function adminPermissionForApiPath(pathname: string): AdminPermissionKey {
	return (ADMIN_API_PERMISSIONS.find(([pattern]) => pattern.test(pathname)) || [null, 'dashboard'])[1] as AdminPermissionKey;
}

export function defaultRoleRows() {
	return Object.entries(ROLE_DEFAULT_PERMISSIONS).map(([role, permissions]) => ({ role, permissions }));
}
