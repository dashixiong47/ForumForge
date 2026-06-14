import { appScript } from "./client-script";
export { appScript } from "./client-script";
import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type {
	PageState,
	SiteCategory,
	SiteComment,
	SiteLanguage,
	SiteNotification,
	SitePost,
	SiteProgressLog,
	SiteTag,
	SiteUser,
} from '../types';

export type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';

export type LayoutOptions = {
	title: string;
	user?: SiteUser | null;
	categories?: SiteCategory[];
	allCategory?: SiteCategory;
	activeCategory?: string;
	brand?: SiteBrand;
	body: string;
	script?: string;
	wide?: boolean;
	fixed?: boolean;
	videoEmbedDomains?: string[];
	env?: Env;
};

export type SiteBrand = {
	siteName?: string;
	siteIconUrl?: string;
};

export const SITE_NAME = 'ForumForge';

export function siteHtmlResponse(html: string, status = 200, headers?: HeadersInit): Response {
	return new Response(html, {
		status,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
			'X-Frame-Options': 'SAMEORIGIN',
			'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
			...(headers || {}),
		},
	});
}

export function attr(value: unknown): string {
	return escapeHtml(value).replace(/"/g, '&quot;');
}

export function siteBrand(brand?: SiteBrand): { siteName: string; siteIconUrl: string } {
	const siteName = String(brand?.siteName || SITE_NAME).trim() || SITE_NAME;
	const siteIconUrl = String(brand?.siteIconUrl || '').trim();
	return { siteName, siteIconUrl };
}

export function faviconLinks(brand?: SiteBrand): string {
	const { siteIconUrl } = siteBrand(brand);
	const iconUrl = siteIconUrl || FORUMFORGE_ICON_DATA_URL;
	return `<link rel="icon" href="${attr(iconUrl)}">
<link rel="shortcut icon" href="${attr(iconUrl)}">`;
}

export function brandMark(brand?: SiteBrand): string {
	const { siteName, siteIconUrl } = siteBrand(brand);
	if (siteIconUrl) return `<span class="brand-mark"><img src="${attr(siteIconUrl)}" alt=""></span>`;
	return `<span class="brand-mark">${escapeHtml(siteName.slice(0, 1).toUpperCase() || 'F')}</span>`;
}

export function hasRealEmail(user: Pick<SiteUser, 'email'>): boolean {
	const email = String(user.email || '').trim().toLowerCase();
	return !!email && !email.endsWith('@oauth.local');
}

export function avatar(user?: Partial<SiteUser> | null, fallback = '?'): string {
	if (user?.avatar_url) {
		return `<img class="avatar" src="${attr(user.avatar_url)}" alt="">`;
	}
	return `<span class="avatar">${escapeHtml(String(fallback || '?').slice(0, 1).toUpperCase())}</span>`;
}

export type HoverProfile = Partial<SiteUser> & {
	author_name?: string;
	author_avatar?: string;
	author_id?: number;
	author_role?: string;
	author_points?: number;
	author_experience?: number;
	author_level?: number;
};

export function profileAvatar(profile?: HoverProfile | null, fallback = '?', env?: Partial<Env> | Record<string, unknown>): string {
	const username = profile?.username || profile?.author_name || String(fallback || 'User');
	const id = Number(profile?.id ?? profile?.author_id ?? 0);
	const normalized: Partial<SiteUser> = {
		id,
		username,
		avatar_url: profile?.avatar_url || profile?.author_avatar,
		role: profile?.role || profile?.author_role,
		points: profile?.points ?? profile?.author_points,
		experience: profile?.experience ?? profile?.author_experience,
		level: profile?.level ?? profile?.author_level,
	};
	const role = normalized.role || 'user';
	const level = Math.max(1, Number(normalized.level || 1));
	const points = Math.max(0, Number(normalized.points || 0));
	const xp = Math.max(0, Number(normalized.experience || 0));
	const avatarNode = id > 0
		? `<a class="user-avatar-link" href="${publicUserPath(id, env)}" aria-label="${attr(username)}">${avatar(normalized, username)}</a>`
		: avatar(normalized, username);
	const cardAvatar = id > 0
		? `<a class="user-avatar-link" href="${publicUserPath(id, env)}" aria-label="${attr(username)}">${avatar(normalized, username)}</a>`
		: avatar(normalized, username);
	return `<span class="user-hover" tabindex="0">${avatarNode}
		<span class="user-card" role="tooltip">
			<span class="user-card-head">${cardAvatar}<span><strong>${escapeHtml(username)}</strong><small>${escapeHtml(role)}</small></span></span>
			<span class="user-card-stats"><span><b>${level}</b><small data-i18n="index.side.level">等级</small></span><span><b>${points}</b><small data-i18n="index.side.points">积分</small></span><span><b>${xp}</b><small data-i18n="index.side.experience">经验</small></span></span>
			${id > 0 ? `<span class="user-card-badges" data-user-id="${id}"></span>` : ''}
		</span>
	</span>`;
}

export function dateText(value?: string): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
}

export function i18n(key: string, fallback: string): string {
	return `<span data-i18n="${attr(key)}">${escapeHtml(fallback)}</span>`;
}

export function i18nText(key: string, fallback: string): string {
	return `<span data-i18n="${attr(key)}">${escapeHtml(fallback)}</span>`;
}

export function roleLabel(role: unknown): string {
	const key = String(role || 'user').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'user';
	return `<span data-i18n="role.${attr(key)}">${escapeHtml(key)}</span>`;
}

export type StatKind = 'like' | 'comment' | 'view';

export function statIcon(kind: StatKind): string {
	if (kind === 'like') {
		return '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';
	}
	if (kind === 'comment') {
		return '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></svg>';
	}
	return '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
}

export function statNode(kind: StatKind, count: number, attrs = '', active = false): string {
	const activeClass = kind === 'like' && active ? ' active is-liked' : '';
	const countAttr = kind === 'like' ? ' data-like-count' : '';
	return `<span class="stat stat-${kind}${activeClass}"${attrs}>${statIcon(kind)}<span${countAttr}>${Number(count || 0)}</span></span>`;
}

export function likeButton(post: SitePost): string {
	return `<button class="btn stat stat-like ${post.liked ? 'active is-liked' : ''}" type="button" data-like="${post.id}">${statIcon('like')}<span data-like-count>${Number(post.like_count || 0)}</span></button>`;
}


