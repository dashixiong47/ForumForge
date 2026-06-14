import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderSettingsPageSite(options: { user: SiteUser; categories: SiteCategory[]; brand?: SiteBrand; levelSettings?: LevelSettings }): string {
	const user = options.user;
	const points = Number(user.points || 0);
	const xp = Number(user.experience || 0);
	const level = Number(user.level || 1);
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const emailVerified = Number(user.verified || 0) === 1;
	const realEmail = hasRealEmail(user);
	const canBindEmail = !realEmail && Number(user.oauth_count || 0) > 0;
	const emailPanel = canBindEmail
		? `<section class="panel settings-section email-section"><h2 data-i18n="settings.emailBinding">绑定邮箱</h2><div class="panel-body">
						<div class="email-bind-card">
							<div class="email-flow">
								<label class="email-label" for="new_email_input" data-i18n="settings.newEmail">新邮箱</label>
								<div class="email-input-line">
									<input id="new_email_input" type="email" placeholder="name@example.com" maxlength="254" autocomplete="email">
									<button class="btn" type="button" data-action="send-email-code" data-i18n="settings.sendCode">发送验证码</button>
								</div>
								<p class="muted no-margin" data-i18n="settings.oauthBindEmailHint">第三方登录账号可以绑定一次邮箱，绑定后可用邮箱和密码登录。</p>
							</div>
							<div id="email-code-step" class="email-code-step" hidden>
								<div class="email-note"><span class="email-note-dot"></span><span data-i18n="settings.emailCodeHint">验证码已发送至新邮箱，10 分钟内有效。</span></div>
								<div class="email-verify-line">
									<input id="email-code-input" type="text" inputmode="numeric" maxlength="6" placeholder="______" autocomplete="one-time-code" class="email-code-input">
									<button class="btn primary" type="button" data-action="verify-email-code" data-i18n="settings.verifyAndBind">验证并绑定</button>
									<button id="resend-code-btn" class="btn" type="button" data-action="send-email-code" data-i18n="settings.resendCode">重新发送</button>
								</div>
							</div>
						</div>
					</div></section>`
		: `<section class="panel settings-section email-section"><h2 data-i18n="settings.emailBinding">邮箱账号</h2><div class="panel-body">
						<div class="email-bind-card is-locked">
							<div class="email-current"><span class="label muted" data-i18n="settings.currentEmail">当前邮箱</span><span class="current-email-value">${realEmail ? escapeHtml(user.email) : '<span data-i18n="settings.noEmailBound">未绑定邮箱</span>'}</span>${emailVerified ? '<span class="badge badge-ok" data-i18n="settings.verified">已验证</span>' : '<span class="badge badge-warn" data-i18n="settings.unverified">未验证</span>'}</div>
							<p class="muted no-margin" data-i18n="settings.emailLockedHint">邮箱用于登录身份，绑定后不能在个人设置中更换。</p>
						</div>
					</div></section>`;
	return renderSiteLayout({
		title: '个人设置',
		user,
		brand: options.brand,
		categories: options.categories,
		fixed: true,
		body: `<div class="settings-view">
			<aside class="settings-profile-panel panel">
				<div class="settings-avatar-card">
					${avatar(user, user.username)}
					<label class="btn ghost" for="avatar-upload" data-i18n="settings.replaceAvatar">替换头像</label>
					<input id="avatar-upload" type="file" accept="image/*" data-upload data-type="avatar" data-target="input[name=avatar_url]" hidden>
					<input name="avatar_url" value="${attr(user.avatar_url || '')}" type="hidden">
				</div>
				<div class="settings-profile-title">
					<div class="hero-kicker" data-i18n="settings.account">账号</div>
					<h1>${escapeHtml(user.username)}</h1>
					<p>${realEmail ? escapeHtml(user.email) : '<span data-i18n="settings.noEmailBound">未绑定邮箱</span>'}</p>
				</div>
				<div class="daily-stats">
					<div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div>
					<div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div>
					<div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div>
				</div>
				<div class="hero-badges ff-user-badge-slot" data-user-id="${user.id}"></div>
				${levelBar(progress)}
				<section class="settings-status">
					<div><span data-i18n="settings.role">角色</span><strong>${roleLabel(user.role)}</strong></div>
					<div><span data-i18n="settings.emailVerified">邮箱验证</span><strong data-i18n="${emailVerified ? 'common.verified' : 'common.unverified'}">${emailVerified ? '已验证' : '未验证'}</strong></div>
					<div><span data-i18n="settings.notifications">通知</span><strong data-i18n="${user.email_notifications === 0 ? 'common.off' : 'common.on'}">${user.email_notifications === 0 ? '关闭' : '开启'}</strong></div>
					${emailVerified ? '' : '<button class="btn" type="button" data-resend-verification data-i18n="settings.resendVerification">重新发送验证邮件</button>'}
				</section>
				<nav class="settings-links">
					<a class="btn" href="/me" data-i18n="me.title">我的内容</a>
					<a class="btn" href="/new-post" data-i18n="index.newPost">发布新帖</a>
					${user.role === 'admin' ? '<a class="btn" href="/admin" data-i18n="nav.adminPanel">管理后台</a>' : ''}
				</nav>
			</aside>
			<main class="settings-main">
				<div class="settings-section-grid">
					<form class="panel settings-section" data-action="settings"><div class="settings-card-head"><h2 data-i18n="settings.publicProfile">公开资料</h2><button class="btn primary" type="submit" data-i18n="common.save">保存</button></div><div class="panel-body">
						<div class="settings-form-grid">
							<div>
								<div class="field setting-field-narrow"><label data-i18n="auth.username">用户名</label><input name="username" value="${attr(user.username)}" required maxlength="20" data-count-target="#settings-username-count"></div>
								<div class="field-foot setting-field-narrow"><span data-i18n="settings.usernameLimit">最多 20 个字符</span><span><span id="settings-username-count">${escapeHtml(String(user.username || '').length)}</span>/20</span></div>
							</div>
						</div>
					</div></form>
					<form class="panel settings-section" data-action="settings"><div class="settings-card-head"><h2 data-i18n="settings.preferences">偏好设置</h2><button class="btn primary" type="submit" data-i18n="common.save">保存</button></div><div class="panel-body">
						<div class="settings-option-list">
							<label class="settings-toggle"><input name="email_notifications" type="checkbox" ${user.email_notifications === 0 ? '' : 'checked'}><span data-i18n="settings.emailNotifications">接收邮件通知</span></label>
							<p class="muted" data-i18n="settings.emailHint">仅用于评论、账号安全和管理员通知。</p>
							<label class="settings-toggle"><input name="show_public_posts" type="checkbox" ${user.show_public_posts === 0 ? '' : 'checked'}><span data-i18n="settings.showPublicPosts">公开展示我的帖子</span></label>
							<p class="muted" data-i18n="settings.showPublicPostsHint">关闭后，其他用户只能看到你的个人介绍和等级信息。</p>
						</div>
					</div></form>
					${emailPanel}
					<div id="ff-plugin-settings-slot" class="plugin-settings-slot"></div>
					<section class="panel settings-section password-section"><div class="settings-card-head"><h2 data-i18n="settings.localPassword">本地密码</h2><button class="btn" type="submit" form="set-password-form" data-i18n="settings.savePassword">保存密码</button></div><div class="panel-body">
						<div class="settings-form-grid password-grid">
							<div class="field"><label data-i18n="settings.oldPassword">老密码</label><input name="old_password" type="password" form="set-password-form" autocomplete="current-password" maxlength="64"></div>
							<div class="field"><label data-i18n="auth.newPassword">新密码</label><input name="password" type="password" form="set-password-form" autocomplete="new-password" minlength="8" maxlength="64"></div>
							<div class="field"><label data-i18n="settings.confirmNewPassword">再次输入新密码</label><input name="password_confirm" type="password" form="set-password-form" autocomplete="new-password" minlength="8" maxlength="64"></div>
						</div>
						<p class="muted" data-i18n="settings.passwordHint">第三方登录账号也可以设置密码，之后可用邮箱和密码登录。</p>
					</div></section>
				</div>
			</main>
		</div><form id="set-password-form" data-action="set-password"></form>`,
	});
}

