import type { UserPayload } from '../../core/security';
import { publicPostPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { escapeHtml, jsonScript } from '../../utils/html';
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from '../ui';
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from '../localization';

export type AdminNavKey = 'dashboard' | 'posts' | 'comments' | 'moderation' | 'users' | 'permissions' | 'categories' | 'tags' | 'media' | 'plugins' | 'badges' | 'translations' | 'logs' | 'settings';

export type AdminLayoutOptions = {
	title: string;
	titleKey?: string;
	subtitle?: string;
	subtitleKey?: string;
	active: AdminNavKey;
	user: UserPayload;
	content: string;
	head?: string;
	script?: string;
};

export const ACE = 'https://cdn.bootcdn.net/ajax/libs/ace/1.32.6';
export const DEFAULT_THEME = 'one_dark';
export const ACE_THEMES = [
	'one_dark', 'monokai', 'github_dark', 'nord_dark', 'dracula', 'tomorrow_night_blue',
	'tomorrow_night', 'tomorrow_night_bright', 'tomorrow', 'solarized_dark',
	'solarized_light', 'gruvbox_dark_hard', 'gruvbox_light_hard', 'chrome', 'xcode'
];

export const FAVICON_LINKS = `<link rel="icon" type="image/svg+xml" href="${escapeHtml(FORUMFORGE_ICON_DATA_URL).replace(/"/g, '&quot;')}">
<link rel="shortcut icon" href="${escapeHtml(FORUMFORGE_ICON_DATA_URL).replace(/"/g, '&quot;')}">`;

export const navItems: Array<{ key: AdminNavKey; href: string; label: string; i18n: string; icon: string }> = [
	{ key: 'dashboard', href: '/admin', label: '仪表盘', i18n: 'admin.dashboard', icon: 'chart' },
	{ key: 'posts', href: '/admin/posts', label: '帖子管理', i18n: 'admin.posts', icon: 'post' },
	{ key: 'comments', href: '/admin/comments', label: '评论管理', i18n: 'admin.comments', icon: 'comment' },
	{ key: 'moderation', href: '/admin/moderation', label: '审核管理', i18n: 'admin.moderation.title', icon: 'shield' },
	{ key: 'users', href: '/admin/users', label: '用户管理', i18n: 'admin.users', icon: 'users' },
	{ key: 'permissions', href: '/admin/permissions', label: '权限管理', i18n: 'admin.permissions.title', icon: 'shield' },
	{ key: 'categories', href: '/admin/categories', label: '分类管理', i18n: 'admin.categories', icon: 'folder' },
	{ key: 'tags', href: '/admin/tags', label: '标签管理', i18n: 'admin.tags', icon: 'tag' },
	{ key: 'media', href: '/admin/media', label: '媒体管理', i18n: 'admin.media.title', icon: 'media' },
	{ key: 'plugins', href: '/admin/plugins', label: '插件管理', i18n: 'admin.plugins.title', icon: 'plugin' },
	{ key: 'badges', href: '/admin/badges', label: '勋章管理', i18n: 'admin.badges.title', icon: 'award' },
	{ key: 'translations', href: '/admin/translations', label: '翻译管理', i18n: 'admin.i18n.title', icon: 'globe' },
	{ key: 'logs', href: '/admin/logs', label: '日志管理', i18n: 'admin.logs.title', icon: 'log' },
	{ key: 'settings', href: '/admin/settings', label: '站点设置', i18n: 'admin.settings', icon: 'settings' },
];

export const adminPermissionOptions = [
	{ key: 'dashboard', label: '仪表盘', i18n: 'admin.dashboard' },
	{ key: 'posts', label: '帖子管理', i18n: 'admin.posts' },
	{ key: 'comments', label: '评论管理', i18n: 'admin.comments' },
	{ key: 'moderation', label: '审核管理', i18n: 'admin.moderation.title' },
	{ key: 'users', label: '用户管理', i18n: 'admin.users' },
	{ key: 'permissions', label: '权限管理', i18n: 'admin.permissions.title' },
	{ key: 'categories', label: '分类管理', i18n: 'admin.categories' },
	{ key: 'tags', label: '标签管理', i18n: 'admin.tags' },
	{ key: 'media', label: '媒体管理', i18n: 'admin.media.title' },
	{ key: 'plugins', label: '插件管理', i18n: 'admin.plugins.title' },
	{ key: 'badges', label: '勋章管理', i18n: 'admin.badges.title' },
	{ key: 'translations', label: '翻译管理', i18n: 'admin.i18n.title' },
	{ key: 'logs', label: '日志管理', i18n: 'admin.logs.title' },
	{ key: 'settings', label: '站点设置', i18n: 'admin.settings' },
];

export function parsePermissionList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === 'string' && value.trim()) {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed.map(String) : [];
		} catch {
			return [];
		}
	}
	return [];
}

export function adminUserPermissions(user: UserPayload): string[] {
	if (user.role === 'admin') return adminPermissionOptions.map((item) => item.key);
	return parsePermissionList((user as any).permissions);
}

export function canSeeAdminNav(user: UserPayload, key: AdminNavKey): boolean {
	return user.role === 'admin' || adminUserPermissions(user).includes(key);
}

export function parseJson(value: unknown, fallback: unknown): unknown {
	if (value === null || value === undefined || value === '') return fallback;
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

export function adminHtmlResponse(html: string, status = 200, headers?: HeadersInit): Response {
	return new Response(html, {
		status,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			...(headers || {}),
		},
	});
}

export function renderAdminLayout(options: AdminLayoutOptions): string {
	const visibleNav = navItems.filter((item) => canSeeAdminNav(options.user, item.key));
	const nav = visibleNav.map((item) => {
		const active = item.key === options.active ? ' active' : '';
		return `<a class="nav-item${active}" href="${item.href}">${icon(item.icon)}<span data-i18n="${item.i18n}">${item.label}</span></a>`;
	}).join('');
	const initial = escapeHtml(options.user.email.slice(0, 1).toUpperCase());
	const subtitle = options.subtitle ? `<p${options.subtitleKey ? ` data-i18n="${escapeHtml(options.subtitleKey)}"` : ''}>${escapeHtml(options.subtitle)}</p>` : '';
	const titleAttr = options.titleKey ? ` data-i18n="${escapeHtml(options.titleKey)}"` : '';
	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(options.title)} - ForumForge</title>
	${FAVICON_LINKS}
	${options.head || ''}
	<style>
