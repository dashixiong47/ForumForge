import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderMyContentPage(options: {
	user: SiteUser;
	env?: Partial<Env> | Record<string, unknown>;
	brand?: SiteBrand;
	categories: SiteCategory[];
	posts: SitePost[];
	drafts?: SitePost[];
	comments: SiteComment[];
	progressLogs: SiteProgressLog[];
	notifications?: SiteNotification[];
	activeTab?: 'posts' | 'drafts' | 'replies' | 'level' | 'notifications';
	pagination?: {
		posts?: PageState;
		drafts?: PageState;
		replies?: PageState;
		level?: PageState;
		notifications?: PageState;
	};
	levelSettings?: LevelSettings;
}): string {
	const activeTab = options.activeTab || 'posts';
	const points = Number(options.user.points || 0);
	const xp = Number(options.user.experience || 0);
	const level = Number(options.user.level || 1);
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const posts = options.posts.map((post) => `<article class="compact-item">
		<div class="compact-item-head"><a class="compact-item-title" href="${publicPostPath(post.id, options.env)}">${escapeHtml(post.title)}</a>${postManageActions(options.user, post, '/me', options.env)}</div>
		<div class="meta">${statusBadge(post.status)}<span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.created_at))}</span><span>·</span>${statNode('comment', Number(post.comment_count || 0))}<span>·</span>${statNode('view', Number(post.view_count || 0))}</div>
		<p class="post-excerpt no-margin">${escapeHtml(stripMarkdown(post.content).slice(0, 160))}</p>
		${String(post.status || '') === 'rejected' ? `<div class="status-note rejected"><strong data-i18n="me.rejectReason">拒绝理由</strong><span>${rejectReasonNote(post.rejection_reason)}</span><a class="btn" href="${publicPostPath(post.id, options.env)}/edit" data-i18n="me.editAndResubmit">修改后重新提交</a></div>` : ''}
	</article>`).join('') || '<div class="panel-body muted" data-i18n="me.emptyPosts">你还没有发布帖子。</div>';
	const drafts = (options.drafts || []).map((post) => `<article class="compact-item">
		<div class="compact-item-head"><a class="compact-item-title" href="${publicPostPath(post.id, options.env)}/edit">${escapeHtml(post.title)}</a>${postManageActions(options.user, post, '/me?tab=drafts', options.env)}</div>
		<div class="meta">${statusBadge('draft')}<span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.created_at))}</span></div>
		<p class="post-excerpt no-margin">${escapeHtml(stripMarkdown(post.content || '').slice(0, 160) || i18nText('me.emptyDraftContent', '草稿还没有正文。'))}</p>
	</article>`).join('') || '<div class="panel-body muted" data-i18n="me.emptyDrafts">暂无草稿。</div>';
	const comments = options.comments.map((comment) => `<article class="compact-item">
		<div class="compact-item-head"><a class="compact-item-title" href="${publicPostPath(comment.post_id, options.env)}">${comment.post_title ? escapeHtml(comment.post_title) : i18nText('me.viewPost', '查看帖子')}</a><button class="btn ghost danger" type="button" data-comment-delete="${comment.id}" data-admin="0" data-i18n="post.delete">删除</button></div>
		<div class="meta">${statusBadge(comment.status)}<span>${escapeHtml(dateText(comment.created_at))}</span></div>
		<div class="comment-body">${escapeHtml(comment.content)}</div>
		${String(comment.status || '') === 'rejected' ? `<div class="status-note rejected"><strong data-i18n="me.rejectReason">拒绝理由</strong><span>${rejectReasonNote(comment.rejection_reason)}</span></div>` : ''}
	</article>`).join('') || '<div class="panel-body muted" data-i18n="me.emptyComments">你还没有发表评论。</div>';
	const notifications = (options.notifications || []).map((item) => {
		const targetUrl = item.target_url || (item.post_id ? `${publicPostPath(item.post_id, options.env)}${item.comment_id ? `#comment-${item.comment_id}` : ''}` : '');
		return `<article id="notification-${item.id}" class="compact-item notif-row ${Number(item.is_read || 0) ? '' : 'unread'}">
			<div class="compact-item-head"><a class="compact-item-title" href="${attr(item.url || `/me?tab=notifications#notification-${item.id}`)}">${escapeHtml(item.title)}</a><span class="pill">${escapeHtml(dateText(item.created_at))}</span></div>
			<p class="post-excerpt no-margin">${escapeHtml(item.body || '')}</p>
			${targetUrl ? `<div class="toolbar toolbar-end"><a class="btn ghost btn-compact" href="${attr(targetUrl)}" data-i18n="notifications.viewTarget">查看关联内容</a></div>` : ''}
		</article>`;
	}).join('') || '<div class="panel-body muted" data-i18n="notifications.empty">暂无消息</div>';
	const sourceMeta = (source: string) => {
		if (source === 'checkin') return { key: 'me.progressSource.checkin', text: '签到' };
		if (source === 'create_post') return { key: 'me.progressSource.createPost', text: '发帖' };
		if (source === 'reply_post') return { key: 'me.progressSource.replyPost', text: '回复帖子' };
		if (source === 'post_replied') return { key: 'me.progressSource.postReplied', text: '被回复帖子' };
		return { key: '', text: source };
	};
	const progressRows = options.progressLogs.map((log) => {
		const source = sourceMeta(log.source);
		const pointsDelta = Number(log.points_delta || 0);
		const xpDelta = Number(log.experience_delta || 0);
		const sourceLabel = source.key ? `<strong data-i18n="${source.key}">${source.text}</strong>` : `<strong>${escapeHtml(source.text)}</strong>`;
		const target = log.post_id && log.post_title
			? `<a href="${publicPostPath(log.post_id, options.env)}" class="muted">${escapeHtml(log.post_title)}</a>`
			: `<span class="muted" data-i18n="me.progressNoTarget">无关联帖子</span>`;
		return `<article class="progress-row">
			<div>${sourceLabel}</div>
			<div class="progress-delta">${pointsDelta >= 0 ? '+' : ''}${pointsDelta}</div>
			<div class="progress-delta">${xpDelta >= 0 ? '+' : ''}${xpDelta}</div>
			<div class="progress-target">${target}</div>
			<time class="progress-time muted">${escapeHtml(dateText(log.created_at))}</time>
		</article>`;
	}).join('');
	const progressLogs = progressRows
		? `<article class="progress-row is-head">
			<div data-i18n="me.progressSource">来源</div>
			<div data-i18n="me.progressPoints">积分变化</div>
			<div data-i18n="me.progressExperience">经验变化</div>
			<div data-i18n="me.progressTarget">关联帖子</div>
			<div data-i18n="me.progressTime">时间</div>
		</article>${progressRows}`
		: '<div class="muted" data-i18n="me.progressEmpty">还没有积分或经验记录。</div>';
	const totalPosts = Number(options.pagination?.posts?.total || options.posts.length || 0);
	const totalDrafts = Number(options.pagination?.drafts?.total || (options.drafts || []).length || 0);
	const totalReplies = Number(options.pagination?.replies?.total || options.comments.length || 0);
	const totalNotifications = Number(options.pagination?.notifications?.total || (options.notifications || []).length || 0);
	return renderSiteLayout({
		title: '我的内容',
		user: options.user,
		brand: options.brand,
		categories: options.categories,
		wide: true,
		fixed: true,
		body: `<div class="me-page me-dashboard">
			<aside class="settings-profile-panel me-profile-panel panel">
				<div class="settings-avatar-card">
					${avatar(options.user, options.user.username)}
				</div>
				<div class="settings-profile-title">
					<div class="hero-kicker" data-i18n="settings.account">账号</div>
					<h1>${escapeHtml(options.user.username)}</h1>
					<p>${escapeHtml(options.user.email || '')}</p>
				</div>
				<div class="daily-stats">
					<div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div>
					<div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div>
					<div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div>
				</div>
				<div class="hero-badges ff-user-badge-slot" data-user-id="${options.user.id}"></div>
				${levelBar(progress)}
				<section class="settings-status">
					<div><span data-i18n="me.posts">我的帖子</span><strong>${totalPosts}</strong></div>
					<div><span data-i18n="me.drafts">草稿</span><strong>${totalDrafts}</strong></div>
					<div><span data-i18n="me.comments">我的回复</span><strong>${totalReplies}</strong></div>
					<div><span data-i18n="me.notifications">消息通知</span><strong>${totalNotifications}</strong></div>
				</section>
			</aside>
			<main class="me-main">
				<section class="panel me-tabs" data-tabs>
					<div class="me-tab-nav">
						<button type="button" class="${activeTab === 'posts' ? 'active' : ''}" data-tab-target="posts" data-i18n="me.posts">我的帖子</button>
						<button type="button" class="${activeTab === 'drafts' ? 'active' : ''}" data-tab-target="drafts" data-i18n="me.drafts">草稿</button>
						<button type="button" class="${activeTab === 'replies' ? 'active' : ''}" data-tab-target="replies" data-i18n="me.comments">我的回复</button>
						<button type="button" class="${activeTab === 'notifications' ? 'active' : ''}" data-tab-target="notifications" data-i18n="me.notifications">消息通知</button>
						<button type="button" class="${activeTab === 'level' ? 'active' : ''}" data-tab-target="level" data-i18n="me.level">成长中心</button>
					</div>
					<div class="me-tab-body">
						<div class="me-tab-panel compact-list" data-tab-panel="posts" ${activeTab === 'posts' ? '' : 'hidden'}><div class="me-scroll-list">${posts}</div>${tabPager('posts', options.pagination?.posts)}</div>
						<div class="me-tab-panel compact-list" data-tab-panel="drafts" ${activeTab === 'drafts' ? '' : 'hidden'}><div class="me-scroll-list">${drafts}</div>${tabPager('drafts', options.pagination?.drafts)}</div>
						<div class="me-tab-panel compact-list" data-tab-panel="replies" ${activeTab === 'replies' ? '' : 'hidden'}><div class="me-scroll-list">${comments}</div>${tabPager('replies', options.pagination?.replies)}</div>
						<div class="me-tab-panel compact-list" data-tab-panel="notifications" ${activeTab === 'notifications' ? '' : 'hidden'}><div class="me-scroll-list">${notifications}</div>${tabPager('notifications', options.pagination?.notifications)}</div>
						<div class="me-tab-panel me-level-tab" data-tab-panel="level" ${activeTab === 'level' ? '' : 'hidden'}><div class="me-level-content">
							<section class="me-level-panel">
								<div><span class="muted" data-i18n="index.side.level">等级</span><strong>${level}</strong></div>
								<div><span class="muted" data-i18n="index.side.points">积分</span><strong>${points}</strong></div>
								<div><span class="muted" data-i18n="index.side.experience">经验</span><strong>${xp}</strong></div>
							</section>
							${levelBar(progress)}
							<div class="muted">${xp} / ${nextXp} XP</div>
							<section class="progress-log">
								<div class="compact-item-head"><h3 data-i18n="me.progressLog">成长记录</h3></div>
								<div class="progress-log-list">${progressLogs}</div>
							</section>
							</div>${tabPager('level', options.pagination?.level)}
						</div>
					</div>
				</section>
			</main>
		</div>`,
	});
}


