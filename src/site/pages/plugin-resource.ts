import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { appScript, SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderPluginResourcePage(options: {
	user?: SiteUser | null;
	brand?: SiteBrand;
	categories: SiteCategory[];
	type: string;
	id: string;
	title: string;
	height?: number;
}): string {
	const type = String(options.type || '').trim().toLowerCase();
	const id = String(options.id || '').trim();
	const height = Math.max(320, Math.min(2400, Number(options.height || 0) || 980));
	const title = options.title || type || 'Resource';
	const brand = siteBrand(options.brand);
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - ${escapeHtml(brand.siteName)}</title>
${faviconLinks(options.brand)}
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#0f1624;--border:#263244;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}html,body{height:100%;margin:0}body{font-family:var(--font);font-size:14px;color:var(--text);background:#0d1117;overflow:hidden}a{color:inherit;text-decoration:none}button{font:inherit;color:inherit}.resource-shell{height:100vh;display:grid;grid-template-rows:58px minmax(0,1fr);background:#0d1117}.resource-top{display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid rgba(96,120,150,.22);background:rgba(13,19,32,.96)}.brand{display:flex;align-items:center;gap:9px;font-weight:900;min-width:0}.brand span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.brand-mark{width:24px;height:24px;border:1px solid rgba(88,166,255,.42);border-radius:7px;display:grid;place-items:center;color:#9ecbff;background:rgba(88,166,255,.09);font-size:12px;overflow:hidden;flex:0 0 auto}.brand-mark img{width:100%;height:100%;object-fit:cover;display:block}.spacer{flex:1}.lang-picker{position:relative}.lang-btn{height:34px;border:1px solid var(--border);border-radius:999px;background:#101827;color:var(--text);padding:0 11px;display:flex;align-items:center;gap:7px;font-weight:800;cursor:pointer}.lang-flag{display:inline-grid;place-items:center;width:22px;height:22px;font-size:15px;line-height:1}.lang-flag svg{width:20px;height:14px;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}.lang-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid var(--border);border-radius:12px;background:#111827;box-shadow:0 24px 70px rgba(0,0,0,.5);display:none;z-index:20}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:8px;cursor:pointer}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.11);color:#9ecbff}.lang-menu small{color:var(--muted)}.resource-main{min-height:0;overflow:hidden}.plugin-resource-viewer{height:100%;min-height:0;display:grid;background:#262626}.plugin-resource-stage{min-height:0;display:grid;background:#262626;overflow:hidden}.plugin-resource-stage .ff-bp-placeholder,.plugin-resource-stage .ff-bp,.plugin-resource-stage .ff-bp-canvas,.plugin-resource-stage ueb-blueprint{width:100%;height:100%!important;min-height:100%!important}.plugin-resource-stage .ff-bp{margin:0;border:0;border-radius:0}.plugin-resource-stage .ff-bp-canvas{height:calc(100vh - 58px)!important;--ueb-height:calc(100vh - 58px)!important}.plugin-resource-stage ueb-blueprint{--ueb-height:calc(100vh - 58px)!important}.plugin-resource-stage ueb-blueprint .ueb-viewport-header,.plugin-resource-stage ueb-blueprint .ueb-viewport-type{display:none!important}.plugin-resource-stage ueb-blueprint .ueb-viewport-body{height:calc(100vh - 58px)!important;min-height:calc(100vh - 58px)!important}.plugin-resource-stage ueb-blueprint .ueb-grid{min-height:calc(100vh - 58px)!important}.plugin-resource-stage .ff-bp-head{display:none!important}
</style>
</head>
<body>
<div class="resource-shell">
	<header class="resource-top">
		<a class="brand" href="/">${brandMark(options.brand)}<span>${escapeHtml(brand.siteName)}</span></a>
		<div class="spacer"></div>
		<div class="lang-picker" data-language-picker>
			<button class="lang-btn" type="button" data-language-button><span class="lang-flag" data-language-flag>🇨🇳</span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button>
			<ul class="lang-menu" data-language-menu></ul>
		</div>
	</header>
	<main class="resource-main">
		<div class="plugin-resource-viewer" data-resource-viewer="${attr(type)}">
			<div class="plugin-resource-stage">
				<div class="ff-bp-placeholder" data-blueprint-id="${attr(id)}" data-blueprint-title="${attr(title)}" data-blueprint-height="${height}">
					<div class="ff-bp-link">${escapeHtml(title)}</div>
				</div>
			</div>
		</div>
	</main>
</div>
<script>${appScript()}if(window.ForumForge&&ForumForge.loadEnabledPlugins){ForumForge.loadEnabledPlugins().then(function(){if(window.FFBlueprintRenderer)FFBlueprintRenderer.hydrate(document);});}</script>
</body>
</html>`;
}


