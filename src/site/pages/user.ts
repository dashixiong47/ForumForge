import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderPublicUserPage(options: {
	profile: SiteUser;
	viewer?: SiteUser | null;
	env?: Partial<Env> | Record<string, unknown>;
	brand?: SiteBrand;
	categories: SiteCategory[];
	posts: SitePost[];
	pagination?: PageState;
	showPosts: boolean;
	postCount?: number;
	commentCount?: number;
	levelSettings?: LevelSettings;
}): string {
	const profile = options.profile;
	const level = Math.max(1, Number(profile.level || 1));
	const points = Math.max(0, Number(profile.points || 0));
	const xp = Math.max(0, Number(profile.experience || 0));
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const page = options.pagination?.page || 1;
	const pageSize = options.pagination?.pageSize || 12;
	const total = options.pagination?.total || 0;
	const lastPage = Math.max(1, Math.ceil(total / pageSize));
	const postsBody = options.showPosts
		? (options.posts.map((post) => postRow(post, false, options.viewer, options.env)).join('') || '<div class="panel-body muted" data-i18n="user.noPosts">暂无公开帖子</div>')
		: '<div class="panel-body muted" data-i18n="user.postsHidden">该用户已关闭公开帖子列表。</div>';
	const pager = options.showPosts
		? `<div class="pagination"><a class="btn ${page <= 1 ? 'muted' : ''}" href="${publicUserPath(profile.id, options.env)}?page=${Math.max(1, page - 1)}" data-i18n="pagination.previous">上一页</a><span class="muted">${page} / ${lastPage} <span data-i18n="pagination.page">页</span>，<span data-i18n="pagination.total">共</span> ${total}</span><a class="btn ${page >= lastPage ? 'muted' : ''}" href="${publicUserPath(profile.id, options.env)}?page=${Math.min(lastPage, page + 1)}" data-i18n="pagination.next">下一页</a></div>`
		: '';
	return renderSiteLayout({
		title: profile.username,
		user: options.viewer,
		brand: options.brand,
		categories: options.categories,
		fixed: true,
		body: `<div class="public-profile profile-dashboard">
			<aside class="settings-profile-panel profile-side-panel panel">
				<div class="settings-avatar-card">
					${avatar(profile, profile.username)}
				</div>
				<div class="settings-profile-title">
					<div class="hero-kicker" data-i18n="user.profileTitle">玩家资料</div>
					<h1>${escapeHtml(profile.username)}</h1>
					<p>${roleLabel(profile.role)}</p>
				</div>
				<div class="daily-stats">
					<div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div>
					<div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div>
					<div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div>
				</div>
				<div class="hero-badges ff-user-badge-slot" data-user-id="${profile.id}"></div>
				${levelBar(progress)}
				<section class="settings-status">
					<div><span data-i18n="settings.role">角色</span><strong>${roleLabel(profile.role)}</strong></div>
					<div><span data-i18n="user.joined">加入时间</span><strong>${escapeHtml(dateText(profile.created_at))}</strong></div>
					<div><span data-i18n="index.hero.posts">帖子</span><strong>${Number(options.postCount || 0)}</strong></div>
					<div><span data-i18n="index.hero.pageComments">回复</span><strong>${Number(options.commentCount || 0)}</strong></div>
				</section>
			</aside>
			<main class="profile-main">
				<section class="panel public-profile-posts profile-posts-panel"><header class="profile-section-head"><h2 data-i18n="user.posts">发帖</h2>${options.showPosts ? `<span class="pill">${total}</span>` : ''}</header><div class="public-profile-list">${postsBody}</div>${pager}</section>
			</main>
		</div>`,
	});
}


