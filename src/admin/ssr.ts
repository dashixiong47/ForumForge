import type { UserPayload } from '../core/security';
import { publicPostPath } from '../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../assets/brand';
import { escapeHtml, jsonScript } from '../utils/html';
import { adminButton, adminField, adminInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from './ui';
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from './localization';

type AdminNavKey = 'dashboard' | 'posts' | 'comments' | 'moderation' | 'users' | 'permissions' | 'categories' | 'tags' | 'media' | 'plugins' | 'translations' | 'logs' | 'settings';

type AdminLayoutOptions = {
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

const ACE = 'https://cdn.bootcdn.net/ajax/libs/ace/1.32.6';
const DEFAULT_THEME = 'one_dark';
const ACE_THEMES = [
	'one_dark', 'monokai', 'github_dark', 'nord_dark', 'dracula', 'tomorrow_night_blue',
	'tomorrow_night', 'tomorrow_night_bright', 'tomorrow', 'solarized_dark',
	'solarized_light', 'gruvbox_dark_hard', 'gruvbox_light_hard', 'chrome', 'xcode'
];

const FAVICON_LINKS = `<link rel="icon" type="image/svg+xml" href="${escapeHtml(FORUMFORGE_ICON_DATA_URL).replace(/"/g, '&quot;')}">
<link rel="shortcut icon" href="${escapeHtml(FORUMFORGE_ICON_DATA_URL).replace(/"/g, '&quot;')}">`;

const navItems: Array<{ key: AdminNavKey; href: string; label: string; i18n: string; icon: string }> = [
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
	{ key: 'translations', href: '/admin/translations', label: '翻译管理', i18n: 'admin.i18n.title', icon: 'globe' },
	{ key: 'logs', href: '/admin/logs', label: '日志管理', i18n: 'admin.logs.title', icon: 'log' },
	{ key: 'settings', href: '/admin/settings', label: '站点设置', i18n: 'admin.settings', icon: 'settings' },
];

const adminPermissionOptions = [
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
	{ key: 'translations', label: '翻译管理', i18n: 'admin.i18n.title' },
	{ key: 'logs', label: '日志管理', i18n: 'admin.logs.title' },
	{ key: 'settings', label: '站点设置', i18n: 'admin.settings' },
];

function parsePermissionList(value: unknown): string[] {
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

function adminUserPermissions(user: UserPayload): string[] {
	if (user.role === 'admin') return adminPermissionOptions.map((item) => item.key);
	return parsePermissionList((user as any).permissions);
}

function canSeeAdminNav(user: UserPayload, key: AdminNavKey): boolean {
	return user.role === 'admin' || adminUserPermissions(user).includes(key);
}

function parseJson(value: unknown, fallback: unknown): unknown {
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
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:var(--z-modal);align-items:center;justify-content:center;backdrop-filter:blur(2px);display:none}.modal-ov.open{display:flex}.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:440px;max-width:calc(100vw - 32px);box-shadow:0 24px 80px rgba(0,0,0,.55)}.modal-wide{width:min(840px,calc(100vw - 32px));max-height:88vh;overflow:auto}.modal-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.modal-hd h3{margin:0;font-size:16px}.modal-close{background:none;border:none;color:var(--muted);font-size:20px;padding:2px 6px;border-radius:5px}.modal-close:hover{background:rgba(255,255,255,.07);color:#fff}.modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:999px;font-size:13px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:var(--z-toast)}.toast.show{opacity:1}.toast-ok{background:#122d1f;border:1px solid #1a3d2a;color:var(--ok)}.toast-err{background:#2d1216;border:1px solid #5a1e27;color:var(--danger)}
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
	<script>
function nonceHeaders(json){var h={'X-Timestamp':String(Math.floor(Date.now()/1000)),'X-Nonce':crypto.randomUUID()};if(json)h['Content-Type']='application/json';return h;}
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
		ADMIN_I18N=d.messages||{};
		localStorage.setItem('ff.locale',ADMIN_LOCALE);
		document.cookie='ff_locale='+encodeURIComponent(ADMIN_LOCALE)+'; Path=/; Max-Age=31536000; SameSite=Lax';
		document.documentElement.lang=ADMIN_LOCALE;
		renderLanguageSwitchers();
		applyAdminI18n();
	}).catch(function(){renderLanguageSwitchers();});
}
loadAdminI18n(ADMIN_LOCALE);
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

export function renderAdminDashboard(user: UserPayload, data: any): string {
	const analytics = data.analytics || {};
	const latestVisits = (analytics.latest_visits || []).map((row: any) => `
		<li><span>${escapeHtml(row.country || 'XX')}</span><strong title="${escapeHtml(row.raw_path || row.path || '/')}">${escapeHtml(row.page_title || row.path || '/')}</strong><small>${escapeHtml(row.created_at || '')}</small></li>
	`).join('') || `<li class="empty" data-i18n="admin.dashboard.noVisits">暂无访问记录</li>`;
	const topPaths = (analytics.top_paths_30d || []).map((row: any) => `
		<li><strong title="${escapeHtml(row.raw_path || row.path || '/')}">${escapeHtml(row.page_title || row.path || '/')}</strong><span>${Number(row.visits || 0)}</span></li>
	`).join('') || `<li class="empty" data-i18n="admin.dashboard.noVisits">暂无访问记录</li>`;
	const visits30 = analytics.visits_30d || {};
	const visits7Count = (analytics.visits_7d || []).reduce((sum: number, row: any) => sum + Number(row.visits || 0), 0);
	const visitors7Count = (analytics.visits_7d || []).reduce((sum: number, row: any) => sum + Number(row.visitors || 0), 0);
	const country7Count = (analytics.countries_7d || []).filter((row: any) => row.country && row.country !== 'XX').length;
	const countryName = (code: string) => {
		const names: Record<string, string> = {
			US: 'United States', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan', JP: 'Japan', KR: 'South Korea',
			SG: 'Singapore', GB: 'United Kingdom', DE: 'Germany', FR: 'France', CA: 'Canada', AU: 'Australia',
			IN: 'India', RU: 'Russia', BR: 'Brazil', NL: 'Netherlands', VN: 'Vietnam', TH: 'Thailand',
			ID: 'Indonesia', MY: 'Malaysia', PH: 'Philippines', ES: 'Spain', IT: 'Italy', PL: 'Poland',
			TR: 'Turkey', AE: 'United Arab Emirates', SA: 'Saudi Arabia', MX: 'Mexico', AR: 'Argentina',
			ZA: 'South Africa'
		};
		return names[String(code || '').toUpperCase()] || String(code || 'Unknown').toUpperCase();
	};
	const countryCoord = (code: string): [number, number] => {
		const coords: Record<string, [number, number]> = {
			US: [-98, 38], CN: [104, 35], HK: [114, 22], TW: [121, 24], JP: [138, 37], KR: [128, 36],
			SG: [104, 1], GB: [-2, 54], DE: [10, 51], FR: [2, 46], CA: [-106, 57], AU: [134, -25],
			IN: [78, 22], RU: [90, 61], BR: [-51, -10], NL: [5, 52], VN: [108, 16], TH: [101, 15],
			ID: [118, -2], MY: [102, 4], PH: [122, 13], ES: [-4, 40], IT: [12, 43], PL: [19, 52],
			TR: [35, 39], AE: [54, 24], SA: [45, 24], MX: [-102, 23], AR: [-64, -34], ZA: [24, -29]
		};
		return coords[String(code || '').toUpperCase()] || [0, 0];
	};
	const chartData = {
		days: Array.from({ length: 7 }, (_, index) => {
			const d = new Date();
			d.setUTCDate(d.getUTCDate() - (6 - index));
			return d.toISOString().slice(0, 10);
		}),
		visits7: analytics.visits_7d || [],
		countries7: (analytics.countries_7d || []).map((row: any) => ({
			name: countryName(row.country),
			code: String(row.country || 'XX').toUpperCase(),
			value: Number(row.visits || 0),
			coord: countryCoord(row.country),
		})),
		device30: analytics.device_30d || [],
		topPaths30: analytics.top_paths_30d || [],
	};
	return renderAdminLayout({
		title: '管理后台',
		titleKey: 'admin.page.title',
		subtitle: '实时监控访问、内容增长和社区活跃度。',
		subtitleKey: 'admin.dashboard.subtitle',
		active: 'dashboard',
		user,
		head: `<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script><style>
.content-body:has(.dashboard-shell){overflow:hidden}.dashboard-shell{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) 178px;gap:12px;overflow:hidden}.dash-hero{position:relative;overflow:hidden;border:1px solid rgba(88,166,255,.28);border-radius:16px;background:radial-gradient(circle at 18% 0,rgba(88,166,255,.18),transparent 30%),radial-gradient(circle at 80% 0,rgba(63,185,80,.11),transparent 32%),linear-gradient(135deg,#101a28,#0d1117 64%);padding:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px}.dash-hero:before{content:"";position:absolute;inset:auto -10% -55% 38%;height:220px;background:linear-gradient(90deg,rgba(88,166,255,.16),rgba(63,185,80,.08));filter:blur(38px);transform:rotate(-8deg)}.dash-copy,.dash-metrics{position:relative}.dash-kicker{color:#79c0ff;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.dash-copy h2{margin:6px 0 6px;font-size:27px;line-height:1}.dash-copy p{margin:0;color:#a8bed6;max-width:760px;line-height:1.6}.dash-metrics{display:grid;grid-template-columns:repeat(4,132px);gap:10px}.dash-stat{border:1px solid rgba(96,120,150,.34);border-radius:14px;background:rgba(9,14,22,.58);padding:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}.dash-stat strong{display:block;font-size:24px;line-height:1;color:#fff}.dash-stat span{display:block;margin-top:7px;color:#9fb4cc;font-size:12px;font-weight:800}.dash-grid{min-height:0;display:grid;grid-template-columns:minmax(520px,1.36fr) minmax(390px,.64fr);grid-template-rows:minmax(260px,.95fr) minmax(210px,.72fr);gap:12px;overflow:hidden}.dash-panel{min-height:0;border:1px solid rgba(96,120,150,.3);border-radius:16px;background:linear-gradient(180deg,rgba(17,25,38,.96),rgba(13,17,23,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.025);overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}.dash-panel-hd{padding:13px 15px;border-bottom:1px solid rgba(96,120,150,.2);display:flex;align-items:center;justify-content:space-between;gap:12px}.dash-panel-hd h3{margin:0;font-size:15px}.dash-panel-hd p{margin:3px 0 0;color:var(--muted);font-size:12px}.dash-chart{min-height:0;width:100%;height:100%}.map-panel{grid-row:span 2}.dash-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-height:0}.dash-list{margin:0;padding:10px 12px 12px;list-style:none;overflow:auto;display:grid;align-content:start;gap:8px}.dash-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid rgba(96,120,150,.18);border-radius:10px;background:rgba(13,19,32,.6);padding:9px 10px}.dash-list li span:first-child{min-width:34px;text-align:center;border-radius:999px;background:rgba(88,166,255,.12);color:#9ed0ff;font-size:11px;font-weight:900;padding:3px 6px}.dash-list li strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dash-list li small,.dash-list li span:last-child{color:var(--muted);font-size:12px}.dash-list li.empty{display:block;color:var(--muted)}.spark-row{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;padding:12px;min-height:0}.device-chart{min-height:180px}.top-paths{min-height:0}
@media(max-width:1280px){.dash-hero{grid-template-columns:1fr}.dash-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.dash-grid{grid-template-columns:1fr;grid-template-rows:360px 280px 280px}.map-panel{grid-row:auto}.spark-row{grid-template-columns:1fr}}
</style>`,
		content: `
<div class="dashboard-shell">
	<section class="dash-hero">
		<div class="dash-copy">
			<div class="dash-kicker">ForumForge Monitor</div>
			<h2 data-i18n="admin.dashboard.monitorTitle">全球访问与社区健康监控</h2>
			<p data-i18n="admin.dashboard.monitorDesc">查看最近 7 天访问明细、30 天总览、访客来源和内容趋势，快速判断站点活跃度。</p>
		</div>
		<div class="dash-metrics">
			<div class="dash-stat"><strong>${Number(visits7Count || 0)}</strong><span data-i18n="admin.dashboard.visits7d">7 天访问</span></div>
			<div class="dash-stat"><strong>${Number(visitors7Count || 0)}</strong><span data-i18n="admin.dashboard.visitors7d">7 天访客</span></div>
			<div class="dash-stat"><strong>${Number(visits30.visits || 0)}</strong><span data-i18n="admin.dashboard.visits30d">30 天访问</span></div>
			<div class="dash-stat"><strong>${Number(country7Count || visits30.countries || 0)}</strong><span data-i18n="admin.dashboard.countries">访问国家</span></div>
		</div>
	</section>
	<section class="dash-grid">
		<div class="dash-panel map-panel">
			<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.worldMap">全球访问热力</h3><p data-i18n="admin.dashboard.worldMapDesc">按最近 7 天国家访问量聚合。</p></div><span class="badge">${Number(data.user_count || 0)} <span data-i18n="admin.stats.users">用户</span></span></div>
			<div id="world-map" class="dash-chart"></div>
		</div>
		<div class="dash-panel">
			<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.weekTrend">7 天访问趋势</h3><p data-i18n="admin.dashboard.weekTrendDesc">访问量与独立访客。</p></div><span class="badge">${Number(data.post_count || 0)} <span data-i18n="admin.stats.posts">帖子</span></span></div>
			<div id="week-trend" class="dash-chart"></div>
		</div>
		<div class="dash-split">
			<div class="dash-panel">
				<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.monthOverview">30 天设备概览</h3><p data-i18n="admin.dashboard.monthOverviewDesc">Desktop / Mobile / Bot。</p></div></div>
				<div id="device-chart" class="dash-chart device-chart"></div>
			</div>
			<div class="dash-panel">
				<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.topPaths">热门路径</h3><p data-i18n="admin.dashboard.topPathsDesc">最近 30 天访问最多的页面。</p></div></div>
				<ul class="dash-list top-paths">${topPaths}</ul>
			</div>
		</div>
	</section>
	<section class="dash-panel">
		<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.latestVisits">最近访问</h3><p data-i18n="admin.dashboard.latestVisitsDesc">最新 10 条访问事件。</p></div><span class="badge">${Number(data.comment_count || 0)} <span data-i18n="admin.stats.comments">评论</span></span></div>
		<ul class="dash-list">${latestVisits}</ul>
	</section>
</div>`
		,
		script: `
var dashboardData=${jsonScript(chartData)};
function dashChart(id){var el=document.getElementById(id);return el&&window.echarts?echarts.init(el,null,{renderer:'canvas'}):null;}
function cssVar(name,fallback){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback;}
function makeGradient(top,bottom){return new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:top},{offset:1,color:bottom}]);}
function buildSeriesByDay(rows,key){var byDay={};(rows||[]).forEach(function(row){byDay[row.day]=Number(row[key]||0);});return (dashboardData.days||[]).map(function(day){return byDay[day]||0;});}
function renderMapFallback(map,text,muted){
	map.setOption({
		backgroundColor:'transparent',
		graphic:{type:'text',left:'center',top:'middle',style:{text:t('admin.dashboard.mapLoadFailed','地图数据加载失败'),fill:muted,fontSize:14,fontWeight:700}},
		xAxis:{show:false},yAxis:{show:false},series:[]
	});
}
function bindMapControls(chart,el){
	if(!chart||!el)return;
	el.addEventListener('contextmenu',function(e){e.preventDefault();});
	var down=false,lastX=0,lastY=0;
	el.addEventListener('mousedown',function(e){
		if(e.button!==2)return;
		e.preventDefault();down=true;lastX=e.clientX;lastY=e.clientY;el.style.cursor='grabbing';
	});
	document.addEventListener('mousemove',function(e){
		if(!down)return;
		e.preventDefault();
		var dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
		chart.dispatchAction({type:'geoRoam',componentType:'geo',dx:dx,dy:dy});
	});
	document.addEventListener('mouseup',function(e){
		if(e.button===2&&down){down=false;el.style.cursor='';}
	});
	document.addEventListener('keydown',function(e){
		if((e.key||'').toLowerCase()==='f'&&!/input|textarea|select/i.test((document.activeElement&&document.activeElement.tagName)||'')){
			chart.dispatchAction({type:'restore'});
		}
	});
}
async function renderWorldMap(map,countryData,text,muted,green){
	try{
		if(!echarts.getMap || !echarts.getMap('world')){
			var res=await fetch('/assets/maps/world.json',{cache:'force-cache'});
			if(!res.ok)throw new Error('world map '+res.status);
			echarts.registerMap('world',await res.json());
		}
		var maxCountry=Math.max.apply(null,[1].concat(countryData.map(function(i){return i.value||0;})));
		map.setOption({
			backgroundColor:'transparent',
			tooltip:{trigger:'item',backgroundColor:'#0d141d',borderColor:'rgba(88,166,255,.35)',textStyle:{color:text},formatter:function(p){var d=p.data||{};return (d.code?d.code+' · ':'')+p.name+'<br/>'+Number(d.value||0)+' visits';}},
			visualMap:{min:0,max:maxCountry,left:18,bottom:18,text:['High','Low'],textStyle:{color:muted},inRange:{color:['#102033','#1f6feb','#3fb950']},calculable:true,itemWidth:12,itemHeight:96},
			toolbox:{show:false,feature:{restore:{}}},
			geo:{map:'world',roam:true,zoom:1.05,left:18,right:18,top:18,bottom:18,label:{show:false},emphasis:{label:{show:false},itemStyle:{areaColor:'#1f6feb'}},itemStyle:{areaColor:'#141f2d',borderColor:'rgba(120,145,175,.32)',borderWidth:.6}},
			series:[
				{type:'map',map:'world',geoIndex:0,data:countryData},
				{type:'effectScatter',coordinateSystem:'geo',rippleEffect:{brushType:'stroke',scale:3},symbolSize:function(v){return 7+Math.min(24,(Number(v[2]||0)/maxCountry)*24);},itemStyle:{color:green,shadowBlur:18,shadowColor:'rgba(63,185,80,.55)'},data:countryData.map(function(i){return {name:i.name,code:i.code,value:[i.coord&&i.coord[0]||0,i.coord&&i.coord[1]||0,Number(i.value||0)]};})}
			]
		});
	}catch(e){
		console.warn('world map failed',e);
		renderMapFallback(map,text,muted);
	}
}
function initDashboard(){
	if(!window.echarts)return;
	var text='#c9d7e8',muted='#8b949e',grid='rgba(96,120,150,.22)',blue='#58a6ff',green='#3fb950',purple='#a371f7';
	var countryData=dashboardData.countries7||[];
	var map=dashChart('world-map');
	if(map){
		bindMapControls(map,document.getElementById('world-map'));
		map.showLoading('default',{text:t('admin.dashboard.loadingMap','加载地图中...'),color:green,textColor:muted,maskColor:'rgba(13,17,23,.15)'});
		renderWorldMap(map,countryData,text,muted,green).finally(function(){map.hideLoading();});
	}
	var week=dashChart('week-trend');
	if(week){
		var visits=buildSeriesByDay(dashboardData.visits7,'visits'),visitors=buildSeriesByDay(dashboardData.visits7,'visitors');
		week.setOption({
			backgroundColor:'transparent',
			tooltip:{trigger:'axis',backgroundColor:'#0d141d',borderColor:'rgba(88,166,255,.35)',textStyle:{color:text}},
			legend:{top:8,right:12,textStyle:{color:muted},data:['Visits','Visitors']},
			grid:{left:42,right:26,top:48,bottom:34,containLabel:true},
			xAxis:{type:'category',data:(dashboardData.days||[]).map(function(day){return day.slice(5);}),axisLine:{lineStyle:{color:grid}},axisLabel:{color:muted}},
			yAxis:{type:'value',splitLine:{lineStyle:{color:grid}},axisLabel:{color:muted}},
			series:[
				{name:'Visits',type:'line',smooth:true,symbolSize:8,lineStyle:{width:3,color:blue},areaStyle:{color:makeGradient('rgba(88,166,255,.28)','rgba(88,166,255,0)')},data:visits},
				{name:'Visitors',type:'bar',barWidth:18,itemStyle:{borderRadius:[5,5,0,0],color:makeGradient('rgba(63,185,80,.78)','rgba(63,185,80,.22)')},data:visitors}
			]
		});
	}
	var device=dashChart('device-chart');
	if(device){
		var deviceRows=(dashboardData.device30||[]).filter(function(row){return Number(row.visits||0)>0;});
		device.setOption({
			backgroundColor:'transparent',
			tooltip:{trigger:'item',backgroundColor:'#0d141d',borderColor:'rgba(88,166,255,.35)',textStyle:{color:text}},
			legend:{bottom:4,left:'center',textStyle:{color:muted}},
			color:[blue,green,purple,'#d29922'],
			series:[{type:'pie',radius:['42%','64%'],center:['50%','45%'],avoidLabelOverlap:true,label:{show:false},labelLine:{show:false},itemStyle:{borderRadius:8,borderColor:'#0d1117',borderWidth:3},data:(deviceRows.length?deviceRows:[{device:'No data',visits:1}]).map(function(row){return {name:row.device,value:Number(row.visits||0)};})}]
		});
	}
	window.addEventListener('resize',function(){[map,week,device].forEach(function(chart){chart&&chart.resize();});});
}
initDashboard();
`
	});
}

