import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderHomePage(options: {
	user?: SiteUser | null;
	env?: Partial<Env> | Record<string, unknown>;
	brand?: SiteBrand;
	categories: SiteCategory[];
	allCategory?: SiteCategory;
	posts: SitePost[];
	total: number;
	page: number;
	pageSize: number;
	activeCategory?: string;
	q?: string;
	sortBy?: string;
	levelSettings?: LevelSettings;
}): string {
	const rows = options.posts.map((post) => postRow(post, false, options.user, options.env)).join('') || '<div class="panel-body muted" data-i18n="index.empty.posts">暂无帖子</div>';
	const lastPage = Math.max(1, Math.ceil(options.total / options.pageSize));
	const sortBy = ['comments', 'views'].includes(String(options.sortBy || '')) ? String(options.sortBy) : 'time';
	const queryBase = `${options.activeCategory ? `category_id=${encodeURIComponent(options.activeCategory)}&` : ''}${options.q ? `q=${encodeURIComponent(options.q)}&` : ''}`;
	const sortLink = (value: string) => `/?${queryBase}sort_by=${value}`;
	const activeCategory = options.categories.find((cat) => String(cat.id) === String(options.activeCategory || ''));
	const heroCategory = activeCategory || (!options.activeCategory ? options.allCategory : undefined);
	const customHeroTitle = heroCategory ? (heroCategory.hero_title || heroCategory.name || '') : '';
	const customHeroDesc = heroCategory ? (heroCategory.hero_description || heroCategory.description || '') : '';
	const heroTitle = escapeHtml(customHeroTitle || '高密度图文讨论流');
	const heroDesc = escapeHtml(customHeroDesc || '快速扫读图文、视频和长文讨论。');
	const today = new Date().toISOString().slice(0, 10);
	const points = Number(options.user?.points || 0);
	const xp = Number(options.user?.experience || 0);
	const level = Number(options.user?.level || 1);
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const checkedIn = !!options.user && options.user.last_checkin_date === today;
	const dailyCard = options.user
		? `<div class="side-card daily-card"><h3 data-i18n="index.side.dailyCheckin">每日签到</h3><p class="daily-desc" data-i18n="index.side.dailyDesc">签到获取积分和经验。</p><div class="daily-stats"><div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div><div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div><div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div></div>${levelBar(progress)}<button class="btn primary" type="button" data-checkin ${checkedIn ? 'disabled' : ''} data-i18n="${checkedIn ? 'index.side.checkedIn' : 'index.side.checkinAction'}">${checkedIn ? '今日已签到' : '签到'}</button></div>`
		: `<div class="side-card daily-card"><h3 data-i18n="index.side.dailyCheckin">每日签到</h3><p class="daily-desc" data-i18n="index.side.dailyDesc">签到获取积分和经验。</p><a class="btn primary" href="/login" data-i18n="index.side.loginToCheckin">登录后签到</a></div>`;
	const topPosts = options.posts.slice(0, 5).map((post) => `<a href="${publicPostPath(post.id, options.env)}"><span>${escapeHtml(post.title)}</span><small>${Number(post.view_count || 0)}</small></a>`).join('') || '<span class="muted" data-i18n="index.empty.trends">暂无趋势</span>';
	return renderSiteLayout({
		title: '最新帖子',
		user: options.user,
		brand: options.brand,
		categories: options.categories,
		allCategory: options.allCategory,
		activeCategory: options.activeCategory,
		fixed: true,
		body: `<div class="home-board"><section class="feed-hero">
			<div class="hero-copy">
				<div class="hero-kicker" data-i18n="index.hero.kicker">ForumForge</div>
				<h1>${heroTitle}</h1>
				<p>${heroDesc}</p>
			</div>
			<div class="hero-stats"><div class="hero-stat"><strong>${options.total}</strong><span data-i18n="index.hero.posts">帖子</span></div><div class="hero-stat"><strong>${options.categories.length}</strong><span data-i18n="index.hero.categories">分类</span></div><div class="hero-stat"><strong>${options.posts.reduce((sum, post) => sum + Number(post.comment_count || 0), 0)}</strong><span data-i18n="index.hero.pageComments">本页评论</span></div></div>
		</section>
		<div class="feed-controls"><div><h1 class="feed-title" data-i18n="index.title">最新帖子</h1><div class="muted" data-i18n="index.feed.subtitle">重点内容突出，普通帖子保持紧凑。</div></div><div class="seg"><a class="btn ${sortBy === 'time' ? 'active' : ''}" href="${sortLink('time')}" data-i18n="index.sort.latest">最新</a><a class="btn ${sortBy === 'comments' ? 'active' : ''}" href="${sortLink('comments')}" data-i18n="index.sort.comments">评论</a><a class="btn ${sortBy === 'views' ? 'active' : ''}" href="${sortLink('views')}" data-i18n="index.sort.views">浏览</a></div></div>
		<div class="feed-shell">
			<section class="feed-main"><div class="post-list">${rows}</div><div class="pagination"><a class="btn ${options.page <= 1 ? 'muted' : ''}" href="/?page=${Math.max(1, options.page - 1)}" data-i18n="pagination.previous">上一页</a><span class="muted">${options.page} / ${lastPage} <span data-i18n="pagination.page">页</span>，<span data-i18n="pagination.total">共</span> ${options.total} <span data-i18n="index.hero.posts">帖子</span></span><a class="btn ${options.page >= lastPage ? 'muted' : ''}" href="/?page=${Math.min(lastPage, options.page + 1)}" data-i18n="pagination.next">下一页</a></div></section>
			<aside class="feed-aside">${dailyCard}<div class="side-card"><h3 data-i18n="index.side.trends">本页趋势</h3><div class="topic-list">${topPosts}</div></div></aside>
		</div></div>`,
	});
}