export function renderSiteLayout(options: LayoutOptions): string {
	const categories = options.categories || [];
	const user = options.user || null;
	const brand = siteBrand(options.brand);
	const renderCategoryIcon = (cat: SiteCategory): string => {
		const iconUrl = String(cat.icon_url || '').trim();
		if (!iconUrl) return '<span class="side-dot">•</span>';
		return `<span class="side-icon"><img src="${attr(iconUrl)}" alt=""></span>`;
	};
	const categoryLinks = [
		`<a class="side-link ${!options.activeCategory ? 'active' : ''}" href="/"><span class="side-dot">#</span><span>${escapeHtml(options.allCategory?.name || '全部')}</span></a>`,
		...categories.map((cat) => `<a class="side-link ${options.activeCategory === String(cat.id) ? 'active' : ''}" href="/?category_id=${cat.id}">${renderCategoryIcon(cat)}<span>${escapeHtml(cat.name)}</span><small>${Number(cat.post_count || 0)}</small></a>`),
	].join('');
	const userMenu = user
		? `<details class="user-menu"><summary>${avatar(user, user.username)}<span>${escapeHtml(user.username)}</span></summary><div class="menu-panel"><div class="menu-head">${avatar(user, user.username)}<strong>${escapeHtml(user.username)}</strong><small>${escapeHtml(user.email)}</small></div><a href="${publicUserPath(user.id, options.env)}" data-i18n="nav.myProfile">我的主页</a><a href="/me" data-i18n="me.title">我的内容</a><a href="/settings" data-i18n="nav.profileSettings">个人设置</a>${user.role === 'admin' ? '<a href="/admin" data-i18n="nav.adminPanel">管理后台</a>' : ''}<a href="/logout" data-i18n="nav.logout">退出登录</a></div></details>`
		: `<a class="btn ghost" href="/login" data-i18n="nav.login">登录</a><a class="btn primary" href="/register" data-i18n="nav.register">注册</a>`;
	const notificationBell = user
		? `<div class="notifications"><button class="icon-btn" type="button" data-notification-toggle title="Notifications">🔔<span class="notif-count" data-notification-count ${Number(user.unread_count || 0) ? '' : 'hidden'}>${Number(user.unread_count || 0)}</span></button><div class="notif-panel" data-notification-panel></div></div>`
		: '';
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)} - ${escapeHtml(brand.siteName)}</title>
${faviconLinks(options.brand)}
<script>try{var ffLocale=localStorage.getItem('ff.locale')||((document.cookie.match(/(?:^|; )ff_locale=([^;]+)/)||[])[1]&&decodeURIComponent((document.cookie.match(/(?:^|; )ff_locale=([^;]+)/)||[])[1]));if(ffLocale&&ffLocale!==document.documentElement.lang)document.documentElement.classList.add('i18n-pending');}catch(e){}</script>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--panel2:#0f1623;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--danger:#f85149;--radius:8px;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;--mono:"Cascadia Code","Consolas",monospace;--z-base:0;--z-header:1000;--z-dropdown:1100;--z-floating:1200;--z-modal:2000;--z-toast:2200}
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:rgba(88,166,255,.48) rgba(15,23,36,.78)}*::-webkit-scrollbar{width:10px;height:10px}*::-webkit-scrollbar-track{background:rgba(15,23,36,.78);border-radius:999px}*::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(88,166,255,.68),rgba(96,120,150,.42));border:2px solid rgba(15,23,36,.9);border-radius:999px}*::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,rgba(88,166,255,.92),rgba(139,148,158,.58))}html,body{height:100%;margin:0}body{background:var(--bg);color:var(--text);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.i18n-pending [data-i18n]{color:transparent!important;background:linear-gradient(90deg,rgba(96,120,150,.16),rgba(96,120,150,.28),rgba(96,120,150,.16));background-size:180% 100%;border-radius:6px;animation:i18nPulse 1s ease-in-out infinite}@keyframes i18nPulse{0%{background-position:100% 0}100%{background-position:-100% 0}}a{color:inherit;text-decoration:none}button,input,textarea,select{font:inherit;color:inherit}img,video{max-width:100%}
.app{height:100vh;display:grid;grid-template-columns:228px minmax(0,1fr)}.side{border-right:1px solid rgba(96,120,150,.22);background:linear-gradient(180deg,#101827 0%,#0b111d 58%,#090d14 100%);display:flex;flex-direction:column;min-height:0}.brand{height:58px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid rgba(96,120,150,.2);font-weight:850;letter-spacing:.01em;min-width:0}.brand span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.brand-mark{width:22px;height:22px;display:grid;place-items:center;border:1px solid rgba(88,166,255,.45);border-radius:7px;color:#8cc8ff;background:rgba(88,166,255,.09);overflow:hidden;flex:0 0 auto}.brand-mark img{width:100%;height:100%;object-fit:cover;display:block}.side-title{padding:18px 14px 8px;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.side-link{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:9px;margin:3px 8px;padding:9px 10px;border-radius:9px;color:#c7d3e2;border:1px solid transparent}.side-link:hover,.side-link.active{background:rgba(88,166,255,.1);border-color:rgba(88,166,255,.16);color:#fff}.side-link small{color:var(--muted);font-size:11px}.side-dot{width:18px;height:18px;display:grid;place-items:center;color:#cfe6ff;font-weight:900}.side-icon{width:18px;height:18px;border:1px solid rgba(96,120,150,.24);border-radius:6px;background:#0f1724;display:grid;place-items:center;overflow:hidden}.side-icon img{width:100%;height:100%;object-fit:cover;display:block}
.workspace{min-width:0;display:flex;flex-direction:column;height:100vh}.topbar{position:relative;z-index:var(--z-header);isolation:isolate;height:58px;border-bottom:1px solid rgba(96,120,150,.22);display:flex;align-items:center;gap:12px;padding:0 16px;background:rgba(13,19,32,.92);backdrop-filter:blur(16px)}.search{width:min(560px,44vw);background:#0f1724;border:1px solid rgba(96,120,150,.3);border-radius:10px;padding:9px 12px;outline:none}.search:focus{border-color:rgba(88,166,255,.75);box-shadow:0 0 0 3px rgba(88,166,255,.12)}.top-actions{margin-left:auto;display:flex;align-items:center;gap:8px}.lang-picker{position:relative;z-index:var(--z-dropdown)}.lang-btn{height:36px;display:flex;align-items:center;gap:8px;border:1px solid rgba(96,120,150,.34);border-radius:999px;background:#0f1724;color:var(--text);padding:0 11px;font-size:13px;font-weight:750;cursor:pointer}.lang-btn:hover{border-color:var(--accent);background:#131d2c}.lang-btn>svg{opacity:.55}.lang-flag{display:inline-grid;place-items:center;width:22px;height:22px;font-size:15px;line-height:1}.lang-flag svg{width:20px;height:14px;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}.lang-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid rgba(96,120,150,.34);border-radius:12px;background:#161b22;box-shadow:0 22px 70px rgba(0,0,0,.55);display:none;max-height:360px;overflow:auto;z-index:var(--z-dropdown)}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border-radius:8px;cursor:pointer;color:#d8dee9}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.1);color:#58a6ff}.lang-menu li small{color:var(--muted);font-size:11px}.content{position:relative;z-index:var(--z-base);min-height:0;flex:1;overflow:hidden;padding:18px}.content.wide{padding:12px}.content.fixed{overflow:hidden}
.plugin-resource-viewer{height:100%;min-height:0;display:grid;background:#0b1018}.plugin-resource-stage{min-height:0;display:grid;border:1px solid rgba(96,120,150,.24);border-radius:12px;background:#262626;overflow:hidden}.plugin-resource-stage .ff-bp-placeholder,.plugin-resource-stage .ff-bp,.plugin-resource-stage .ff-bp-canvas,.plugin-resource-stage ueb-blueprint{width:100%;height:100%!important;min-height:100%!important}.plugin-resource-stage .ff-bp{margin:0;border:0;border-radius:0}.plugin-resource-stage .ff-bp-head{position:absolute;left:12px;top:12px;right:12px;z-index:2}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--border);background:transparent;border-radius:var(--radius);padding:7px 11px;color:var(--text);cursor:pointer;font-weight:650;transition:.15s}.btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.05)}.btn:disabled,.btn[data-loading="1"]{cursor:wait;opacity:.72;pointer-events:none}.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:750}.btn.primary:hover{color:#fff;opacity:.86}.btn.ghost{background:transparent}.btn.danger{border-color:#6e1f26;color:#ff7b72}.btn.active{border-color:rgba(88,166,255,.54);color:#dff0ff;background:rgba(88,166,255,.12)}.spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.22);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.stat{display:inline-flex;align-items:center;gap:5px;color:var(--muted);line-height:1;font-variant-numeric:tabular-nums}.stat-icon{width:15px;height:15px;display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:fill .15s,color .15s,filter .15s,transform .15s}.stat-like{color:#7fb7ff}.stat-comment{color:#cdbbff}.stat-view{color:#89d7ff}.stat-like.active,.stat-like.is-liked{color:#58a6ff}.stat-like.active .stat-icon,.stat-like.is-liked .stat-icon{fill:currentColor;filter:drop-shadow(0 0 7px rgba(88,166,255,.5));transform:translateY(-.5px)}.btn.stat{padding:7px 10px}.btn.stat.active,.btn.stat.is-liked{border-color:rgba(88,166,255,.54);background:rgba(88,166,255,.12)}.stats .stat{min-width:34px}.muted{color:var(--muted)}.pill{border:1px solid var(--border);background:#111827;border-radius:999px;padding:2px 7px;font-size:12px;color:#9fb1c5}.message[data-type=error]{color:var(--danger)}.message[data-type=ok]{color:var(--green)}
.avatar{width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;background:#212a3a;color:#c9d1d9;object-fit:cover;flex:0 0 auto}.user-hover{position:relative;display:inline-grid;place-items:center;line-height:1;z-index:25}.user-avatar-link{display:inline-grid;border-radius:999px;line-height:1}.user-avatar-link .avatar{cursor:pointer}.user-avatar-link:hover .avatar{box-shadow:0 0 0 2px rgba(88,166,255,.35)}.user-card{position:absolute;left:0;top:calc(100% + 10px);width:238px;display:grid;gap:10px;padding:12px;border:1px solid rgba(88,166,255,.34);border-radius:14px;background:linear-gradient(180deg,rgba(18,28,44,.98),rgba(9,14,24,.98));box-shadow:0 24px 70px rgba(0,0,0,.58),0 0 0 1px rgba(255,255,255,.02) inset;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-4px);transition:.14s;z-index:var(--z-floating);color:var(--text)}.user-card:before{content:"";position:absolute;left:10px;top:-6px;width:10px;height:10px;transform:rotate(45deg);background:rgba(18,28,44,.98);border-left:1px solid rgba(88,166,255,.34);border-top:1px solid rgba(88,166,255,.34)}.user-hover:hover .user-card,.user-hover:focus-within .user-card{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0)}.user-card-head{display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;align-items:center}.user-card-head .avatar{width:42px;height:42px;font-size:16px}.user-card-head strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.user-card-head small{display:inline-flex;margin-top:4px;color:#8cc8ff;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.user-card-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.user-card-stats span{display:grid;place-items:center;align-content:center;min-height:54px;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826}.user-card-stats b{font-size:17px;line-height:1}.user-card-stats small{margin-top:4px;color:var(--muted);font-size:11px}.user-card-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;max-height:72px;overflow:auto;padding:1px 2px}.badge-chip{border:1px solid rgba(88,166,255,.3);border-radius:999px;background:rgba(88,166,255,.1);color:#cfe6ff;padding:4px 8px;font-size:11px;font-weight:800}.muted-badge{border-color:rgba(96,120,150,.24);background:#0d1320;color:var(--muted)}.icon-btn{position:relative;width:36px;height:36px;border:1px solid var(--border);border-radius:10px;background:#0f1724;color:#c9d1d9;display:grid;place-items:center;cursor:pointer}.icon-btn:hover{border-color:var(--accent);color:#fff;background:#132033}.notif-count{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--danger);color:#fff;font-size:11px;font-weight:900;line-height:18px}.notifications{position:relative;z-index:var(--z-dropdown)}.notif-panel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:min(360px,calc(100vw - 24px));max-height:420px;overflow:auto;border:1px solid rgba(96,120,150,.34);border-radius:14px;background:#0d1320;box-shadow:0 24px 80px rgba(0,0,0,.55);padding:8px}.notifications.open .notif-panel{display:grid;gap:6px}.notif-item{display:grid;gap:3px;padding:10px;border-radius:10px;border:1px solid rgba(96,120,150,.18);background:#101826}.notif-item:hover{border-color:rgba(88,166,255,.38);background:#142033}.notif-item.unread{border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.1)}.notif-item strong{font-size:13px}.notif-item span{color:#b9c8da;font-size:12px;line-height:1.45}.notif-item small,.notif-empty{color:var(--muted);font-size:12px}.notif-empty{padding:14px;text-align:center}.user-menu{position:relative;z-index:var(--z-dropdown)}.user-menu[open]{z-index:var(--z-dropdown)}.user-menu summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;border:1px solid var(--border);border-radius:999px;padding:4px 9px;background:var(--panel)}.user-menu summary::-webkit-details-marker{display:none}.menu-panel{display:none}.floating-menu{position:fixed;z-index:var(--z-floating);display:grid;gap:4px;width:max-content;min-width:128px;max-width:min(260px,calc(100vw - 16px));border:1px solid rgba(96,120,150,.34);border-radius:12px;background:#0d1320;box-shadow:0 22px 70px rgba(0,0,0,.58);padding:8px}.floating-menu[hidden]{display:none}.floating-menu a{display:block;padding:9px 10px;border-radius:7px}.floating-menu a:hover{background:#21262d}.floating-menu .btn{width:100%;justify-content:flex-start;padding:7px 9px;font-size:12px;border-color:transparent}.floating-menu .btn:hover{background:#162238}.menu-head{display:grid;grid-template-columns:36px 1fr;gap:2px 10px;padding:8px 10px 12px;border-bottom:1px solid var(--border);margin-bottom:6px;min-width:220px}.menu-head .avatar{grid-row:1/3;width:36px;height:36px}.menu-head small{color:var(--muted)}
.badge-chip{display:inline-flex;align-items:center;justify-content:center;gap:0;width:34px;height:34px;max-width:100%;padding:0;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),0 8px 22px rgba(0,0,0,.22)}.badge-chip:hover{transform:translateY(-1px);filter:brightness(1.08)}.badge-chip-icon{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;font-size:10px;font-weight:900;line-height:1;background:rgba(5,10,18,.42)}.badge-chip-img{width:22px;height:22px;border-radius:50%;object-fit:cover;background:#050a12;box-shadow:0 0 0 1px rgba(255,255,255,.12);flex:0 0 auto}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.page-head h1{font-size:20px;margin:0}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.toolbar-end{justify-content:flex-end}.btn-compact{padding:3px 7px}.stats-start{justify-content:flex-start}.no-margin{margin:0}.feed-title{margin:0;font-size:20px}.feed-shell{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}.feed-main{min-width:0}.feed-hero{position:relative;overflow:hidden;border:1px solid rgba(96,120,150,.24);border-radius:16px;background:linear-gradient(135deg,rgba(18,29,45,.96),rgba(10,15,24,.98));padding:16px 18px;margin-bottom:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center}.feed-hero:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:linear-gradient(180deg,var(--accent),var(--green));opacity:.95}.hero-copy{position:relative;min-width:0}.hero-kicker{color:#8cc8ff;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.14em}.feed-hero h1{margin:4px 0 6px;font-size:24px;line-height:1.08;letter-spacing:-.015em}.feed-hero p{position:relative;max-width:960px;margin:0;color:#aebdd0;white-space:normal}.hero-stats{position:relative;display:grid;grid-template-columns:repeat(3,108px);gap:8px}.hero-stat{border:1px solid rgba(96,120,150,.24);border-radius:12px;background:rgba(5,10,18,.42);padding:10px 11px;min-width:0;text-align:center;display:grid;place-items:center;align-content:center}.hero-stat strong{display:block;font-size:19px;line-height:1}.hero-stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}.feed-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 12px}.seg{display:flex;gap:4px;padding:4px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d}.seg .btn{border:0;border-radius:9px;padding:7px 12px}.seg .btn.active{background:#1b2738;color:#fff}.post-list{display:grid;gap:10px;align-content:start}.post-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 164px;gap:16px;height:148px;min-height:0;overflow:visible;padding:14px 16px;border:1px solid rgba(96,120,150,.22);border-radius:16px;background:linear-gradient(180deg,rgba(18,26,39,.92),rgba(10,16,26,.96));box-shadow:0 16px 40px rgba(0,0,0,.14)}.post-row:hover{z-index:20;border-color:rgba(88,166,255,.38);background:linear-gradient(180deg,rgba(20,31,48,.96),rgba(12,19,31,.98));transform:translateY(-1px)}.post-row.featured{grid-template-columns:minmax(0,1fr) minmax(260px,34%);height:184px;min-height:0;border-color:rgba(88,166,255,.38)}.post-title{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:850;margin:0 0 7px;line-height:1.25}.post-row.featured .post-title{font-size:22px;letter-spacing:-.015em}.post-excerpt{color:#adbad0;margin:8px 0 11px;max-width:980px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.post-row.featured .post-excerpt{-webkit-line-clamp:3}.meta,.stats{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:12px}.stats{justify-content:flex-end}.post-side{display:flex;flex-direction:column;align-items:stretch;gap:10px;min-width:0;height:100%;overflow:hidden;border-radius:12px}.thumbs{height:100%;min-height:92px;border:1px solid rgba(96,120,150,.24);border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#172338,#0f1828);display:grid;position:relative}.post-row.featured .thumbs{height:100%}.thumbs img,.thumbs video{width:100%;height:100%;object-fit:cover;border:0;border-radius:0}.thumbs img[src=""],.thumbs img:not([src]){display:none}.thumbs.multi{grid-template-columns:1fr 1fr}.thumbs.multi img:first-child,.thumbs.multi video:first-child{grid-row:span 2}.thumbs.empty{display:grid;place-items:center;color:#8aa2bd;background:linear-gradient(135deg,#18243a,#0d1422)}.thumbs.empty:before{content:"Discussion";font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.feed-aside{display:grid;gap:12px;align-self:start;position:sticky;top:14px}.side-card{border:1px solid rgba(96,120,150,.22);border-radius:16px;background:#0b111d;padding:14px}.side-card h3{margin:0 0 10px;font-size:14px}.topic-list{display:grid;gap:8px}.topic-list a{display:flex;align-items:center;justify-content:space-between;gap:8px;border-radius:10px;padding:8px 9px;background:#101826;color:#c8d5e6}.topic-list a:hover{background:#162238}.daily-card{background:linear-gradient(180deg,rgba(88,166,255,.08),rgba(13,19,32,.96));text-align:center}.daily-card .btn{width:100%;height:38px}.daily-desc{color:#9fb0c8;margin:0 0 12px;line-height:1.55}.daily-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}.daily-stat{border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:8px;min-height:66px;text-align:center;display:grid;place-items:center;align-content:center}.daily-stat strong{display:block;font-size:18px}.daily-stat span{display:block;color:var(--muted);font-size:11px;margin-top:3px}.levelbar{appearance:none;width:100%;height:7px;border:0;border-radius:999px;background:#111827;overflow:hidden;margin:8px 0 12px}.levelbar::-webkit-progress-bar{background:#111827;border-radius:999px}.levelbar::-webkit-progress-value{background:linear-gradient(90deg,var(--accent),var(--green));border-radius:999px}.levelbar::-moz-progress-bar{background:linear-gradient(90deg,var(--accent),var(--green));border-radius:999px}.pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px}.home-board{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr)}.home-board .feed-hero{margin-bottom:12px}.home-board .feed-controls{margin:0 0 12px}.home-board .feed-shell{min-height:0;height:100%;align-items:stretch}.home-board .feed-main{min-height:0;display:flex;flex-direction:column}.home-board .post-list{min-height:0;flex:1;overflow:auto;align-content:start;padding-right:4px;padding-bottom:8px}.home-board .pagination{flex:0 0 auto;margin-top:0;padding-top:10px;border-top:1px solid rgba(96,120,150,.18);background:linear-gradient(180deg,rgba(13,17,23,0),rgba(13,17,23,.72))}.home-board .feed-aside{position:static;align-self:stretch;min-height:0;height:100%;display:flex;flex-direction:column;overflow:hidden}.home-board .side-card{min-height:0}.home-board .side-card:last-child{flex:1;overflow:hidden}.home-board .topic-list{min-height:0;overflow:auto;padding-right:2px}
.detail-grid{height:100%;min-height:0;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(360px,.85fr);gap:12px}.detail-panel{min-height:0;border:1px solid var(--border);border-radius:8px;background:#0b111d;display:flex;flex-direction:column}.detail-head{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px}.detail-head h1{margin:0 0 8px;font-size:22px}.detail-actions{margin-left:auto;display:flex;gap:8px}.article{min-height:0;flex:1;overflow:auto;padding:18px 20px}.prose{width:100%;max-width:none}.prose h2,.prose h3,.prose h4{border-bottom:0;padding-bottom:0}.prose p{margin:0 0 14px}.prose p:has(> img.md-image:only-child),.editor-preview p:has(> img.md-image:only-child){display:inline-block;margin:0 12px 12px 0;vertical-align:top}.prose p:has(> img.md-image:only-child)+p:not(:has(> img.md-image:only-child)),.editor-preview p:has(> img.md-image:only-child)+p:not(:has(> img.md-image:only-child)){display:block;clear:both}.prose a,.editor-preview a{color:#8cc8ff;border-bottom:1px solid rgba(88,166,255,.35);text-decoration:none}.prose a:hover,.editor-preview a:hover{color:#fff;border-bottom-color:rgba(88,166,255,.75)}.prose img,.prose video,.editor-preview img,.editor-preview video{display:block;width:min(640px,100%);max-height:520px;border-radius:8px;border:1px solid var(--border);margin:12px 0;object-fit:contain;background:#050a12}.prose p:has(> img.md-image:only-child)>img.md-image,.editor-preview p:has(> img.md-image:only-child)>img.md-image{margin:0}.prose img.md-image,.editor-preview img.md-image{display:inline-block;margin:0 12px 12px 0;vertical-align:top;cursor:zoom-in}.prose img.md-image:hover,.editor-preview img.md-image:hover{border-color:rgba(88,166,255,.62);filter:brightness(1.04)}.prose .video-embed,.editor-preview .video-embed{display:block;width:min(860px,100%);aspect-ratio:16/9;height:auto;border:1px solid var(--border);border-radius:10px;margin:12px 0;background:#050a12}.public-profile{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;overflow:hidden}.public-profile-hero{padding:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;background:radial-gradient(circle at 12% 0,rgba(88,166,255,.18),transparent 40%),linear-gradient(135deg,rgba(18,29,45,.96),rgba(10,15,24,.98))}.public-profile-main{display:flex;align-items:center;gap:14px;min-width:0}.public-profile-main .avatar{width:70px;height:70px;font-size:28px;border:1px solid rgba(96,120,150,.35)}.public-profile-main h1{margin:4px 0 4px;font-size:28px}.public-profile-main p{margin:0;color:var(--muted)}.public-profile-stats{display:grid;grid-template-columns:repeat(3,96px);gap:8px}.public-profile-hero .levelbar{grid-column:1/-1;margin:0}.public-profile-hero .meta{grid-column:1/-1}.hero-badges{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}.public-profile-posts{min-height:0;display:flex;flex-direction:column;overflow:hidden}.profile-section-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}.profile-section-head h2{padding:0;border:0}.public-profile-list{min-height:0;flex:1;overflow:auto;display:grid;gap:10px;padding:12px}.public-profile-posts>.pagination{padding:10px 12px;margin:0;border-top:1px solid var(--border)}.setting-field-narrow{max-width:460px}.setting-field-narrow input{max-width:460px}.field-foot{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px;margin-top:6px;margin-bottom:0;line-height:1.3}.settings-view{height:100%;min-height:0;width:100%;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:14px;overflow:hidden}.settings-profile-panel{grid-row:1/3;padding:18px;display:grid;align-content:start;gap:14px;background:radial-gradient(circle at 50% 0,rgba(88,166,255,.16),transparent 42%),linear-gradient(135deg,rgba(88,166,255,.08),rgba(63,185,80,.035),rgba(10,16,26,.98))}.settings-profile-panel .settings-avatar-card{display:grid;gap:10px;justify-items:center}.settings-profile-panel .avatar{width:92px;height:92px;font-size:32px;border:1px solid rgba(96,120,150,.35);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-profile-title{text-align:center}.settings-profile-title h1{margin:4px 0 6px;font-size:26px}.settings-profile-title p{margin:0;color:var(--muted);overflow:hidden;text-overflow:ellipsis}.settings-main{min-height:0;overflow:auto;padding-right:4px}.settings-section-grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:14px;align-items:start}.settings-section.wide{grid-column:1/-1}.settings-section .panel-body{display:grid;gap:12px}.settings-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,360px));gap:12px 16px;align-items:start}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}.settings-form-grid .field{margin:0}.settings-form-grid .field input{max-width:100%}.settings-option-list{display:grid;gap:10px;max-width:520px}.settings-toggle{min-height:40px;display:flex;align-items:center;gap:9px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#101826;padding:8px 11px}.settings-toggle input{width:15px!important;height:15px;accent-color:var(--accent);flex:0 0 auto}.settings-toggle span{font-weight:800}.settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}.settings-actions .btn{min-width:128px}.settings-card .panel-body{display:grid;gap:10px}.settings-big{font-size:34px;font-weight:900;line-height:1;color:#fff}.settings-links{display:grid;gap:8px}.settings-links .btn{width:100%;justify-content:center}.settings-status{display:grid;gap:8px}.settings-status>div{display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 10px}.settings-status span{color:var(--muted)}.settings-save{grid-column:2;justify-content:flex-end;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;padding:12px}.settings-save .message{margin-right:auto}@media(max-width:1180px){.settings-view{grid-template-columns:260px minmax(0,1fr)}.settings-section-grid{grid-template-columns:1fr}}@media(max-width:860px){.settings-view{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto}.settings-profile-panel{grid-row:auto}.settings-save{grid-column:1}.settings-form-grid.password-grid{grid-template-columns:1fr}}
.comments{min-height:0;display:flex;flex-direction:column}.comment-form{padding:12px;border-bottom:1px solid var(--border)}.comment-form textarea{height:54px;min-height:54px;resize:vertical}.comment-form textarea:focus{height:54px}.comment-list{min-height:0;flex:1;overflow:auto;padding:12px}.comment{border:1px solid var(--border);border-radius:7px;padding:10px;margin-bottom:8px;background:#0d1320}.comment.child{margin-left:28px;background:#101826}.comment-top{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin-bottom:6px}.comment-actions{margin-left:auto;display:flex;gap:6px}.comment-body{white-space:pre-wrap}.turnstile-box{display:flex;justify-content:flex-start;margin:10px 0}.turnstile-box[hidden]{display:none!important}.post-actions{position:relative;z-index:12;flex:0 0 auto}.post-actions summary{list-style:none}.post-actions summary::-webkit-details-marker{display:none}.post-action-trigger{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#8b949e;cursor:pointer;font-size:18px;line-height:1}.post-action-trigger:hover{color:#fff;background:rgba(88,166,255,.12)}.post-action-menu{display:none}.me-page{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px}.me-tabs{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.me-tab-nav{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border);background:#0d1320}.me-tab-nav button{border:1px solid rgba(96,120,150,.22);border-radius:10px;background:transparent;padding:7px 13px;color:#b9c8da;cursor:pointer;font-weight:750}.me-tab-nav button:hover{border-color:rgba(88,166,255,.45);color:#fff}.me-tab-nav button.active{background:rgba(88,166,255,.14);border-color:rgba(88,166,255,.42);color:#fff}.me-tab-body{min-height:0;overflow:hidden;padding:12px}.me-tab-panel{height:100%;min-height:0;overflow:auto}.me-tab-panel[hidden]{display:none!important}.me-level-panel{display:grid;grid-template-columns:repeat(3,minmax(0,160px));gap:10px;margin-bottom:12px}.me-level-panel>div{min-height:82px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#101826;display:grid;place-items:center;align-content:center;text-align:center}.me-level-panel strong{display:block;font-size:28px}.progress-log{margin-top:14px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;overflow:hidden}.progress-log h3{margin:0;padding:12px 14px;font-size:16px}.progress-log-list{display:grid;gap:6px;padding:12px;border-top:1px solid rgba(96,120,150,.22)}.progress-row{display:grid;grid-template-columns:minmax(150px,1.1fr) 96px 96px minmax(160px,1.3fr) 128px;align-items:center;gap:10px;border:1px solid rgba(96,120,150,.18);border-radius:10px;background:#101826;padding:9px 12px}.progress-row.is-head{position:sticky;top:0;z-index:1;background:#0d1320;color:#8b949e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.progress-row strong{font-size:13px}.progress-target{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.progress-delta{border:1px solid rgba(88,166,255,.22);border-radius:999px;background:rgba(88,166,255,.08);padding:4px 8px;color:#cfe6ff;font-weight:800;text-align:center}.me-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.me-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.compact-list{display:grid;gap:8px;align-content:start}.compact-item{border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#0b111d;padding:12px;display:grid;gap:7px}.compact-item-head{display:flex;justify-content:space-between;gap:10px}.compact-item-title{font-weight:800}.status-approved{border-color:rgba(63,185,80,.28);color:#a7f3c0}.status-pending{border-color:rgba(230,184,82,.35);color:#f0d48a}.status-rejected{border-color:rgba(248,81,73,.35);color:#ff9a94}.status-note{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-radius:10px;padding:9px 10px;background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.22);color:#ffd7d4}.status-note span{color:#f4b2ad}.status-note .btn{margin-left:auto}.notif-row.unread{border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.08)}.me-pager{padding-top:8px;margin-top:4px}.form-shell{height:100%;min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr) minmax(0,1fr);gap:12px;overflow:hidden}.panel{border:1px solid var(--border);border-radius:8px;background:#0b111d;min-height:0}.panel>h2{font-size:18px;margin:0;padding:14px 16px;border-bottom:1px solid var(--border)}.panel-body{padding:14px 16px}.field{display:grid;gap:7px;margin-bottom:14px}.field label{font-weight:700}.field input,.field textarea,.field select{width:100%;border:1px solid var(--border);border-radius:6px;background:#0d1320;padding:9px 10px}.field textarea{min-height:220px;resize:vertical}.comment-form .field textarea{height:54px;min-height:54px}.comment-form .field textarea:focus{height:54px;min-height:54px}.compose-sidebar,.compose-editor,.compose-preview{display:flex;flex-direction:column;overflow:hidden}.compose-sidebar .panel-body{min-height:0;flex:1;overflow:auto}.md-toolbar{display:flex;align-items:center;gap:4px;padding:7px 10px;border-bottom:1px solid rgba(96,120,150,.22);background:linear-gradient(180deg,#101826,#0d1320);flex:0 0 auto;overflow:auto}.md-toolbar button{width:30px;height:30px;border:1px solid transparent;border-radius:8px;background:transparent;color:#9fb1c7;display:grid;place-items:center;cursor:pointer;transition:.14s;padding:0;line-height:1}.md-toolbar button svg{width:16px;height:16px;display:block;stroke-width:2}.md-toolbar button:hover{border-color:rgba(88,166,255,.32);background:rgba(88,166,255,.1);color:#fff}.md-toolbar button:active{transform:translateY(1px)}.md-toolbar>span{width:1px;height:18px;background:rgba(96,120,150,.35);margin:0 5px;flex:0 0 auto}.compose-editor .panel-body{min-height:0;flex:1;overflow:hidden;display:flex;flex-direction:column}.compose-editor .field{min-height:0;flex:1;margin:0}.compose-editor textarea{height:100%;min-height:0;resize:none;overflow:auto}.compose-preview > .article{min-height:0;flex:1;overflow:auto}.compose-preview .panel-body{flex:0 0 auto;border-top:1px solid var(--border);padding:12px 16px}.checks{display:flex;flex-wrap:wrap;gap:8px}.check{display:flex;gap:6px;align-items:center;border:1px solid var(--border);border-radius:999px;padding:5px 9px}.tag-checks{display:flex;flex-wrap:wrap;gap:7px;align-items:flex-start}.tag-check{position:relative;display:inline-flex;align-items:center;min-width:0;max-width:100%;height:30px;border:1px solid rgba(96,120,150,.28);border-radius:999px;background:#101826;color:#b9c8dc;padding:0 10px 0 8px;font-size:12px;font-weight:800;cursor:pointer;transition:.14s}.tag-check input{width:14px!important;height:14px;margin:0 6px 0 0;padding:0;accent-color:var(--accent);flex:0 0 auto}.tag-check span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag-check:hover{border-color:rgba(88,166,255,.48);background:#132033;color:#fff}.tag-check:has(input:checked){border-color:rgba(88,166,255,.62);background:rgba(88,166,255,.14);color:#e6f1ff;box-shadow:inset 0 0 0 1px rgba(88,166,255,.1)}.upload-card{min-height:88px;border:1px dashed rgba(96,120,150,.36);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.06),rgba(13,19,32,.4));display:grid;grid-template-columns:34px minmax(0,1fr);gap:4px 10px;align-items:center;padding:12px;cursor:pointer;transition:.14s}.upload-card:hover{border-color:rgba(88,166,255,.58);background:linear-gradient(180deg,rgba(88,166,255,.1),rgba(13,19,32,.5))}.upload-card.is-disabled{opacity:.56;cursor:not-allowed}.upload-card.is-disabled:hover{border-color:rgba(96,120,150,.36);background:linear-gradient(180deg,rgba(88,166,255,.06),rgba(13,19,32,.4))}.upload-icon{grid-row:1/3;width:34px;height:34px;border:1px solid rgba(88,166,255,.28);border-radius:10px;background:rgba(88,166,255,.1);display:grid;place-items:center;color:#8cc8ff}.upload-card strong{font-size:13px}.upload-card small{color:var(--muted);line-height:1.45}.editor-preview{height:100%;overflow:hidden}.auth{height:100%;min-height:0;overflow:auto;display:grid;place-items:center}.auth-card{width:min(440px,100%);border:1px solid var(--border);border-radius:10px;background:#0b111d;padding:24px}.auth-card h1{margin-top:0}.settings-view{height:100%;min-height:0;width:100%;display:grid;grid-template-columns:280px minmax(520px,1fr) 320px;grid-template-rows:minmax(0,1fr) auto;gap:14px;overflow:hidden}.settings-hero{padding:18px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;background:radial-gradient(circle at 50% 0,rgba(88,166,255,.16),transparent 42%),linear-gradient(135deg,rgba(88,166,255,.08),rgba(63,185,80,.035),rgba(10,16,26,.98))}.settings-avatar-card{display:grid;gap:10px;justify-items:center}.settings-avatar-card .avatar{width:96px;height:96px;font-size:32px;border:1px solid rgba(96,120,150,.35);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-avatar-card img.avatar{object-fit:cover}.settings-profile-title h1{margin:4px 0 6px;font-size:28px}.settings-profile-title p{margin:0;color:var(--muted)}.settings-grid{min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.settings-aside{min-height:0;overflow:auto;display:grid;align-content:start;gap:14px}.settings-card .panel-body{display:grid;gap:10px}.settings-big{font-size:34px;font-weight:900;line-height:1;color:#fff}.settings-links{grid-template-columns:1fr}.settings-links .btn{width:100%;justify-content:center}.settings-status{display:grid;gap:8px}.settings-status>div{display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 10px}.settings-status span{color:var(--muted)}.settings-save{grid-column:1/-1;justify-content:flex-end;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;padding:12px}.settings-save .message{margin-right:auto}.current-email-row,.pending-email-row{display:flex;align-items:center;gap:10px;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 12px;margin-bottom:12px;flex-wrap:wrap}.current-email-row .label,.pending-email-row .label{flex:0 0 auto;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.current-email-value,.pending-email-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#c9d1d9}.badge-ok{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(63,185,80,.15);border:1px solid rgba(63,185,80,.4);color:#7ee787;flex:0 0 auto}.badge-warn{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(230,184,82,.12);border:1px solid rgba(230,184,82,.38);color:#f0c040;flex:0 0 auto}.email-otp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px}.email-otp-row input{flex:1;min-width:160px;max-width:360px}.email-code-input{font-family:'Cascadia Code',Consolas,monospace;letter-spacing:.2em;font-size:18px;font-weight:700;max-width:160px!important;min-width:130px!important;text-align:center}.email-code-step{margin-top:12px}@media(max-width:1280px){.settings-view{grid-template-columns:260px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}.settings-aside{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden}}@media(max-width:980px){.settings-view{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto}.settings-hero,.settings-grid{grid-template-columns:1fr}.settings-aside{grid-template-columns:1fr;overflow:auto}.settings-hero .daily-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.progress-row{grid-template-columns:1fr 80px 80px}.progress-row.is-head .progress-target,.progress-row.is-head .progress-time,.progress-row .progress-target,.progress-row .progress-time{display:none}}
.settings-view{height:100%;min-height:0;width:100%;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:14px;overflow:hidden}.settings-profile-panel{padding:18px;display:grid;align-content:start;gap:14px;background:radial-gradient(circle at 50% 0,rgba(88,166,255,.16),transparent 42%),linear-gradient(135deg,rgba(88,166,255,.08),rgba(63,185,80,.035),rgba(10,16,26,.98))}.settings-profile-panel .settings-avatar-card{display:grid;gap:10px;justify-items:center}.settings-profile-panel .avatar{width:92px;height:92px;font-size:32px;border:1px solid rgba(96,120,150,.35);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-profile-title{text-align:center}.settings-profile-title h1{margin:4px 0 6px;font-size:26px}.settings-profile-title p{margin:0;color:var(--muted);overflow:hidden;text-overflow:ellipsis}.settings-main{min-height:0;overflow:auto;padding-right:4px}.settings-section-grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:14px;align-items:start}.settings-section.wide{grid-column:1/-1}.settings-section .panel-body{display:grid;gap:12px}.settings-card-head{min-height:50px;padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px}.settings-card-head h2{margin:0;border:0;padding:0;min-width:0}.settings-card-head .btn{min-width:94px;white-space:nowrap}.settings-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,360px));gap:12px 16px;align-items:start}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}.settings-form-grid .field{margin:0}.settings-form-grid .field input{max-width:100%}.settings-option-list{display:grid;gap:10px;max-width:520px}.settings-toggle{min-height:40px;display:flex;align-items:center;gap:9px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#101826;padding:8px 11px}.settings-toggle input{width:15px!important;height:15px;accent-color:var(--accent);flex:0 0 auto}.settings-toggle span{font-weight:800}.settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}.settings-actions .btn{min-width:128px}.settings-card .panel-body{display:grid;gap:10px}.settings-big{font-size:34px;font-weight:900;line-height:1;color:#fff}.settings-links{display:grid;gap:8px}.settings-links .btn{width:100%;justify-content:center}.settings-status{display:grid;gap:8px}.settings-status>div{display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 10px}.settings-status span{color:var(--muted)}@media(max-width:1180px){.settings-view{grid-template-columns:260px minmax(0,1fr)}.settings-section-grid{grid-template-columns:1fr}}@media(max-width:860px){.settings-view{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.settings-form-grid.password-grid{grid-template-columns:1fr}}
.settings-main{min-height:0;overflow:auto;padding-right:4px}.settings-section-grid{min-height:100%;display:grid;grid-template-columns:repeat(2,minmax(320px,1fr));gap:14px;align-items:stretch;align-content:start}.settings-section{min-height:0;display:flex;flex-direction:column}.settings-section .panel-body{flex:1;display:flex;flex-direction:column;gap:12px}.settings-section.email-section,.settings-section.password-section{grid-column:auto}.settings-section.email-section .panel-body,.settings-section.password-section .panel-body{min-height:0}.settings-section .settings-actions{margin-top:auto}.settings-section .settings-form-grid,.settings-section .settings-option-list{flex:0 0 auto}.settings-section .muted{max-width:720px}.plugin-settings-slot{display:none;min-height:0}.plugin-settings-slot.has-content{display:block}.plugin-settings-slot>.fab-card:first-child{margin-top:0;height:100%}.plugin-settings-slot .fab-card{margin:0;height:100%;display:flex;flex-direction:column}.plugin-settings-slot .fab-card-hd,.settings-card-head{min-height:50px;padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px}.plugin-settings-slot .fab-card-hd h3,.settings-card-head h2{margin:0;border:0;padding:0;min-width:0}.plugin-settings-slot .fab-card-hd p{margin:3px 0 0}.plugin-settings-slot .fab-card-body{padding:14px;display:flex;flex-direction:column;gap:12px;flex:1}.plugin-settings-slot .fab-form{margin-top:auto}.settings-card-head .btn,.plugin-settings-slot .fab-card-hd .btn{min-width:94px;white-space:nowrap}.settings-form-grid{grid-template-columns:repeat(auto-fit,minmax(240px,360px))}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}.settings-section .field-foot{margin-top:6px;margin-bottom:0;line-height:1.3}.profile-dashboard,.me-dashboard{height:100%;min-height:0;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:14px;overflow:hidden}.profile-side-panel,.me-profile-panel{grid-row:auto!important;min-height:0;overflow:auto}.profile-main,.me-main{min-height:0;overflow:hidden;display:grid}.profile-posts-panel{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.profile-posts-panel .public-profile-list{min-height:0;overflow:auto}.settings-profile-panel .hero-badges{display:flex;flex-wrap:wrap;gap:8px;grid-column:auto;justify-content:center;max-height:80px;overflow:auto;padding:2px}.settings-profile-panel .hero-badges:empty{display:none}.ff-user-badge-slot .badge-chip{max-width:100%;justify-content:center}.ff-user-badge-slot .badge-chip-img{width:22px;height:22px}.me-dashboard .me-tabs{height:100%;min-height:0}.me-dashboard .me-tab-body{min-height:0;overflow:hidden;padding:12px}.me-dashboard .me-tab-nav{overflow:auto;flex-wrap:nowrap}.me-profile-panel .levelbar,.profile-side-panel .levelbar{margin:0 0 10px}@media(max-width:1180px){.settings-section-grid{grid-template-columns:1fr}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}.profile-dashboard,.me-dashboard{grid-template-columns:260px minmax(0,1fr)}}@media(max-width:860px){.profile-dashboard,.me-dashboard{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.profile-side-panel,.me-profile-panel{max-height:360px}}
.field select{appearance:none;-webkit-appearance:none;padding-right:34px;background-color:#0d1320;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%239fb4cc' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px;transition:border-color .14s,background-color .14s,box-shadow .14s}.field select:hover{border-color:#3a4656;background-color:#101826;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%23c9d8ea' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px}.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.12);outline:none}
.me-tab-panel{overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr) auto}.me-scroll-list{min-height:0;overflow:auto;display:grid;gap:8px;align-content:start;padding-right:4px}.me-level-content{min-height:0;overflow:auto;padding-right:4px;width:100%;max-width:none;margin:0}.me-level-content .me-level-panel{grid-template-columns:repeat(3,minmax(140px,160px));justify-content:center}.me-level-content .levelbar{display:block;width:100%;max-width:680px;margin:14px auto 12px}.me-level-content>.muted{text-align:center}.me-level-content .progress-log{width:100%;max-width:none;box-sizing:border-box}.me-pager{position:relative;margin:8px 0 0;padding-top:10px;border-top:1px solid rgba(96,120,150,.18);background:#0b111d}.me-actions{display:none}
@media(max-width:1180px){.feed-shell{grid-template-columns:1fr}.feed-aside{position:static;grid-template-columns:repeat(2,minmax(0,1fr))}.post-row.featured{grid-template-columns:minmax(0,1fr) 240px}.home-board .feed-shell{grid-template-rows:minmax(0,1fr) auto}.home-board .feed-aside{height:auto;max-height:220px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:980px){body{overflow:hidden}.app{height:100vh;grid-template-columns:1fr}.side{display:none}.workspace{height:100vh;min-height:0}.content{overflow:hidden}.content:not(.fixed){overflow:hidden}.detail-grid,.form-shell{height:100%;grid-template-columns:1fr}.detail-panel{min-height:420px}.search{width:100%}.topbar{height:auto;min-height:56px;flex-wrap:wrap}.top-actions{margin-left:0}.feed-aside{grid-template-columns:1fr}.post-row,.post-row.featured,.feed-hero{grid-template-columns:1fr}.hero-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.stats{justify-content:flex-start}.feed-hero h1{font-size:24px}.home-board{grid-template-rows:auto auto minmax(0,1fr)}.home-board .feed-hero p{display:none}.home-board .feed-shell{grid-template-columns:1fr}.home-board .feed-aside{display:none}}
.home-board .post-list{padding-top:3px;scroll-padding-top:3px}.post-row,.post-row.featured{grid-template-columns:minmax(0,1fr) max-content;height:158px;border-color:rgba(96,120,150,.22)}.post-main{min-width:0;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:6px}.post-title,.post-row.featured .post-title{min-width:0;margin:0;font-size:18px;letter-spacing:0}.post-title span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pin-badge{flex:0 0 auto;font-size:11px;border-radius:999px}.pin-badge.global{color:#ffd166;border-color:rgba(255,209,102,.38);background:rgba(255,209,102,.1)}.pin-badge.category{color:#8cc8ff;border-color:rgba(88,166,255,.38);background:rgba(88,166,255,.1)}.post-excerpt,.post-row.featured .post-excerpt{margin:0;-webkit-line-clamp:2}.stats{justify-content:flex-start;gap:16px;margin-top:2px}.stats span{display:inline-flex;align-items:center;gap:4px}.post-side{width:max-content;max-width:min(52vw,880px)}.thumbs{height:100%;min-height:0;width:max-content;max-width:100%;display:flex;gap:10px;border:0;border-radius:0;overflow:hidden;background:transparent}.thumb-item{display:block;width:clamp(132px,10.5vw,220px);height:100%;flex:0 0 clamp(132px,10.5vw,220px);min-width:0;min-height:0;border:1px solid rgba(96,120,150,.28);border-radius:12px;background:#0d1320;padding:0;overflow:hidden;cursor:zoom-in}.thumb-item:hover{filter:brightness(1.08);border-color:rgba(88,166,255,.52)}.media-lightbox{position:fixed;inset:0;z-index:var(--z-modal);display:grid;place-items:center;background:rgba(2,6,14,.86);backdrop-filter:blur(10px);padding:28px}.media-lightbox[hidden]{display:none}.media-lightbox-inner{position:relative;max-width:min(92vw,1280px);max-height:90vh;display:grid;place-items:center}.media-lightbox img,.media-lightbox video{max-width:100%;max-height:90vh;border:1px solid rgba(96,120,150,.35);border-radius:12px;background:#050914;box-shadow:0 24px 90px rgba(0,0,0,.55)}.media-lightbox video{width:min(92vw,1180px)}.media-lightbox-close{position:fixed;right:18px;top:18px;width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(13,19,32,.78);color:#fff;font-size:24px;line-height:1;cursor:pointer}.media-lightbox-close:hover{background:rgba(88,166,255,.22);border-color:rgba(88,166,255,.5)}@media(max-width:980px){.post-row,.post-row.featured{grid-template-columns:1fr;height:auto;min-height:158px}.post-side{width:100%;max-width:100%;height:116px}.thumbs{width:100%;overflow-x:auto}.thumb-item{width:148px;flex-basis:148px}}
.feed-main{container-type:inline-size}.post-row.has-media .compact-item-head,.post-row.has-media .meta,.post-row.has-media .post-excerpt,.post-row.has-media .stats{min-width:0}@container (max-width:920px){.post-row.has-media,.post-row.featured.has-media{grid-template-columns:1fr;height:auto;min-height:158px}.post-row.has-media .post-side{width:100%;max-width:100%;height:112px}.post-row.has-media .thumbs{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden}.post-row.has-media .thumb-item{width:148px;flex:0 0 148px}.post-row.has-media .post-excerpt{-webkit-line-clamp:1}}@supports not (container-type:inline-size){@media(max-width:1280px){.post-row.has-media,.post-row.featured.has-media{grid-template-columns:1fr;height:auto;min-height:158px}.post-row.has-media .post-side{width:100%;max-width:100%;height:112px}.post-row.has-media .thumbs{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden}.post-row.has-media .thumb-item{width:148px;flex:0 0 148px}.post-row.has-media .post-excerpt{-webkit-line-clamp:1}}}
.top-actions .notifications{display:flex;align-items:center;justify-content:center}.top-actions .notifications .notif-panel{left:50%;right:auto;transform:translateX(-50%);width:360px;max-width:min(360px,calc(100vw - 24px))}@media(max-width:760px){.top-actions .notifications .notif-panel{left:auto;right:0;transform:none}}
.level-input-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.level-input-row label{display:grid;gap:6px;font-size:12px;color:#b9c8da}.level-input-row input{height:34px;padding:7px 8px}.locked-excerpt{color:#f0d48a}.locked-thumb{border-style:dashed;background:linear-gradient(135deg,rgba(230,184,82,.08),rgba(88,166,255,.04))}.access-note{display:grid;gap:5px;border:1px solid rgba(88,166,255,.24);border-radius:12px;background:rgba(88,166,255,.08);padding:12px 14px;color:#cfe6ff}.access-note.locked{min-height:180px;place-content:center;text-align:center}.access-note strong{color:#fff;font-size:15px}.access-note span{color:#9fb4cc}
.email-bind-card{display:grid;gap:14px;width:100%;max-width:760px;border:1px solid rgba(88,166,255,.24);border-radius:14px;background:linear-gradient(135deg,rgba(88,166,255,.075),rgba(16,24,38,.88));padding:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.email-bind-card.is-locked{border-color:rgba(96,120,150,.22);background:linear-gradient(135deg,rgba(16,24,38,.86),rgba(10,16,26,.92))}.email-current{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;min-height:42px;border:1px solid rgba(96,120,150,.22);border-radius:11px;background:#101826;padding:9px 11px}.email-current .label{font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.email-flow{display:grid;gap:8px}.email-label{font-weight:850;color:#d9e7f7}.email-input-line,.email-verify-line{display:flex;align-items:center;gap:8px;min-width:0}.email-input-line input,.email-verify-line input{height:40px;border:1px solid rgba(96,120,150,.32);border-radius:10px;background:#0d1320;color:var(--text);padding:0 12px;outline:none}.email-input-line input{width:min(420px,100%);flex:1 1 320px}.email-input-line input:focus,.email-verify-line input:focus{border-color:rgba(88,166,255,.72);box-shadow:0 0 0 3px rgba(88,166,255,.12)}.email-input-line .btn,.email-verify-line .btn{height:40px;min-width:118px;padding:0 14px;white-space:nowrap}.email-code-step{display:grid;gap:10px;margin-top:0!important}.email-note{display:flex;align-items:center;gap:8px;color:#9fb4cc;font-size:13px}.email-note-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 14px rgba(63,185,80,.7)}.email-code-input{width:148px!important;min-width:148px!important;max-width:148px!important;height:40px!important;text-align:center!important;letter-spacing:.28em!important;font-family:var(--mono)!important;font-size:16px!important;font-weight:850!important}.email-verify-line{flex-wrap:wrap}.email-verify-line #resend-code-btn{min-width:132px}.settings-section.email-section .panel-body{min-height:0!important}.settings-section.email-section .muted{max-width:760px}@media(max-width:720px){.email-current{grid-template-columns:1fr}.email-input-line,.email-verify-line{align-items:stretch;flex-direction:column}.email-input-line input,.email-input-line .btn,.email-verify-line input,.email-verify-line .btn{width:100%!important;max-width:none!important}.email-code-input{letter-spacing:.18em!important}}
</style>
</head>
<body>
<div class="app">
	<aside class="side">
		<a class="brand" href="/">${brandMark(options.brand)}<span>${escapeHtml(brand.siteName)}</span></a>
		<div class="side-title" data-i18n="site.categories">分类</div>
		<nav>${categoryLinks}</nav>
	</aside>
	<div class="workspace">
		<header class="topbar">
			<form action="/" method="get"><input class="search" name="q" data-i18n-placeholder="nav.searchPlaceholder" placeholder="搜索帖子..." value=""></form>
			<div class="lang-picker" data-language-picker>
				<button class="lang-btn" type="button" data-language-button aria-label="Language"><span class="lang-flag" data-language-flag>🇨🇳</span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button>
				<ul class="lang-menu" data-language-menu></ul>
			</div>
			<div class="top-actions">
				${notificationBell}
				<a class="btn" href="/" data-i18n="nav.home">首页</a>
				${user ? '<a class="btn primary" href="/new-post" data-i18n="index.newPost">发布新帖</a>' : ''}
				${userMenu}
			</div>
		</header>
		<main class="content ${options.wide ? 'wide' : ''} ${options.fixed ? 'fixed' : ''}">${options.body}</main>
	</div>
</div>
<script>window.FF_VIDEO_EMBED_DOMAINS=${jsonScript(options.videoEmbedDomains || [])};</script>
<script>${appScript()}${options.script || ''}</script>
</body>
</html>`;
}

export function postTags(post: SitePost): string {
	const tags = post.tags || [];
	if (!tags.length) return '';
	return tags.map((tag) => `<span class="pill">#${escapeHtml(tag.name)}</span>`).join('');
}

export function postMedia(post: SitePost): string {
	const media = extractMedia(post.content).slice(0, 4);
	if (!media.length) return '<div class="thumbs empty"></div>';
	return `<div class="thumbs media-${media.length}">${media.map((item, index) => item.type === 'video'
		? `<button class="thumb-item" type="button" data-lightbox="${attr(item.url)}" data-lightbox-type="video" aria-label="Open media ${index + 1}"><video src="${attr(item.url)}" muted preload="metadata"></video></button>`
		: `<button class="thumb-item" type="button" data-lightbox="${attr(item.url)}" data-lightbox-type="image" aria-label="Open media ${index + 1}"><img src="${attr(item.url)}" alt="${attr(item.alt)}" loading="lazy"></button>`
	).join('')}</div>`;
}

export function levelBar(progress: number): string {
	const value = Math.max(0, Math.min(100, Math.round(progress)));
	return `<progress class="levelbar" value="${value}" max="100"></progress>`;
}

export function pageLink(tab: string, page: number, labelKey: string, label: string, disabled: boolean): string {
	const href = `/me?tab=${encodeURIComponent(tab)}&${encodeURIComponent(tab)}_page=${Math.max(1, page)}`;
	return disabled
		? `<span class="btn muted" data-i18n="${labelKey}">${label}</span>`
		: `<a class="btn" href="${href}" data-i18n="${labelKey}">${label}</a>`;
}

export function tabPager(tab: string, state?: PageState): string {
	if (!state) return '';
	const lastPage = Math.max(1, Math.ceil(Number(state.total || 0) / Math.max(1, Number(state.pageSize || 10))));
	return `<div class="pagination me-pager">
		${pageLink(tab, Number(state.page || 1) - 1, 'pagination.previous', '上一页', Number(state.page || 1) <= 1)}
		<span class="muted">${Number(state.page || 1)} / ${lastPage} <span data-i18n="pagination.page">页</span>，<span data-i18n="pagination.total">共</span> ${Number(state.total || 0)}</span>
		${pageLink(tab, Number(state.page || 1) + 1, 'pagination.next', '下一页', Number(state.page || 1) >= lastPage)}
	</div>`;
}

export function toolbarIcon(name: string): string {
	const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
	const icons: Record<string, string> = {
		bold: `<svg ${common}><path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>`,
		italic: `<svg ${common}><path d="M19 5h-8"/><path d="M13 19H5"/><path d="M15 5 9 19"/></svg>`,
		strike: `<svg ${common}><path d="M16 6.5A4 4 0 0 0 12.5 5H10a3 3 0 0 0-1.6 5.5"/><path d="M14 13.5A3 3 0 0 1 12 19H8.5A4 4 0 0 1 5 17.5"/><path d="M4 12h16"/></svg>`,
		h2: `<svg ${common}><path d="M4 6v12"/><path d="M12 6v12"/><path d="M4 12h8"/><path d="M16 12a2 2 0 1 1 4 0c0 2-4 3-4 6h4"/></svg>`,
		h3: `<svg ${common}><path d="M4 6v12"/><path d="M12 6v12"/><path d="M4 12h8"/><path d="M16 8h4l-3 4a3 3 0 1 1-1 5"/></svg>`,
		quote: `<svg ${common}><path d="M9 7H5a2 2 0 0 0-2 2v4h4v4h2z"/><path d="M21 7h-4a2 2 0 0 0-2 2v4h4v4h2z"/></svg>`,
		list: `<svg ${common}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
		ordered: `<svg ${common}><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M4 14a2 2 0 1 1 2 2c0 1-2 1.5-2 3h2"/></svg>`,
		link: `<svg ${common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>`,
		image: `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-4-4a2 2 0 0 0-2.8 0L8 17"/></svg>`,
		video: `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>`,
		code: `<svg ${common}><path d="m9 18-6-6 6-6"/><path d="m15 6 6 6-6 6"/></svg>`,
		codeblock: `<svg ${common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9-3 3 3 3"/><path d="m14 9 3 3-3 3"/></svg>`,
		upload: `<svg ${common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>`,
	};
	return icons[name] || '';
}

export function mdTool(command: string, title: string, icon: string, titleKey: string): string {
	return `<button type="button" title="${attr(title)}" aria-label="${attr(title)}" data-i18n-title="${attr(titleKey)}" data-md="${attr(command)}">${toolbarIcon(icon)}</button>`;
}

export function rejectReasonNote(reason?: string): string {
	const text = String(reason || '').trim();
	return text ? escapeHtml(text) : '<span data-i18n="me.rejectReasonEmpty">管理员未填写额外说明。</span>';
}

export function statusBadge(status?: string): string {
	const value = String(status || 'approved');
	if (value === 'draft') return '<span class="pill" data-i18n="me.postStatus.draft">草稿</span>';
	if (value === 'pending') return '<span class="pill status-pending" data-i18n="me.postStatus.pending">待审核</span>';
	if (value === 'rejected') return '<span class="pill status-rejected" data-i18n="me.postStatus.rejected">已拒绝</span>';
	return '<span class="pill status-approved" data-i18n="me.postStatus.approved">已发布</span>';
}

export function canManagePost(user: SiteUser | null | undefined, post: SitePost): boolean {
	return !!user && (user.role === 'admin' || Number(user.id) === Number(post.author_id));
}

export function postManageActions(user: SiteUser | null | undefined, post: SitePost, redirect = '/', env?: Partial<Env> | Record<string, unknown>): string {
	if (!canManagePost(user, post)) return '';
	const isAdmin = user?.role === 'admin';
	const isDraft = String(post.status || '') === 'draft';
	const postPath = publicPostPath(post.id, env);
	return `<details class="post-actions">
		<summary><span class="post-action-trigger" role="button" aria-label="Post actions">⋯</span></summary>
		<div class="post-action-menu">
			${isDraft ? `<button class="btn ghost" type="button" data-post-publish="${post.id}" data-i18n="compose.publishDraft">发布草稿</button>` : ''}
			${isAdmin && !isDraft ? `<button class="btn ghost" type="button" data-post-pin="${post.id}" data-pinned="${Number(post.is_pinned || 0)}" data-i18n="${post.is_pinned ? 'post.unpinGlobal' : 'post.pinGlobal'}">${post.is_pinned ? '取消全局置顶' : '全局置顶'}</button>` : ''}
			${isAdmin && !isDraft ? `<button class="btn ghost" type="button" data-post-category-pin="${post.id}" data-pinned="${Number(post.is_category_pinned || 0)}" data-i18n="${post.is_category_pinned ? 'post.unpinCategory' : 'post.pinCategory'}">${post.is_category_pinned ? '取消分类置顶' : '分类置顶'}</button>` : ''}
			<a class="btn ghost" href="${postPath}/edit" data-i18n="post.edit">编辑</a>
			<button class="btn ghost danger" type="button" data-post-delete="${post.id}" data-admin="${isAdmin ? 1 : 0}" data-redirect="${attr(redirect)}" data-i18n="post.delete">删除</button>
		</div>
	</details>`;
}

export function postPinBadges(post: SitePost): string {
	const badges: string[] = [];
	if (post.is_pinned) badges.push('<span class="pill pin-badge global" data-i18n="post.globalPinned">全局置顶</span>');
	if (post.is_category_pinned) badges.push('<span class="pill pin-badge category" data-i18n="post.categoryPinned">分类置顶</span>');
	return badges.join('');
}

export function canViewPostContent(user: SiteUser | null | undefined, post: SitePost): boolean {
	const required = Math.max(0, Number(post.min_view_level || 0));
	if (required <= 0) return true;
	if (!user) return false;
	if (Number(user.id) === Number(post.author_id)) return true;
	if (user.role === 'admin') return true;
	return Number(user.level || 0) >= required;
}

export function postRow(post: SitePost, _featured = false, user?: SiteUser | null, env?: Partial<Env> | Record<string, unknown>): string {
	const author = {
		id: post.author_id,
		author_id: post.author_id,
		avatar_url: post.author_avatar,
		username: post.author_name || 'User',
		role: post.author_role,
		points: post.author_points,
		experience: post.author_experience,
		level: post.author_level,
	};
	const canView = canViewPostContent(user, post);
	const hasMedia = canView && extractMedia(post.content).length > 0;
	const minViewLevel = Math.max(0, Number(post.min_view_level || 0));
	const excerpt = canView ? stripMarkdown(post.content).slice(0, 220) : '';
	const postPath = publicPostPath(post.id, env);
	return `<article class="post-row ${hasMedia ? 'has-media' : 'no-media'}">
		<div class="post-main">
			<div class="compact-item-head"><a class="post-title" href="${postPath}">${postPinBadges(post)}<span>${escapeHtml(post.title)}</span></a>${postManageActions(user, post, '/', env)}</div>
			<div class="meta">${profileAvatar(author, post.author_name || 'U', env)}<strong>${escapeHtml(post.author_name || 'User')}</strong><span>·</span><span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.created_at))}</span><span>·</span><span>${readingMinutes(post.content)} <span data-i18n="post.minRead">分钟阅读</span></span>${postTags(post)}</div>
			${canView ? `<p class="post-excerpt">${escapeHtml(excerpt)}</p>` : `<p class="post-excerpt locked-excerpt"><span data-i18n="post.viewLevelLocked">查看等级不足</span> · <span data-i18n="post.needLevel">需要等级</span> ${minViewLevel}</p>`}
			<div class="stats stats-start">${statNode('like', Number(post.like_count || 0), ` data-like-static="${post.id}"`, !!post.liked)}${statNode('comment', Number(post.comment_count || 0))}${statNode('view', Number(post.view_count || 0))}</div>
		</div>
		${hasMedia ? `<div class="post-side">${postMedia(post)}</div>` : ''}
	</article>`;
}


export function renderComments(comments: SiteComment[], parentId: number | null = null, depth = 0, user?: SiteUser | null, env?: Partial<Env> | Record<string, unknown>): string {
	return comments
		.filter((comment) => Number(comment.parent_id || 0) === Number(parentId || 0))
		.map((comment) => {
			const children = renderComments(comments, Number(comment.id), depth + 1, user, env);
			const canDelete = !!user && (user.role === 'admin' || Number(user.id) === Number(comment.author_id));
			return `<div class="comment ${depth ? 'child' : ''}" id="comment-${comment.id}">
				<div class="comment-top">${profileAvatar({ id: comment.author_id, author_id: comment.author_id, avatar_url: comment.avatar_url, username: comment.username, role: comment.role, points: comment.points, experience: comment.experience, level: comment.level }, comment.username || 'U', env)}<strong>${escapeHtml(comment.username || 'User')}</strong><span>${escapeHtml(dateText(comment.created_at))}</span><div class="comment-actions"><button class="btn ghost btn-compact" type="button" data-reply="${comment.id}" data-i18n="comment.reply">回复</button>${canDelete ? `<button class="btn ghost danger btn-compact" type="button" data-comment-delete="${comment.id}" data-admin="${user?.role === 'admin' ? 1 : 0}" data-i18n="post.delete">删除</button>` : ''}</div></div>
				<div class="comment-body">${escapeHtml(comment.content)}</div>
			</div>${children}`;
		})
		.join('');
}