export function renderAdminPlugins(user: UserPayload, plugins: any[]): string {
	const cards = plugins.map((plugin) => {
		const id = escapeHtml(plugin.id);
		const type = escapeHtml(plugin.type || 'system');
		const enabled = Number(plugin.enabled || 0) === 1;
		const tags = (parseJson(plugin.tags, []) as any[]).map((tag) => String(tag)).filter(Boolean);
		const blockTypes = (parseJson(plugin.block_types, []) as any[]).map((tag) => String(tag)).filter(Boolean);
		const tagChips = [...blockTypes.map((tag) => `<span class="chip chip-block">${escapeHtml(tag)}</span>`), ...tags.map((tag) => `<span class="chip chip-tag">#${escapeHtml(tag)}</span>`)].join('');
		return `<article class="ext-card${enabled ? '' : ' disabled'}" data-plugin-id="${id}" data-tags="${escapeHtml(JSON.stringify(tags))}">
			<div class="ext-head">
				<div class="ext-icon">${escapeHtml(plugin.icon || 'Puzzle').slice(0, 2)}</div>
				<div class="ext-main">
					<div class="ext-title">${escapeHtml(plugin.name)} <span class="ext-badge">${type}</span></div>
					<div class="ext-meta">v${escapeHtml(plugin.version || '1.0.0')} · <code>${id}</code>${plugin.author ? ` · ${escapeHtml(plugin.author)}` : ''}</div>
				</div>
				${adminButton('admin.plugins.share', '⤴', { class: 'btn-sm icon-btn', 'data-action': 'share', 'data-id': id, 'data-i18n-title': 'admin.plugins.share', title: '分享' })}
			</div>
			<p class="ext-desc">${plugin.description ? escapeHtml(plugin.description) : tr('admin.common.none', '暂无数据')}</p>
			${tagChips ? `<div class="chips">${tagChips}</div>` : ''}
			<div id="plugin-update-${id}" class="plugin-update"></div>
			<div class="ext-actions">
				<label class="toggle"><input type="checkbox" ${enabled ? 'checked' : ''} data-action="toggle" data-id="${id}" data-enabled="${enabled ? '0' : '1'}"><span></span></label>
				<span class="ext-state" data-i18n="${enabled ? 'admin.plugins.enabled' : 'admin.plugins.disabled'}">${enabled ? '已启用' : '已停用'}</span>
				<a class="btn btn-sm" href="/admin/plugins/${id}/editor" data-i18n="admin.plugins.editor">编辑器</a>
				<a class="btn btn-sm btn-outline" href="/api/admin/plugins/${id}/manifest" target="_blank">Manifest</a>
				${adminButton('admin.plugins.delete', '删除', { class: 'btn-sm', 'data-action': 'delete', 'data-id': id }, 'btn-danger')}
			</div>
		</article>`;
	}).join('') || '<div class="notice" data-i18n="admin.plugins.empty">暂无插件。可以从 JSON、本地文件或 URL 安装。</div>';
	const allTags = [...new Set(plugins.flatMap((plugin) => (parseJson(plugin.tags, []) as any[]).map((tag) => String(tag))))].filter(Boolean).sort();
	return renderAdminLayout({
		title: '插件管理',
		subtitle: '安装、启停、分享和更新插件。插件运行时代码由 Worker SSR 注入并通过后台 API 管理。',
		titleKey: 'admin.plugins.title',
		subtitleKey: 'admin.plugins.subtitle',
		active: 'plugins',
		head: `<style>
.plugin-workbench{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:12px}.plugin-scroll{min-height:0;overflow:auto}.filter-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.filter-lbl{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}.tag-filter{padding:4px 10px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);font-size:12px}.tag-filter.active,.tag-filter:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.1)}
.ext-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}.ext-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:10px;transition:.12s}.ext-card:hover{border-color:#484f58}.ext-card.disabled{opacity:.55}.ext-head{display:flex;gap:12px;align-items:flex-start}.ext-icon{width:42px;height:42px;border-radius:8px;background:rgba(88,166,255,.08);display:grid;place-items:center;color:var(--accent);font-weight:800;flex:0 0 auto}.ext-main{min-width:0;flex:1}.ext-title{font-weight:800}.ext-badge{font-size:10px;border:1px solid rgba(88,166,255,.25);color:var(--accent);border-radius:4px;padding:1px 6px;margin-left:5px}.ext-meta{font-size:12px;color:var(--muted);margin-top:3px}.ext-desc{color:#aebad0;line-height:1.5;margin:0;min-height:40px}.chips{display:flex;gap:5px;flex-wrap:wrap}.chip{font-size:11px;padding:2px 7px;border-radius:4px}.chip-block{background:rgba(88,166,255,.1);color:var(--accent);border:1px solid rgba(88,166,255,.2);font-family:var(--mono)}.chip-tag{background:rgba(63,185,80,.1);color:var(--ok);border:1px solid rgba(63,185,80,.2)}.ext-actions{display:flex;gap:6px;align-items:center;border-top:1px solid var(--border);padding-top:10px;margin-top:auto}.ext-state{font-size:12px;color:var(--muted);margin-right:auto}.toggle{position:relative;width:36px;height:20px;display:inline-flex}.toggle input{opacity:0;width:0;height:0}.toggle span{position:absolute;inset:0;background:#30363d;border-radius:999px;transition:.2s}.toggle span:before{content:'';position:absolute;width:14px;height:14px;left:3px;top:3px;background:#8b949e;border-radius:50%;transition:.2s}.toggle input:checked+span{background:var(--ok)}.toggle input:checked+span:before{transform:translateX(16px);background:#fff}.plugin-update{display:none;font-size:12px;color:var(--warn);border:1px solid rgba(210,153,29,.25);background:rgba(210,153,29,.08);border-radius:6px;padding:7px 9px}
.upload-zone{border:2px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center;cursor:pointer;color:var(--muted);margin-bottom:12px}.upload-zone:hover,.upload-zone.drag{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.04)}.install-preview{display:none;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin:10px 0}.install-error{display:none;color:var(--danger);font-size:13px;margin:8px 0}.share-field{display:flex;gap:8px;align-items:center;margin-top:8px}.share-field input{flex:1;min-width:0;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text)}
</style>`,
		user,
		content: `
<div class="plugin-workbench admin-workbench">
<div class="admin-toolbar toolbar-right">
	<span class="badge ml-auto">${plugins.length} <span data-i18n="admin.plugins.countSuffix">个插件</span></span>
	${adminButton('admin.plugins.checkUpdates', '检查更新', { id: 'check-updates' }, 'btn-outline')}
	${adminButton('admin.plugins.install', '安装插件', { onclick: "openModal('install-modal')" }, 'btn-primary')}
</div>
${allTags.length ? `<div class="filter-bar"><span class="filter-lbl">Tag</span>${adminButton('admin.plugins.allTags', '全部', { class: 'tag-filter active', 'data-tag': '' })}${allTags.map((tag) => adminButton('', tag, { class: 'tag-filter', 'data-tag': tag })).join('')}</div>` : ''}
<div class="plugin-scroll"><div class="ext-grid">${cards}</div></div>
</div>
<div class="modal-ov" id="install-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 data-i18n="admin.plugins.install">安装插件</h3><button class="modal-close" onclick="closeModal('install-modal')">×</button></div>
	<div class="toolbar mb-12">
		${adminButton('admin.plugins.themeTemplate', '主题模板', { class: 'btn-sm', 'data-template': 'theme' })}
		${adminButton('admin.plugins.widgetTemplate', '组件模板', { class: 'btn-sm', 'data-template': 'widget' })}
		${adminButton('admin.plugins.systemTemplate', '系统模板', { class: 'btn-sm', 'data-template': 'system' })}
	</div>
	<div class="upload-zone" id="upload-zone" data-i18n="admin.plugins.uploadHint">拖拽或点击上传 plugin JSON</div><input id="file-input" type="file" accept=".json,application/json" class="hidden-file">
	${adminField('admin.plugins.manifestUrl', 'Manifest URL', `<div class="inline-field">${adminInput({ id: 'manifest-url', placeholder: 'https://example.com/plugin.json' })}${adminButton('admin.plugins.loadFromUrl', '从网址加载', { id: 'load-url' })}</div>`)}
	<div class="mt-12">${adminField('admin.plugins.manifestJson', 'Manifest JSON', adminTextarea('', { id: 'manifest-json', class: 'textarea-tall', placeholder: '{"id":"my-plugin","name":"My Plugin"}' }))}</div>
	<div class="install-preview" id="install-preview"></div><div class="install-error" id="install-error"></div>
	<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { onclick: "closeModal('install-modal')" }, 'btn-outline')}${adminButton('admin.plugins.install', '安装', { id: 'install-submit' }, 'btn-primary')}</div>
</div></div>
<div class="modal-ov" id="share-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 data-i18n="admin.plugins.shareTitle">分享插件</h3><button class="modal-close" onclick="closeModal('share-modal')">×</button></div>
	<p class="muted" data-i18n="admin.plugins.shareHint">复制安装链接给其他 ForumForge 站点安装，也可以下载 manifest 文件离线分发。</p>
	<div class="card mt-12"><div class="inline-field"><strong data-i18n="admin.plugins.shareNotify">安装回传</strong><span class="spacer"></span><label class="toggle"><input type="checkbox" id="share-notify"><span></span></label></div><p class="muted" data-i18n="admin.plugins.shareNotifyDesc">允许安装方通知本插件安装次数。</p></div>
	<div class="card mt-12"><strong data-i18n="admin.plugins.installLink">安装链接</strong><div class="share-field">${adminInput({ id: 'share-install-url', readonly: true })}${adminButton('admin.common.copyUrl', '复制', { 'data-copy': 'share-install-url' }, 'btn-primary')}</div></div>
	<div class="card mt-12"><strong data-i18n="admin.plugins.manifestLink">Manifest 链接</strong><div class="share-field">${adminInput({ id: 'share-manifest-url', readonly: true })}${adminButton('admin.common.copyUrl', '复制', { 'data-copy': 'share-manifest-url' }, 'btn-outline')}${adminButton('admin.plugins.download', '下载', { id: 'download-share' }, 'btn-outline')}</div></div>
	<div id="share-status" class="muted mt-12"></div>
</div></div>`,
		script: `
var templates={theme:{id:'my-theme',slug:'my-theme',name:'My Theme',type:'theme',icon:'T',version:'1.0.0',tags:['ui'],description:'Custom theme',css:':root {\\n  --accent: #58a6ff;\\n}'},widget:{id:'my-widget',slug:'my-widget',name:'My Widget',type:'widget',icon:'W',version:'1.0.0',tags:['ui'],blockTypes:['my-block'],description:'Custom HTML widget',html:'<template data-tag="my-block">\\n  <div class="my-block">{{slot}}</div>\\n</template>',css:'.my-block { padding: 12px; }',js:'ForumForge.register({ id: "my-widget", onLoad(){ console.log("loaded"); } });'},system:{id:'my-system',slug:'my-system',name:'My System',type:'system',icon:'S',version:'1.0.0',tags:['system'],description:'Global hook',js:'ForumForge.register({ id: "my-system", onLoad(){ console.log("loaded"); } });'}};
var currentShare={id:'',manifestUrl:''};
function escClient(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function loadManifestText(text){var err=document.getElementById('install-error'),prev=document.getElementById('install-preview');err.style.display='none';try{var d=JSON.parse(text);document.getElementById('manifest-json').value=JSON.stringify(d,null,2);prev.innerHTML='<strong>'+escClient(d.name||d.id)+'</strong><div class="muted">v'+escClient(d.version||'1.0.0')+' · '+escClient(d.id||d.slug||'')+'</div><p>'+escClient(d.description||'')+'</p>';prev.style.display='block';}catch(e){err.textContent='JSON: '+e.message;err.style.display='block';prev.style.display='none';}}
document.querySelectorAll('[data-template]').forEach(function(btn){btn.addEventListener('click',function(){loadManifestText(JSON.stringify(templates[btn.dataset.template]||{},null,2));});});
document.getElementById('upload-zone').addEventListener('click',function(){document.getElementById('file-input').click();});
document.getElementById('upload-zone').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
document.getElementById('upload-zone').addEventListener('dragleave',function(){this.classList.remove('drag');});
document.getElementById('upload-zone').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag');var f=e.dataTransfer.files[0];if(f){var r=new FileReader();r.onload=function(ev){loadManifestText(ev.target.result);};r.readAsText(f,'utf-8');}});
document.getElementById('file-input').addEventListener('change',function(e){var f=e.target.files[0];if(f){var r=new FileReader();r.onload=function(ev){loadManifestText(ev.target.result);};r.readAsText(f,'utf-8');this.value='';}});
document.getElementById('load-url').addEventListener('click',async function(){var btn=this,url=document.getElementById('manifest-url').value.trim();if(!url)return;try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/plugins/fetch-manifest',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({url:url})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.loadFailed','加载失败'));loadManifestText(JSON.stringify(data.manifest,null,2));done();});}catch(e){showToast(e.message||String(e),'err');}});
document.getElementById('install-submit').addEventListener('click',async function(){var btn=this;try{await runButton(btn,t('common.processing','处理中...'),async function(){var manifest=JSON.parse(document.getElementById('manifest-json').value);var res=await fetch('/api/admin/plugins',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(manifest)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.installFailed','安装失败'));location.reload();});}catch(e){showToast(e.message||String(e),'err');}});
document.getElementById('check-updates').addEventListener('click',async function(){var btn=this;try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/plugins/check-updates',{method:'POST',headers:nonceHeaders(true),body:'{}'});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.checkFailed','检查失败'));var found=0;(data.updates||[]).forEach(function(u){var box=document.getElementById('plugin-update-'+u.id);if(!box)return;if(u.hasUpdate){found++;box.style.display='block';box.innerHTML=escClient(t('admin.plugins.updateAvailable','发现新版本'))+' '+escClient(u.remoteVersion)+' <button class="btn btn-sm" data-action="update" data-id="'+escClient(u.id)+'">'+escClient(t('admin.plugins.update','更新'))+'</button>';}else if(u.error){box.style.display='block';box.textContent=t('admin.plugins.checkFailed','检查失败')+'：'+u.error;}});done();if(!found)showToast(t('admin.plugins.noUpdates','没有可用更新'));});}catch(e){showToast(e.message||String(e),'err');}});
document.querySelectorAll('.tag-filter').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.tag-filter').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');var tag=btn.dataset.tag;document.querySelectorAll('.ext-card').forEach(function(card){var tags=[];try{tags=JSON.parse(card.dataset.tags||'[]');}catch(e){}card.style.display=!tag||tags.indexOf(tag)!==-1?'':'none';});});});
document.addEventListener('change',async function(e){var cb=e.target.closest('input[data-action="toggle"]');if(!cb)return;try{var id=cb.dataset.id;var res=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/toggle',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({enabled:cb.checked})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.actionFailed','操作失败'));location.reload();}catch(err){showToast(err.message||String(err),'err');cb.checked=!cb.checked;}});
document.addEventListener('click',async function(e){var btn=e.target.closest('[data-action]');if(!btn)return;var id=btn.dataset.id;try{if(btn.dataset.action==='delete'){if(!confirm(t('admin.plugins.deleteConfirmPrefix','删除插件')+' '+id+' ?'))return;await runButton(btn,t('common.deleting','删除中...'),async function(){var r=await fetch('/api/admin/plugins/'+encodeURIComponent(id),{method:'DELETE',headers:nonceHeaders()});var d=await r.json();if(!r.ok)throw new Error(d.error||t('admin.plugins.deleteFailed','删除失败'));location.reload();});}if(btn.dataset.action==='share'){await runButton(btn,t('common.processing','处理中...'),async function(done){currentShare.id=id;openModal('share-modal');var r2=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/share');var d2=await r2.json();if(!r2.ok)throw new Error(d2.error||t('admin.plugins.shareFailed','分享失败'));currentShare.manifestUrl=d2.manifestUrl;document.getElementById('share-install-url').value=d2.installUrl||'';document.getElementById('share-manifest-url').value=d2.manifestUrl||'';document.getElementById('share-notify').checked=!!d2.shareNotify;done();});}if(btn.dataset.action==='update'){await runButton(btn,t('common.processing','处理中...'),async function(){var r3=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/update-from-url',{method:'POST',headers:nonceHeaders(true),body:'{}'});var d3=await r3.json();if(!r3.ok)throw new Error(d3.error||t('admin.plugins.updateFailed','更新失败'));location.reload();});}}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('share-notify').addEventListener('change',async function(){if(!currentShare.id)return;var r=await fetch('/api/admin/plugins/'+encodeURIComponent(currentShare.id)+'/share-notify',{method:'PUT',headers:nonceHeaders(true),body:'{}'});var d=await r.json();if(!r.ok){showToast(d.error||t('admin.plugins.saveFailed','保存失败'),'err');return;}this.checked=!!d.shareNotify;showToast(t('admin.editor.saved','已保存'));});
document.querySelectorAll('[data-copy]').forEach(function(btn){btn.addEventListener('click',function(){var el=document.getElementById(btn.dataset.copy);navigator.clipboard?.writeText(el.value);showToast(t('admin.common.copied','已复制 URL'));});});
document.getElementById('download-share').addEventListener('click',async function(){if(!currentShare.id)return;var r=await fetch('/api/admin/plugins/'+encodeURIComponent(currentShare.id)+'/manifest');var manifest=await r.json();var blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(manifest.slug||manifest.id||'plugin')+'.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0);});
var installParam=new URLSearchParams(location.search).get('install');if(installParam){openModal('install-modal');document.getElementById('manifest-url').value=installParam;document.getElementById('load-url').click();}
`
	});
}

