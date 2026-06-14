import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { appScript, SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderAuthPage(kind: 'login' | 'register' | 'forgot' | 'reset', token = '', oauthProviders: Array<{ id: string; label: string }> = [], brandOptions?: SiteBrand): string {
	const titleMap = { login: '登录', register: '注册', forgot: '找回密码', reset: '重置密码' } as const;
	const keyMap = { login: 'auth.login', register: 'auth.register', forgot: 'auth.forgot', reset: 'auth.reset' } as const;
	const brand = siteBrand(brandOptions);
	const oauthIcon = (id: string, label: string) => {
		if (id === 'google') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.1-2 3.2-4.8 3.2-8.3Z"/><path fill="#34a853" d="M12 23c3.1 0 5.7-1 7.5-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H1.9v2.9A11 11 0 0 0 12 23Z"/><path fill="#fbbc05" d="M5.7 13.8a6.6 6.6 0 0 1 0-3.6V7.3H1.9a11 11 0 0 0 0 9.4l3.8-2.9Z"/><path fill="#ea4335" d="M12 5.5c1.7 0 3.2.6 4.4 1.7l3.2-3.2A10.8 10.8 0 0 0 12 1 11 11 0 0 0 1.9 7.3l3.8 2.9C6.6 7.5 9.1 5.5 12 5.5Z"/></svg>';
		if (id === 'github') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.8a10.2 10.2 0 0 0-3.2 19.9c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.2-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.5.1 2.7.7.8 1 1.7 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7 1 .7 2v2.5c0 .3.2.6.8.5A10.2 10.2 0 0 0 12 1.8Z"/></svg>';
		if (id === 'epic') return '<img src="https://cdn.simpleicons.org/epicgames/ffffff" alt="" loading="lazy">';
		return `<span>${escapeHtml(label.slice(0, 1).toUpperCase())}</span>`;
	};
	const oauthButtons = (kind === 'login' || kind === 'register') && oauthProviders.length
		? `<div class="oauth-auth"><div class="oauth-divider"><span data-i18n="auth.oauthTitle">或使用第三方账号</span></div><div class="oauth-icon-row">${oauthProviders.map((provider) => `<a class="oauth-icon-btn oauth-${attr(provider.id)}" href="/oauth/${attr(provider.id)}/start" title="${attr(provider.label)}" aria-label="${attr(provider.label)}">${oauthIcon(provider.id, provider.label)}</a>`).join('')}</div></div>`
		: '';
	const fields =
		kind === 'login'
			? `<div class="field"><label data-i18n="auth.email">邮箱</label><input name="email" type="email" required></div><div class="field"><label data-i18n="auth.password">密码</label><input name="password" type="password" required></div>`
			: kind === 'register'
				? `<div class="field"><label data-i18n="auth.email">邮箱</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label data-i18n="auth.password">密码</label><input name="password" type="password" minlength="8" maxlength="16" required><small data-i18n="auth.passwordRule">8-16 个字符。</small></div><div class="field auth-verify-field"><label data-i18n="auth.verificationCode">验证码</label><div class="auth-verify-row"><input class="auth-code-input" name="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="______" required><button class="mini-btn" type="button" data-register-send-code data-i18n="auth.sendCode">发送验证码</button></div><small class="auth-verify-hint" data-i18n="auth.registerCodeHint">验证码会发送到邮箱，10 分钟内有效。</small></div>`
				: kind === 'forgot'
				? `<div class="field"><label data-i18n="auth.email">邮箱</label><input name="email" type="email" required></div>`
				: `<input type="hidden" name="token" value="${attr(token)}"><div class="field"><label data-i18n="auth.newPassword">新密码</label><input name="password" type="password" minlength="8" maxlength="64" required></div><div class="field"><label data-i18n="auth.confirmPassword">确认密码</label><input name="password_confirm" type="password" minlength="8" maxlength="64" required></div>`;
	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(titleMap[kind])} - ${escapeHtml(brand.siteName)}</title>
	${faviconLinks(brandOptions)}
	<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#0f1624;--panel2:#111b2b;--border:#263244;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--danger:#f85149;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}html,body{height:100%;margin:0}body{font-family:var(--font);font-size:14px;color:var(--text);background:radial-gradient(circle at 50% 12%,rgba(88,166,255,.12),transparent 34%),linear-gradient(180deg,#0d1117,#090d14);overflow:hidden}a{color:#9ecbff;text-decoration:none}button,input{font:inherit;color:inherit}.auth-shell{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr);padding:18px}.auth-top{display:flex;align-items:center;gap:10px}.brand{display:flex;align-items:center;gap:9px;font-weight:900;min-width:0}.brand span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.brand-mark{width:24px;height:24px;border:1px solid rgba(88,166,255,.42);border-radius:7px;display:grid;place-items:center;color:#9ecbff;background:rgba(88,166,255,.09);font-size:12px;overflow:hidden;flex:0 0 auto}.brand-mark img{width:100%;height:100%;object-fit:cover;display:block}.spacer{flex:1}.lang-picker{position:relative}.lang-btn{height:34px;border:1px solid var(--border);border-radius:999px;background:#101827;color:var(--text);padding:0 11px;display:flex;align-items:center;gap:7px;font-weight:800}.lang-btn>svg{opacity:.55}.lang-flag{display:inline-grid;place-items:center;width:22px;height:22px;font-size:15px;line-height:1}.lang-flag svg{width:20px;height:14px;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}.lang-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid var(--border);border-radius:12px;background:#111827;box-shadow:0 24px 70px rgba(0,0,0,.5);display:none}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:8px;cursor:pointer}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.11);color:#9ecbff}.lang-menu small{color:var(--muted)}.auth-main{min-height:0;display:grid;place-items:center}.auth-card{width:min(430px,calc(100vw - 36px));border:1px solid rgba(96,120,150,.28);border-radius:16px;background:linear-gradient(180deg,rgba(17,27,43,.96),rgba(11,17,29,.96));box-shadow:0 24px 80px rgba(0,0,0,.38);padding:28px}.auth-card h1{margin:0 0 22px;font-size:28px}.field{display:grid;gap:7px;margin-bottom:14px}.field label{font-weight:800;color:#d8e2f1}.field input{width:100%;height:42px;border:1px solid var(--border);border-radius:10px;background:#0b111d;padding:0 12px;outline:none}.field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.14)}.field small{color:var(--muted);line-height:1.35}.auth-verify-field{width:max-content;max-width:100%;margin-top:4px;border:1px solid rgba(88,166,255,.22);border-radius:14px;background:linear-gradient(135deg,rgba(88,166,255,.08),rgba(16,24,38,.72));padding:12px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.auth-verify-title{margin-bottom:8px}.auth-verify-title label{font-size:13px;color:#e6edf3}.auth-verify-row{display:grid;grid-template-columns:142px 122px;gap:8px;align-items:center}.auth-verify-hint{display:block;margin-top:8px;font-size:12px;max-width:272px}.mini-btn{height:40px;border:1px solid rgba(88,166,255,.44);border-radius:10px;background:rgba(88,166,255,.12);color:#cfe6ff;font-weight:900;cursor:pointer;white-space:nowrap;padding:0 12px}.mini-btn:hover{background:rgba(88,166,255,.2);border-color:rgba(88,166,255,.72)}.mini-btn:disabled{opacity:.62;cursor:not-allowed}.auth-code-input{height:40px!important;letter-spacing:.32em!important;text-align:center!important;font-weight:900!important;font-family:Consolas,"Cascadia Code",monospace!important;font-size:17px!important}.turnstile-box{display:flex;justify-content:center;margin:10px 0}.turnstile-box[hidden]{display:none!important}.btn{width:100%;height:44px;border:1px solid var(--accent);border-radius:10px;background:var(--accent);color:#fff;font-weight:900;cursor:pointer}.btn:hover{filter:brightness(1.08)}.oauth-auth{display:grid;gap:10px;margin-top:16px}.oauth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}.oauth-divider:before,.oauth-divider:after{content:"";height:1px;background:var(--border);flex:1}.oauth-icon-row{display:flex;align-items:center;justify-content:center;gap:12px}.oauth-icon-btn{width:48px;height:48px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,#101827,#0b111d);color:#dbe7f7;display:grid;place-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:.15s}.oauth-icon-btn:hover{transform:translateY(-1px);border-color:rgba(88,166,255,.58);background:rgba(88,166,255,.1);box-shadow:0 10px 28px rgba(0,0,0,.28),0 0 0 3px rgba(88,166,255,.1)}.oauth-icon-btn svg,.oauth-icon-btn img{width:22px;height:22px;display:block;object-fit:contain}.oauth-icon-btn span{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(135deg,#182235,#26344d);color:#9ecbff;font-weight:950}.message{min-height:22px;margin-top:12px;color:var(--muted)}.message.ok{color:#3fb950}.message.error{color:var(--danger)}.auth-links{margin:14px 0 0;color:var(--muted);text-align:center}.auth-links a{margin:0 7px}@media(max-width:520px){.auth-verify-field{width:100%}.auth-verify-row{grid-template-columns:1fr}.mini-btn{width:100%}.auth-verify-hint{max-width:none}}
	.auth-verify-field{width:100%;margin:4px 0 16px;border:0;background:transparent;padding:0;box-shadow:none}
	.auth-verify-field>label{display:flex;align-items:center;gap:8px;width:100%;margin-bottom:10px;font-size:13px;color:#e6edf3;font-weight:700}
	.auth-verify-field>label:before{content:"";width:8px;height:8px;flex:0 0 auto;border-radius:999px;background:linear-gradient(135deg,#58a6ff,#3fb950);box-shadow:0 0 12px rgba(88,166,255,.55)}
	.auth-verify-title{display:none}
	.auth-verify-row{display:flex;gap:10px;align-items:stretch;width:100%}
	.auth-code-input{flex:1;min-width:0;height:42px!important;font-size:20px!important;letter-spacing:.42em!important;text-align:center!important;font-weight:900!important;font-family:Consolas,"Cascadia Code",monospace!important;border:1.5px solid rgba(88,166,255,.35)!important;border-radius:10px!important;background:rgba(88,166,255,.05)!important;padding:0 8px!important}
	.auth-code-input:focus{border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(88,166,255,.16)!important;background:rgba(88,166,255,.08)!important}
	.mini-btn{flex:0 0 auto;width:108px;height:42px;border-radius:10px}
	.auth-verify-hint{display:block;width:100%;margin-top:8px;font-size:12px}
	@media(max-width:520px){.auth-verify-row{flex-direction:column}.mini-btn{width:100%;height:44px}}
	</style>
</head>
<body>
	<div class="auth-shell">
		<header class="auth-top">
			<a class="brand" href="/">${brandMark(brandOptions)}<span>${escapeHtml(brand.siteName)}</span></a>
			<div class="spacer"></div>
			<div class="lang-picker" data-language-picker>
				<button class="lang-btn" type="button" data-language-button><span class="lang-flag" data-language-flag>🇨🇳</span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button>
				<ul class="lang-menu" data-language-menu></ul>
			</div>
		</header>
		<main class="auth-main">
			<form class="auth-card" data-action="${kind}">
				<h1 data-i18n="${keyMap[kind]}">${titleMap[kind]}</h1>
				${fields}
				${kind === 'login' || kind === 'register' || kind === 'forgot' ? '<div class="turnstile-box" data-turnstile hidden></div>' : ''}
				<button class="btn" type="submit" data-i18n="${keyMap[kind]}">${titleMap[kind]}</button>
				${oauthButtons}
				<p class="auth-links"><a href="/login" data-i18n="auth.login">登录</a><a href="/register" data-i18n="auth.register">注册</a><a href="/forgot" data-i18n="auth.forgotLink">忘记密码</a></p>
			</form>
		</main>
	</div>
	<script>${appScript()}</script>
</body>
</html>`;
}


