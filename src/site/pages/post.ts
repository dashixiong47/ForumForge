import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderPostPage(options: {
	user?: SiteUser | null;
	env?: Partial<Env> | Record<string, unknown>;
	brand?: SiteBrand;
	categories: SiteCategory[];
	post: SitePost;
	comments: SiteComment[];
	videoEmbedDomains?: string[];
}): string {
	const post = options.post;
	const userLevel = Number(options.user?.level || 0);
	const isPrivileged = options.user?.role === 'admin' || Number(options.user?.id || 0) === Number(post.author_id || 0);
	const minViewLevel = Math.max(0, Number(post.min_view_level || 0));
	const minCommentLevel = Math.max(0, Number(post.min_comment_level || 0));
	const canView = isPrivileged || userLevel >= minViewLevel;
	const canComment = isPrivileged || userLevel >= minCommentLevel;
	const form = !options.user
		? `<div class="comment-form"><a class="btn primary" href="/login" data-i18n="comment.loginToReply">登录后评论</a></div>`
		: canComment
			? `<form class="comment-form" data-action="comment"><input type="hidden" name="post_id" value="${post.id}"><input type="hidden" name="parent_id" value=""><div class="field comment-field"><textarea name="content" data-i18n-placeholder="comment.placeholder" placeholder="写下你的评论..."></textarea></div><div class="turnstile-box" data-turnstile hidden></div><div class="toolbar toolbar-end"><button class="btn primary" type="submit" data-i18n="comment.submit">发布评论</button></div><div class="message" data-message></div></form>`
			: `<div class="comment-form"><div class="access-note"><strong data-i18n="post.commentLevelLocked">评论等级不足</strong><span><span data-i18n="post.needLevel">需要等级</span> ${minCommentLevel} · <span data-i18n="post.currentLevel">当前等级</span> ${userLevel}</span></div></div>`;
	const articleBody = canView
		? renderPostArticleHtml(post.content, { videoEmbedDomains: options.videoEmbedDomains })
		: `<div class="access-note locked"><strong data-i18n="post.viewLevelLocked">查看等级不足</strong><span><span data-i18n="post.needLevel">需要等级</span> ${minViewLevel} · <span data-i18n="post.currentLevel">当前等级</span> ${userLevel}</span></div>`;
	const commentsBody = canView ? renderComments(options.comments, null, 0, options.user, options.env) : '<div class="muted" data-i18n="post.commentsHidden">达到查看等级后可查看评论。</div>';
	return renderSiteLayout({
		title: post.title,
		user: options.user,
		brand: options.brand,
		categories: options.categories,
		wide: true,
		fixed: true,
		videoEmbedDomains: options.videoEmbedDomains,
		body: `<div class="detail-grid">
			<article class="detail-panel">
				<header class="detail-head"><div>${profileAvatar({ id: post.author_id, author_id: post.author_id, avatar_url: post.author_avatar, username: post.author_name, role: post.author_role, points: post.author_points, experience: post.author_experience, level: post.author_level }, post.author_name || 'U', options.env)}</div><div><h1>${escapeHtml(post.title)}</h1><div class="meta"><strong>${escapeHtml(post.author_name || 'User')}</strong><span>·</span><span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.published_at || post.created_at))}</span>${postTags(post)}</div></div><div class="detail-actions">${likeButton(post)}<span class="btn stat stat-view">${statIcon('view')}<span>${Number(post.view_count || 0)}</span></span>${postManageActions(options.user, post, '/', options.env)}</div></header>
				${articleBody}
			</article>
			<section class="detail-panel comments"><header class="detail-head"><h1 data-i18n="comment.title">评论</h1><span class="pill">${canView ? options.comments.length : 0} <span data-i18n="comment.countSuffix">条</span></span></header>${canView ? form : ''}<div class="comment-list">${commentsBody || '<div class="muted" data-i18n="comment.empty">暂无评论</div>'}</div></section>
		</div>`,
	});
}