export function renderPluginEditor(user: UserPayload, plugin: any): string {
	const pluginId = String(plugin.id || plugin.slug || '');
	const safePluginId = escapeHtml(pluginId);
	const activeTheme = DEFAULT_THEME;
	const pluginI18n = parseJson(plugin.i18n, {}) as Record<string, any>;
	const code = {
		css: String(plugin.css || ''),
		html: String(plugin.html || ''),
		headHtml: String(plugin.head_html || ''),
		js: String(plugin.js || ''),
		blockTypes: JSON.stringify(parseJson(plugin.block_types, []), null, 2),
		configSchema: JSON.stringify(parseJson(plugin.config_schema, {}), null, 2),
		permissions: JSON.stringify(parseJson(plugin.permissions, []), null, 2),
		tags: JSON.stringify(parseJson(plugin.tags, []), null, 2),
		config: JSON.stringify(parseJson(plugin.config, {}), null, 2),
	};
	const typeOptions = ['system', 'theme', 'widget', 'integration']
		.map((type) => `<option value="${type}" ${String(plugin.type || 'system') === type ? 'selected' : ''}>${type}</option>`)
		.join('');
return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(plugin.name || pluginId)} - 插件编辑器</title>
${FAVICON_LINKS}
<script src="${ACE}/ace.min.js"></script><script src="${ACE}/ext-language_tools.min.js"></script><script src="${ACE}/ext-searchbox.min.js"></script><script src="${ACE}/ext-beautify.min.js"></script><script src="${ACE}/theme-${activeTheme}.min.js"></script>
<style>
:root{color-scheme:dark;--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--danger:#f85149;--ok:#3fb950;--warn:#d2991d;--radius:8px;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;--mono:"Cascadia Code","Consolas",monospace;--z-base:0;--z-header:1000;--z-dropdown:1100;--z-modal:2000;--z-toast:2200}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--font);font-size:14px;color:var(--text);background:var(--bg);height:100vh;overflow:hidden;display:flex;flex-direction:column}a{color:var(--accent);text-decoration:none}input,select,textarea{font:inherit;color:inherit}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}.ace_editor{font-family:var(--mono)!important;font-size:13px!important}
.topbar{position:relative;z-index:var(--z-header);isolation:isolate;height:48px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:0 14px;flex:0 0 auto;min-width:0}.topbar strong{color:var(--accent);min-width:0;max-width:28vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.t-right{margin-left:auto;display:flex;gap:7px;align-items:center;flex:0 0 auto;min-width:max-content}.muted{color:var(--muted);white-space:nowrap}.enable-row{position:relative;min-height:40px;border:1px solid var(--border);border-radius:12px;background:#0d141d;display:flex;gap:9px;align-items:center;margin-top:8px;padding:8px 10px;color:#d7dee9;font-weight:750}.enable-row input{position:absolute;opacity:0;pointer-events:none}.enable-row:before{content:'';width:34px;height:20px;border-radius:999px;background:#30363d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03);transition:.16s}.enable-row:after{content:'';position:absolute;width:14px;height:14px;left:13px;border-radius:50%;background:#8b949e;transition:.16s}.enable-row:has(input:checked):before{background:linear-gradient(90deg,var(--accent),#3fb950)}.enable-row:has(input:checked):after{transform:translateX(14px);background:#fff}.lang-picker{position:relative;z-index:var(--z-dropdown);flex:0 0 auto}.lang-btn{height:32px;min-width:118px;display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:999px;background:#0d1320;color:var(--text);padding:0 10px;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap;flex:0 0 auto}.lang-btn [data-language-name]{white-space:nowrap}.lang-btn:hover{border-color:var(--accent);background:#111b2a}.lang-btn>svg{opacity:.55;flex:0 0 auto}.lang-flag svg{width:20px;height:14px;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}.lang-menu{position:absolute;right:0;top:calc(100% + 7px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:0 22px 70px rgba(0,0,0,.55);display:none;max-height:360px;overflow:auto;z-index:var(--z-dropdown)}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border-radius:8px;cursor:pointer;color:#d8dee9}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.1);color:var(--accent)}.lang-menu li small{color:var(--muted);font-size:11px}.fi{line-height:1}.ide-body{position:relative;z-index:var(--z-base);flex:1;display:flex;overflow:hidden;min-height:0;background:var(--bg)}.ide-sb{width:300px;background:linear-gradient(180deg,rgba(22,27,34,.98),rgba(13,17,23,.98));border-right:1px solid var(--border);overflow:auto;padding:14px;flex:0 0 auto}.ide-sb h3{font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:.06em;margin:0 0 12px}.fg{margin-bottom:11px}.fg label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted);letter-spacing:.04em;margin-bottom:5px}.fg input,.fg select,.fg textarea,.i18n-locale-input,.i18n-table input,.sel-theme{width:100%;min-height:34px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);background:#0b1017;color:var(--text);outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.02);transition:border-color .14s,background-color .14s,box-shadow .14s}.fg select,.sel-theme{appearance:none;-webkit-appearance:none;padding-right:30px;background-color:#0b1017;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%239fb4cc' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px 14px}.fg select:hover,.sel-theme:hover{border-color:#3a4656;background-color:#0d141d;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%23c9d8ea' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px 14px}.t-right .sel-theme{width:132px;flex:0 0 132px}.fg textarea{min-height:82px;resize:vertical}.fg input:focus,.fg select:focus,.fg textarea:focus,.i18n-locale-input:focus,.i18n-table input:focus,.sel-theme:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.12);background-color:#0d141d}.ide-main{flex:1;min-width:0;display:flex;flex-direction:column}.ed-tabs{height:44px;background:#111821;border-bottom:1px solid var(--border);display:flex;align-items:center;flex:0 0 auto;overflow-x:auto;padding:0 10px;gap:4px}.ed-tab{height:32px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;font-size:12px;font-weight:750;color:#a8b8cc;border:1px solid transparent;border-radius:8px;background:none;cursor:pointer;white-space:nowrap}.ed-tab:hover{color:var(--text);background:rgba(88,166,255,.06);border-color:rgba(88,166,255,.14)}.ed-tab.active{color:#fff;border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.14);box-shadow:inset 0 -2px 0 var(--accent)}.ed-tabs-right{margin-left:auto;display:flex;gap:6px;align-items:center;padding-left:8px;background:#111821}.ed-wrap{flex:1;position:relative;overflow:hidden;min-height:0}.ed-panel{display:none;position:absolute;inset:0}.ed-panel.active{display:block}.ed-panel-ace{position:absolute;inset:0}.i18n-panel{position:absolute;inset:0;overflow:auto;padding:16px;background:var(--bg)}.i18n-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:10px}.i18n-localebar{display:flex;gap:8px;align-items:center;margin-bottom:12px}.i18n-locale-input{width:120px}.i18n-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}.i18n-table th,.i18n-table td{border-bottom:1px solid var(--border);padding:8px;text-align:left}.i18n-table th{font-size:11px;text-transform:uppercase;color:var(--muted);background:#111821}.i18n-table input{font-size:13px}.btn{padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;background:transparent;color:var(--text);text-decoration:none}.btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.05)}.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn-primary:hover{color:#fff;opacity:.86}.btn-ok{background:var(--ok);border-color:var(--ok);color:#fff}.btn-danger{background:var(--danger);border-color:var(--danger);color:#fff}.btn-sm{padding:4px 9px;font-size:12px}.sep{border:0;border-top:1px solid var(--border);margin:12px 0}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:999px;font-size:13px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:var(--z-toast)}.toast.show{opacity:1}.toast-ok{background:#122d1f;border:1px solid #1a3d2a;color:var(--ok)}.toast-err{background:#2d1216;border:1px solid #5a1e27;color:var(--danger)}
</style></head><body>
<div class="topbar"><a class="btn btn-sm" href="/admin/plugins" data-i18n="admin.editor.backList">返回列表</a><strong>${escapeHtml(plugin.name || pluginId)}</strong><span class="muted" data-i18n="admin.editor.titleSuffix">插件编辑器</span><div class="t-right"><div class="lang-picker" data-language-picker><button class="lang-btn" type="button" data-language-button aria-label="Language"><span class="lang-flag" data-language-flag>🇨🇳</span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button><ul class="lang-menu" data-language-menu></ul></div>${adminSelect('', { id: 'sel-theme', class: 'sel-theme' })}<a class="btn btn-sm" href="/api/admin/plugins/${safePluginId}/manifest" target="_blank" data-i18n="admin.editor.manifest">Manifest</a></div></div>
<div class="ide-body">
	<aside class="ide-sb">
		<h3 data-i18n="admin.editor.basic">基础信息</h3>
		<div class="fg"><label data-i18n="admin.editor.name">名称</label>${adminInput({ id: 'f-name', value: plugin.name || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.idSlug">ID / Slug</label>${adminInput({ id: 'f-slug', value: plugin.slug || pluginId })}</div>
		<div class="fg"><label data-i18n="admin.editor.version">版本</label>${adminInput({ id: 'f-version', value: plugin.version || '1.0.0' })}</div>
		<div class="fg"><label data-i18n="admin.editor.type">类型</label>${adminSelect(typeOptions, { id: 'f-type' })}</div>
		<div class="fg"><label data-i18n="admin.editor.author">作者</label>${adminInput({ id: 'f-author', value: plugin.author || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.homepage">主页</label>${adminInput({ id: 'f-homepage', value: plugin.homepage || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.icon">图标</label>${adminInput({ id: 'f-icon', value: plugin.icon || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.sourceUrl">Source URL</label>${adminInput({ id: 'f-source-url', value: plugin.source_url || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.description">描述</label>${adminTextarea(String(plugin.description || ''), { id: 'f-description' })}</div>
		<label class="enable-row"><input type="checkbox" id="f-enabled" ${Number(plugin.enabled || 0) === 1 ? 'checked' : ''}> <span data-i18n="admin.editor.enablePlugin">启用插件</span></label>
	</aside>
	<main class="ide-main">
		<div class="ed-tabs">
			<button class="ed-tab active" data-tab="css">CSS<span id="dot-css"></span></button>
			<button class="ed-tab" data-tab="html">HTML<span id="dot-html"></span></button>
			<button class="ed-tab" data-tab="js"><span data-i18n="admin.editor.tabJs">JavaScript</span><span id="dot-js"></span></button>
			<button class="ed-tab" data-tab="head"><span data-i18n="admin.editor.tabHeadHtml">Head HTML</span><span id="dot-head"></span></button>
			<button class="ed-tab" data-tab="blockTypes"><span data-i18n="admin.editor.tabBlockTypes">Block Types</span></button>
			<button class="ed-tab" data-tab="i18n"><span data-i18n="admin.editor.tabI18n">i18n</span></button>
			<button class="ed-tab" data-tab="schema"><span data-i18n="admin.editor.tabConfigSchema">Config Schema</span></button>
			<button class="ed-tab" data-tab="permissions"><span data-i18n="admin.editor.tabPermissions">Permissions</span></button>
			<button class="ed-tab" data-tab="tags"><span data-i18n="admin.editor.tabTags">Tags</span></button>
			<button class="ed-tab" data-tab="config"><span data-i18n="admin.editor.tabConfig">Config</span></button>
			<div class="ed-tabs-right"><button class="btn btn-sm" onclick="formatActive()" data-i18n="admin.editor.format">格式化</button><button class="btn btn-ok btn-sm" onclick="saveAll()" data-i18n="admin.editor.save">保存</button></div>
		</div>
		<div class="ed-wrap">
			<div class="ed-panel active" id="panel-css"><div class="ed-panel-ace" id="ace-css"></div></div>
			<div class="ed-panel" id="panel-html"><div class="ed-panel-ace" id="ace-html"></div></div>
			<div class="ed-panel" id="panel-head"><div class="ed-panel-ace" id="ace-head"></div></div>
			<div class="ed-panel" id="panel-js"><div class="ed-panel-ace" id="ace-js"></div></div>
			<div class="ed-panel" id="panel-blockTypes"><div class="ed-panel-ace" id="ace-blockTypes"></div></div>
			<div class="ed-panel" id="panel-i18n">
				<div class="i18n-panel">
					<div class="i18n-toolbar">
						<div class="muted" data-i18n="admin.editor.i18nHint">插件自己的多语言文案会写入 manifest，分享给别人后仍可使用。</div>
						<button class="btn btn-primary btn-sm" type="button" onclick="addI18nRow()" data-i18n="admin.editor.addI18nKey">添加 Key</button>
					</div>
					<div class="i18n-localebar">
						<input class="i18n-locale-input" id="plugin-i18n-locale" placeholder="ja-JP" data-i18n-placeholder="admin.editor.addLocalePlaceholder">
						<button class="btn btn-sm" type="button" onclick="addI18nLocale()" data-i18n="admin.editor.addLocale">添加语言</button>
					</div>
					<table class="i18n-table">
						<thead id="plugin-i18n-head"></thead>
						<tbody id="plugin-i18n-body"></tbody>
					</table>
				</div>
			</div>
			<div class="ed-panel" id="panel-schema"><div class="ed-panel-ace" id="ace-schema"></div></div>
			<div class="ed-panel" id="panel-permissions"><div class="ed-panel-ace" id="ace-permissions"></div></div>
			<div class="ed-panel" id="panel-tags"><div class="ed-panel-ace" id="ace-tags"></div></div>
			<div class="ed-panel" id="panel-config"><div class="ed-panel-ace" id="ace-config"></div></div>
		</div>
	</main>
</div><div class="toast" id="toast"></div>
<script>
ace.config.set('basePath','${ACE}');
var ACE_THEMES=${jsonScript(ACE_THEMES)}, ACTIVE_THEME=localStorage.getItem('ff.ace.theme')||'${activeTheme}', activeTab='css', changed={};
function cookieLocale(){var m=document.cookie.match(/(?:^|; )ff_locale=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
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
function normalizeClientLocale(value){var raw=String(value||'').trim().replace('_','-'),low=raw.toLowerCase();if(!raw)return '';if(low==='zh'||low==='zh-cn'||low==='zh-hans')return 'zh-CN';if(low==='en'||low==='en-us')return 'en-US';var parts=raw.split('-');return parts[1]?parts[0].toLowerCase()+'-'+parts[1].toUpperCase():parts[0].toLowerCase();}
function pickBrowserLocale(langs){var supported=(langs&&langs.length?langs:[{code:'en-US'},{code:'zh-CN'}]).map(langCode);var nav=((navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language])||[]).map(normalizeClientLocale);for(var i=0;i<nav.length;i++){var item=nav[i];var hit=supported.find(function(code){var normalized=normalizeClientLocale(code);return normalized===item||normalized.split('-')[0]===item.split('-')[0];});if(hit)return hit;}return supported.indexOf('en-US')>=0?'en-US':(supported[0]||'en-US');}
var ADMIN_I18N={}, ADMIN_LANGUAGES=[], ADMIN_LOCALE=localStorage.getItem('ff.locale')||cookieLocale()||pickBrowserLocale()||document.documentElement.lang||'en-US', PLUGIN_I18N_RAW=${jsonScript(pluginI18n)}, PLUGIN_I18N_LOCALES=['zh-CN','en-US'];
function t(key,fallback){return (ADMIN_I18N&&ADMIN_I18N[key])||fallback||key;}
function applyEditorI18n(){
	document.querySelectorAll('[data-i18n]').forEach(function(el){var k=el.getAttribute('data-i18n');if(k&&ADMIN_I18N[k])el.textContent=ADMIN_I18N[k];});
	document.querySelectorAll('[data-i18n-title]').forEach(function(el){var k=el.getAttribute('data-i18n-title');if(k&&ADMIN_I18N[k])el.setAttribute('title',ADMIN_I18N[k]);});
	document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){var k=el.getAttribute('data-i18n-placeholder');if(k&&ADMIN_I18N[k])el.setAttribute('placeholder',ADMIN_I18N[k]);});
}
function renderLanguageSwitchers(){var langs=ADMIN_LANGUAGES.length?ADMIN_LANGUAGES:[{code:'zh-CN',native_name:'简体中文'},{code:'en-US',native_name:'English'}];document.querySelectorAll('[data-language-switch]').forEach(function(sel){sel.innerHTML=langs.map(function(lang){var code=lang.code||lang.locale,name=lang.native_name||lang.name||code;return '<option value="'+escClient(code)+'">'+escClient(name)+'</option>';}).join('');sel.value=ADMIN_LOCALE;sel.onchange=function(){loadEditorI18n(this.value);};});document.querySelectorAll('[data-language-picker]').forEach(function(picker){var btn=picker.querySelector('[data-language-button]'),menu=picker.querySelector('[data-language-menu]'),flag=picker.querySelector('[data-language-flag]'),name=picker.querySelector('[data-language-name]');var current=langs.find(function(lang){return langCode(lang)===ADMIN_LOCALE;})||langs[0];if(flag)flag.innerHTML=flagEmoji(langCode(current));if(name)name.textContent=langName(current);if(menu){menu.innerHTML=langs.map(function(lang){var code=langCode(lang);return '<li data-code="'+escClient(code)+'" class="'+(code===ADMIN_LOCALE?'active':'')+'"><span class="lang-flag">'+flagEmoji(code)+'</span><span>'+escClient(langName(lang))+'</span><small>('+escClient(code)+')</small></li>';}).join('');menu.querySelectorAll('li').forEach(function(li){li.onclick=function(e){e.stopPropagation();menu.classList.remove('open');loadEditorI18n(li.dataset.code);};});}if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.onclick=function(e){e.stopPropagation();document.querySelectorAll('[data-language-menu].open').forEach(function(m){if(m!==menu)m.classList.remove('open');});if(menu)menu.classList.toggle('open');};}});}
document.addEventListener('click',function(e){if(!e.target.closest('[data-language-picker]'))document.querySelectorAll('[data-language-menu].open').forEach(function(m){m.classList.remove('open');});});
function loadEditorI18n(locale){return fetch('/api/i18n?locale='+encodeURIComponent(locale||ADMIN_LOCALE)).then(function(r){return r.json();}).then(function(d){ADMIN_LANGUAGES=d.languages||ADMIN_LANGUAGES;var hadStoredLocale=!!(localStorage.getItem('ff.locale')||cookieLocale());var nextLocale=hadStoredLocale?(d.locale||locale||ADMIN_LOCALE):pickBrowserLocale(ADMIN_LANGUAGES);if(!hadStoredLocale&&nextLocale&&nextLocale!==(d.locale||locale))return loadEditorI18n(nextLocale);ADMIN_LOCALE=nextLocale||d.locale||locale||ADMIN_LOCALE;ADMIN_I18N=d.messages||{};localStorage.setItem('ff.locale',ADMIN_LOCALE);document.cookie='ff_locale='+encodeURIComponent(ADMIN_LOCALE)+'; Path=/; Max-Age=31536000; SameSite=Lax';document.documentElement.lang=ADMIN_LOCALE;renderLanguageSwitchers();applyEditorI18n();}).catch(function(){renderLanguageSwitchers();});}
loadEditorI18n(ADMIN_LOCALE);
function nonceHeaders(json){var h={'X-Timestamp':String(Math.floor(Date.now()/1000)),'X-Nonce':crypto.randomUUID()};if(json)h['Content-Type']='application/json';return h;}
function showToast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast toast-'+(type==='err'?'err':'ok')+' show';clearTimeout(t._tmr);t._tmr=setTimeout(function(){t.className='toast';},2200);}
function makeEditor(id,mode,value){var ed=ace.edit('ace-'+id);ed.setTheme('ace/theme/'+ACTIVE_THEME);ed.session.setMode('ace/mode/'+mode);ed.setOptions({fontSize:'13px',tabSize:2,useSoftTabs:true,showPrintMargin:false,wrap:true,enableBasicAutocompletion:true,enableLiveAutocompletion:true,scrollPastEnd:.3});ed.setValue(value||'',-1);ed.session.on('change',function(){changed[id]=true;var dot=document.getElementById('dot-'+id);if(dot)dot.textContent=' ●';});return ed;}
var editors={
 css:makeEditor('css','css',${jsonScript(code.css)}),
 html:makeEditor('html','html',${jsonScript(code.html)}),
 head:makeEditor('head','html',${jsonScript(code.headHtml)}),
 js:makeEditor('js','javascript',${jsonScript(code.js)}),
 blockTypes:makeEditor('blockTypes','json',${jsonScript(code.blockTypes)}),
 schema:makeEditor('schema','json',${jsonScript(code.configSchema)}),
 permissions:makeEditor('permissions','json',${jsonScript(code.permissions)}),
 tags:makeEditor('tags','json',${jsonScript(code.tags)}),
 config:makeEditor('config','json',${jsonScript(code.config)})
};
document.getElementById('sel-theme').innerHTML=ACE_THEMES.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');document.getElementById('sel-theme').value=ACTIVE_THEME;document.getElementById('sel-theme').addEventListener('change',function(){ACTIVE_THEME=this.value;localStorage.setItem('ff.ace.theme',ACTIVE_THEME);Object.values(editors).forEach(function(ed){ed.setTheme('ace/theme/'+ACTIVE_THEME);});});
document.querySelectorAll('[data-tab]').forEach(function(btn){btn.addEventListener('click',function(){switchTab(btn.dataset.tab);});});
function switchTab(tab){activeTab=tab;document.querySelectorAll('[data-tab]').forEach(function(b){b.classList.toggle('active',b.dataset.tab===tab);});document.querySelectorAll('.ed-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+tab);});if(editors[tab])setTimeout(function(){editors[tab].resize(true);editors[tab].focus();},20);}
function formatActive(){if(!editors[activeTab])return;try{var beautify=ace.require('ace/ext/beautify');beautify.beautify(editors[activeTab].session);}catch(e){showToast(t('admin.editor.formatMissing','格式化插件未加载'),'err');}}
function readJson(id,fallback){var raw=editors[id].getValue().trim();if(!raw)return fallback;return JSON.parse(raw);}
function escClient(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function normalizePluginI18nRows(){
	var localeSet={'zh-CN':true,'en-US':true}, rows=[];
	Object.keys(PLUGIN_I18N_RAW||{}).sort().forEach(function(key){
		var value=PLUGIN_I18N_RAW[key], row={key:key,values:{}};
		if(value&&typeof value==='object'){
			Object.keys(value).forEach(function(locale){localeSet[locale]=true;row.values[locale]=String(value[locale]||'');});
		}else{
			row.values['en-US']=String(value||'');
		}
		rows.push(row);
	});
	PLUGIN_I18N_LOCALES=Object.keys(localeSet).sort(function(a,b){if(a==='zh-CN')return -1;if(b==='zh-CN')return 1;if(a==='en-US')return -1;if(b==='en-US')return 1;return a.localeCompare(b);});
	return rows.length?rows:[{key:'plugin.title',values:{'zh-CN':'','en-US':''}}];
}
var PLUGIN_I18N_ROWS=normalizePluginI18nRows();
function renderPluginI18n(){
	var head=document.getElementById('plugin-i18n-head'), body=document.getElementById('plugin-i18n-body');
	head.innerHTML='<tr><th data-i18n="admin.editor.i18nKey">Key</th>'+PLUGIN_I18N_LOCALES.map(function(locale){return '<th>'+escClient(locale)+'</th>';}).join('')+'<th></th></tr>';
	body.innerHTML=PLUGIN_I18N_ROWS.map(function(row,i){
		return '<tr data-i="'+i+'"><td><input data-i18n-key value="'+escClient(row.key)+'"></td>'+PLUGIN_I18N_LOCALES.map(function(locale){return '<td><input data-i18n-locale="'+escClient(locale)+'" value="'+escClient(row.values[locale]||'')+'"></td>';}).join('')+'<td><button class="btn btn-danger btn-sm" onclick="removeI18nRow('+i+')">×</button></td></tr>';
	}).join('');
	applyEditorI18n();
}
function readPluginI18n(){
	var out={};
	document.querySelectorAll('#plugin-i18n-body tr').forEach(function(tr){
		var key=tr.querySelector('[data-i18n-key]').value.trim();
		if(!key)return;
		var values={};
		tr.querySelectorAll('[data-i18n-locale]').forEach(function(inp){values[inp.dataset.i18nLocale]=inp.value;});
		out[key]=values;
	});
	return out;
}
function syncPluginI18nRows(){
	PLUGIN_I18N_ROWS=[];
	document.querySelectorAll('#plugin-i18n-body tr').forEach(function(tr){
		var row={key:tr.querySelector('[data-i18n-key]').value.trim(),values:{}};
		tr.querySelectorAll('[data-i18n-locale]').forEach(function(inp){row.values[inp.dataset.i18nLocale]=inp.value;});
		PLUGIN_I18N_ROWS.push(row);
	});
}
function addI18nRow(){syncPluginI18nRows();var values={};PLUGIN_I18N_LOCALES.forEach(function(locale){values[locale]='';});PLUGIN_I18N_ROWS.push({key:'',values:values});renderPluginI18n();}
function removeI18nRow(i){syncPluginI18nRows();PLUGIN_I18N_ROWS.splice(i,1);renderPluginI18n();}
function addI18nLocale(){syncPluginI18nRows();var input=document.getElementById('plugin-i18n-locale');var locale=(input.value||'').trim();if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)){showToast(t('admin.editor.addLocaleInvalid','Locale 格式应类似 ja-JP'),'err');return;}if(PLUGIN_I18N_LOCALES.indexOf(locale)===-1)PLUGIN_I18N_LOCALES.push(locale);PLUGIN_I18N_ROWS.forEach(function(row){if(row.values[locale]===undefined)row.values[locale]='';});input.value='';renderPluginI18n();}
async function saveAll(){try{var body={id:${jsonScript(pluginId)},slug:document.getElementById('f-slug').value.trim(),name:document.getElementById('f-name').value.trim(),version:document.getElementById('f-version').value.trim(),type:document.getElementById('f-type').value,author:document.getElementById('f-author').value.trim(),homepage:document.getElementById('f-homepage').value.trim(),icon:document.getElementById('f-icon').value.trim(),sourceUrl:document.getElementById('f-source-url').value.trim(),description:document.getElementById('f-description').value,enabled:document.getElementById('f-enabled').checked,css:editors.css.getValue(),html:editors.html.getValue(),headHtml:editors.head.getValue(),js:editors.js.getValue(),blockTypes:readJson('blockTypes',[]),i18n:readPluginI18n(),configSchema:readJson('schema',{}),permissions:readJson('permissions',[]),tags:readJson('tags',[]),config:readJson('config',{})};var res=await fetch('/api/admin/plugins/'+encodeURIComponent(${jsonScript(pluginId)}),{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.error||'保存失败');changed={};document.querySelectorAll('[id^="dot-"]').forEach(function(d){d.textContent='';});showToast(t('admin.editor.saved','已保存'));}catch(e){showToast(e.message||String(e),'err');}}
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveAll();}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='F'){e.preventDefault();formatActive();}});
renderPluginI18n();
setTimeout(function(){editors.css.resize(true);},50);
</script></body></html>`;
}

const AI_TRANSLATE_CONTROLS = `
<div class="ai-trans-ctrl">
  <button class="btn btn-sm btn-primary" id="ai-trans-btn" onclick="aiTranslateMissing()" data-i18n="admin.i18n.aiTranslate">AI 翻译</button>
  <button class="btn btn-sm" onclick="aiOpenConfig()" data-i18n-title="admin.i18n.aiSettings" title="AI 翻译设置">⚙</button>
</div>`;

const AI_TRANSLATE_MODAL = `
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

export function renderAdminI18n(user: UserPayload, data: any): string {
	const languages = (data.languages || []).filter((lang: any) => Number(lang.enabled ?? 1) === 1);
	const langData = languages.length ? languages : [{ code: 'zh-CN', name: 'Chinese (Simplified)', native_name: '简体中文' }, { code: 'en-US', name: 'English', native_name: 'English' }];
	const translations = data.translations || [];
	const initialSrc = langData.find((lang: any) => String(lang.code).startsWith('en'))?.code || langData[0]?.code || 'en-US';
	const initialDst = langData.find((lang: any) => String(lang.code).startsWith('zh'))?.code || langData[1]?.code || initialSrc;
	return renderAdminLayout({
		title: '翻译管理',
		subtitle: '管理界面文案、语言目录和翻译 key。支持批量编辑、语言增删和 AI 辅助填充。',
		titleKey: 'admin.i18n.title',
		subtitleKey: 'admin.i18n.subtitle',
		active: 'translations',
		user,
		head: `<style>
.i18n-workbench{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:12px}
.i18n-toolbar{border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.045),rgba(22,27,34,.92));padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:nowrap;overflow-x:auto}
.i18n-toolbar input,.i18n-toolbar select{height:34px;flex:0 0 auto}
.i18n-toolbar select{width:180px}
.i18n-table-shell{min-height:0;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr)}
.i18n-table-scroll{min-height:0;overflow:auto}
.i18n-table-scroll .table{min-width:920px}
.i18n-table-scroll th{position:sticky;top:0;background:#111821;z-index:2}
.i18n-footer{border:1px solid var(--border);border-radius:12px;background:rgba(13,19,32,.72);padding:10px 12px;color:var(--muted)}
.i18n-filter{width:260px;min-width:180px;max-width:260px}.i18n-flag{display:inline-grid;place-items:center;width:22px;height:22px;font-size:15px;flex:0 0 auto}.i18n-key-col{width:210px}.i18n-action-col{width:80px}.i18n-key-name{color:var(--accent);font-family:var(--mono)}.ai-trans-ctrl{display:flex;gap:6px;align-items:center;flex:0 0 auto}.locale-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}.locale-option{justify-content:flex-start;padding:10px}
</style>`,
		content: `
<div class="i18n-workbench">
  <div class="i18n-toolbar">
    ${adminInput({ id: 't-filter', class: 'i18n-filter', 'data-i18n-placeholder': 'admin.i18n.searchKey', placeholder: '搜索 key...', onkeyup: 'renderTable()' })}
    <span class="i18n-flag" id="t-src-flag"></span>
    ${adminSelect('', { id: 't-src', onchange: "updateFlag('t-src-flag',this.value);renderTable()" })}
    <span class="muted-inline">→</span>
    <span class="i18n-flag" id="t-dst-flag"></span>
    ${adminSelect('', { id: 't-dst', onchange: "updateFlag('t-dst-flag',this.value);renderTable()" })}
    ${adminButton('admin.i18n.language', '+ 语言', { class: 'btn-sm', onclick: 'openAddLocale()', 'data-i18n-title': 'admin.i18n.addLanguageTitle', title: '添加翻译语言' }, 'btn-outline')}
    ${adminButton('admin.i18n.removeLanguage', '删除语言', { class: 'btn-sm danger-link', onclick: 'removeLocale()', 'data-i18n-title': 'admin.i18n.removeLanguageTitle', title: '移除当前目标语言' }, 'btn-outline')}
    ${AI_TRANSLATE_CONTROLS}
    <div class="spacer"></div>
    ${adminButton('admin.i18n.addKey', '添加 Key', { class: 'btn-sm', onclick: 'addRow()' }, 'btn-primary')}
    ${adminButton('admin.i18n.batchSave', '批量保存', { class: 'btn-sm', id: 't-save-all', onclick: 'saveAllTranslations()' }, 'btn-ok')}
  </div>
  <div class="i18n-table-shell">
  <div class="i18n-table-scroll">
    <table class="table" id="t-table">
      <thead><tr><th class="i18n-key-col" data-i18n="admin.i18n.scopeKey">Scope / Key</th><th id="t-src-head">原文</th><th id="t-dst-head">翻译</th><th class="i18n-action-col"></th></tr></thead>
      <tbody id="t-body"></tbody>
    </table>
  </div>
  </div>
  <div class="i18n-footer hidden-file" id="t-empty" data-i18n="admin.i18n.emptyKeys">暂无翻译 key，点击“添加 Key”创建。</div>
</div>
${AI_TRANSLATE_MODAL}
<div class="modal-ov" id="add-locale-modal">
  <div class="modal modal-wide">
    <div class="modal-hd"><h3 data-i18n="admin.i18n.addLanguageTitle">添加翻译语言</h3><button class="modal-close" onclick="closeModal('add-locale-modal')">×</button></div>
    ${adminInput({ id: 'locale-filter', class: 'mb-12', 'data-i18n-placeholder': 'admin.i18n.searchLanguage', placeholder: '搜索语言...', oninput: 'renderLocaleGrid()' })}
    <div id="locale-grid" class="locale-grid"></div>
  </div>
</div>`,
		script: `
var ACTIVE_LANGS=${jsonScript(langData)};
var ALL_ROWS=${jsonScript(translations)};
var LOCALES=${jsonScript(localeCatalog)};
var CURRENT_SRC=${jsonScript(initialSrc)}, CURRENT_DST=${jsonScript(initialDst)};
function countryFor(code){var found=LOCALES.find(function(l){return l.code===code;});if(found)return found.country;var p=String(code||'').toLowerCase();if(p.startsWith('zh'))return 'cn';if(p.startsWith('en'))return 'us';return p.split('-').pop()||'us';}
var TRANSLATION_FLAG={cn:'🇨🇳',tw:'🇹🇼',us:'🇺🇸',jp:'🇯🇵',kr:'🇰🇷',fr:'🇫🇷',de:'🇩🇪',es:'🇪🇸',br:'🇧🇷',ru:'🇷🇺',vn:'🇻🇳',id:'🇮🇩',th:'🇹🇭',sa:'🇸🇦'};
function translationFlag(code){return TRANSLATION_FLAG[countryFor(code)]||'🌐';}
function labelFor(code){var found=LOCALES.find(function(l){return l.code===code;});if(found)return found.native+' ('+code+')';var active=ACTIVE_LANGS.find(function(l){return l.code===code;});return active?(active.native_name||active.name||code)+' ('+code+')':code;}
function updateFlag(id,code){var el=document.getElementById(id);if(el)el.textContent=translationFlag(code);}
function renderSelects(){var opts=ACTIVE_LANGS.map(function(l){return '<option value="'+l.code+'">'+labelFor(l.code)+'</option>';}).join('');document.getElementById('t-src').innerHTML=opts;document.getElementById('t-dst').innerHTML=opts;document.getElementById('t-src').value=CURRENT_SRC;document.getElementById('t-dst').value=CURRENT_DST;updateFlag('t-src-flag',CURRENT_SRC);updateFlag('t-dst-flag',CURRENT_DST);}
function keyId(row){return row.scope+'\\u0000'+row.key;}
function uniqueKeys(){var map={};ALL_ROWS.forEach(function(r){map[keyId(r)]={scope:r.scope||'system',key:r.key};});return Object.values(map).sort(function(a,b){return (a.scope+':'+a.key).localeCompare(b.scope+':'+b.key);});}
function val(scope,key,locale){var row=ALL_ROWS.find(function(r){return (r.scope||'system')===scope&&r.key===key&&r.locale===locale;});return row?row.value:'';}
function setCached(scope,key,locale,value){var row=ALL_ROWS.find(function(r){return (r.scope||'system')===scope&&r.key===key&&r.locale===locale;});if(row)row.value=value;else ALL_ROWS.push({scope:scope,key:key,locale:locale,value:value});}
function escClient(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function renderTable(){CURRENT_SRC=document.getElementById('t-src').value;CURRENT_DST=document.getElementById('t-dst').value;var q=document.getElementById('t-filter').value.toLowerCase();var rows=uniqueKeys().filter(function(r){return !q||(r.scope+':'+r.key).toLowerCase().indexOf(q)!==-1;});document.getElementById('t-src-head').textContent=t('admin.i18n.sourceText','原文')+' ('+CURRENT_SRC+')';document.getElementById('t-dst-head').textContent=t('admin.i18n.translation','翻译')+' ('+CURRENT_DST+')';document.getElementById('t-empty').style.display=rows.length?'none':'block';document.getElementById('t-body').innerHTML=rows.map(function(r){var sv=val(r.scope,r.key,CURRENT_SRC),dv=val(r.scope,r.key,CURRENT_DST);return '<tr data-scope="'+escClient(r.scope)+'" data-key="'+escClient(r.key)+'"><td><code>'+escClient(r.scope)+'</code><br><span class="i18n-key-name">'+escClient(r.key)+'</span></td><td><input class="t-cell-edit" data-locale="'+CURRENT_SRC+'" value="'+escClient(sv)+'" oninput="this.dataset.dirty=1;setCached(this.closest(\\'tr\\').dataset.scope,this.closest(\\'tr\\').dataset.key,this.dataset.locale,this.value)"></td><td><input class="t-cell-edit '+(dv?'':'t-missing')+'" data-locale="'+CURRENT_DST+'" value="'+escClient(dv)+'" oninput="this.dataset.dirty=1;this.classList.remove(\\'t-missing\\');setCached(this.closest(\\'tr\\').dataset.scope,this.closest(\\'tr\\').dataset.key,this.dataset.locale,this.value)"></td><td><button class="btn btn-danger btn-sm" onclick="deleteRow(this)">'+escClient(t('admin.common.delete','删除'))+'</button></td></tr>';}).join('');}
function addRow(){var scope=prompt(t('admin.i18n.scopePrompt','Scope'),'system')||'system';var key=prompt(t('admin.i18n.keyPrompt','Key'));if(!key)return;setCached(scope.trim()||'system',key.trim(),CURRENT_SRC,'');setCached(scope.trim()||'system',key.trim(),CURRENT_DST,'');renderTable();}
async function deleteRow(btn){var tr=btn.closest('tr'),scope=tr.dataset.scope,key=tr.dataset.key;if(!confirm(t('admin.i18n.deleteConfirm','删除这个翻译 key？')+' '+scope+':'+key))return;try{await runButton(btn,t('common.deleting','删除中...'),async function(done){var res=await fetch('/api/admin/i18n/translations/'+encodeURIComponent(scope)+'/'+encodeURIComponent(key),{method:'DELETE',headers:nonceHeaders()});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.deleteFailed','删除失败'));ALL_ROWS=ALL_ROWS.filter(function(r){return !((r.scope||'system')===scope&&r.key===key);});renderTable();done();showToast(t('admin.i18n.deleted','已删除'));});}catch(e){showToast(e.message||String(e),'err');}}
async function saveAllTranslations(){var btn=document.getElementById('t-save-all');var entries=[];document.querySelectorAll('#t-body tr').forEach(function(tr){tr.querySelectorAll('input[data-locale]').forEach(function(inp){entries.push({scope:tr.dataset.scope,key:tr.dataset.key,locale:inp.dataset.locale,value:inp.value});});});try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/i18n/translations',{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({entries:entries})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.saveFailed','保存失败'));document.querySelectorAll('.t-cell-edit').forEach(function(i){i.dataset.dirty='';i.style.borderColor='';});done();showToast(t('admin.i18n.savedPrefix','已保存')+' '+(data.count||entries.length)+' '+t('admin.i18n.rowsSuffix','条'));});}catch(e){showToast(e.message||String(e),'err');}}
function openAddLocale(){openModal('add-locale-modal');renderLocaleGrid();}
function renderLocaleGrid(){var q=(document.getElementById('locale-filter').value||'').toLowerCase();var active=new Set(ACTIVE_LANGS.map(function(l){return l.code;}));document.getElementById('locale-grid').innerHTML=LOCALES.filter(function(l){return !active.has(l.code)&&(!q||(l.code+' '+l.name+' '+l.native).toLowerCase().indexOf(q)!==-1);}).map(function(l){return '<button class="btn btn-outline locale-option" onclick="addLocale(\\''+l.code+'\\')"><span class="lang-flag">'+translationFlag(l.code)+'</span><span>'+escClient(l.native)+'</span><span class="muted">'+escClient(l.code)+'</span></button>';}).join('')||'<div class="muted">'+escClient(t('admin.i18n.noMoreLanguages','没有可添加语言'))+'</div>';}
async function addLocale(code){var meta=LOCALES.find(function(l){return l.code===code;});var res=await fetch('/api/admin/i18n/languages',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({code:code,name:meta.name,native_name:meta.native,enabled:true,sort_order:100})});var data=await res.json();if(!res.ok){showToast(data.error||t('admin.i18n.addFailed','添加失败'),'err');return;}ACTIVE_LANGS.push({code:code,name:meta.name,native_name:meta.native,enabled:1});CURRENT_DST=code;renderSelects();renderTable();closeModal('add-locale-modal');showToast(t('admin.i18n.addedLanguage','已添加语言'));}
async function removeLocale(){var code=document.getElementById('t-dst').value;if(!confirm(t('admin.i18n.disableLanguageConfirm','停用目标语言？')+' '+code))return;var res=await fetch('/api/admin/i18n/languages/'+encodeURIComponent(code),{method:'DELETE',headers:nonceHeaders()});var data=await res.json();if(!res.ok){showToast(data.error||t('admin.i18n.removeFailed','移除失败'),'err');return;}ACTIVE_LANGS=ACTIVE_LANGS.filter(function(l){return l.code!==code;});CURRENT_DST=ACTIVE_LANGS[0]?.code||CURRENT_SRC;renderSelects();renderTable();showToast(t('admin.i18n.removedLanguage','已移除语言'));}
function aiSettings(){try{return JSON.parse(localStorage.getItem('ff_ai_translate')||'{}');}catch(e){return {};}}
function aiOpenConfig(){var s=aiSettings();document.getElementById('ai-api-key').value=s.apiKey||'';document.getElementById('ai-model').value=s.model||'deepseek-v4-flash';document.getElementById('ai-batch-size').value=s.batchSize||20;openModal('ai-config-modal');}
function aiCloseConfig(){closeModal('ai-config-modal');}
function aiSaveControls(){localStorage.setItem('ff_ai_translate',JSON.stringify({apiKey:document.getElementById('ai-api-key').value,model:document.getElementById('ai-model').value,batchSize:Number(document.getElementById('ai-batch-size').value)||20}));}
function aiSaveConfigAndClose(){aiSaveControls();aiCloseConfig();}
async function aiTranslateMissing(){var s=aiSettings();if(!s.apiKey){aiOpenConfig();return;}var limit=Math.max(1,Math.min(100,Number(s.batchSize)||20));var jobs=[];document.querySelectorAll('#t-body tr').forEach(function(tr){if(jobs.length>=limit)return;var src=tr.querySelector('input[data-locale="'+CURRENT_SRC+'"]'),dst=tr.querySelector('input[data-locale="'+CURRENT_DST+'"]');if(src&&dst&&src.value.trim()&&!dst.value.trim())jobs.push({scope:tr.dataset.scope,key:tr.dataset.key,text:src.value,input:dst});});if(!jobs.length){showToast(t('admin.i18n.aiNoMissing','没有需要翻译的空行'),'err');return;}var btn=document.getElementById('ai-trans-btn'),old=btn.textContent;btn.disabled=true;btn.textContent=t('admin.i18n.aiWorking','AI 翻译中...');try{var res=await fetch('/api/admin/i18n/ai-translate',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({apiKey:s.apiKey,model:s.model||'deepseek-v4-flash',sourceLocale:CURRENT_SRC,targetLocale:CURRENT_DST,items:jobs.map(function(j){return {scope:j.scope,key:j.key,text:j.text};})})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.aiFailed','AI 翻译失败'));(data.translations||[]).forEach(function(item,i){var job=jobs[i];var value=item.value||item.translation||'';job.input.value=value;job.input.classList.remove('t-missing');job.input.dataset.dirty=1;setCached(job.scope,job.key,CURRENT_DST,value);});showToast(t('admin.i18n.aiFilledPrefix','AI 已填充')+' '+(data.translations||[]).length+' '+t('admin.i18n.aiFilledSuffix','行，请检查后保存'));}catch(e){showToast(e.message||String(e),'err');}finally{btn.disabled=false;btn.textContent=old;}}
renderSelects();renderTable();`
	});
}

function formatBytes(value: unknown): string {
	const bytes = Number(value || 0);
	if (!bytes) return '未知大小';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isVideoMedia(item: any): boolean {
	return String(item.media_type || '').toLowerCase() === 'video' || String(item.mime_type || '').toLowerCase().startsWith('video/');
}

export function renderAdminMedia(user: UserPayload, data: any, env?: Partial<Env> | Record<string, unknown>): string {
	const page = Math.max(1, Number(data.page || 1));
	const pageSize = Math.max(1, Number(data.pageSize || 24));
	const total = Number(data.total || 0);
	const includePosts = !!data.includePosts;
	const query = String(data.query || '');
	const type = String(data.type || '');
	const pageParams = { includePosts: includePosts ? '1' : '0', q: query, type };
	const mediaTypeOptions = [
		['', 'admin.media.allTypes', '全部类型'],
		['image', 'admin.media.imageType', '图片'],
		['video', 'admin.media.videoType', '视频'],
		['file', 'admin.media.fileType', '文件'],
	].map(([value, key, label]) => `<option value="${value}"${type === value ? ' selected' : ''} data-i18n="${key}">${label}</option>`).join('');
	const items = (data.items || []) as any[];
	const cards = items.length ? items.map((item) => {
		const scope = String(item.scope || 'system');
		const scopeKey = scope === 'system' ? 'admin.media.system' : 'admin.media.post';
		const scopeLabel = scope === 'system' ? '系统' : '帖子';
		const preview = isVideoMedia(item)
			? `<video class="media-thumb" src="${escapeHtml(item.url)}" controls muted preload="metadata"></video>`
			: `<img class="media-thumb" src="${escapeHtml(item.url)}" loading="lazy" alt="${escapeHtml(item.filename || 'media')}">`;
		const postLine = item.post_id
			? `<a class="muted" href="${escapeHtml(publicPostPath(item.post_id, env))}">#${escapeHtml(item.post_id)} ${escapeHtml(item.post_title || '')}</a>`
			: '<span class="muted" data-i18n="admin.media.systemLibrary">系统资源库</span>';
		const deleteButton = scope === 'system' && item.id
			? adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-delete-media': item.id }, 'btn-danger')
			: '';
		return `
<article class="media-card">
	<div class="media-preview">${preview}</div>
	<div class="media-body">
		<div class="media-line"><strong title="${escapeHtml(item.filename || item.key || '')}">${escapeHtml(item.filename || item.key || 'media')}</strong><span class="badge" data-i18n="${scopeKey}">${scopeLabel}</span></div>
		<div class="muted">${escapeHtml(item.media_type || 'media')} · ${item.mime_type ? escapeHtml(item.mime_type) : '<span data-i18n="admin.media.unknownType">未知类型</span>'} · ${Number(item.size_bytes || 0) ? formatBytes(item.size_bytes) : '<span data-i18n="admin.media.unknownSize">未知大小</span>'}</div>
		<div>${postLine}</div>
		<div class="media-actions">
			<a class="btn btn-sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" data-i18n="admin.common.open">打开</a>
			${adminButton('admin.common.copyUrl', '复制 URL', { class: 'btn-sm', 'data-copy-url': item.url })}
			${deleteButton}
		</div>
	</div>
</article>`;
	}).join('') : '<div class="notice" data-i18n="admin.media.empty">暂无媒体。系统媒体可通过上方按钮上传；开启“包含帖子媒体”后会同时扫描帖子里的图片和视频。</div>';
	const toolbar = adminToolbar(`
		<form class="media-filter" method="get" action="/admin/media">
			${adminInput({ name: 'q', value: query, 'data-i18n-placeholder': 'admin.media.searchPlaceholder', placeholder: '搜索文件名、帖子或路径...' })}
			${adminSelect(mediaTypeOptions, { name: 'type' })}
			<input type="hidden" name="includePosts" value="${includePosts ? '1' : '0'}">
			${adminButton('admin.common.search', '搜索', { type: 'submit', class: 'btn-sm' }, 'btn-primary')}
			<a class="btn btn-sm" href="/admin/media?includePosts=${includePosts ? '1' : '0'}" data-i18n="admin.common.reset">重置</a>
		</form>
		<div class="media-actions-bar ml-auto">
			<label class="btn btn-primary btn-sm" for="system-media-file" data-i18n="admin.media.uploadSystem">上传系统媒体</label>
			<input id="system-media-file" class="hidden-file" type="file" accept="image/*,video/*">
			<label class="media-switch"><input id="include-posts" type="checkbox" ${includePosts ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span><span data-i18n="admin.media.includePosts">包含帖子媒体</span></label>
		</div>
	`, 'media-toolbar');
	const mediaShell = `<div class="admin-table-shell">
		<div class="admin-table-scroll"><div class="media-grid">${cards}</div></div>
		<div class="admin-footer">
			<span><span data-i18n="admin.media.totalPrefix">共</span> ${total} <span data-i18n="admin.media.totalSuffix">个媒体</span></span>
			${adminPager('/admin/media', page, pageSize, total, pageParams)}
		</div>
	</div>`;
	return renderAdminLayout({
		title: '媒体管理',
		titleKey: 'admin.media.title',
		subtitle: '管理系统媒体，并可按需查看所有帖子中的图片和视频。默认只显示系统媒体。',
		subtitleKey: 'admin.media.subtitle',
		active: 'media',
		user,
		head: `<style>
.media-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:nowrap}
.media-filter,.media-actions-bar{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
.media-filter .input{width:260px}.media-filter .select{width:180px}
.media-switch{display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:650}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:12px}
.media-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;min-width:0}
.media-preview{height:158px;background:var(--bg);border-bottom:1px solid var(--border);display:grid;place-items:center;overflow:hidden}
.media-thumb{width:100%;height:100%;object-fit:contain;background:#090d14}
.media-body{display:grid;gap:7px;padding:12px;min-width:0}
.media-line{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.media-line strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.media-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin-top:3px}
		</style>`,
		content: `
<div class="admin-workbench">
	${toolbar}
	${mediaShell}
</div>`,
		script: `
document.getElementById('include-posts')?.addEventListener('change',function(){var u=new URL(location.href);u.searchParams.set('includePosts',this.checked?'1':'0');u.searchParams.set('page','1');location.href=u.pathname+'?'+u.searchParams.toString();});
document.getElementById('system-media-file')?.addEventListener('change',async function(){
	if(!this.files||!this.files[0])return;
	var fd=new FormData();fd.append('file',this.files[0]);fd.append('type','system');
	try{
		var res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});
		var data=await res.json();
		if(!res.ok)throw new Error(data.error||t('common.uploadFailed','上传失败'));
		location.reload();
	}catch(e){showToast(e.message||String(e),'err');}
});
document.addEventListener('click',async function(e){
	var copy=e.target.closest('[data-copy-url]');
	if(copy){await navigator.clipboard?.writeText(copy.dataset.copyUrl);showToast(t('admin.common.copied','已复制 URL'));return;}
	var del=e.target.closest('[data-delete-media]');
	if(del){
		if(!confirm(t('admin.media.deleteConfirm','删除这个系统媒体？')))return;
		var res=await fetch('/api/admin/media/'+encodeURIComponent(del.dataset.deleteMedia),{method:'DELETE',headers:nonceHeaders(false)});
		var data=await res.json();
		if(!res.ok){showToast(data.error||t('admin.common.delete','删除')+'失败','err');return;}
		location.reload();
	}
});`
	});
}

export function renderSimpleAdminTable(
	user: UserPayload,
	active: AdminNavKey,
	title: string,
	subtitle: string,
	headers: Array<string | { label: string; key?: string }>,
	rows: string[][],
	empty = '暂无数据',
	i18n?: { titleKey?: string; subtitleKey?: string; emptyKey?: string }
): string {
	const thead = headers.map((header) => {
		const item = typeof header === 'string' ? { label: header } : header;
		return `<th${item.key ? ` data-i18n="${escapeHtml(item.key)}"` : ''}>${escapeHtml(item.label)}</th>`;
	}).join('');
	const tbody = rows.length
		? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
		: `<tr><td colspan="${headers.length}" class="muted"${i18n?.emptyKey ? ` data-i18n="${escapeHtml(i18n.emptyKey)}"` : ''}>${escapeHtml(empty)}</td></tr>`;
	return renderAdminLayout({
		title,
		subtitle,
		titleKey: i18n?.titleKey,
		subtitleKey: i18n?.subtitleKey,
		active,
		user,
		content: `<div class="admin-workbench">${adminTableShell('', `<tr>${thead}</tr>`, tbody)}</div>`
	});
}

export function renderAdminCategories(user: UserPayload, data: { categories: any[]; languages?: AdminLanguage[] } | any[]): string {
	const categories = Array.isArray(data) ? data : data.categories;
	const languages = Array.isArray(data) ? undefined : data.languages;
	const activeContentLocale = languageCode(normalizeContentLanguages(languages)[0]);
	const categoryDefaults: Record<string, { description: string; hero_title: string; hero_description: string }> = {
		all: { description: 'All forum posts.', hero_title: 'Media-first forum feed', hero_description: 'Scan posts fast. Media stays clear.' },
		'1': { description: 'Official updates and release notes.', hero_title: 'Announcements', hero_description: 'Official updates, releases, and site news.' },
		'2': { description: 'Progress notes for projects and plugins.', hero_title: 'Build Logs', hero_description: 'Track implementation notes and release progress.' },
		'3': { description: 'Media-rich examples and demos.', hero_title: 'Showcase', hero_description: 'Media-rich posts, previews, and demos.' },
		'4': { description: 'Proposals and product decisions.', hero_title: 'Ideas', hero_description: 'Short proposals and design discussions.' },
	};
	const rows = categories.map((row) => {
		const localized = (row.localized || {}) as LocalizedValueMap;
		const defaults = categoryDefaults[String(row.id)] || { description: '', hero_title: row.name || '', hero_description: '' };
		const description = localizedValue(localized, 'description', activeContentLocale, row.description || defaults.description);
		const heroTitle = localizedValue(localized, 'hero_title', activeContentLocale, row.hero_title || defaults.hero_title);
		const heroDescription = localizedValue(localized, 'hero_description', activeContentLocale, row.hero_description || defaults.hero_description);
		const name = localizedValue(localized, 'name', activeContentLocale, row.name || '');
		const iconUrl = String(row.icon_url || '');
		const isSystemAll = String(row.id) === 'all';
		const enabled = isSystemAll || Number(row.enabled ?? 1) !== 0;
		const adminOnly = !isSystemAll && Number(row.admin_only ?? 0) !== 0;
		return `<article class="cat-edit ${isSystemAll ? 'cat-edit-system' : ''}" data-category-row data-category-id="${escapeHtml(row.id)}" data-system-category="${isSystemAll ? '1' : '0'}" data-category-fixed="${isSystemAll ? '1' : '0'}" data-localized="${escapeHtml(JSON.stringify(localized))}">
		<div class="cat-drag-slot">
			${isSystemAll ? '' : `<button class="cat-drag-handle" type="button" draggable="true" title="拖动排序" aria-label="拖动排序" data-i18n-title="admin.categories.dragHandle" data-category-drag-handle><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="4" r="1.2"></circle><circle cx="11" cy="4" r="1.2"></circle><circle cx="5" cy="8" r="1.2"></circle><circle cx="11" cy="8" r="1.2"></circle><circle cx="5" cy="12" r="1.2"></circle><circle cx="11" cy="12" r="1.2"></circle></svg></button>`}
		</div>
		<div class="cat-icon-col">
			<button class="cat-icon-card" type="button" data-category-icon-pick>
				<span class="cat-icon-preview">${iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="">` : '<span>#</span>'}</span>
				<small data-i18n="admin.categories.icon">分类图标</small>
			</button>
			<input type="hidden" name="icon_url" value="${escapeHtml(iconUrl)}">
		</div>
		<div class="cat-main">
			<div class="cat-main-top">
				${adminField('admin.categories.name', '分类名称', adminInput({ name: 'name', value: name, 'data-i18n-field': 'name' }))}
				${adminField('admin.categories.description', '分类说明', adminInput({ name: 'description', value: description, 'data-i18n-field': 'description' }))}
			</div>
			<div class="cat-main-hero">
				${adminField('admin.categories.heroTitle', '首页标题', adminInput({ name: 'hero_title', value: heroTitle, 'data-i18n-field': 'hero_title' }))}
				${adminField('admin.categories.heroDescription', '首页文案', adminTextarea(heroDescription, { name: 'hero_description', 'data-i18n-field': 'hero_description' }))}
			</div>
		</div>
		<div class="cat-side">
			<span class="badge cat-count"><strong>${Number(row.post_count || 0)}</strong><span data-i18n="index.hero.posts">帖子</span></span>
			<div class="cat-switches">
				${isSystemAll ? '<span class="cat-system-note" data-i18n="admin.categories.systemCategory">系统分类</span>' : adminSwitch(`category-enabled-${escapeHtml(row.id)}`, 'admin.common.enabled', '启用', enabled, { class: 'cat-enabled-switch', 'data-category-enabled': true })}
				${isSystemAll ? '' : adminSwitch(`category-admin-only-${escapeHtml(row.id)}`, 'admin.categories.adminOnly', '仅管理员可选', adminOnly, { class: 'cat-enabled-switch', 'data-category-admin-only': true })}
			</div>
			<div class="cat-actions">
				${adminButton('admin.common.save', '保存', { 'data-save-category': true }, 'btn-primary btn-sm')}
				${isSystemAll ? '' : adminButton('admin.common.delete', '删除', { 'data-delete-category': true }, 'btn-danger btn-sm')}
			</div>
		</div>
	</article>`;
	}).join('') || `<div class="notice" data-i18n="admin.common.none">暂无数据</div>`;
	return renderAdminLayout({
		title: '分类管理',
		subtitle: '管理分类名称、说明和分类首页文案。',
		titleKey: 'admin.categories',
		subtitleKey: 'admin.categories.subtitle',
		active: 'categories',
		head: `<style>
				.cat-layout{height:100%;min-height:0;display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;overflow:hidden}.cat-form{min-height:0;overflow:auto;background:linear-gradient(180deg,rgba(22,34,51,.72),rgba(13,17,23,.96))}.cat-form form{align-content:start}.cat-create-grid{display:grid;grid-template-columns:92px minmax(0,1fr);gap:12px;align-items:start}.cat-create-fields{display:grid;gap:10px}.cat-create-options{display:grid;gap:8px}.cat-list-shell{min-height:0;border:1px solid var(--border);border-radius:14px;background:rgba(12,18,28,.72);overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}.cat-list-head{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(90deg,rgba(88,166,255,.08),rgba(63,185,80,.04),transparent)}.cat-list{min-height:0;overflow:auto;display:grid;align-content:start;gap:12px;padding:12px}.cat-edit{border:1px solid rgba(88,166,255,.18);border-radius:16px;background:linear-gradient(135deg,rgba(20,31,46,.9),rgba(12,18,28,.94));padding:14px;display:grid;grid-template-columns:34px 92px minmax(0,1fr) 146px;gap:12px;align-items:stretch;transition:border-color .16s ease,background .16s ease,opacity .16s ease,box-shadow .16s ease}.cat-edit:hover{border-color:rgba(88,166,255,.46);box-shadow:0 16px 48px rgba(0,0,0,.18)}.cat-edit.dragging{opacity:.55;border-color:var(--accent);background:rgba(88,166,255,.08)}.cat-drag-ghost{opacity:.96!important;border-color:var(--accent)!important;background:linear-gradient(180deg,rgba(23,34,52,.98),rgba(15,23,36,.98))!important;box-shadow:0 18px 48px rgba(0,0,0,.42)}.cat-edit-system{border-color:rgba(88,166,255,.42);background:linear-gradient(135deg,rgba(88,166,255,.16),rgba(14,26,42,.95))}.cat-drag-slot{display:grid;align-content:center;justify-content:center}.cat-drag-handle{width:28px;height:48px;border:1px solid rgba(96,120,150,.3);border-radius:12px;background:#0b111c;color:#8aa4c7;display:grid;place-items:center;cursor:grab;touch-action:none}.cat-drag-handle:hover{color:#dbeafe;border-color:rgba(88,166,255,.56);background:rgba(88,166,255,.12)}.cat-drag-handle:active{cursor:grabbing}.cat-drag-handle svg{width:16px;height:16px;fill:currentColor}.cat-icon-col{display:grid;align-content:center}.cat-icon-card{height:92px;border:1px dashed rgba(96,120,150,.42);border-radius:14px;background:rgba(88,166,255,.05);color:var(--text);display:grid;place-items:center;gap:6px;padding:8px;cursor:pointer}.cat-icon-card:hover{border-color:var(--accent);background:rgba(88,166,255,.1)}.cat-icon-preview{width:46px;height:46px;border:1px solid var(--border);border-radius:14px;background:#090d14;display:grid;place-items:center;overflow:hidden}.cat-icon-preview img{width:100%;height:100%;object-fit:contain}.cat-icon-preview>span{font-weight:900;color:#9fb4d0}.cat-icon-card small{font-size:11px;color:var(--muted);text-align:center}.cat-main{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.cat-main-top{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(260px,1fr);gap:10px}.cat-main-hero{display:grid;grid-template-columns:minmax(220px,.65fr) minmax(300px,1fr);gap:10px}.cat-main .field:last-child{grid-column:auto}.cat-main .textarea{min-height:74px;resize:vertical}.cat-side{display:grid;grid-template-rows:auto auto 1fr;gap:10px;align-content:start}.cat-switches{display:grid;gap:8px}.cat-enabled-switch{height:34px;justify-content:center;border:1px solid var(--border);border-radius:999px;padding:0 10px;background:#0d1320;white-space:nowrap}.cat-system-note{height:34px;border:1px solid var(--border);border-radius:999px;display:grid;place-items:center;color:var(--muted);font-size:12px;background:#0d1320}.cat-actions{align-self:end;display:grid;gap:8px}.cat-actions .btn,.cat-side>.btn{width:100%}.cat-count{height:42px;min-height:42px;display:flex;align-items:center;justify-content:center;gap:5px;text-align:center;padding:0 12px;border-radius:999px}.cat-count strong{font-size:18px;line-height:1;color:#e6edf3}.cat-count span{font-size:12px;color:var(--muted);line-height:1}.cat-hint{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.media-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;max-height:420px;overflow:auto}.media-pick-item{border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px;display:grid;gap:6px;text-align:left;color:var(--text);min-width:0}.media-pick-item:hover{border-color:var(--accent);background:rgba(88,166,255,.08)}.media-pick-thumb{height:88px;border-radius:6px;background:#090d14;display:grid;place-items:center;overflow:hidden}.media-pick-thumb img{width:100%;height:100%;object-fit:contain}.media-pick-name{font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.media-pick-upload{border:1px dashed var(--border);border-radius:8px;background:rgba(88,166,255,.03);height:132px;display:grid;place-items:center;color:var(--muted)}.media-pick-upload:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.08)}.media-upload-inner{display:grid;gap:6px;place-items:center}.media-upload-inner strong{font-size:26px;line-height:1}@media(max-width:1180px){.cat-layout{grid-template-columns:1fr}.cat-form{max-height:360px}.cat-edit{grid-template-columns:34px 92px minmax(0,1fr)}.cat-side{grid-column:2/-1;grid-template-columns:120px minmax(0,1fr) 120px;grid-template-rows:auto;align-items:center}.cat-actions{align-self:auto}}@media(max-width:760px){.cat-layout,.cat-edit,.cat-main-top,.cat-main-hero,.cat-create-grid{grid-template-columns:1fr}.cat-list-shell{min-height:360px}.cat-drag-slot{justify-content:start}.cat-side{grid-column:auto;grid-template-columns:1fr}.cat-count{min-width:84px}}
</style>`,
		user,
		content: `
<div class="admin-workbench">
<div class="cat-layout">
	<section class="card cat-form">
		<h2 data-i18n="admin.categories.add">新增分类</h2>
		<p class="cat-hint" data-i18n="admin.categories.heroHint">用户打开该分类时会显示这组文案。留空则使用分类名和默认说明。</p>
		<form id="category-create" class="grid mt-12">
			<div class="cat-create-grid">
				<button class="cat-icon-card" type="button" data-category-icon-pick>
					<span class="cat-icon-preview"><span>#</span></span>
					<small data-i18n="admin.categories.icon">分类图标</small>
				</button>
				<div class="cat-create-fields">
					${adminField('admin.categories.name', '分类名称', adminInput({ name: 'name', required: true }))}
					${adminField('admin.categories.description', '分类说明', adminInput({ name: 'description' }))}
				</div>
			</div>
			<input type="hidden" name="icon_url" value="">
			${adminField('admin.categories.heroTitle', '首页标题', adminInput({ name: 'hero_title' }))}
			${adminField('admin.categories.heroDescription', '首页文案', adminTextarea('', { name: 'hero_description' }))}
			<div class="cat-create-options">
				${adminSwitch('category-create-enabled', 'admin.common.enabled', '启用', true, { class: 'cat-enabled-switch', 'data-category-enabled': true })}
				${adminSwitch('category-create-admin-only', 'admin.categories.adminOnly', '仅管理员可选', false, { class: 'cat-enabled-switch', 'data-category-admin-only': true })}
			</div>
			${adminButton('admin.common.add', '添加', { type: 'submit' }, 'btn-primary')}
		</form>
	</section>
	<section class="cat-list-shell">
		<div class="cat-list-head"><strong data-i18n="admin.categories">分类管理</strong>${contentLanguageSelector(languages, activeContentLocale)}<span class="muted">${categories.length} <span data-i18n="index.hero.categories">分类</span></span></div>
		<div class="cat-list" data-category-list>${rows}</div>
	</section>
</div>
</div>
</div>
<div class="modal-ov" id="category-media-modal">
	<div class="modal modal-wide">
		<div class="modal-hd">
			<h3 data-i18n="admin.settings.pickMedia">选择媒体</h3>
			<button class="modal-close" type="button" onclick="closeModal('category-media-modal')">×</button>
		</div>
		<div class="toolbar mb-12">
			${adminInput({ id: 'category-media-search', class: 'wide-input', 'data-i18n-placeholder': 'admin.settings.searchMedia', placeholder: '搜索媒体文件...' })}
			<div class="toolbar-right"><span class="muted" id="category-media-count"></span></div>
		</div>
		<div class="media-pick-grid" id="category-media-grid"></div>
		<div class="pager mt-12" id="category-media-pager"></div>
		<input id="category-media-upload" class="hidden-file" type="file" accept="image/*,video/*">
	</div>
</div>`,
		script: `
let CONTENT_LOCALE=document.querySelector('[data-content-locale]')?.value||'${activeContentLocale}';
let CATEGORY_MEDIA_TARGET=null, categoryMediaPage=1;
function readLocalized(root){try{return JSON.parse(root.dataset.localized||'{}')||{};}catch(e){return {};}}
function writeCurrentLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;map[field]=map[field]||{};map[field][CONTENT_LOCALE]=input.value||'';});root.dataset.localized=JSON.stringify(map);return map;}
function applyLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;var values=map[field]||{};input.value=values[CONTENT_LOCALE]||values['en-US']||values['zh-CN']||input.value||'';});}
document.querySelector('[data-content-locale]')?.addEventListener('change',function(){document.querySelectorAll('[data-category-id]').forEach(writeCurrentLocalized);CONTENT_LOCALE=this.value;document.querySelectorAll('[data-category-id]').forEach(applyLocalized);});
function categoryPayload(root){var localized=writeCurrentLocalized(root);return {locale:CONTENT_LOCALE,name:root.querySelector('[name="name"]').value.trim(),description:root.querySelector('[name="description"]').value.trim(),hero_title:root.querySelector('[name="hero_title"]').value.trim(),hero_description:root.querySelector('[name="hero_description"]').value.trim(),icon_url:root.querySelector('[name="icon_url"]')?.value||'',enabled:root.dataset.systemCategory==='1'?true:!!root.querySelector('[data-category-enabled] input')?.checked,admin_only:root.dataset.systemCategory==='1'?false:!!root.querySelector('[data-category-admin-only] input')?.checked,localized:localized};}
function mediaUploadCard(){return '<button class="media-pick-upload" type="button" data-category-upload-media><div class="media-upload-inner"><strong>+</strong><span data-i18n="admin.media.uploadSystem">上传系统媒体</span></div></button>';}
async function loadCategoryMediaPicker(page){categoryMediaPage=page||1;var grid=document.getElementById('category-media-grid');grid.innerHTML=mediaUploadCard()+'<div class="notice" data-i18n="admin.media.loading">加载中...</div>';try{var res=await fetch('/api/admin/media?includePosts=0&page='+categoryMediaPage+'&pageSize=18');var data=await res.json();if(!res.ok)throw new Error(data.error||'加载失败');var q=(document.getElementById('category-media-search').value||'').toLowerCase();var items=(data.items||[]).filter(function(item){return !q||String(item.filename||item.key||'').toLowerCase().includes(q);});document.getElementById('category-media-count').textContent=String(data.total||0);grid.innerHTML=mediaUploadCard()+items.map(function(item){var url=String(item.url||'');var name=String(item.filename||item.key||'media');var isVideo=String(item.media_type||'').toLowerCase()==='video'||String(item.mime_type||'').startsWith('video/');return '<button class="media-pick-item" type="button" data-url="'+url.replace(/"/g,'&quot;')+'"><div class="media-pick-thumb">'+(isVideo?'<span>Video</span>':'<img src="'+url.replace(/"/g,'&quot;')+'" alt="">')+'</div><div class="media-pick-name" title="'+name.replace(/"/g,'&quot;')+'">'+name+'</div></button>';}).join('');var totalPages=Math.max(1,Math.ceil(Number(data.total||0)/Number(data.pageSize||18)));document.getElementById('category-media-pager').innerHTML='<div class="toolbar-right"><button class="btn btn-sm" '+(categoryMediaPage<=1?'disabled':'')+' onclick="loadCategoryMediaPicker('+(categoryMediaPage-1)+')" data-i18n="admin.common.previous">上一页</button><span class="muted">'+categoryMediaPage+' / '+totalPages+'</span><button class="btn btn-sm" '+(categoryMediaPage>=totalPages?'disabled':'')+' onclick="loadCategoryMediaPicker('+(categoryMediaPage+1)+')" data-i18n="admin.common.next">下一页</button></div>';applyAdminI18n();}catch(e){grid.innerHTML='<div class="notice">'+(e.message||String(e))+'</div>';}}
function setCategoryIcon(url){if(!CATEGORY_MEDIA_TARGET)return;var input=CATEGORY_MEDIA_TARGET.querySelector('[name="icon_url"]');var preview=CATEGORY_MEDIA_TARGET.querySelector('.cat-icon-preview');if(input)input.value=url||'';if(preview)preview.innerHTML=url?'<img src="'+String(url).replace(/"/g,'&quot;')+'" alt="">':'<span>#</span>';}
document.addEventListener('click',function(e){var pick=e.target.closest('[data-category-icon-pick]');if(pick){CATEGORY_MEDIA_TARGET=pick.closest('[data-category-id]')||pick.closest('form');openModal('category-media-modal');loadCategoryMediaPicker(1);}});
document.getElementById('category-media-search')?.addEventListener('input',function(){loadCategoryMediaPicker(1);});
document.getElementById('category-media-grid')?.addEventListener('click',function(e){var upload=e.target.closest('[data-category-upload-media]');if(upload){document.getElementById('category-media-upload').click();return;}var item=e.target.closest('[data-url]');if(!item)return;setCategoryIcon(item.dataset.url||'');closeModal('category-media-modal');});
document.getElementById('category-media-upload')?.addEventListener('change',async function(){if(!this.files||!this.files[0])return;var fd=new FormData();fd.append('file',this.files[0]);fd.append('type','system');try{var res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});var data=await res.json();if(!res.ok)throw new Error(data.error||'上传失败');setCategoryIcon(data.url||'');await loadCategoryMediaPicker(1);}catch(err){showToast(err.message||String(err),'err');}this.value='';});
document.getElementById('category-create')?.addEventListener('submit',async function(e){e.preventDefault();var btn=this.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/categories',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(categoryPayload(document.getElementById('category-create')))});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.createFailed','创建失败'));showToast(t('admin.categories.created','分类已创建'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){var save=e.target.closest('[data-save-category]');var del=e.target.closest('[data-delete-category]');if(save){var card=save.closest('[data-category-id]');var url=card.dataset.systemCategory==='1'?'/api/admin/categories/all':'/api/admin/categories/'+card.dataset.categoryId;try{await runButton(save,t('common.processing','处理中...'),async function(done){var res=await fetch(url,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify(categoryPayload(card))});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.saveFailed','保存失败'));done();showToast(t('admin.categories.saved','分类已保存'));});}catch(err){showToast(err.message||String(err),'err');}}if(del){var card=del.closest('[data-category-id]');if(card.dataset.systemCategory==='1')return;if(!confirm(t('admin.categories.deleteConfirm','删除这个分类？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/categories/'+card.dataset.categoryId,{method:'DELETE',headers:nonceHeaders(false)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}});
var CATEGORY_DRAG_ROW=null,CATEGORY_DRAG_GHOST=null,CATEGORY_DRAG_SAVING=false,CATEGORY_DRAG_ORDER=[];
function sortableCategoryRows(){return Array.from(document.querySelectorAll('[data-category-row]')).filter(function(row){return row.dataset.systemCategory!=='1';});}
function categoryOrder(){return sortableCategoryRows().map(function(row){return Number(row.dataset.categoryId);}).filter(function(id){return Number.isInteger(id)&&id>0;});}
function rememberCategoryOrder(){CATEGORY_DRAG_ORDER=sortableCategoryRows().slice();}
function restoreCategoryOrder(){var list=document.querySelector('[data-category-list]');if(!list||!CATEGORY_DRAG_ORDER.length)return;CATEGORY_DRAG_ORDER.forEach(function(row){list.appendChild(row);});}
async function saveCategoryOrder(){var ids=categoryOrder();if(!ids.length)return;CATEGORY_DRAG_SAVING=true;try{var res=await fetch('/api/admin/categories/reorder',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.orderFailed','排序保存失败'));showToast(t('admin.categories.orderSaved','分类顺序已保存'));}catch(err){restoreCategoryOrder();showToast(err.message||String(err),'err');}finally{CATEGORY_DRAG_SAVING=false;CATEGORY_DRAG_ORDER=[];}}
function removeCategoryDragGhost(){if(CATEGORY_DRAG_GHOST&&CATEGORY_DRAG_GHOST.parentNode)CATEGORY_DRAG_GHOST.parentNode.removeChild(CATEGORY_DRAG_GHOST);CATEGORY_DRAG_GHOST=null;}
function clearCategoryDragVisuals(){removeCategoryDragGhost();document.querySelectorAll('[data-category-row].dragging').forEach(function(row){row.classList.remove('dragging');});}
function setCategoryDragImage(e,row,handle){removeCategoryDragGhost();var rect=row.getBoundingClientRect();var hRect=handle.getBoundingClientRect();var ghost=row.cloneNode(true);ghost.classList.add('cat-drag-ghost');ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';ghost.style.position='fixed';ghost.style.left='-9999px';ghost.style.top='-9999px';ghost.style.pointerEvents='none';document.body.appendChild(ghost);CATEGORY_DRAG_GHOST=ghost;e.dataTransfer.setDragImage(ghost,Math.max(0,hRect.left-rect.left+hRect.width/2),Math.max(0,hRect.top-rect.top+hRect.height/2));}
document.addEventListener('dragstart',function(e){var handle=e.target.closest('[data-category-drag-handle]');if(!handle)return;var row=handle.closest('[data-category-row]');if(!row||row.dataset.systemCategory==='1')return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.dataset.categoryId||'');setCategoryDragImage(e,row,handle);CATEGORY_DRAG_ROW=row;rememberCategoryOrder();row.classList.add('dragging');});
document.addEventListener('dragover',function(e){if(!CATEGORY_DRAG_ROW)return;var target=e.target.closest('[data-category-row]');if(!target||target===CATEGORY_DRAG_ROW||target.dataset.systemCategory==='1')return;e.preventDefault();var rect=target.getBoundingClientRect();var before=e.clientY<rect.top+rect.height/2;target.parentNode.insertBefore(CATEGORY_DRAG_ROW,before?target:target.nextSibling);});
document.addEventListener('drop',function(e){if(!CATEGORY_DRAG_ROW)return;e.preventDefault();clearCategoryDragVisuals();});
document.addEventListener('dragend',function(){var row=CATEGORY_DRAG_ROW;clearCategoryDragVisuals();if(!row||CATEGORY_DRAG_SAVING){CATEGORY_DRAG_ROW=null;return;}CATEGORY_DRAG_ROW=null;saveCategoryOrder();});
document.addEventListener('pointerup',function(){if(!CATEGORY_DRAG_ROW)return;clearCategoryDragVisuals();});
window.addEventListener('blur',function(){clearCategoryDragVisuals();CATEGORY_DRAG_ROW=null;});
`
	});
}

export function renderAdminTags(user: UserPayload, data: { tags: any[]; languages?: AdminLanguage[] } | any[]): string {
	const tags = Array.isArray(data) ? data : data.tags;
	const languages = Array.isArray(data) ? undefined : data.languages;
	const activeContentLocale = languageCode(normalizeContentLanguages(languages)[0]);
	const rows = tags.map((row) => {
		const localized = (row.localized || {}) as LocalizedValueMap;
		const name = localizedValue(localized, 'name', activeContentLocale, row.name || '');
		return `<tr data-row data-tag-id="${escapeHtml(row.id)}" data-localized="${escapeHtml(JSON.stringify(localized))}" data-search="${escapeHtml(`${row.id} ${row.name}`)}">
		<td class="admin-check"><input type="checkbox" data-tag-check value="${escapeHtml(row.id)}"></td>
		<td>${escapeHtml(row.id)}</td>
		<td>${adminInput({ 'data-tag-name': row.id, 'data-i18n-field': 'name', value: name })}</td>
		<td>${Number(row.post_count || 0)}</td>
		<td>${escapeHtml(row.created_at || '')}</td>
		<td><div class="admin-row-actions">
			${adminButton('admin.common.save', '保存', { 'data-tag-save': row.id }, 'btn-sm btn-primary')}
			${adminButton('admin.common.delete', '删除', { 'data-tag-delete': row.id }, 'btn-sm btn-danger')}
		</div></td>
	</tr>`;
	}).join('') || `<tr><td colspan="6" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminButton('admin.tags.bulkDelete', '批量删除', { id: 'tag-bulk-delete' }, 'btn-danger')}
		${contentLanguageSelector(languages, activeContentLocale)}
		<form id="tag-create" class="tag-create ml-auto">
			${adminInput({ name: 'name', 'data-i18n-field': 'name', 'data-i18n-placeholder': 'admin.tags.namePlaceholder', placeholder: '新标签名称', required: true })}
			${adminButton('admin.common.add', '添加', { type: 'submit', class: 'btn-sm' }, 'btn-primary')}
		</form>
	`);
	const table = adminTableShell(
		'tags-table',
		`<tr><th class="admin-check"><input id="tag-check-all" type="checkbox"></th><th data-i18n="admin.table.id">ID</th><th data-i18n="admin.table.name">名称</th><th data-i18n="admin.table.postCount">帖子数</th><th data-i18n="admin.table.createdAt">创建时间</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${tags.length}</span> / ${tags.length}</span><span data-i18n="admin.tags.footer">标签用于组织帖子主题。</span>`
	);
	return renderAdminLayout({
		title: '标签管理',
		subtitle: '创建、搜索、重命名和删除帖子标签。',
		titleKey: 'admin.tags',
		subtitleKey: 'admin.tags.subtitle',
		active: 'tags',
		user,
		head: '<style>.tag-create{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}.tag-create .input{width:260px}</style>',
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>`,
		script: `
let CONTENT_LOCALE=document.querySelector('[data-content-locale]')?.value||'${activeContentLocale}';
function readLocalized(root){try{return JSON.parse(root.dataset.localized||'{}')||{};}catch(e){return {};}}
function writeCurrentLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;map[field]=map[field]||{};map[field][CONTENT_LOCALE]=input.value||'';});root.dataset.localized=JSON.stringify(map);return map;}
function applyLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;var values=map[field]||{};input.value=values[CONTENT_LOCALE]||values['en-US']||values['zh-CN']||input.value||'';});}
document.querySelector('[data-content-locale]')?.addEventListener('change',function(){document.querySelectorAll('[data-tag-id]').forEach(writeCurrentLocalized);CONTENT_LOCALE=this.value;document.querySelectorAll('[data-tag-id]').forEach(applyLocalized);});
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=!q||String(row.dataset.search||'').toLowerCase().includes(q);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
document.getElementById('admin-search')?.addEventListener('input',filterRows);
document.getElementById('tag-check-all')?.addEventListener('change',function(){document.querySelectorAll('[data-tag-check]').forEach(function(cb){cb.checked=document.getElementById('tag-check-all').checked;});});
document.getElementById('tag-bulk-delete')?.addEventListener('click',async function(){var ids=Array.from(document.querySelectorAll('[data-tag-check]:checked')).map(function(cb){return Number(cb.value);});if(!ids.length){showToast(t('admin.tags.noSelection','请选择标签'),'err');return;}if(!confirm(t('admin.tags.bulkDeleteConfirm','删除选中的标签？帖子本身不会删除。')))return;try{await runButton(this,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/tags/bulk-delete',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.tags.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('tag-create')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var localized={name:{}};localized.name[CONTENT_LOCALE]=form.name.value.trim();var res=await fetch('/api/admin/tags',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({locale:CONTENT_LOCALE,name:form.name.value.trim(),localized:localized})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.tags.createFailed','创建失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var save=e.target.closest('[data-tag-save]');var del=e.target.closest('[data-tag-delete]');
	if(save){var id=save.dataset.tagSave;var row=save.closest('[data-tag-id]');var input=document.querySelector('[data-tag-name="'+id+'"]');var localized=writeCurrentLocalized(row);try{await runButton(save,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/tags/'+id,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({locale:CONTENT_LOCALE,name:input.value.trim(),localized:localized})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.tags.saveFailed','保存失败'));done();showToast(t('admin.tags.saved','标签已保存'));});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){var id2=del.dataset.tagDelete;if(!confirm(t('admin.tags.deleteConfirm','删除这个标签？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res2=await fetch('/api/admin/tags/'+id2,{method:'DELETE',headers:nonceHeaders(false)});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.tags.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

export function renderAdminPosts(user: UserPayload, data: { posts: any[]; categories: any[]; page?: number; pageSize?: number; total?: number }, env?: Partial<Env> | Record<string, unknown>): string {
	const page = Math.max(1, Number(data.page || 1));
	const pageSize = Math.max(1, Number(data.pageSize || 50));
	const total = Number(data.total ?? data.posts.length);
	const categoryOptions = [`<option value="" data-i18n="post.uncategorized">未分类</option>`]
		.concat((data.categories || []).map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || '')}</option>`)).join('');
	const rows = (data.posts || []).map((row) => {
		const id = escapeHtml(row.id);
		const categoryId = row.category_id ?? '';
		const excerpt = String(row.content || '').replace(/[#*_>`\[\]()!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 130);
		const status = row.is_pinned ? 'global-pinned' : row.is_category_pinned ? 'category-pinned' : 'normal';
		const statusBadge = row.is_pinned
			? '<span class="badge badge-ok" data-i18n="post.globalPinned">全局置顶</span>'
			: row.is_category_pinned
				? '<span class="badge badge-info" data-i18n="post.categoryPinned">分类置顶</span>'
				: '<span class="badge badge-off" data-i18n="admin.status.normal">普通</span>';
		return `<tr data-row data-category="${escapeHtml(categoryId)}" data-status="${status}" data-search="${escapeHtml(`${row.id} ${row.title} ${row.username} ${row.category_name || ''} ${excerpt}`)}">
			<td class="admin-check"><input type="checkbox" data-post-check value="${id}"></td>
			<td class="admin-title-cell">
				<a href="${escapeHtml(publicPostPath(row.id, env))}">${escapeHtml(row.title || '')}</a>
				<p>${escapeHtml(excerpt)}</p>
			</td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${escapeHtml(String(row.username || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(row.username || '')}</strong><small>#${escapeHtml(row.author_id || '')}</small></div></div></td>
			<td>${adminSelect(categoryOptions.replace(`value="${escapeHtml(categoryId)}"`, `value="${escapeHtml(categoryId)}" selected`), { 'data-post-category': id })}</td>
			<td>${Number(row.comment_count || 0)} / ${Number(row.view_count || 0)}</td>
			<td>${statusBadge}</td>
			<td>${escapeHtml(row.created_at || '')}</td>
			<td><div class="admin-row-actions">
				<a class="btn btn-sm" href="${escapeHtml(publicPostPath(row.id, env))}" data-i18n="admin.common.view">查看</a>
				<a class="btn btn-sm" href="${escapeHtml(publicPostPath(row.id, env))}/edit" data-i18n="admin.common.edit">编辑</a>
				${adminButton('admin.posts.move', '移动', { class: 'btn-sm', 'data-post-move': id })}
				${adminButton(row.is_pinned ? 'post.unpinGlobal' : 'post.pinGlobal', row.is_pinned ? '取消全局置顶' : '全局置顶', { class: 'btn-sm', 'data-post-pin': id, 'data-pinned': row.is_pinned ? '0' : '1' })}
				${adminButton(row.is_category_pinned ? 'post.unpinCategory' : 'post.pinCategory', row.is_category_pinned ? '取消分类置顶' : '分类置顶', { class: 'btn-sm', 'data-post-category-pin': id, 'data-pinned': row.is_category_pinned ? '0' : '1' })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-post-delete': id }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="8" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminSelect(`<option value="" data-i18n="admin.posts.allCategories">全部分类</option>${(data.categories || []).map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || '')}</option>`).join('')}`, { id: 'post-category-filter' })}
		${adminSelect('<option value="" data-i18n="admin.posts.allStatus">全部状态</option><option value="global-pinned" data-i18n="post.globalPinned">全局置顶</option><option value="category-pinned" data-i18n="post.categoryPinned">分类置顶</option><option value="normal" data-i18n="admin.status.normal">普通</option>', { id: 'post-status-filter' })}
		${adminButton('admin.posts.bulkDelete', '批量删除', { id: 'post-bulk-delete' }, 'btn-danger')}
	`);
	const table = adminTableShell(
		'posts-table',
		`<tr><th class="admin-check"><input id="post-check-all" type="checkbox"></th><th data-i18n="admin.table.title">标题</th><th data-i18n="admin.table.author">作者</th><th data-i18n="admin.table.category">分类</th><th data-i18n="admin.posts.commentsViews">评论/浏览</th><th data-i18n="admin.table.status">状态</th><th data-i18n="admin.table.publishedAt">发布时间</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${data.posts.length}</span> / ${total}</span>${adminPager('/admin/posts', page, pageSize, total)}`
	);
	return renderAdminLayout({
		title: '帖子管理',
		subtitle: '搜索、移动、置顶、编辑和删除帖子。',
		titleKey: 'admin.posts',
		subtitleKey: 'admin.posts.subtitle',
		active: 'posts',
		user,
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var c=document.getElementById('post-category-filter').value;var s=document.getElementById('post-status-filter').value;var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=(!q||String(row.dataset.search||'').toLowerCase().includes(q))&&(!c||String(row.dataset.category||'')===c)&&(!s||String(row.dataset.status||'')===s);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
['admin-search','post-category-filter','post-status-filter'].forEach(function(id){document.getElementById(id)?.addEventListener('input',filterRows);document.getElementById(id)?.addEventListener('change',filterRows);});
document.getElementById('post-check-all')?.addEventListener('change',function(){document.querySelectorAll('[data-post-check]').forEach(function(cb){cb.checked=document.getElementById('post-check-all').checked;});});
document.getElementById('post-bulk-delete')?.addEventListener('click',async function(){var ids=Array.from(document.querySelectorAll('[data-post-check]:checked')).map(function(cb){return Number(cb.value);});if(!ids.length){showToast(t('admin.posts.noSelection','请选择帖子'),'err');return;}if(!confirm(t('admin.posts.bulkDeleteConfirm','删除选中的帖子？')))return;try{await runButton(this,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/posts/bulk-delete',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.posts.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var pin=e.target.closest('[data-post-pin]');var categoryPin=e.target.closest('[data-post-category-pin]');var move=e.target.closest('[data-post-move]');var del=e.target.closest('[data-post-delete]');
	if(pin){try{await runButton(pin,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/posts/'+pin.dataset.postPin+'/pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:pin.dataset.pinned==='1'})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.posts.pinFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
	if(categoryPin){try{await runButton(categoryPin,t('common.processing','处理中...'),async function(){var res0=await fetch('/api/admin/posts/'+categoryPin.dataset.postCategoryPin+'/category-pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:categoryPin.dataset.pinned==='1'})});var data0=await res0.json();if(!res0.ok)throw new Error(data0.error||t('admin.posts.pinFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
	if(move){var sel=document.querySelector('[data-post-category="'+move.dataset.postMove+'"]');try{await runButton(move,t('common.processing','处理中...'),async function(done){var res2=await fetch('/api/admin/posts/'+move.dataset.postMove+'/move',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({category_id:sel.value||null})});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.posts.moveFailed','移动失败'));done();showToast(t('admin.posts.moved','帖子已移动'));});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){if(!confirm(t('admin.posts.deleteConfirm','删除这个帖子？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res3=await fetch('/api/admin/posts/'+del.dataset.postDelete,{method:'DELETE',headers:nonceHeaders(false)});var data3=await res3.json();if(!res3.ok)throw new Error(data3.error||t('admin.posts.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

export function renderAdminUsers(user: UserPayload, data: { users: any[]; roles?: Array<{ role: string }>; page?: number; pageSize?: number; total?: number } | any[]): string {
	const users = Array.isArray(data) ? data : data.users;
	const page = Math.max(1, Number(Array.isArray(data) ? 1 : data.page || 1));
	const pageSize = Math.max(1, Number(Array.isArray(data) ? users.length || 50 : data.pageSize || 50));
	const total = Number(Array.isArray(data) ? users.length : data.total ?? users.length);
	const roles = Array.isArray(data) ? ['user', 'moderator', 'manager', 'admin'] : (data.roles || []).map((row) => String(row.role || '')).filter(Boolean);
	const roleOptions = Array.from(new Set([...roles, 'user', 'moderator', 'manager', 'admin']))
		.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`)
		.join('');
	const rows = users.map((row) => {
		const id = escapeHtml(row.id);
		const initial = escapeHtml(String(row.username || row.email || '?').slice(0, 1).toUpperCase());
		const username = escapeHtml(row.username || '');
		const email = escapeHtml(row.email || '');
		const role = escapeHtml(row.role || 'user');
		const verified = !!row.verified;
		const createdAt = escapeHtml(row.created_at || '');
		return `<tr data-row data-role="${escapeHtml(row.role || 'user')}" data-status="${row.verified ? 'verified' : 'unverified'}" data-search="${escapeHtml(`${row.id} ${row.username} ${row.email} ${row.role || ''}`)}">
			<td>${id}</td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${row.avatar_url ? `<img src="${escapeHtml(row.avatar_url)}" alt="">` : initial}</span><div><strong>${username || '-'}</strong><small>${createdAt}</small></div></div></td>
			<td><span class="admin-cell-main">${email || '-'}</span></td>
			<td><span class="badge">${role}</span></td>
			<td><span class="badge ${verified ? 'badge-ok' : 'badge-off'}" data-i18n="${verified ? 'admin.status.verified' : 'admin.status.unverified'}">${verified ? '已验证' : '未验证'}</span></td>
			<td>${Number(row.points || 0)} / ${Number(row.experience || 0)} / L${Number(row.level || 1)}</td>
			<td><div class="admin-row-actions">
				${adminButton('admin.common.edit', '编辑', { class: 'btn-sm', 'data-user-edit': id, 'data-username': username, 'data-email': email, 'data-role': role, 'data-verified': verified ? '1' : '0' }, 'btn-primary')}
				${adminButton('admin.users.resend', '重发验证', { class: 'btn-sm', 'data-user-resend': id })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-user-delete': id }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="7" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminSelect('<option value="" data-i18n="admin.users.allRoles">全部角色</option>' + roleOptions, { id: 'user-role-filter' })}
		${adminSelect('<option value="" data-i18n="admin.users.allStatus">全部状态</option><option value="verified" data-i18n="admin.status.verified">已验证</option><option value="unverified" data-i18n="admin.status.unverified">未验证</option>', { id: 'user-status-filter' })}
		${adminButton('admin.users.add', '新增用户', { class: 'ml-auto', onclick: "openModal('user-create-modal')" }, 'btn-primary')}
	`);
	const table = adminTableShell(
		'users-table',
		`<tr><th data-i18n="admin.table.id">ID</th><th data-i18n="admin.table.username">用户名</th><th data-i18n="admin.table.email">邮箱</th><th data-i18n="admin.table.role">角色</th><th data-i18n="admin.table.status">状态</th><th data-i18n="admin.users.progress">积分/经验/等级</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${users.length}</span> / ${total}</span>${adminPager('/admin/users', page, pageSize, total)}`
	);
	return renderAdminLayout({
		title: '用户管理',
		subtitle: '创建用户、修改资料、角色、验证状态和密码。',
		titleKey: 'admin.users',
		subtitleKey: 'admin.users.subtitle',
		active: 'users',
		user,
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>
<div class="modal-ov" id="user-edit-modal"><div class="modal">
	<div class="modal-hd"><h3 data-i18n="admin.common.edit">编辑</h3><button class="modal-close" onclick="closeModal('user-edit-modal')">×</button></div>
	<form id="user-edit" class="grid">
		<input type="hidden" name="id">
		${adminField('admin.table.username', '用户名', adminInput({ name: 'username', required: true }))}
		${adminField('admin.table.email', '邮箱', adminInput({ name: 'email', type: 'email', required: true }))}
		${adminField('admin.table.role', '角色', adminSelect(roleOptions, { name: 'role' }))}
		${adminField('admin.users.password', '密码', adminInput({ name: 'password', type: 'password', 'data-i18n-placeholder': 'admin.users.passwordPlaceholder', placeholder: '留空不改' }))}
		<label class="admin-switch"><input type="checkbox" name="verified"><span class="switch-track" aria-hidden="true"></span><span class="switch-label" data-i18n="admin.status.verified">已验证</span></label>
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('user-edit-modal')" }, 'btn-outline')}${adminButton('admin.common.save', '保存', { type: 'submit' }, 'btn-primary')}</div>
	</form>
</div></div>
<div class="modal-ov" id="user-create-modal"><div class="modal">
	<div class="modal-hd"><h3 data-i18n="admin.users.add">新增用户</h3><button class="modal-close" onclick="closeModal('user-create-modal')">×</button></div>
	<form id="user-create" class="grid">
		${adminField('admin.table.email', '邮箱', adminInput({ name: 'email', type: 'email', required: true }))}
		${adminField('admin.table.username', '用户名', adminInput({ name: 'username', required: true }))}
		${adminField('admin.users.password', '密码', adminInput({ name: 'password', type: 'password', required: true }))}
		${adminField('admin.table.role', '角色', adminSelect(roleOptions, { name: 'role' }))}
		<label class="badge"><input type="checkbox" name="verified" checked> <span data-i18n="admin.status.verified">已验证</span></label>
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('user-create-modal')" }, 'btn-outline')}${adminButton('admin.common.add', '添加', { type: 'submit' }, 'btn-primary')}</div>
	</form>
</div></div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var r=document.getElementById('user-role-filter').value;var s=document.getElementById('user-status-filter').value;var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=(!q||String(row.dataset.search||'').toLowerCase().includes(q))&&(!r||row.dataset.role===r)&&(!s||row.dataset.status===s);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
['admin-search','user-role-filter','user-status-filter'].forEach(function(id){document.getElementById(id)?.addEventListener('input',filterRows);document.getElementById(id)?.addEventListener('change',filterRows);});
document.getElementById('user-create')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var payload={email:form.email.value.trim(),username:form.username.value.trim(),password:form.password.value,role:form.role.value,verified:form.verified.checked};var res=await fetch('/api/admin/users',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.users.createFailed','创建失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('user-edit')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');var id=form.id.value;var payload={username:form.username.value.trim(),email:form.email.value.trim(),role:form.role.value,verified:form.verified.checked,password:form.password.value};try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/users/'+id+'/update',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.users.saveFailed','保存失败'));showToast(t('admin.users.saved','用户已保存'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var edit=e.target.closest('[data-user-edit]');var del=e.target.closest('[data-user-delete]');var resend=e.target.closest('[data-user-resend]');
	if(edit){var form=document.getElementById('user-edit');form.id.value=edit.dataset.userEdit;form.username.value=edit.dataset.username||'';form.email.value=edit.dataset.email||'';form.role.value=edit.dataset.role||'user';form.verified.checked=edit.dataset.verified==='1';form.password.value='';openModal('user-edit-modal');}
	if(resend){try{await runButton(resend,t('common.processing','处理中...'),async function(done){var res2=await fetch('/api/admin/users/'+resend.dataset.userResend+'/resend',{method:'POST',headers:nonceHeaders(true),body:'{}'});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.users.resendFailed','发送失败'));done();showToast(t('admin.users.resent','验证邮件已发送'));});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){if(!confirm(t('admin.users.deleteConfirm','删除这个用户及其内容？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res3=await fetch('/api/admin/users/'+del.dataset.userDelete,{method:'DELETE',headers:nonceHeaders(false)});var data3=await res3.json();if(!res3.ok)throw new Error(data3.error||t('admin.users.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

export function renderAdminPermissions(user: UserPayload, data: { roles: Array<{ role: string; permissions: string[]; user_count?: number }> }): string {
	const roles = data.roles || [];
	const builtinRoles = new Set(['admin', 'manager', 'moderator', 'user']);
	const permissionGroups = [
		{ title: '内容管理', titleKey: 'admin.permissions.groupContent', desc: '帖子、评论、审核与媒体资源。', descKey: 'admin.permissions.groupContentDesc', keys: ['posts', 'comments', 'moderation', 'media'] },
		{ title: '站点结构', titleKey: 'admin.permissions.groupStructure', desc: '分类、标签和站点配置。', descKey: 'admin.permissions.groupStructureDesc', keys: ['categories', 'tags', 'settings'] },
		{ title: '系统管理', titleKey: 'admin.permissions.groupSystem', desc: '用户、角色权限、插件和翻译。', descKey: 'admin.permissions.groupSystemDesc', keys: ['dashboard', 'users', 'permissions', 'plugins', 'translations'] },
	];
	const optionByKey = new Map(adminPermissionOptions.map((item) => [item.key, item]));
	const roleCards = roles.map((role, index) => {
		const locked = role.role === 'admin';
		const selected = new Set(role.permissions || []);
		const active = index === 0 ? ' active' : '';
		const permissionCount = locked ? adminPermissionOptions.length : selected.size;
		return `<button type="button" class="role-pill${active}" data-role-tab="${escapeHtml(role.role)}">
			<span><strong>${escapeHtml(role.role)}</strong><small>${Number(role.user_count || 0)} users</small></span>
			<em>${locked ? 'Full' : `${permissionCount}/${adminPermissionOptions.length}`}</em>
		</button>`;
	}).join('');
	const rolePanels = roles.map((role, index) => {
		const locked = role.role === 'admin';
		const builtin = builtinRoles.has(role.role);
		const selected = new Set(role.permissions || []);
		const groups = permissionGroups.map((group) => {
			const toggles = group.keys.map((key) => {
				const perm = optionByKey.get(key);
				if (!perm) return '';
				const checked = locked || selected.has(perm.key);
				return `<label class="permission-toggle${checked ? ' is-on' : ''}${locked ? ' is-locked' : ''}">
					<input type="checkbox" data-role="${escapeHtml(role.role)}" value="${escapeHtml(perm.key)}"${checked ? ' checked' : ''}${locked ? ' disabled' : ''}>
					<span class="toggle-mark"></span>
					<span><strong data-i18n="${escapeHtml(perm.i18n)}">${escapeHtml(perm.label)}</strong><small>${escapeHtml(perm.key)}</small></span>
				</label>`;
			}).join('');
			return `<section class="permission-group">
				<div class="permission-group-hd"><h3 data-i18n="${escapeHtml(group.titleKey)}">${escapeHtml(group.title)}</h3><p data-i18n="${escapeHtml(group.descKey)}">${escapeHtml(group.desc)}</p></div>
				<div class="permission-toggle-grid">${toggles}</div>
			</section>`;
		}).join('');
		return `<div class="role-panel${index === 0 ? ' active' : ''}" data-role-panel="${escapeHtml(role.role)}">
			<div class="role-panel-head">
				<div><h2>${escapeHtml(role.role)}</h2><p data-i18n="${locked ? 'admin.permissions.lockedHint' : 'admin.permissions.editHint'}">${locked ? '系统管理员固定拥有全部权限。' : '勾选该角色可以访问的后台模块。'}</p></div>
				<div class="admin-row-actions">${locked ? `<span class="badge badge-ok" data-i18n="admin.permissions.locked">管理员角色拥有全部权限</span>` : `${builtin ? `<span class="badge" data-i18n="admin.permissions.builtinRole">内置角色</span>` : adminButton('admin.permissions.deleteRole', '删除角色', { class: 'btn-sm', 'data-delete-role': role.role }, 'btn-danger')}${adminButton('admin.common.save', '保存', { 'data-save-role': role.role }, 'btn-primary')}`}</div>
			</div>
			${groups}
		</div>`;
	}).join('');
	return renderAdminLayout({
		title: '权限管理',
		subtitle: '集中维护角色权限，用户管理里只分配角色。',
		titleKey: 'admin.permissions.title',
		subtitleKey: 'admin.permissions.subtitle',
		active: 'permissions',
		user,
		content: `<div class="admin-workbench permission-workbench">
			<div class="permission-layout">
				<aside class="permission-roles">
					<button type="button" class="role-create" onclick="openModal('role-create-modal')"><strong data-i18n="admin.permissions.addRole">新增角色</strong><small data-i18n="admin.permissions.addRoleHint">创建自定义后台角色</small></button>
					${roleCards}
				</aside>
				<section class="permission-editor">${rolePanels}</section>
			</div>
		</div>
		<div class="modal-ov" id="role-create-modal"><div class="modal">
			<div class="modal-hd"><h3 data-i18n="admin.permissions.createRole">创建角色</h3><button class="modal-close" onclick="closeModal('role-create-modal')">×</button></div>
			<form id="role-create" class="grid">
				${adminField('admin.permissions.roleName', '角色标识', adminInput({ name: 'role', required: true, pattern: '[a-z][a-z0-9_-]{1,31}', placeholder: 'operator' }), 'admin.permissions.roleNameHint', '只能使用小写字母、数字、下划线和短横线。')}
				<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('role-create-modal')" }, 'btn-outline')}${adminButton('admin.permissions.createRole', '创建角色', { type: 'submit' }, 'btn-primary')}</div>
			</form>
		</div></div>`,
		head: `<style>
.permission-workbench{grid-template-rows:minmax(0,1fr);padding-top:0}.permission-layout{min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;overflow:hidden}.permission-roles{min-height:0;overflow:auto;display:grid;align-content:start;gap:8px}.role-create,.role-pill{width:100%;border:1px solid var(--border);border-radius:12px;background:#0d131d;color:var(--text);padding:12px;display:flex;align-items:center;justify-content:space-between;text-align:left}.role-create{border-style:dashed;background:linear-gradient(135deg,rgba(88,166,255,.12),rgba(63,185,80,.05));display:grid;gap:4px}.role-create:hover,.role-pill:hover,.role-pill.active{border-color:rgba(88,166,255,.65);background:linear-gradient(135deg,rgba(88,166,255,.16),rgba(63,185,80,.05))}.role-create small,.role-pill small,.role-pill em{color:var(--muted);font-style:normal;font-size:12px}.role-pill span{display:grid;gap:3px}.permission-editor{min-height:0;overflow:auto}.role-panel{display:none;min-height:100%;border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,rgba(88,166,255,.045),rgba(13,19,32,.86));overflow:hidden}.role-panel.active{display:block}.role-panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border);background:rgba(13,19,32,.72)}.role-panel-head h2{margin:0;font-size:24px}.role-panel-head p{margin:5px 0 0;color:var(--muted)}.permission-group{padding:18px 20px;border-bottom:1px solid var(--border)}.permission-group:last-child{border-bottom:0}.permission-group-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px}.permission-group-hd h3{margin:0;font-size:16px}.permission-group-hd p{margin:0;color:var(--muted)}.permission-toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px}.permission-toggle{border:1px solid var(--border);border-radius:12px;background:#0b1017;padding:12px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;cursor:pointer}.permission-toggle input{position:absolute;opacity:0;pointer-events:none}.permission-toggle strong{display:block}.permission-toggle small{display:block;margin-top:2px;color:var(--muted);font-size:12px}.toggle-mark{width:34px;height:20px;border-radius:999px;background:#30363d;position:relative;transition:.16s}.toggle-mark:after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#c9d1d9;transition:.16s}.permission-toggle.is-on{border-color:rgba(88,166,255,.5);background:rgba(88,166,255,.09)}.permission-toggle.is-on .toggle-mark{background:linear-gradient(135deg,var(--accent),#3fb950)}.permission-toggle.is-on .toggle-mark:after{left:17px;background:#fff}.permission-toggle.is-locked{opacity:.75;cursor:not-allowed}@media(max-width:1100px){.permission-layout{grid-template-columns:1fr}.permission-roles{grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}.permission-toggle-grid{grid-template-columns:1fr}}
		</style>`,
		script: `
function collectRolePermissions(role){return Array.from(document.querySelectorAll('input[data-role="'+role+'"]:checked')).map(function(cb){return cb.value;});}
function showRole(role){document.querySelectorAll('[data-role-tab]').forEach(function(el){el.classList.toggle('active',el.dataset.roleTab===role);});document.querySelectorAll('[data-role-panel]').forEach(function(el){el.classList.toggle('active',el.dataset.rolePanel===role);});}
async function saveRole(role,btn){if(role==='admin'){showToast(t('admin.permissions.locked','管理员角色拥有全部权限'));return;}try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/permissions/'+encodeURIComponent(role),{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({permissions:collectRolePermissions(role)})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.permissions.saveFailed','保存失败'));done();showToast(t('admin.permissions.saved','权限已保存'));setTimeout(function(){location.reload();},350);});}catch(err){showToast(err.message||String(err),'err');}}
document.addEventListener('click',function(e){var btn=e.target.closest('[data-save-role]');if(btn)saveRole(btn.dataset.saveRole,btn);});
document.addEventListener('click',function(e){var tab=e.target.closest('[data-role-tab]');if(tab)showRole(tab.dataset.roleTab);});
document.addEventListener('click',async function(e){var del=e.target.closest('[data-delete-role]');if(!del)return;if(!confirm(t('admin.permissions.deleteConfirm','删除这个角色？请先把用户移动到其他角色。')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/permissions/'+encodeURIComponent(del.dataset.deleteRole),{method:'DELETE',headers:nonceHeaders(false)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.permissions.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('change',function(e){var cb=e.target.closest('.permission-toggle input');if(cb)cb.closest('.permission-toggle').classList.toggle('is-on',cb.checked);});
document.getElementById('role-create')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var role=form.role.value.trim().toLowerCase();var res=await fetch('/api/admin/permissions',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({role:role})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.permissions.createFailed','创建失败'));location.href='/admin/permissions';});}catch(err){showToast(err.message||String(err),'err');}});
`
	});
}

export function renderAdminComments(user: UserPayload, data: { comments: any[]; page?: number; pageSize?: number; total?: number } | any[], env?: Partial<Env> | Record<string, unknown>): string {
	const comments = Array.isArray(data) ? data : data.comments;
	const page = Math.max(1, Number(Array.isArray(data) ? 1 : data.page || 1));
	const pageSize = Math.max(1, Number(Array.isArray(data) ? comments.length || 50 : data.pageSize || 50));
	const total = Number(Array.isArray(data) ? comments.length : data.total ?? comments.length);
	const rows = comments.map((row) => {
		const id = escapeHtml(row.id);
		const content = String(row.content || '');
		const excerpt = content.replace(/\s+/g, ' ').trim().slice(0, 180);
		return `<tr data-row data-search="${escapeHtml(`${row.id} ${row.content} ${row.username} ${row.post_title}`)}">
			<td class="admin-check"><input type="checkbox" data-comment-check value="${id}"></td>
			<td>${id}</td>
			<td><div class="admin-cell-main">${escapeHtml(excerpt || '...')}</div>${row.parent_id ? `<div class="admin-cell-sub">↳ #${escapeHtml(row.parent_id)}</div>` : ''}<textarea class="hidden-file" data-comment-content="${id}">${escapeHtml(content)}</textarea></td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${escapeHtml(String(row.username || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(row.username || '')}</strong><small>${escapeHtml(row.created_at || '')}</small></div></div></td>
			<td><a class="admin-cell-main" href="${escapeHtml(publicPostPath(row.post_id, env))}">${escapeHtml(row.post_title || '')}</a></td>
			<td><div class="admin-row-actions">
				<a class="btn btn-sm" href="${escapeHtml(publicPostPath(row.post_id, env))}#comment-${id}" data-i18n="admin.common.view">查看</a>
				${adminButton('admin.common.edit', '编辑', { class: 'btn-sm', 'data-comment-edit': id })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-comment-delete': id }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="6" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminButton('admin.comments.bulkDelete', '批量删除', { id: 'comment-bulk-delete' }, 'btn-danger')}
		<span class="badge ml-auto">${total} <span data-i18n="admin.comments.countSuffix">条评论</span></span>
	`);
	const table = adminTableShell(
		'comments-table',
		`<tr><th class="admin-check"><input id="comment-check-all" type="checkbox"></th><th data-i18n="admin.table.id">ID</th><th data-i18n="admin.table.content">内容</th><th data-i18n="admin.table.author">作者</th><th data-i18n="admin.table.post">帖子</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${comments.length}</span> / ${total}</span>${adminPager('/admin/comments', page, pageSize, total)}`
	);
	return renderAdminLayout({
		title: '评论管理',
		subtitle: '搜索、编辑和删除用户评论。',
		titleKey: 'admin.comments',
		subtitleKey: 'admin.comments.subtitle',
		active: 'comments',
		user,
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>
<div class="modal-ov" id="comment-edit-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 data-i18n="admin.comments.editTitle">编辑评论</h3><button class="modal-close" type="button" onclick="closeModal('comment-edit-modal')">×</button></div>
	${adminTextarea('', { id: 'comment-edit-content', class: 'textarea-tall' })}
	<input type="hidden" id="comment-edit-id">
	<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { onclick: "closeModal('comment-edit-modal')" }, 'btn-outline')}${adminButton('admin.common.save', '保存', { id: 'comment-edit-save' }, 'btn-primary')}</div>
</div></div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=!q||String(row.dataset.search||'').toLowerCase().includes(q);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
document.getElementById('admin-search')?.addEventListener('input',filterRows);
document.getElementById('comment-check-all')?.addEventListener('change',function(){document.querySelectorAll('[data-comment-check]').forEach(function(cb){cb.checked=document.getElementById('comment-check-all').checked;});});
document.getElementById('comment-bulk-delete')?.addEventListener('click',async function(){var ids=Array.from(document.querySelectorAll('[data-comment-check]:checked')).map(function(cb){return Number(cb.value);});if(!ids.length){showToast(t('admin.comments.noSelection','请选择评论'),'err');return;}if(!confirm(t('admin.comments.bulkDeleteConfirm','删除选中的评论？')))return;try{await runButton(this,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/comments/bulk-delete',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.comments.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('comment-edit-save')?.addEventListener('click',async function(){var btn=this;var id=document.getElementById('comment-edit-id').value;var content=document.getElementById('comment-edit-content').value;try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/comments/'+id,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({content:content})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.comments.saveFailed','保存失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var edit=e.target.closest('[data-comment-edit]');var del=e.target.closest('[data-comment-delete]');
	if(edit){var id=edit.dataset.commentEdit;document.getElementById('comment-edit-id').value=id;document.getElementById('comment-edit-content').value=document.querySelector('[data-comment-content="'+id+'"]').value;openModal('comment-edit-modal');}
	if(del){var id2=del.dataset.commentDelete;if(!confirm(t('admin.comments.deleteConfirm','删除这条评论？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res2=await fetch('/api/admin/comments/'+id2,{method:'DELETE',headers:nonceHeaders(false)});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.comments.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

export function renderAdminModeration(user: UserPayload, data: { items: any[]; status: string; page?: number; pageSize?: number; total?: number; defaultRejectReason?: string; rejectReasons?: string }, env?: Partial<Env> | Record<string, unknown>): string {
	const status = ['pending', 'approved', 'rejected'].includes(String(data.status)) ? String(data.status) : 'pending';
	const page = Math.max(1, Number(data.page || 1));
	const pageSize = Math.max(1, Number(data.pageSize || 50));
	const total = Number(data.total || data.items.length);
	const statusBadge = (value: string) => {
		if (value === 'approved') return '<span class="badge badge-ok" data-i18n="admin.moderation.approved">已通过</span>';
		if (value === 'rejected') return '<span class="badge badge-off" data-i18n="admin.moderation.rejected">已拒绝</span>';
		return '<span class="badge" data-i18n="admin.moderation.pending">待审核</span>';
	};
	const rows = data.items.map((row) => {
		const id = escapeHtml(row.id);
		const type = escapeHtml(row.type);
		const title = row.type === 'post' ? row.title : row.post_title;
		const content = row.type === 'post' ? row.content : row.content;
		const viewHref = row.type === 'post' ? publicPostPath(row.id, env) : `${publicPostPath(row.post_id, env)}#comment-${id}`;
		return `<tr data-row data-type="${type}" data-id="${id}" data-search="${escapeHtml(`${row.type} ${title || ''} ${content || ''} ${row.username || ''}`)}">
			<td class="admin-check"><input type="checkbox" data-moderation-check data-type="${type}" data-id="${id}"></td>
			<td><span class="badge" data-i18n="${row.type === 'post' ? 'admin.posts' : 'admin.comments'}">${row.type === 'post' ? '帖子' : '评论'}</span></td>
			<td><div class="admin-title-cell"><a href="${viewHref}" target="_blank" rel="noopener">${escapeHtml(title || '-')}</a><p>${escapeHtml(String(content || '').replace(/[#>*_`~[\]()!-]/g, '').slice(0, 180))}</p></div></td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${escapeHtml(String(row.username || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(row.username || '-')}</strong><small>${escapeHtml(row.created_at || '')}</small></div></div></td>
			<td>${statusBadge(String(row.status || 'pending'))}</td>
			<td><div class="admin-row-actions">
				${adminButton('admin.moderation.approve', '通过', { class: 'btn-sm', 'data-moderate': 'approved' }, 'btn-primary')}
				${adminButton('admin.moderation.reject', '拒绝', { class: 'btn-sm', 'data-moderate': 'rejected' })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-moderate-delete': '1' }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="6" class="muted" data-i18n="admin.moderation.empty">暂无待审核内容</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		<div class="admin-filter-tabs">
			<a class="${status === 'pending' ? 'active' : ''}" href="/admin/moderation?status=pending&pageSize=${pageSize}" data-i18n="admin.moderation.pending">待审核</a>
			<a class="${status === 'approved' ? 'active' : ''}" href="/admin/moderation?status=approved&pageSize=${pageSize}" data-i18n="admin.moderation.approved">已通过</a>
			<a class="${status === 'rejected' ? 'active' : ''}" href="/admin/moderation?status=rejected&pageSize=${pageSize}" data-i18n="admin.moderation.rejected">已拒绝</a>
		</div>
		<div class="toolbar-divider"></div>
		${adminButton('admin.moderation.bulkApprove', '批量通过', { id: 'moderation-bulk-approve', class: 'btn-sm' }, 'btn-primary')}
		${adminButton('admin.moderation.bulkReject', '批量拒绝', { id: 'moderation-bulk-reject', class: 'btn-sm' })}
		${adminButton('admin.moderation.bulkDelete', '批量删除', { id: 'moderation-bulk-delete', class: 'btn-sm' }, 'btn-danger')}
		<span class="badge ml-auto">${total} <span data-i18n="admin.common.totalSuffix">条</span></span>
	`);
	const defaultRejectReason = String(data.defaultRejectReason || '内容不符合社区规则，请修改后重新提交。');
	const rejectReasons = String(data.rejectReasons || defaultRejectReason).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
	if (!rejectReasons.includes(defaultRejectReason)) rejectReasons.unshift(defaultRejectReason);
	const rejectOptions = rejectReasons.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('');
	const table = adminTableShell(
		'moderation-table',
		`<tr><th class="admin-check"><input type="checkbox" id="moderation-check-all"></th><th data-i18n="admin.table.type">类型</th><th data-i18n="admin.table.content">内容</th><th data-i18n="admin.table.author">作者</th><th data-i18n="admin.table.status">状态</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${data.items.length}</span> / ${total}</span>${adminPager('/admin/moderation', page, pageSize, total, { status })}`
	);
	return renderAdminLayout({
		title: '审核管理',
		subtitle: '审核待发布的帖子和评论。',
		titleKey: 'admin.moderation.title',
		subtitleKey: 'admin.moderation.subtitle',
		active: 'moderation',
		user,
		content: `<div class="admin-workbench">${toolbar}${table}</div>
<div class="modal-ov" id="reject-modal"><div class="modal">
	<div class="modal-hd"><h3 data-i18n="admin.moderation.rejectDialogTitle">拒绝内容</h3><button class="modal-close" type="button" data-reject-cancel>×</button></div>
	<div class="field"><label data-i18n="admin.moderation.rejectReasonSelect">选择理由</label><select id="reject-reason-select">${rejectOptions}</select></div>
	<div class="field"><label data-i18n="admin.moderation.rejectExtra">补充说明</label><textarea id="reject-extra" rows="4" maxlength="500" data-i18n-placeholder="admin.moderation.rejectExtraPlaceholder" placeholder="可选，写给用户看的额外说明..."></textarea></div>
	<div class="modal-footer"><button class="btn" type="button" data-reject-cancel data-i18n="admin.common.cancel">取消</button><button class="btn btn-primary" type="button" id="reject-confirm" data-i18n="admin.moderation.confirmReject">确认拒绝</button></div>
</div></div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=!q||String(row.dataset.search||'').toLowerCase().includes(q);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
document.getElementById('admin-search')?.addEventListener('input',filterRows);
document.getElementById('moderation-check-all')?.addEventListener('change',function(){var checked=this.checked;document.querySelectorAll('[data-row]').forEach(function(row){if(row.style.display==='none')return;var cb=row.querySelector('[data-moderation-check]');if(cb)cb.checked=checked;});});
var DEFAULT_REJECT_REASON=${jsonScript(defaultRejectReason)};
var PENDING_REJECT=null;
function openRejectDialog(){return new Promise(function(resolve){var modal=document.getElementById('reject-modal');var select=document.getElementById('reject-reason-select');var extra=document.getElementById('reject-extra');if(select&&!select.value)select.value=DEFAULT_REJECT_REASON;if(extra)extra.value='';PENDING_REJECT=resolve;modal?.classList.add('open');setTimeout(function(){select?.focus();},0);});}
function closeRejectDialog(value){var modal=document.getElementById('reject-modal');modal?.classList.remove('open');if(PENDING_REJECT){PENDING_REJECT(value);PENDING_REJECT=null;}}
function rejectReasonValue(){var base=(document.getElementById('reject-reason-select')?.value||DEFAULT_REJECT_REASON).trim();var extra=(document.getElementById('reject-extra')?.value||'').trim();return extra?base+'\\n'+extra:base;}
document.querySelectorAll('[data-reject-cancel]').forEach(function(btn){btn.addEventListener('click',function(){closeRejectDialog('');});});
document.getElementById('reject-confirm')?.addEventListener('click',function(){closeRejectDialog(rejectReasonValue());});
function selectedModerationItems(){return Array.from(document.querySelectorAll('[data-moderation-check]:checked')).map(function(cb){return {type:cb.dataset.type,id:Number(cb.dataset.id)};}).filter(function(item){return item.id>0&&(item.type==='post'||item.type==='comment');});}
async function bulkModeration(action,status,btn){var items=selectedModerationItems();if(!items.length){showToast(t('admin.moderation.noSelection','请选择内容'),'err');return;}var reason='';if(action==='status'&&status==='rejected'){reason=await openRejectDialog();if(!reason)return;}var msg=action==='delete'?t('admin.moderation.bulkDeleteConfirm','删除选中的内容？'):status==='approved'?t('admin.moderation.bulkApproveConfirm','通过选中的内容？'):t('admin.moderation.bulkRejectConfirm','拒绝选中的内容？');if(!confirm(msg))return;try{await runButton(btn,action==='delete'?t('common.deleting','删除中...'):t('common.processing','处理中...'),async function(){var body={items:items};if(action==='status'){body.status=status;body.reason=reason;}var res=await fetch('/api/admin/moderation/bulk-'+action,{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.moderation.updateFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
document.getElementById('moderation-bulk-approve')?.addEventListener('click',function(){bulkModeration('status','approved',this);});
document.getElementById('moderation-bulk-reject')?.addEventListener('click',function(){bulkModeration('status','rejected',this);});
document.getElementById('moderation-bulk-delete')?.addEventListener('click',function(){bulkModeration('delete',null,this);});
document.addEventListener('click',async function(e){
	var act=e.target.closest('[data-moderate]');var del=e.target.closest('[data-moderate-delete]');
	if(act){var row=act.closest('[data-row]');var reason='';if(act.dataset.moderate==='rejected'){reason=await openRejectDialog();if(!reason)return;}try{await runButton(act,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/moderation/'+row.dataset.type+'/'+row.dataset.id,{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({status:act.dataset.moderate,reason:reason})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.moderation.updateFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){var row2=del.closest('[data-row]');if(!confirm(t('admin.moderation.deleteConfirm','删除这条内容？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res2=await fetch('/api/admin/moderation/'+row2.dataset.type+'/'+row2.dataset.id,{method:'DELETE',headers:nonceHeaders(false)});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.moderation.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

type AdminLogRow = {
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

function compactLogDetails(value: unknown): string {
	const raw = String(value || '').trim();
	if (!raw) return '';
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

export function renderAdminLogs(user: UserPayload, data: {
	logs: AdminLogRow[];
	page: number;
	pageSize: number;
	total: number;
	q: string;
	action: string;
	resourceType: string;
}): string {
	const rows = data.logs.map((row) => {
		const actor = row.username || row.email || (row.user_id ? `#${row.user_id}` : 'system');
		const details = compactLogDetails(row.details);
		return `<tr>
			<td><div class="admin-cell-main">${escapeHtml(row.created_at || '')}</div></td>
			<td><span class="badge">${escapeHtml(row.action || '-')}</span></td>
			<td><div class="admin-cell-main">${escapeHtml(row.resource_type || '-')}</div><div class="admin-cell-sub">${escapeHtml(row.resource_id || '')}</div></td>
			<td><div class="admin-user-cell"><div class="avatar-sm">${escapeHtml(String(actor).slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(actor)}</strong><small>${row.user_id ? `#${escapeHtml(row.user_id)}` : 'system'}</small></div></div></td>
			<td><code>${escapeHtml(row.ip_address || '')}</code></td>
			<td><pre class="log-details">${escapeHtml(details || '-')}</pre></td>
		</tr>`;
	}).join('');
	const toolbar = adminToolbar(`
		<form class="admin-toolbar-form" method="get" action="/admin/logs">
			${adminInput({ name: 'q', value: data.q, placeholder: '搜索 action / 资源 / 详情 / IP...', 'data-i18n-placeholder': 'admin.logs.search' })}
			${adminInput({ name: 'action', value: data.action, placeholder: 'Action', 'data-i18n-placeholder': 'admin.logs.action' })}
			${adminInput({ name: 'resourceType', value: data.resourceType, placeholder: 'Resource', 'data-i18n-placeholder': 'admin.logs.resource' })}
			${adminButton('admin.common.search', '搜索', { type: 'submit' }, 'btn-primary')}
			<a class="btn" href="/admin/logs" data-i18n="admin.common.reset">重置</a>
		</form>
		<span class="badge ml-auto">${data.total} <span data-i18n="admin.common.totalSuffix">条</span></span>
	`);
	const table = adminTableShell(
		'logs-table',
		`<tr>
			<th data-i18n="admin.logs.time">时间</th>
			<th data-i18n="admin.logs.action">动作</th>
			<th data-i18n="admin.logs.resource">资源</th>
			<th data-i18n="admin.logs.user">用户</th>
			<th data-i18n="admin.logs.ip">IP</th>
			<th data-i18n="admin.logs.details">详情</th>
		</tr>`,
		rows || `<tr><td colspan="6" class="muted" data-i18n="admin.common.none">暂无数据</td></tr>`,
		adminPager('/admin/logs', data.page, data.pageSize, data.total, { q: data.q, action: data.action, resourceType: data.resourceType })
	);
	return renderAdminLayout({
		title: '日志管理',
		titleKey: 'admin.logs.title',
		subtitle: '查看邮件发送、后台操作和配置异常。',
		subtitleKey: 'admin.logs.subtitle',
		active: 'logs',
		user,
		head: `<style>
.logs-table th:nth-child(1),.logs-table td:nth-child(1){width:170px}.logs-table th:nth-child(2),.logs-table td:nth-child(2){width:180px}.logs-table th:nth-child(3),.logs-table td:nth-child(3){width:190px}.logs-table th:nth-child(4),.logs-table td:nth-child(4){width:190px}.logs-table th:nth-child(5),.logs-table td:nth-child(5){width:150px}.logs-table th:nth-child(6),.logs-table td:nth-child(6){width:45%}.log-details{margin:0;max-height:74px;overflow:auto;white-space:pre-wrap;font:12px/1.45 var(--mono);color:#b8c7da;background:#0b1017;border:1px solid rgba(96,120,150,.24);border-radius:8px;padding:8px}.admin-toolbar-form{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}.admin-toolbar-form .input{width:220px}
</style>`,
		content: `<div class="admin-workbench">${toolbar}${table}</div>`,
	});
}

export function renderSettingsPage(user: UserPayload, input: Record<string, any> | { settings: Record<string, any>; languages?: AdminLanguage[]; localized?: LocalizedValueMap }): string {
	const settings = 'settings' in input ? input.settings : input;
	const languages = 'settings' in input ? input.languages : undefined;
	const localizedSettings = ('settings' in input ? input.localized : {}) || {};
	const activeContentLocale = languageCode(normalizeContentLanguages(languages)[0]);
	const bools = [
		['turnstile_enabled', 'admin.settings.turnstile', '启用 Turnstile'],
		['notify_on_user_delete', 'admin.settings.notifyDeleteUser', '删除用户时邮件通知'],
		['notify_on_username_change', 'admin.settings.notifyUsernameChange', '修改用户名时邮件通知'],
		['notify_on_avatar_change', 'admin.settings.notifyAvatarChange', '修改头像时邮件通知'],
		['notify_on_manual_verify', 'admin.settings.notifyManualVerify', '手动验证时邮件通知'],
	];
	const rows = bools.map(([key, labelKey, label]) => adminSwitch(key, labelKey, label, Boolean(settings[key]))).join('');
	const maintenancePanel = adminPanel('admin.settings.maintenance', '维护模式', 'admin.settings.maintenanceDesc', '升级或迁移时临时关闭前台访问。', `<div class="settings-toggle-grid">${adminSwitch('maintenance_enabled', 'admin.settings.maintenanceEnabled', '启用维护模式', Boolean(settings.maintenance_enabled))}</div>
	<div class="grid cols-2 mt-12">
		${adminField('admin.settings.maintenanceTitle', '维护标题', adminInput({ id: 'maintenance_title', value: settings.maintenance_title || '站点维护中', maxlength: 120 }))}
		${adminField('admin.settings.maintenanceUntil', '预计恢复时间', adminInput({ id: 'maintenance_until', type: 'datetime-local', value: settings.maintenance_until || '' }), 'admin.settings.maintenanceUntilHint', '可选，维护页会显示倒计时。')}
	</div>
	${adminField('admin.settings.maintenanceMessage', '维护说明', adminTextarea(String(settings.maintenance_message || '我们正在升级服务，请稍后再回来。'), { id: 'maintenance_message', rows: 4, maxlength: 1000 }))}`, 'settings-wide');
	const rewardRows = [
		['reward_checkin', 'admin.settings.rewardCheckin', '签到', 'reward_checkin_points', 'reward_checkin_experience'],
		['reward_post', 'admin.settings.rewardPost', '发帖', 'reward_post_points', 'reward_post_experience'],
		['reward_reply', 'admin.settings.rewardReply', '回复帖子', 'reward_reply_points', 'reward_reply_experience'],
		['reward_post_replied', 'admin.settings.rewardPostReplied', '被回复帖子', 'reward_post_replied_points', 'reward_post_replied_experience'],
	].map(([, key, label, pointsKey, xpKey]) => `<div class="reward-row">
		<div class="reward-action"><span data-i18n="${key}">${label}</span></div>
		<div class="reward-fields">
			<label><span data-i18n="admin.settings.rewardPoints">积分</span>${adminInput({ class: 'reward-input', id: pointsKey, type: 'number', min: 0, step: 1, value: settings[pointsKey] ?? '' })}</label>
			<label><span data-i18n="admin.settings.rewardExperience">经验</span>${adminInput({ class: 'reward-input', id: xpKey, type: 'number', min: 0, step: 1, value: settings[xpKey] ?? '' })}</label>
		</div>
	</div>`).join('');
	const levelRuleRows = `<div class="level-rule-grid">
		${adminField('admin.settings.maxLevel', '最高等级', adminInput({ id: 'level_max', class: 'reward-input', type: 'number', min: 1, max: 999, step: 1, value: settings.level_max || 20 }), 'admin.settings.maxLevelHint', '用户达到该等级后不再继续升级。')}
		${adminField('admin.settings.baseExperience', '基础升级经验', adminInput({ id: 'level_base_experience', class: 'reward-input', type: 'number', min: 1, step: 1, value: settings.level_base_experience || 100 }), 'admin.settings.baseExperienceHint', '从 1 级升到 2 级所需经验。')}
		${adminField('admin.settings.growthMultiplier', '升级增长倍率', adminInput({ id: 'level_growth_multiplier', class: 'reward-input', type: 'number', min: 1, max: 10, step: 0.1, value: settings.level_growth_multiplier || 1.6 }), 'admin.settings.growthMultiplierHint', '每一级所需经验按该倍率递增。')}
	</div>`;
	const moderationOptions = (value: string) => [
		`<option value="approved"${value !== 'pending' ? ' selected' : ''} data-i18n="admin.moderation.autoApprove">默认通过</option>`,
		`<option value="pending"${value === 'pending' ? ' selected' : ''} data-i18n="admin.moderation.manualReview">手动审核</option>`,
	].join('');
	const appearancePanel = adminPanel('admin.settings.appearance', '站点外观', 'admin.settings.appearanceDesc', '配置站点显示资源。', `
		<div class="inline-field">${contentLanguageSelector(languages, activeContentLocale)}</div>
		<button class="site-icon-card" type="button" id="site-icon-card">
			<div class="site-icon-preview" id="site-icon-preview">${settings.site_icon_url ? `<img src="${escapeHtml(settings.site_icon_url)}" alt="">` : '<span>F</span>'}</div>
			<strong data-i18n="admin.settings.siteIcon">站点图标</strong>
			<small data-i18n="admin.settings.clickReplace">点击替换媒体</small>
		</button>
		<input type="hidden" id="site_icon_url" value="${escapeHtml(settings.site_icon_url || '')}">
		${adminField('admin.settings.siteName', '站点名称', adminInput({ id: 'site_name', value: localizedValue(localizedSettings, 'site_name', activeContentLocale, settings.site_name || 'ForumForge'), 'data-i18n-field': 'site_name' }))}
		${adminField('admin.settings.siteTagline', '站点简介', adminTextarea(localizedValue(localizedSettings, 'site_tagline', activeContentLocale, settings.site_tagline || ''), { id: 'site_tagline', rows: 3, 'data-i18n-field': 'site_tagline' }))}
	`);
	const logRetentionFields = `<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.visitLogRetention">访问日志保留</strong><span data-i18n="admin.settings.visitLogRetentionDesc">超过限制的访问记录会自动清理。</span></div>
	<div class="level-rule-grid">
		${adminField('admin.settings.visitLogRetentionDays', '保留天数', adminInput({ id: 'visit_log_retention_days', class: 'reward-input', type: 'number', min: 0, max: 3650, step: 1, value: settings.visit_log_retention_days ?? 90 }), 'admin.settings.visitLogRetentionDaysHint', '0 表示不按时间清理。')}
		${adminField('admin.settings.visitLogMaxRows', '最大行数', adminInput({ id: 'visit_log_max_rows', class: 'reward-input', type: 'number', min: 0, max: 10000000, step: 1000, value: settings.visit_log_max_rows ?? 100000 }), 'admin.settings.visitLogMaxRowsHint', '0 表示不按行数清理。')}
	</div>`;
	const idCodecField = `<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.idCodec">URL 编码密钥</strong><span data-i18n="admin.settings.idCodecDesc">用于隐藏公开 URL 中的数字 ID，留空则使用环境变量。</span></div>
	${adminField('admin.settings.idCodecSecret', '编码密钥', adminInput({ id: 'id_codec_secret', type: 'password', autocomplete: 'new-password', value: settings.id_codec_secret || '', placeholder: '至少 16 个字符' }), 'admin.settings.idCodecSecretHint', '上线后修改会让旧编码链接失效；旧数字链接仍兼容。')}`;
	const notifyPanelWithLogs = adminPanel('admin.settings.securityNotifications', '安全与通知', 'admin.settings.securityNotificationsDesc', '控制验证、管理操作通知和访问日志保留。', `<div class="settings-toggle-grid">${rows}</div>${idCodecField}${logRetentionFields}`);
	const contentPanel = adminPanel('admin.settings.contentPublishing', '内容发布', 'admin.settings.contentPublishingDesc', '控制发帖编辑器和内容能力。', `<div class="settings-toggle-grid">
		${adminSwitch('posts_i18n_enabled', 'admin.settings.postsI18nEnabled', '启用多语言帖子', Boolean(settings.posts_i18n_enabled ?? true))}
	</div><p class="muted" data-i18n="admin.settings.postsI18nHint">开启后，发帖和编辑时可维护多个语言版本；管理员始终可用。</p>
	<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.videoEmbeds">视频嵌入</strong><span data-i18n="admin.settings.videoEmbedsDesc">配置允许 iframe 嵌入的视频来源。</span></div>
	${adminField('admin.settings.videoEmbedDomains', 'iframe 白名单域名', adminTextarea(String(settings.video_embed_domains || 'youtube.com\nyoutu.be\nbilibili.com\nb23.tv'), { id: 'video_embed_domains', rows: 5, maxlength: 4000 }), 'admin.settings.videoEmbedDomainsHint', '每行一个域名。YouTube 和 Bilibili 会自动转为播放器，其他域名会直接放入 iframe；普通视频链接仍使用 video 标签。')}`, 'settings-wide');
	const oauthProviders = [
		['google', 'Google'],
		['github', 'GitHub'],
		['epic', 'Epic'],
	];
	const oauthPanel = adminPanel('admin.settings.oauthLogin', '第三方登录', 'admin.settings.oauthLoginDesc', '配置外部账号登录。启用前需要填写对应平台的 Client ID 和 Secret。', `<div class="oauth-grid">${oauthProviders.map(([id, label]) => {
		const enabledKey = `oauth_${id}_enabled`;
		const clientIdKey = `oauth_${id}_client_id`;
		const secretKey = `oauth_${id}_client_secret`;
		return `<section class="oauth-provider-card">
			<div class="oauth-provider-head"><div><strong>${escapeHtml(label)}</strong><span>/oauth/${escapeHtml(id)}/callback</span></div>${adminSwitch(enabledKey, `admin.settings.oauth${label}Enabled`, '启用', Boolean(settings[enabledKey]))}</div>
			<div class="grid cols-2">
				${adminField('admin.settings.oauthClientId', 'Client ID', adminInput({ id: clientIdKey, value: settings[clientIdKey] || '', autocomplete: 'off' }))}
				${adminField('admin.settings.oauthClientSecret', 'Client Secret', adminInput({ id: secretKey, value: settings[secretKey] || '', type: 'password', autocomplete: 'new-password' }))}
			</div>
		</section>`;
	}).join('')}</div><p class="muted" data-i18n="admin.settings.oauthRedirectHint">回调地址使用当前站点域名，可用 OAUTH_REDIRECT_BASE 覆盖。</p>`, 'settings-wide');
	const rewardPanel = adminPanel('admin.settings.rewards', '积分与经验', 'admin.settings.rewardsDesc', '配置用户行为获得的积分、经验和升级规则。', `<div class="admin-section-title"><strong data-i18n="admin.settings.levelRules">等级规则</strong><span data-i18n="admin.settings.levelRulesDesc">控制最高等级和升级所需经验曲线。</span></div>${levelRuleRows}<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.rewardRulesTitle">行为奖励</strong><span data-i18n="admin.settings.rewardRulesDesc">配置用户行为获得的积分和经验。</span></div><div class="reward-grid">${rewardRows}</div>`, 'settings-wide');
	const smtpPanel = adminPanel('admin.settings.emailDelivery', '邮件发送', 'admin.settings.emailDeliveryDesc', 'SMTP 配置用于账号验证和通知邮件。', `<div class="grid cols-2">
		${adminField('admin.settings.smtpHost', 'SMTP Host', adminInput({ id: 'smtp_host', value: settings.smtp_host || '' }))}
		${adminField('admin.settings.smtpPort', 'SMTP Port', adminInput({ id: 'smtp_port', value: settings.smtp_port || '' }))}
		${adminField('admin.settings.smtpUser', 'SMTP User', adminInput({ id: 'smtp_user', value: settings.smtp_user || '' }))}
		${adminField('admin.settings.smtpPass', 'SMTP Pass', adminInput({ id: 'smtp_pass', type: 'password', value: settings.smtp_pass || '' }))}
		${adminField('admin.settings.smtpFrom', 'SMTP From', adminInput({ id: 'smtp_from', value: settings.smtp_from || '' }))}
		${adminField('admin.settings.smtpFromName', 'SMTP From Name', adminInput({ id: 'smtp_from_name', value: settings.smtp_from_name || '' }))}
	</div>`, 'settings-wide');
	const moderationPanel = adminPanel('admin.moderation.settingsTitle', '审核策略', 'admin.moderation.settingsDesc', '设置发帖和评论是否默认通过，或进入审核队列。', `<div class="grid cols-2">
		${adminField('admin.moderation.postsDefault', '帖子默认状态', adminSelect(moderationOptions(String(settings.moderation_posts_default || 'approved')), { id: 'moderation_posts_default' }))}
		${adminField('admin.moderation.commentsDefault', '评论默认状态', adminSelect(moderationOptions(String(settings.moderation_comments_default || 'approved')), { id: 'moderation_comments_default' }))}
	</div>${adminField('admin.moderation.defaultRejectReason', '默认拒绝理由', adminTextarea(String(settings.moderation_default_reject_reason || ''), { id: 'moderation_default_reject_reason', rows: 2, maxlength: 500 }), 'admin.moderation.defaultRejectReasonHint', '拒绝弹窗默认选中的理由。')}
	${adminField('admin.moderation.rejectReasonTemplates', '拒绝理由模板', adminTextarea(String(settings.moderation_reject_reasons || settings.moderation_default_reject_reason || ''), { id: 'moderation_reject_reasons', rows: 5, maxlength: 2000 }), 'admin.moderation.rejectReasonTemplatesHint', '每行一个理由，审核拒绝弹窗会以下拉列表展示。')}<p class="muted" data-i18n="admin.moderation.settingsHint">设为手动审核后，新内容不会在前台公开显示，需要到审核管理中通过。</p>`, 'settings-wide');
	return renderAdminLayout({
		title: '站点设置',
		subtitle: '站点安全和通知配置。',
		titleKey: 'admin.settings',
		subtitleKey: 'admin.settings.subtitle',
		active: 'settings',
		head: `<style>
.settings-workbench{height:100%;min-height:0;display:block}
.settings-layout{height:100%;min-height:0;display:grid;grid-template-columns:330px minmax(0,1fr);gap:14px}
.settings-side{min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:12px}
.settings-main{min-height:0;border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,rgba(22,27,34,.96),rgba(13,17,23,.96));overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}
.settings-tabs{display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);padding:10px 12px;background:rgba(13,19,32,.78)}
.settings-tab{height:34px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--muted);padding:0 12px;font-weight:800}
.settings-tab:hover{color:#fff;background:rgba(88,166,255,.06);border-color:rgba(88,166,255,.18)}
.settings-tab.active{color:#fff;background:linear-gradient(180deg,rgba(88,166,255,.22),rgba(88,166,255,.1));border-color:rgba(88,166,255,.48);box-shadow:0 0 0 1px rgba(88,166,255,.08) inset}
.settings-panels{min-height:0;overflow:auto;padding:14px}
.settings-tab-panel{display:none;min-height:0}
.settings-tab-panel.active{display:block}
.settings-tab-panel .admin-panel{height:100%}
.settings-tab-panel .admin-panel-body{padding:14px}
.settings-toggle-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.oauth-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.oauth-provider-card{border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.055),rgba(13,20,29,.92));padding:12px;display:grid;gap:12px}
.oauth-provider-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.oauth-provider-head strong{display:block;font-size:15px}.oauth-provider-head span{display:block;color:var(--muted);font-size:12px;margin-top:3px}
.site-icon-card{width:100%;border:1px dashed var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.06),rgba(88,166,255,.015));padding:18px;display:grid;place-items:center;gap:12px;color:var(--text);transition:.15s;text-align:center}
.site-icon-card:hover{border-color:var(--accent);background:rgba(88,166,255,.08)}
.site-icon-preview{width:112px;height:112px;border:1px solid var(--border);border-radius:24px;background:#090d14;display:grid;place-items:center;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}
.site-icon-preview img{width:100%;height:100%;object-fit:contain}.site-icon-preview span{font-size:28px;color:var(--muted);font-weight:800}
.site-icon-card strong{font-size:14px}.site-icon-card small{color:var(--muted)}
.settings-actions{border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.07),rgba(22,27,34,.92));backdrop-filter:blur(8px);padding:12px;display:grid;gap:10px}
.settings-actions .btn{width:100%;height:38px}
.settings-summary{border:1px solid var(--border);border-radius:12px;background:rgba(13,20,29,.8);padding:12px;display:grid;gap:10px}.settings-summary h3{margin:0;font-size:13px}.settings-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.settings-mini-stat{border:1px solid var(--border);border-radius:10px;background:#0b1017;padding:10px;text-align:center}.settings-mini-stat strong{display:block;font-size:18px}.settings-mini-stat span{font-size:11px;color:var(--muted)}
.settings-wide{grid-column:auto}
.media-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;max-height:420px;overflow:auto;padding-right:2px}
.media-pick-item{border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px;display:grid;gap:6px;text-align:left;color:var(--text);min-width:0}
.media-pick-item:hover,.media-pick-item.active{border-color:var(--accent);background:rgba(88,166,255,.08)}
.media-pick-upload{border:1px dashed var(--border);border-radius:8px;background:rgba(88,166,255,.03);height:132px;display:grid;place-items:center;color:var(--muted)}
.media-pick-upload:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.08)}
.media-pick-upload strong{font-size:26px;line-height:1}
.media-pick-upload span{font-size:12px}
.media-upload-inner{display:grid;gap:6px;place-items:center}
.media-pick-thumb{height:88px;border-radius:6px;background:#090d14;display:grid;place-items:center;overflow:hidden}
.media-pick-thumb img{width:100%;height:100%;object-fit:contain}
.media-pick-name{font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.setting-preview{width:44px;height:44px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);display:grid;place-items:center;overflow:hidden;flex:0 0 auto}
.setting-preview img{width:100%;height:100%;object-fit:contain}
.reward-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:10px}
.level-rule-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;margin-bottom:12px}
.admin-section-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 10px}.admin-section-title strong{font-size:14px}.admin-section-title span{color:var(--muted);font-size:12px}.mt-12{margin-top:12px!important}
.reward-row{display:grid;gap:10px;border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.045),rgba(13,20,29,.92));padding:12px;min-height:104px}
.reward-action{font-weight:850;color:#e6edf3}
.reward-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end}.reward-row label{display:grid;gap:5px;color:var(--muted);font-size:12px}.reward-input{height:34px}
@media(max-width:1100px){.settings-layout{grid-template-columns:1fr}.settings-side{grid-template-rows:auto auto}.settings-main{min-height:460px}.settings-toggle-grid,.reward-grid,.level-rule-grid{grid-template-columns:1fr}}
@media(max-width:640px){.settings-tabs{overflow:auto}.reward-fields{grid-template-columns:1fr}}
</style>`,
		user,
		content: `
<div class="settings-workbench admin-workbench">
<div class="settings-layout">
	<aside class="settings-side">
	${appearancePanel}
	<div class="settings-summary">
		<h3 data-i18n="admin.settings.quickStatus">配置概览</h3>
		<div class="settings-summary-grid">
			<div class="settings-mini-stat"><strong>${bools.filter(([key]) => settings[key]).length}</strong><span data-i18n="admin.settings.enabledOptions">已启用</span></div>
			<div class="settings-mini-stat"><strong>4</strong><span data-i18n="admin.settings.rewardRules">积分规则</span></div>
		</div>
	</div>
	<div class="settings-actions">
		<div id="settings-message" class="muted"></div>
		${adminButton('admin.settings.save', '保存设置', { id: 'save-settings' }, 'btn-primary')}
	</div>
	</aside>
	<section class="settings-main">
		<div class="settings-tabs">
			<button class="settings-tab active" type="button" data-settings-tab="security" data-i18n="admin.settings.securityNotifications">安全与通知</button>
			<button class="settings-tab" type="button" data-settings-tab="content" data-i18n="admin.settings.contentPublishing">内容发布</button>
			<button class="settings-tab" type="button" data-settings-tab="maintenance" data-i18n="admin.settings.maintenance">维护模式</button>
			<button class="settings-tab" type="button" data-settings-tab="oauth" data-i18n="admin.settings.oauthLogin">第三方登录</button>
			<button class="settings-tab" type="button" data-settings-tab="moderation" data-i18n="admin.moderation.title">审核管理</button>
			<button class="settings-tab" type="button" data-settings-tab="rewards" data-i18n="admin.settings.rewards">积分与经验</button>
			<button class="settings-tab" type="button" data-settings-tab="email" data-i18n="admin.settings.emailDelivery">邮件发送</button>
		</div>
		<div class="settings-panels">
			<div class="settings-tab-panel active" data-settings-panel="security">${notifyPanelWithLogs}</div>
			<div class="settings-tab-panel" data-settings-panel="content">${contentPanel}</div>
			<div class="settings-tab-panel" data-settings-panel="maintenance">${maintenancePanel}</div>
			<div class="settings-tab-panel" data-settings-panel="oauth">${oauthPanel}</div>
			<div class="settings-tab-panel" data-settings-panel="moderation">${moderationPanel}</div>
			<div class="settings-tab-panel" data-settings-panel="rewards">${rewardPanel}</div>
			<div class="settings-tab-panel" data-settings-panel="email">${smtpPanel}</div>
		</div>
	</section>
</div>
</div>
<div class="modal-ov" id="media-picker-modal">
	<div class="modal modal-wide">
		<div class="modal-hd">
			<h3 data-i18n="admin.settings.pickMedia">选择媒体</h3>
			<button class="modal-close" type="button" onclick="closeModal('media-picker-modal')">×</button>
		</div>
		<div class="toolbar mb-12">
			${adminInput({ id: 'media-picker-search', class: 'wide-input', 'data-i18n-placeholder': 'admin.settings.searchMedia', placeholder: '搜索媒体文件...' })}
			<span class="muted" id="media-picker-count"></span>
		</div>
		<div class="media-pick-grid" id="media-picker-grid"></div>
		<div class="pager mt-12" id="media-picker-pager"></div>
		<input id="media-picker-upload" class="hidden-file" type="file" accept="image/*,video/*">
	</div>
</div>`,
		script: `
let mediaPickerPage=1, mediaPickerSelected='';
let CONTENT_LOCALE=document.querySelector('[data-content-locale]')?.value||'${activeContentLocale}';
const SETTINGS_LOCALIZED=${jsonScript(localizedSettings)};
function writeSettingsLocalized(){document.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;SETTINGS_LOCALIZED[field]=SETTINGS_LOCALIZED[field]||{};SETTINGS_LOCALIZED[field][CONTENT_LOCALE]=input.value||'';});return SETTINGS_LOCALIZED;}
function applySettingsLocalized(){document.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;var values=SETTINGS_LOCALIZED[field]||{};input.value=values[CONTENT_LOCALE]||values['en-US']||values['zh-CN']||input.value||'';});}
document.querySelector('[data-content-locale]')?.addEventListener('change',function(){writeSettingsLocalized();CONTENT_LOCALE=this.value;applySettingsLocalized();});
function updateSiteIconPreview(){const input=document.getElementById('site_icon_url');const box=document.getElementById('site-icon-preview');const url=input.value.trim();box.innerHTML=url?'<img src="'+url.replace(/"/g,'&quot;')+'" alt="">':'<span>F</span>';}
document.getElementById('site_icon_url')?.addEventListener('input',updateSiteIconPreview);
document.getElementById('site-icon-card')?.addEventListener('click',function(){openModal('media-picker-modal');loadMediaPicker(1);});
document.getElementById('media-picker-search')?.addEventListener('input',function(){loadMediaPicker(1);});
document.querySelectorAll('[data-settings-tab]').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('[data-settings-tab]').forEach(function(b){b.classList.toggle('active',b===btn);});document.querySelectorAll('[data-settings-panel]').forEach(function(panel){panel.classList.toggle('active',panel.dataset.settingsPanel===btn.dataset.settingsTab);});});});
async function loadMediaPicker(page){
	mediaPickerPage=page||1;
	const grid=document.getElementById('media-picker-grid');
	grid.innerHTML=mediaUploadCard()+'<div class="notice" data-i18n="admin.media.loading">加载中...</div>';
	try{
		const res=await fetch('/api/admin/media?includePosts=0&page='+mediaPickerPage+'&pageSize=18');
		const data=await res.json();
		if(!res.ok)throw new Error(data.error||'加载失败');
		const q=(document.getElementById('media-picker-search').value||'').toLowerCase();
		const items=(data.items||[]).filter(function(item){return !q || String(item.filename||item.key||'').toLowerCase().includes(q);});
		document.getElementById('media-picker-count').textContent=String(data.total||0);
		grid.innerHTML=mediaUploadCard()+items.map(function(item){
			const url=String(item.url||'');
			const name=String(item.filename||item.key||'media');
			const isVideo=String(item.media_type||'').toLowerCase()==='video'||String(item.mime_type||'').startsWith('video/');
			return '<button class="media-pick-item" type="button" data-url="'+url.replace(/"/g,'&quot;')+'"><div class="media-pick-thumb">'+(isVideo?'<span>Video</span>':'<img src="'+url.replace(/"/g,'&quot;')+'" alt="">')+'</div><div class="media-pick-name" title="'+name.replace(/"/g,'&quot;')+'">'+name+'</div></button>';
		}).join('');
		const totalPages=Math.max(1,Math.ceil(Number(data.total||0)/Number(data.pageSize||18)));
		document.getElementById('media-picker-pager').innerHTML='<div class="toolbar-right"><button class="btn btn-sm" '+(mediaPickerPage<=1?'disabled':'')+' onclick="loadMediaPicker('+(mediaPickerPage-1)+')" data-i18n="admin.common.previous">上一页</button><span class="muted">'+mediaPickerPage+' / '+totalPages+'</span><button class="btn btn-sm" '+(mediaPickerPage>=totalPages?'disabled':'')+' onclick="loadMediaPicker('+(mediaPickerPage+1)+')" data-i18n="admin.common.next">下一页</button></div>';
		applyAdminI18n();
	}catch(e){grid.innerHTML='<div class="notice">'+(e.message||String(e))+'</div>';}
}
function mediaUploadCard(){return '<button class="media-pick-upload" type="button" data-upload-media><div class="media-upload-inner"><strong>+</strong><span data-i18n="admin.media.uploadSystem">上传系统媒体</span></div></button>';}
document.getElementById('media-picker-grid')?.addEventListener('click',function(e){
	const upload=e.target.closest('[data-upload-media]');
	if(upload){document.getElementById('media-picker-upload').click();return;}
	const item=e.target.closest('[data-url]');
	if(!item)return;
	document.getElementById('site_icon_url').value=item.dataset.url||'';
	updateSiteIconPreview();
	closeModal('media-picker-modal');
});
document.getElementById('media-picker-upload')?.addEventListener('change',async function(){
	if(!this.files||!this.files[0])return;
	const fd=new FormData();fd.append('file',this.files[0]);fd.append('type','system');
	try{
		const res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});
		const data=await res.json();
		if(!res.ok)throw new Error(data.error||'上传失败');
		document.getElementById('site_icon_url').value=data.url||'';
		updateSiteIconPreview();
		await loadMediaPicker(1);
	}catch(e){showToast(e.message||String(e),'err');}
	this.value='';
});
document.getElementById('save-settings')?.addEventListener('click',async()=>{
	const btn=document.getElementById('save-settings');
	const body={};
	writeSettingsLocalized();
	['turnstile_enabled','notify_on_user_delete','notify_on_username_change','notify_on_avatar_change','notify_on_manual_verify','maintenance_enabled','oauth_google_enabled','oauth_github_enabled','oauth_epic_enabled','posts_i18n_enabled'].forEach(k=>body[k]=document.getElementById(k).checked);
	['site_name','site_tagline','site_icon_url','maintenance_title','maintenance_message','maintenance_until','smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_from_name','oauth_google_client_id','oauth_google_client_secret','oauth_github_client_id','oauth_github_client_secret','oauth_epic_client_id','oauth_epic_client_secret'].forEach(k=>body[k]=document.getElementById(k).value);
	['moderation_posts_default','moderation_comments_default','moderation_default_reject_reason','moderation_reject_reasons','id_codec_secret','visit_log_retention_days','visit_log_max_rows','video_embed_domains'].forEach(k=>body[k]=document.getElementById(k).value);
	['reward_checkin_points','reward_checkin_experience','reward_post_points','reward_post_experience','reward_reply_points','reward_reply_experience','reward_post_replied_points','reward_post_replied_experience','level_max','level_base_experience','level_growth_multiplier'].forEach(k=>body[k]=document.getElementById(k).value);
	body.locale=CONTENT_LOCALE;body.localized=SETTINGS_LOCALIZED;
	try{await runButton(btn,t('common.processing','处理中...'),async function(done){const res=await fetch('/api/admin/settings',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.saveFailed','保存失败'));done();document.getElementById('settings-message').textContent=t('admin.editor.saved','已保存');});}catch(e){document.getElementById('settings-message').textContent=e.message||String(e);}
});`
	});
}

export { escapeHtml, jsonScript };