:root{color-scheme:dark;--bg:#0d1117;--surface:#161b22;--surface2:#0f141c;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--danger:#f85149;--ok:#3fb950;--warn:#d2991d;--radius:8px;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;--mono:"Cascadia Code","Consolas",monospace;--z-base:0;--z-header:1000;--z-dropdown:1100;--z-modal:2000;--z-toast:2200}
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:rgba(88,166,255,.48) rgba(15,23,36,.78)}*::-webkit-scrollbar{width:10px;height:10px}*::-webkit-scrollbar-track{background:rgba(15,23,36,.78);border-radius:999px}*::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(88,166,255,.68),rgba(96,120,150,.42));border:2px solid rgba(15,23,36,.9);border-radius:999px}*::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,rgba(88,166,255,.92),rgba(139,148,158,.58))}html,body{height:100%;margin:0}body{font-family:var(--font);font-size:14px;color:var(--text);background:var(--bg);overflow:hidden}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer}
.shell{height:100vh;display:grid;grid-template-columns:224px minmax(0,1fr);min-width:0}.sidebar{position:relative;z-index:var(--z-header);min-height:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column}.brand{height:48px;display:flex;align-items:center;gap:9px;padding:0 12px;border-bottom:1px solid var(--border);font-weight:800}.brand-mark{width:22px;height:22px;border:1px solid var(--border);border-radius:6px;display:grid;place-items:center;color:var(--accent);font-size:12px}.nav-title{padding:14px 12px 7px;color:var(--muted);font-size:12px;font-weight:700}.nav{display:grid;gap:3px;padding:0 8px}.nav-item{display:flex;align-items:center;gap:9px;border-radius:7px;padding:8px 9px;color:#c9d1d9;transition:.12s}.nav-item:hover,.nav-item.active{background:#21262d;color:#fff}
.main{position:relative;z-index:var(--z-base);min-width:0;min-height:0;display:flex;flex-direction:column}.topbar{position:relative;z-index:var(--z-header);isolation:isolate;height:48px;flex:0 0 auto;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:0 14px}.topbar-title{font-weight:750;color:#fff}.topbar-spacer{flex:1}.lang-picker{position:relative;z-index:var(--z-dropdown)}.lang-btn{height:32px;display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:999px;background:#0d1320;color:var(--text);padding:0 10px;font-size:12px;font-weight:750;cursor:pointer}.lang-btn:hover{border-color:var(--accent);background:#111b2a}.lang-btn>svg{opacity:.55}.lang-flag{display:inline-grid;place-items:center;width:22px;height:22px;font-size:15px;line-height:1}.lang-flag svg{width:20px;height:14px;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}.lang-menu{position:absolute;right:0;top:calc(100% + 7px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:0 22px 70px rgba(0,0,0,.55);display:none;max-height:360px;overflow:auto;z-index:var(--z-dropdown)}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border-radius:8px;cursor:pointer;color:#d8dee9}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.1);color:var(--accent)}.lang-menu li small{color:var(--muted);font-size:11px}.user-pop{position:relative;z-index:var(--z-dropdown)}.user-trigger{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:999px;background:rgba(255,255,255,.02);padding:4px 10px;color:#d8dee9}.avatar{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#1f2937;color:#c9d1d9;font-weight:700}.user-panel{position:absolute;right:0;top:calc(100% + 8px);width:248px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.45);padding:12px;display:none;z-index:var(--z-dropdown)}.user-pop:hover .user-panel,.user-pop:focus-within .user-panel{display:block}.user-card{display:grid;grid-template-columns:42px 1fr;gap:4px 10px;padding:8px 6px 12px;border-bottom:1px solid var(--border);margin-bottom:8px}.user-card .avatar{grid-row:1/4;width:42px;height:42px}.user-card strong{font-size:14px}.user-card small{color:var(--muted)}.user-panel a{display:flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:8px;padding:7px 8px;margin-top:7px}.user-panel a:hover{border-color:var(--accent);color:var(--accent)}
.content{position:relative;z-index:var(--z-base);min-height:0;flex:1;overflow:hidden;padding:16px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px}.content-body{min-height:0;overflow:auto}.content-body:has(.admin-workbench){overflow:hidden}.page-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;min-height:0;flex-wrap:wrap}.page-hd h1{margin:0 0 4px;font-size:22px;line-height:1.15}.page-hd p{margin:0;color:var(--muted);font-size:13px}.page-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.grid{display:grid;gap:12px}.grid.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.admin-workbench{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px}.admin-toolbar{position:relative;z-index:40;border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.045),rgba(22,27,34,.92));padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:nowrap;overflow:visible;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.admin-toolbar .input,.admin-toolbar .select,.admin-toolbar input,.admin-toolbar select{height:36px;max-width:260px;flex:0 0 auto}.admin-toolbar .btn{height:36px;flex:0 0 auto}.admin-table-shell{min-height:0;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr) auto}.admin-table-scroll{min-height:0;overflow:auto}.admin-table-scroll .table{min-width:1080px;table-layout:fixed}.admin-table-scroll .table th{position:sticky;top:0;background:#111821;z-index:2}.admin-table-scroll .table tbody tr{height:56px}.admin-table-scroll .table tbody tr:hover{background:rgba(88,166,255,.04)}.admin-footer{border-top:1px solid var(--border);padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);background:rgba(13,19,32,.72)}.admin-row-actions{display:flex;justify-content:flex-end;gap:6px;flex-wrap:nowrap;min-width:220px}.admin-check{width:38px!important;min-width:38px!important;max-width:38px!important;text-align:center;padding-left:8px!important;padding-right:8px!important}.admin-check input[type="checkbox"]{margin:0}.admin-title-cell{width:34%;min-width:300px}.admin-title-cell a{font-weight:800;color:#e6edf3}.admin-title-cell p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}.admin-cell-main{font-weight:800;color:#e6edf3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.admin-cell-sub{margin-top:4px;color:var(--muted);font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}.posts-table th:nth-child(1),.posts-table td:nth-child(1),.comments-table th:nth-child(1),.comments-table td:nth-child(1),.moderation-table th:nth-child(1),.moderation-table td:nth-child(1){width:38px}.posts-table th:nth-child(2),.posts-table td:nth-child(2){width:36%}.posts-table th:nth-child(3),.posts-table td:nth-child(3){width:150px}.posts-table th:nth-child(4),.posts-table td:nth-child(4){width:170px}.posts-table th:nth-child(5),.posts-table td:nth-child(5){width:90px}.posts-table th:nth-child(6),.posts-table td:nth-child(6){width:78px}.posts-table th:nth-child(7),.posts-table td:nth-child(7){width:130px}.posts-table th:nth-child(8),.posts-table td:nth-child(8){width:250px}.users-table th:nth-child(1),.users-table td:nth-child(1){width:58px}.users-table th:nth-child(2),.users-table td:nth-child(2){width:210px}.users-table th:nth-child(3),.users-table td:nth-child(3){width:230px}.users-table th:nth-child(4),.users-table td:nth-child(4){width:120px}.users-table th:nth-child(5),.users-table td:nth-child(5){width:105px}.users-table th:nth-child(6),.users-table td:nth-child(6){width:110px}.users-table th:nth-child(7),.users-table td:nth-child(7){width:160px}.users-table th:nth-child(8),.users-table td:nth-child(8){width:250px}.comments-table th:nth-child(2),.comments-table td:nth-child(2){width:70px}.comments-table th:nth-child(3),.comments-table td:nth-child(3){width:42%}.comments-table th:nth-child(4),.comments-table td:nth-child(4){width:180px}.comments-table th:nth-child(5),.comments-table td:nth-child(5){width:28%}.comments-table th:nth-child(6),.comments-table td:nth-child(6){width:200px}.moderation-table th:nth-child(2),.moderation-table td:nth-child(2){width:78px}.moderation-table th:nth-child(5),.moderation-table td:nth-child(5){width:100px}.moderation-table th:nth-child(6),.moderation-table td:nth-child(6){width:230px}.admin-filter-tabs{display:flex;gap:6px}.admin-filter-tabs a{border:1px solid var(--border);border-radius:999px;padding:6px 10px;color:var(--muted);font-size:12px}.admin-filter-tabs a.active,.admin-filter-tabs a:hover{border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.1);color:#fff}.drawer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.drawer-grid .field.wide{grid-column:1/-1}.compact-textarea{height:42px;min-height:42px;resize:vertical}.compact-textarea:focus{height:82px;min-height:82px}.avatar-sm{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#1f2937;color:#c9d1d9;font-weight:800;overflow:hidden}.avatar-sm img{width:100%;height:100%;object-fit:cover}.admin-user-cell{display:flex;align-items:center;gap:9px;min-width:0}.admin-user-cell strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.admin-user-cell small{color:var(--muted)}
.metric-card{border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.075),rgba(13,19,32,.86));padding:14px;min-height:92px;display:grid;align-content:center;gap:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.metric-card span{font-size:12px;color:var(--muted);font-weight:800}.metric-card strong{font-size:28px;line-height:1;color:#fff}.mini-table-panel{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr)}.mini-table{min-width:0!important;table-layout:auto!important}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px}.card h2,.card h3{margin:0 0 12px}.muted{color:var(--muted)}.stat{font-size:28px;font-weight:780}.table{width:100%;border-collapse:collapse}.table th,.table td{border-bottom:1px solid var(--border);padding:9px;text-align:left;vertical-align:top}.table th{font-size:12px;color:#a8b8cc}.table tr:last-child td{border-bottom:0}
.btn{padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;text-decoration:none;background:transparent;color:var(--text)}.btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.05)}.btn:disabled,.btn[data-loading="1"]{cursor:wait;opacity:.72;pointer-events:none}.spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.22);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}.btn-primary:hover{opacity:.86;color:#fff}.btn-danger{background:var(--danger);color:#fff;border-color:var(--danger)}.btn-danger:hover{opacity:.86;color:#fff}.btn-ok{background:var(--ok);color:#fff;border-color:var(--ok)}.btn-ok:hover{opacity:.86;color:#fff}.btn-outline{background:transparent}.btn-sm{padding:4px 9px;font-size:12px}.btn.is-disabled,.is-disabled{pointer-events:none;opacity:.45}.icon-btn{width:32px;height:32px;padding:0}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar-right{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.toolbar-divider{width:1px;height:24px;background:var(--border);flex:0 0 auto}.actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}.ml-auto{margin-left:auto}.mt-12{margin-top:12px}.mb-12{margin-bottom:12px}.hidden-file{display:none}.danger-link{color:var(--danger)!important}.wide-input{max-width:260px}.flex-fill{flex:1}.inline-field{display:flex;gap:8px;align-items:center}.muted-inline{color:var(--muted)}.spacer{flex:1}.badge{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;padding:2px 7px;color:#b9c8da;background:#0d1728;font-size:12px}.badge-ok{border-color:#14532d;color:#86efac}.badge-info{border-color:rgba(88,166,255,.42);color:#9ed0ff;background:rgba(88,166,255,.08)}.badge-off{border-color:#334155;color:#94a3b8}.pager{display:flex;align-items:center;justify-content:flex-end;gap:10px;color:var(--muted);flex-wrap:nowrap}.pager-size{display:inline-flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap}.pager-size select{width:72px!important;min-height:30px!important;height:30px!important;padding:4px 24px 4px 8px!important;font-size:12px}.form-card{border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.04),rgba(22,27,34,.92));overflow:hidden}.form-card-hd{padding:12px 14px;border-bottom:1px solid var(--border)}.form-card-hd h2{margin:0;font-size:16px}.form-card-hd p{margin:4px 0 0;color:var(--muted);font-size:12px}.form-card-body{padding:14px;display:grid;gap:12px}
.field{display:grid;gap:6px}.field label{color:var(--muted);font-weight:750;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.field-hint{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.input,.textarea,.select,input:not([type]),input[type="text"],input[type="email"],input[type="password"],input[type="number"],input[type="search"],select,textarea{width:100%;min-height:36px;border:1px solid var(--border);border-radius:var(--radius);background:#0b1017;color:var(--text);padding:8px 10px;outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.02);transition:border-color .14s,background-color .14s,box-shadow .14s}.input:hover,.textarea:hover,input:not([type]):hover,input[type="text"]:hover,input[type="email"]:hover,input[type="password"]:hover,input[type="number"]:hover,input[type="search"]:hover,textarea:hover{border-color:#3a4656;background-color:#0d141d}.input:focus,.textarea:focus,input:not([type]):focus,input[type="text"]:focus,input[type="email"]:focus,input[type="password"]:focus,input[type="number"]:focus,input[type="search"]:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.12)}select,.select{appearance:none;-webkit-appearance:none;padding-right:34px;background-color:#0b1017;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%239fb4cc' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px}select:hover,.select:hover{border-color:#3a4656;background-color:#0d141d;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%23c9d8ea' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px}select:focus,.select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.12);background-color:#0d141d;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%2358a6ff' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px}.textarea,textarea{min-height:120px;resize:vertical;font-family:var(--mono);font-size:13px;line-height:1.5}.textarea-tall{min-height:220px}.table .input,.table .select,.table input:not([type]),.table input[type="text"],.table input[type="email"],.table input[type="password"],.table input[type="number"],.table input[type="search"],.table select{min-height:32px;padding:5px 30px 5px 9px;font-size:12px}.table .compact-textarea{height:38px;min-height:38px;max-height:96px;font-family:var(--font);line-height:1.4;resize:vertical}.table .compact-textarea:focus{height:78px;min-height:78px}.notice{border:1px dashed var(--border);border-radius:10px;padding:22px;color:var(--muted);background:var(--surface2)}
.admin-panel{border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden}.admin-panel-hd{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px}.admin-panel-hd h2{font-size:16px;margin:0}.admin-panel-hd p{margin:3px 0 0;color:var(--muted);font-size:12px}.admin-panel-body{padding:14px;display:grid;gap:12px}.toggle-row{min-height:36px;border:1px solid var(--border);border-radius:10px;background:#0d141d;display:flex;align-items:center;gap:10px;padding:7px 10px;color:#d7dee9;transition:.14s}.toggle-row:hover{border-color:rgba(88,166,255,.35);background:rgba(88,166,255,.055)}input[type="checkbox"]{accent-color:var(--accent)}.toggle-row input[type="checkbox"],.table input[type="checkbox"],.badge input[type="checkbox"]{width:15px;height:15px;min-height:0;flex:0 0 auto}.admin-switch{min-height:42px;border:1px solid var(--border);border-radius:12px;background:#0d141d;display:flex;align-items:center;gap:10px;padding:8px 10px;color:#d7dee9;transition:.14s}.admin-switch:hover{border-color:rgba(88,166,255,.35);background:rgba(88,166,255,.055)}.admin-switch input,.media-switch input,.toggle input{position:absolute;opacity:0;pointer-events:none}.switch-track,.toggle span{position:relative;width:34px;height:20px;border-radius:999px;background:#30363d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03);transition:.16s;flex:0 0 auto;display:inline-block}.switch-track:before,.toggle span:before{content:'';position:absolute;width:14px;height:14px;left:3px;top:3px;border-radius:50%;background:#8b949e;transition:.16s}.admin-switch input:checked+.switch-track,.media-switch input:checked+.switch-track,.toggle input:checked+span{background:linear-gradient(90deg,var(--accent),#3fb950)}.admin-switch input:checked+.switch-track:before,.media-switch input:checked+.switch-track:before,.toggle input:checked+span:before{transform:translateX(14px);background:#fff}.switch-label{font-weight:750;font-size:13px}.media-switch,.toggle{position:relative;display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-weight:700}.content-lang-switch{margin-left:auto;position:relative;z-index:30;display:inline-flex;align-items:center;gap:8px;height:36px;color:var(--muted);font-size:12px;font-weight:800;white-space:nowrap;flex:0 0 auto}.content-lang-menu{position:relative;z-index:30;display:block;height:32px;flex:0 0 auto}.content-lang-trigger{height:32px;min-width:148px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(96,120,150,.34);border-radius:999px;background:#0d141d;color:#e6edf3;padding:0 10px 0 12px;cursor:pointer;font:inherit;font-size:12px;font-weight:800}.content-lang-trigger:hover{border-color:rgba(88,166,255,.5);background:#111b2a}.content-lang-trigger:after{content:"";width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #8aa2bd}.content-lang-trigger small{color:#8aa2bd;font-size:11px;margin-left:auto}.content-lang-pop{position:absolute;right:0;top:calc(100% + 6px);min-width:190px;border:1px solid rgba(96,120,150,.34);border-radius:12px;background:#0d141d;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:6px;display:none;gap:3px}.content-lang-switch.is-open .content-lang-pop{display:grid}.content-lang-pop button{height:34px;border:0;border-radius:8px;background:transparent;color:#c9d7e8;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 9px;cursor:pointer;font-weight:800;text-align:left}.content-lang-pop button:hover,.content-lang-pop button.active{background:rgba(88,166,255,.12);color:#fff}.content-lang-pop small{color:#8aa2bd;font-size:11px}.compact-select{max-width:180px}
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:var(--z-modal);align-items:center;justify-content:center;backdrop-filter:blur(2px);display:none}.modal-ov.open{display:flex}.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:440px;max-width:calc(100vw - 32px);box-shadow:0 24px 80px rgba(0,0,0,.55)}.modal-wide{width:min(840px,calc(100vw - 32px));max-height:88vh;overflow:auto}.modal-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.modal-hd h3{margin:0;font-size:16px}.modal-close{background:none;border:none;color:var(--muted);font-size:20px;padding:2px 6px;border-radius:5px}.modal-close:hover{background:rgba(255,255,255,.07);color:#fff}.modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.media-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;max-height:420px;overflow:auto}.media-pick-item{border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px;display:grid;gap:6px;text-align:left;color:var(--text);min-width:0}.media-pick-item:hover{border-color:var(--accent);background:rgba(88,166,255,.08)}.media-pick-thumb{height:88px;border-radius:6px;background:#090d14;display:grid;place-items:center;overflow:hidden}.media-pick-thumb img{width:100%;height:100%;object-fit:contain}.media-pick-name{font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.media-pick-upload{border:1px dashed var(--border);border-radius:8px;background:rgba(88,166,255,.03);height:132px;display:grid;place-items:center;color:var(--muted)}.media-pick-upload:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.08)}.media-upload-inner{display:grid;gap:6px;place-items:center}.media-upload-inner strong{font-size:26px;line-height:1}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:999px;font-size:13px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:var(--z-toast)}.toast.show{opacity:1}.toast-ok{background:#122d1f;border:1px solid #1a3d2a;color:var(--ok)}.toast-err{background:#2d1216;border:1px solid #5a1e27;color:var(--danger)}
.t-bar-input,.t-bar-sel{padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text);font:inherit;font-size:13px;outline:none}.t-bar-input:focus,.t-bar-sel:focus{border-color:var(--accent)}.t-cell-edit{width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font:inherit;font-size:13px}.t-cell-edit:focus{border-color:var(--accent);outline:none}.t-missing{border-color:rgba(248,81,73,.45)!important}.tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:14px}.tab{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);padding:8px 12px;font-weight:650}.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
@media(max-width:900px){body{overflow:hidden}.shell{height:100vh;grid-template-columns:1fr}.sidebar{display:none}.content{overflow:hidden}.grid.cols-2,.grid.cols-4{grid-template-columns:1fr}}
	</style>
</head>
<body>
	<div class="shell">
		<aside class="sidebar">
			<a class="brand" href="/admin"><span class="brand-mark">F</span><span>ForumForge</span></a>
			<div class="nav-title" data-i18n="admin.menu.title">管理菜单</div>
			<nav class="nav">${nav}</nav>
		</aside>
		<main class="main">
			<header class="topbar">
				<a class="btn btn-sm btn-outline" href="/" data-i18n="admin.common.backToSite">返回前台</a>
				<span class="topbar-title"${titleAttr}>${escapeHtml(options.title)}</span>
				<div class="topbar-spacer"></div>
				<div class="lang-picker" data-language-picker>
					<button class="lang-btn" type="button" data-language-button aria-label="Language"><span class="lang-flag" data-language-flag>🇨🇳</span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button>
					<ul class="lang-menu" data-language-menu></ul>
				</div>
				<div class="user-pop">
					<button class="user-trigger" type="button"><span class="avatar">${initial}</span><span>${escapeHtml(options.user.email)}</span></button>
					<div class="user-panel">
						<div class="user-card"><span class="avatar">${initial}</span><strong>${escapeHtml(options.user.email)}</strong><small>${escapeHtml(options.user.role)}</small></div>
						<a href="/" data-i18n="nav.home">首页</a>
						<a href="/settings" data-i18n="nav.settings">设置</a>
						<a href="/admin" data-i18n="nav.admin">管理</a>
						<a href="/admin/logout" class="danger-link" data-i18n="nav.logout">退出登录</a>
					</div>
				</div>
			</header>
			<section class="content">
				<div class="page-hd"><div><h1${titleAttr}>${escapeHtml(options.title)}</h1>${subtitle}</div></div>
				<div class="content-body">${options.content}</div>
			</section>
		</main>
	</div>
	<div class="toast" id="toast"></div>
	<div class="modal-ov" id="ff-admin-media-modal">
		<div class="modal modal-wide">
			<div class="modal-hd">
				<h3 data-i18n="admin.settings.pickMedia">选择媒体</h3>
				<button class="modal-close" type="button" data-ff-media-close>×</button>
			</div>
			<div class="toolbar mb-12">
				<input class="input wide-input" id="ff-admin-media-search" data-i18n-placeholder="admin.settings.searchMedia" placeholder="搜索媒体文件...">
				<span class="muted" id="ff-admin-media-count"></span>
			</div>
			<div class="media-pick-grid" id="ff-admin-media-grid"></div>
			<div class="pager mt-12" id="ff-admin-media-pager"></div>
			<input id="ff-admin-media-upload" class="hidden-file" type="file" accept="image/*,video/*">
		</div>
	</div>
	<script>
function nonceValue(){try{var c=window.crypto;if(c&&c.randomUUID)return c.randomUUID();if(c&&c.getRandomValues){var a=new Uint8Array(16),s='',i,h;c.getRandomValues(a);for(i=0;i<a.length;i++){h=a[i].toString(16);s+=(h.length<2?'0':'')+h;}return s;}}catch(e){}return String(Date.now())+'-'+Math.random().toString(16).slice(2)+'-'+Math.random().toString(16).slice(2);}
function nonceHeaders(json){var h={'X-Timestamp':String(Math.floor(Date.now()/1000)),'X-Nonce':nonceValue()};if(json)h['Content-Type']='application/json';return h;}
function showToast(msg,type){var t=document.getElementById('toast');if(!t){alert(msg);return;}t.textContent=msg;t.className='toast toast-'+(type==='err'?'err':'ok')+' show';clearTimeout(t._tmr);t._tmr=setTimeout(function(){t.className='toast';},2400);}
function escapeClient(text){return String(text||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function setButtonLoading(btn,label){if(!btn)return function(){};var old=btn.innerHTML,disabled=btn.disabled;btn.disabled=true;btn.dataset.loading='1';if(label)btn.innerHTML='<span class="spin"></span><span>'+escapeClient(label)+'</span>';return function(nextHtml){btn.disabled=disabled;delete btn.dataset.loading;btn.innerHTML=nextHtml!==undefined?nextHtml:old;};}
async function runButton(btn,label,work){var done=setButtonLoading(btn,label||t('common.processing','处理中...'));try{return await work(done);}catch(e){done();throw e;}}
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
document.addEventListener('click',function(e){var ov=e.target.closest('.modal-ov');if(ov&&e.target===ov)ov.classList.remove('open');});
function cookieLocale(){var m=document.cookie.match(/(?:^|; )ff_locale=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
function normalizeClientLocale(value){var raw=String(value||'').trim().replace('_','-'),low=raw.toLowerCase();if(!raw)return '';if(low==='zh'||low==='zh-cn'||low==='zh-hans')return 'zh-CN';if(low==='en'||low==='en-us')return 'en-US';var parts=raw.split('-');return parts[1]?parts[0].toLowerCase()+'-'+parts[1].toUpperCase():parts[0].toLowerCase();}
function pickBrowserLocale(langs){var supported=(langs&&langs.length?langs:[{code:'en-US'},{code:'zh-CN'}]).map(langCode);var nav=((navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language])||[]).map(normalizeClientLocale);for(var i=0;i<nav.length;i++){var item=nav[i];var hit=supported.find(function(code){var normalized=normalizeClientLocale(code);return normalized===item||normalized.split('-')[0]===item.split('-')[0];});if(hit)return hit;}return supported.indexOf('en-US')>=0?'en-US':(supported[0]||'en-US');}
var ADMIN_I18N={}, ADMIN_LANGUAGES=[], ADMIN_LOCALE=localStorage.getItem('ff.locale')||cookieLocale()||pickBrowserLocale()||document.documentElement.lang||'en-US';
window.ADMIN_LOCALE=ADMIN_LOCALE;
var LOCALE_COUNTRY={'zh-CN':'cn','zh':'cn','zh-TW':'tw','en-US':'us','en':'us','ja-JP':'jp','ja':'jp','ko-KR':'kr','ko':'kr','fr-FR':'fr','fr':'fr','de-DE':'de','de':'de','es-ES':'es','es':'es','pt-BR':'br','pt':'br','ru-RU':'ru','ru':'ru','vi-VN':'vn','vi':'vn','id-ID':'id','id':'id','th-TH':'th','th':'th','ar-SA':'sa','ar':'sa'};
function localeCountry(code){return LOCALE_COUNTRY[code]||LOCALE_COUNTRY[String(code||'').split('-')[0]]||String(code||'').toLowerCase();}
var COUNTRY_FLAG={cn:'🇨🇳',tw:'🇹🇼',us:'🇺🇸',jp:'🇯🇵',kr:'🇰🇷',fr:'🇫🇷',de:'🇩🇪',es:'🇪🇸',br:'🇧🇷',ru:'🇷🇺',vn:'🇻🇳',id:'🇮🇩',th:'🇹🇭',sa:'🇸🇦'};
var FLAG_SVG={
 cn:'<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#de2910"/><path fill="#ffde00" d="M5.1 2.1l.5 1.5h1.6l-1.3.9.5 1.5-1.3-.9-1.3.9.5-1.5-1.3-.9h1.6zM9.6 2.2l.3.6.7.1-.5.5.1.7-.6-.3-.6.3.1-.7-.5-.5.7-.1zM11.1 4.7l.2.6.7.1-.5.4.1.7-.6-.3-.6.3.1-.7-.5-.4.7-.1zM11 7.7l.2.6.7.1-.5.4.1.7-.6-.3-.6.3.1-.7-.5-.4.7-.1zM9.5 10.2l.3.6.7.1-.5.5.1.7-.6-.3-.6.3.1-.7-.5-.5.7-.1z"/></svg>',
 us:'<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#fff"/><path fill="#b22234" d="M0 0h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24V16H0z"/><rect width="10.5" height="8.6" rx="2" fill="#3c3b6e"/><path fill="#fff" d="M1.2 1.2h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM2.2 2.6h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM1.2 4h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM2.2 5.4h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7z"/></svg>'
};
function flagEmoji(code){var country=localeCountry(code);return FLAG_SVG[country]||COUNTRY_FLAG[country]||'🌐';}
function langCode(lang){return lang.code||lang.locale||'zh-CN';}
function langName(lang){return lang.native_name||lang.name||langCode(lang);}
function t(key,fallback){return (ADMIN_I18N&&ADMIN_I18N[key])||fallback||key;}
function bindContentLanguageSwitch(){
	document.querySelectorAll('[data-content-locale-trigger]').forEach(function(trigger){
		if(trigger.dataset.bound)return;trigger.dataset.bound='1';
		trigger.addEventListener('click',function(e){
			e.stopPropagation();
			var root=trigger.closest('.content-lang-switch');
			document.querySelectorAll('.content-lang-switch.is-open').forEach(function(item){if(item!==root)item.classList.remove('is-open');});
			if(root)root.classList.toggle('is-open');
		});
	});
	document.querySelectorAll('[data-content-locale-option]').forEach(function(btn){
		if(btn.dataset.bound)return;btn.dataset.bound='1';
		btn.addEventListener('click',function(e){
			e.stopPropagation();
			var root=btn.closest('.content-lang-switch');
			var input=root&&root.querySelector('[data-content-locale]');
			var label=root&&root.querySelector('[data-content-locale-label]');
			if(!input)return;
			input.value=btn.dataset.contentLocaleOption||input.value;
			if(label)label.textContent=(btn.querySelector('span')||btn).textContent||input.value;
			root.querySelectorAll('[data-content-locale-option]').forEach(function(item){item.classList.toggle('active',item===btn);});
			root.classList.remove('is-open');
			input.dispatchEvent(new Event('change',{bubbles:true}));
		});
	});
}
document.addEventListener('click',function(e){if(!e.target.closest('.content-lang-switch'))document.querySelectorAll('.content-lang-switch.is-open').forEach(function(item){item.classList.remove('is-open');});});
function applyAdminI18n(){
	document.querySelectorAll('[data-i18n]').forEach(function(el){var k=el.getAttribute('data-i18n'); if(k&&ADMIN_I18N[k])el.textContent=ADMIN_I18N[k];});
	document.querySelectorAll('[data-i18n-title]').forEach(function(el){var k=el.getAttribute('data-i18n-title'); if(k&&ADMIN_I18N[k])el.setAttribute('title',ADMIN_I18N[k]);});
	document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){var k=el.getAttribute('data-i18n-placeholder'); if(k&&ADMIN_I18N[k])el.setAttribute('placeholder',ADMIN_I18N[k]);});
	bindContentLanguageSwitch();
}
function renderLanguageSwitchers(){
	var langs=ADMIN_LANGUAGES.length?ADMIN_LANGUAGES:[{code:'zh-CN',native_name:'简体中文'},{code:'en-US',native_name:'English'}];
	document.querySelectorAll('[data-language-switch]').forEach(function(sel){
		var current=ADMIN_LOCALE;
		sel.innerHTML=langs.map(function(lang){
			var code=lang.code||lang.locale;
			var name=lang.native_name||lang.name||code;
			return '<option value="'+String(code).replace(/"/g,'&quot;')+'">'+String(name).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];})+'</option>';
		}).join('');
		sel.value=current;
		sel.onchange=function(){loadAdminI18n(this.value);};
	});
	document.querySelectorAll('[data-language-picker]').forEach(function(picker){
		var btn=picker.querySelector('[data-language-button]'),menu=picker.querySelector('[data-language-menu]'),flag=picker.querySelector('[data-language-flag]'),name=picker.querySelector('[data-language-name]');
		var current=langs.find(function(lang){return langCode(lang)===ADMIN_LOCALE;})||langs[0];
		if(flag)flag.innerHTML=flagEmoji(langCode(current));
		if(name)name.textContent=langName(current);
		if(menu){
			menu.innerHTML=langs.map(function(lang){var code=langCode(lang);return '<li data-code="'+String(code).replace(/"/g,'&quot;')+'" class="'+(code===ADMIN_LOCALE?'active':'')+'"><span class="lang-flag">'+flagEmoji(code)+'</span><span>'+String(langName(lang)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];})+'</span><small>('+String(code).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];})+')</small></li>';}).join('');
			menu.querySelectorAll('li').forEach(function(li){li.onclick=function(e){e.stopPropagation();menu.classList.remove('open');loadAdminI18n(li.dataset.code);};});
		}
		if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.onclick=function(e){e.stopPropagation();document.querySelectorAll('[data-language-menu].open').forEach(function(m){if(m!==menu)m.classList.remove('open');});if(menu)menu.classList.toggle('open');};}
	});
}
document.addEventListener('click',function(e){if(!e.target.closest('[data-language-picker]'))document.querySelectorAll('[data-language-menu].open').forEach(function(m){m.classList.remove('open');});});
function loadAdminI18n(locale){
	return fetch('/api/i18n?locale='+encodeURIComponent(locale||ADMIN_LOCALE)).then(function(r){return r.json();}).then(function(d){
		ADMIN_LANGUAGES=d.languages||ADMIN_LANGUAGES;
		var hadStoredLocale=!!(localStorage.getItem('ff.locale')||cookieLocale());
		var nextLocale=hadStoredLocale?(d.locale||locale||ADMIN_LOCALE):pickBrowserLocale(ADMIN_LANGUAGES);
		if(!hadStoredLocale&&nextLocale&&nextLocale!==(d.locale||locale))return loadAdminI18n(nextLocale);
		ADMIN_LOCALE=nextLocale||d.locale||locale||ADMIN_LOCALE;
		window.ADMIN_LOCALE=ADMIN_LOCALE;
		ADMIN_I18N=d.messages||{};
		localStorage.setItem('ff.locale',ADMIN_LOCALE);
		document.cookie='ff_locale='+encodeURIComponent(ADMIN_LOCALE)+'; Path=/; Max-Age=31536000; SameSite=Lax';
		document.documentElement.lang=ADMIN_LOCALE;
		renderLanguageSwitchers();
		applyAdminI18n();
		window.dispatchEvent(new CustomEvent('forumforge:localechange',{detail:{locale:ADMIN_LOCALE,messages:ADMIN_I18N}}));
	}).catch(function(){renderLanguageSwitchers();});
}
loadAdminI18n(ADMIN_LOCALE);
var FF_ADMIN_MEDIA={page:1,resolve:null,reject:null,options:{}};
function ffAdminMediaUploadCard(){return '<button class="media-pick-upload" type="button" data-ff-media-upload><div class="media-upload-inner"><strong>+</strong><span data-i18n="admin.media.uploadSystem">'+escapeClient(t('admin.media.uploadSystem','上传系统媒体'))+'</span></div></button>';}
function ffAdminMediaItemHtml(item){var url=String(item&&item.url||''),name=String(item&&item.filename||item&&item.key||'media'),isVideo=String(item&&item.media_type||'').toLowerCase()==='video'||String(item&&item.mime_type||'').startsWith('video/');return '<button class="media-pick-item" type="button" data-url="'+escapeClient(url)+'" data-name="'+escapeClient(name)+'"><div class="media-pick-thumb">'+(isVideo?'<span>Video</span>':'<img src="'+escapeClient(url)+'" alt="">')+'</div><div class="media-pick-name" title="'+escapeClient(name)+'">'+escapeClient(name)+'</div></button>';}
async function ffLoadAdminMediaPicker(page){FF_ADMIN_MEDIA.page=page||1;var grid=document.getElementById('ff-admin-media-grid');if(!grid)return;grid.innerHTML=ffAdminMediaUploadCard()+'<div class="notice">'+escapeClient(t('admin.media.loading','加载中...'))+'</div>';try{var opts=FF_ADMIN_MEDIA.options||{},q=(document.getElementById('ff-admin-media-search')?.value||'').toLowerCase(),pageSize=Number(opts.pageSize||18),includePosts=opts.includePosts?'1':'0';var res=await fetch('/api/admin/media?includePosts='+includePosts+'&page='+FF_ADMIN_MEDIA.page+'&pageSize='+pageSize,{headers:nonceHeaders()});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.media.loadFailed','加载失败'));var items=(data.items||[]).filter(function(item){return !q||String(item.filename||item.key||'').toLowerCase().includes(q);});document.getElementById('ff-admin-media-count').textContent=String(data.total||0);grid.innerHTML=ffAdminMediaUploadCard()+items.map(ffAdminMediaItemHtml).join('');var totalPages=Math.max(1,Math.ceil(Number(data.total||0)/Number(data.pageSize||pageSize)));document.getElementById('ff-admin-media-pager').innerHTML='<div class="toolbar-right"><button class="btn btn-sm" data-ff-media-page="'+(FF_ADMIN_MEDIA.page-1)+'" '+(FF_ADMIN_MEDIA.page<=1?'disabled':'')+'>'+escapeClient(t('admin.common.previous','上一页'))+'</button><span class="muted">'+FF_ADMIN_MEDIA.page+' / '+totalPages+'</span><button class="btn btn-sm" data-ff-media-page="'+(FF_ADMIN_MEDIA.page+1)+'" '+(FF_ADMIN_MEDIA.page>=totalPages?'disabled':'')+'>'+escapeClient(t('admin.common.next','下一页'))+'</button></div>';applyAdminI18n();}catch(e){grid.innerHTML='<div class="notice">'+escapeClient(e.message||String(e))+'</div>';}}
function ffCloseAdminMediaPicker(value){closeModal('ff-admin-media-modal');var resolve=FF_ADMIN_MEDIA.resolve,reject=FF_ADMIN_MEDIA.reject;FF_ADMIN_MEDIA.resolve=null;FF_ADMIN_MEDIA.reject=null;if(value===undefined){if(reject)reject(new Error('cancelled'));}else if(resolve){resolve(value);}}
function ffOpenAdminMediaPicker(options){FF_ADMIN_MEDIA.options=options||{};FF_ADMIN_MEDIA.page=1;document.getElementById('ff-admin-media-search').value='';document.getElementById('ff-admin-media-upload').setAttribute('accept',FF_ADMIN_MEDIA.options.accept||'image/*,video/*');openModal('ff-admin-media-modal');ffLoadAdminMediaPicker(1);return new Promise(function(resolve,reject){FF_ADMIN_MEDIA.resolve=resolve;FF_ADMIN_MEDIA.reject=reject;});}
document.getElementById('ff-admin-media-search')?.addEventListener('input',function(){ffLoadAdminMediaPicker(1);});
document.getElementById('ff-admin-media-grid')?.addEventListener('click',function(e){var upload=e.target.closest('[data-ff-media-upload]');if(upload){document.getElementById('ff-admin-media-upload').click();return;}var item=e.target.closest('[data-url]');if(!item)return;ffCloseAdminMediaPicker({url:item.dataset.url||'',name:item.dataset.name||''});});
document.getElementById('ff-admin-media-pager')?.addEventListener('click',function(e){var btn=e.target.closest('[data-ff-media-page]');if(btn&&!btn.disabled)ffLoadAdminMediaPicker(Number(btn.dataset.ffMediaPage||1));});
document.querySelector('[data-ff-media-close]')?.addEventListener('click',function(){ffCloseAdminMediaPicker(undefined);});
document.getElementById('ff-admin-media-upload')?.addEventListener('change',async function(){if(!this.files||!this.files[0])return;var fd=new FormData();fd.append('file',this.files[0]);fd.append('type','system');try{var res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.media.uploadFailed','上传失败'));ffCloseAdminMediaPicker({url:data.url||'',name:data.filename||data.key||''});}catch(e){showToast(e.message||String(e),'err');}this.value='';});
window.ForumForgeAdmin=Object.assign(window.ForumForgeAdmin||{},{ui:{t:t,escapeHtml:escapeClient,nonceHeaders:nonceHeaders,showToast:showToast,runButton:runButton,openModal:openModal,closeModal:closeModal,openMediaPicker:ffOpenAdminMediaPicker,bindMediaInput:function(input,options){var el=typeof input==='string'?document.querySelector(input):input;if(!el)return;return ffOpenAdminMediaPicker(options).then(function(item){el.value=item.url||'';el.dispatchEvent(new Event('change',{bubbles:true}));return item;});},getLocale:function(){return ADMIN_LOCALE;}}});
window.ForumForgePluginUI=Object.assign(window.ForumForgePluginUI||{},window.ForumForgeAdmin.ui);
${options.script || ''}
	</script>
</body>
</html>`;
}

export function renderAdminLoginRedirect(): Response {
	return adminHtmlResponse('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/login"><p>Redirecting to login...</p>', 302, {
		Location: '/login',
	});
}


// ---- shared helpers relocated from former monolithic ssr.ts ----
export const AI_TRANSLATE_CONTROLS = `
<div class="ai-trans-ctrl">
  <button class="btn btn-sm btn-primary" id="ai-trans-btn" onclick="aiTranslateMissing()" data-i18n="admin.i18n.aiTranslate">AI 翻译</button>
  <button class="btn btn-sm" onclick="aiOpenConfig()" data-i18n-title="admin.i18n.aiSettings" title="AI 翻译设置">⚙</button>
</div>`;

export const AI_TRANSLATE_MODAL = `
<div class="modal-ov" id="ai-config-modal">
  <div class="modal">
    <div class="modal-hd"><h3 data-i18n="admin.i18n.aiSettings">AI 翻译设置</h3><button class="modal-close" onclick="aiCloseConfig()">×</button></div>
    <div class="grid">
      ${adminField('admin.i18n.aiKey', 'API Key', adminInput({ id: 'ai-api-key', type: 'password', autocomplete: 'off', placeholder: 'sk-...' }))}
      ${adminField('admin.i18n.aiModel', '模型', adminSelect('<option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-chat">DeepSeek Chat</option><option value="gpt-4.1-mini">OpenAI GPT-4.1 mini</option><option value="gpt-4.1">OpenAI GPT-4.1</option>', { id: 'ai-model' }))}
      ${adminField('admin.i18n.aiBatch', '批量行数', adminInput({ id: 'ai-batch-size', type: 'number', min: 1, max: 100, value: 20 }))}
    </div>
    <div class="modal-footer">${adminButton('admin.common.cancel', '取消', { onclick: 'aiCloseConfig()' }, 'btn-outline')}${adminButton('admin.i18n.aiSaveSettings', '保存设置', { onclick: 'aiSaveConfigAndClose()' }, 'btn-primary')}</div>
  </div>
</div>`;


export function formatBytes(value: unknown): string {
	const bytes = Number(value || 0);
	if (!bytes) return '未知大小';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isVideoMedia(item: any): boolean {
	return String(item.media_type || '').toLowerCase() === 'video' || String(item.mime_type || '').toLowerCase().startsWith('video/');
}


export type AdminLogRow = {
	id: number;
	user_id?: number | null;
	username?: string | null;
	email?: string | null;
	action: string;
	resource_type: string;
	resource_id: string;
	details: string;
	ip_address: string;
	created_at: string;
};

export function compactLogDetails(value: unknown): string {
	const raw = String(value || '').trim();
	if (!raw) return '';
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}
