import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

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
	${adminField('admin.settings.idCodecSecret', '编码密钥', adminPasswordInput({ id: 'id_codec_secret', autocomplete: 'new-password', value: settings.id_codec_secret || '', placeholder: '至少 16 个字符' }), 'admin.settings.idCodecSecretHint', '上线后修改会让旧编码链接失效；旧数字链接仍兼容。')}`;
	const turnstileFields = `<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.turnstileKeys">Turnstile 密钥</strong><span data-i18n="admin.settings.turnstileKeysDesc">在此配置后无需设置环境变量，留空则回退到环境变量。</span></div>
	<div class="grid cols-2">
		${adminField('admin.settings.turnstileSiteKey', 'Site Key', adminPasswordInput({ id: 'turnstile_site_key', value: settings.turnstile_site_key || '', autocomplete: 'off', placeholder: '0x4AAAAAAA...' }))}
		${adminField('admin.settings.turnstileSecretKey', 'Secret Key', adminPasswordInput({ id: 'turnstile_secret_key', value: settings.turnstile_secret_key || '', autocomplete: 'new-password', placeholder: '0x4AAAAAAA...' }))}
	</div>`;
	const pbkdf2Field = `<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.pbkdf2">密码哈希强度</strong><span data-i18n="admin.settings.pbkdf2Desc">PBKDF2 是安全的慢速哈希算法，越高越安全但登录越慢，Cloudflare Workers 上限 100000。禁用后改用 SHA-256（快速但较弱）。</span></div>
	<div class="settings-toggle-grid">${adminSwitch('pbkdf2_enabled', 'admin.settings.pbkdf2Enabled', '启用 PBKDF2 密码哈希', Boolean(settings.pbkdf2_enabled ?? true))}</div>
	${adminField('admin.settings.pbkdf2Iterations', '迭代次数', adminInput({ id: 'pbkdf2_iterations', type: 'number', min: 10000, max: 100000, step: 10000, value: settings.pbkdf2_iterations || 100000 }), 'admin.settings.pbkdf2IterationsHint', '修改后仅影响新密码，已有用户下次登录时自动升级。')}`;
	const notifyPanelWithLogs = adminPanel('admin.settings.securityNotifications', '安全与通知', 'admin.settings.securityNotificationsDesc', '控制验证、管理操作通知和访问日志保留。', `<div class="settings-toggle-grid">${rows}</div>${turnstileFields}${pbkdf2Field}${idCodecField}${logRetentionFields}`);
	const contentPanel = adminPanel('admin.settings.contentPublishing', '内容发布', 'admin.settings.contentPublishingDesc', '控制发帖编辑器和内容能力。', `<div class="settings-toggle-grid">
		${adminSwitch('posts_i18n_enabled', 'admin.settings.postsI18nEnabled', '启用多语言帖子', Boolean(settings.posts_i18n_enabled ?? true))}
	</div><p class="muted" data-i18n="admin.settings.postsI18nHint">开启后，发帖和编辑时可维护多个语言版本；管理员始终可用。</p>
	<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.postLimits">字数限制</strong><span data-i18n="admin.settings.postLimitsDesc">控制发帖标题和正文的最大字数。</span></div>
	<div class="level-rule-grid">
		${adminField('admin.settings.maxTitleLength', '标题最大字数', adminInput({ id: 'max_title_length', type: 'number', min: 10, max: 500, step: 10, class: 'reward-input', value: settings.max_title_length || 100 }))}
		${adminField('admin.settings.maxContentLength', '正文最大字数', adminInput({ id: 'max_content_length', type: 'number', min: 100, max: 100000, step: 100, class: 'reward-input', value: settings.max_content_length || 3000 }))}
	</div>
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
				${adminField('admin.settings.oauthClientSecret', 'Client Secret', adminPasswordInput({ id: secretKey, value: settings[secretKey] || '', autocomplete: 'new-password' }))}
			</div>
		</section>`;
	}).join('')}</div><p class="muted" data-i18n="admin.settings.oauthRedirectHint">回调地址使用当前站点域名，可用 OAUTH_REDIRECT_BASE 覆盖。</p>`, 'settings-wide');
	const rewardPanel = adminPanel('admin.settings.rewards', '积分与经验', 'admin.settings.rewardsDesc', '配置用户行为获得的积分、经验和升级规则。', `<div class="admin-section-title"><strong data-i18n="admin.settings.levelRules">等级规则</strong><span data-i18n="admin.settings.levelRulesDesc">控制最高等级和升级所需经验曲线。</span></div>${levelRuleRows}<div class="admin-section-title mt-12"><strong data-i18n="admin.settings.rewardRulesTitle">行为奖励</strong><span data-i18n="admin.settings.rewardRulesDesc">配置用户行为获得的积分和经验。</span></div><div class="reward-grid">${rewardRows}</div>`, 'settings-wide');
	const smtpPanel = adminPanel('admin.settings.emailDelivery', '邮件发送', 'admin.settings.emailDeliveryDesc', 'SMTP 配置用于账号验证和通知邮件。', `<div class="grid cols-2">
		${adminField('admin.settings.smtpHost', 'SMTP Host', adminInput({ id: 'smtp_host', value: settings.smtp_host || '' }))}
		${adminField('admin.settings.smtpPort', 'SMTP Port', adminInput({ id: 'smtp_port', value: settings.smtp_port || '' }))}
		${adminField('admin.settings.smtpUser', 'SMTP User', adminInput({ id: 'smtp_user', value: settings.smtp_user || '' }))}
		${adminField('admin.settings.smtpPass', 'SMTP Pass', adminPasswordInput({ id: 'smtp_pass', value: settings.smtp_pass || '' }))}
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
.pw-wrap{position:relative;display:flex;align-items:center}
.pw-wrap .input{flex:1;padding-right:36px}
.eye-btn{position:absolute;right:8px;background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;display:flex;align-items:center;line-height:1}
.eye-btn:hover{color:var(--text)}
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
function togglePwField(id){const el=document.getElementById(id);if(!el)return;const isHidden=el.type==='password';el.type=isHidden?'text':'password';const btn=el.parentElement&&el.parentElement.querySelector('.eye-btn');if(btn)btn.innerHTML=isHidden?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>':'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';}
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
	['turnstile_enabled','notify_on_user_delete','notify_on_username_change','notify_on_avatar_change','notify_on_manual_verify','maintenance_enabled','oauth_google_enabled','oauth_github_enabled','oauth_epic_enabled','posts_i18n_enabled','pbkdf2_enabled'].forEach(k=>body[k]=document.getElementById(k).checked);
	['site_name','site_tagline','site_icon_url','maintenance_title','maintenance_message','maintenance_until','smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_from_name','oauth_google_client_id','oauth_google_client_secret','oauth_github_client_id','oauth_github_client_secret','oauth_epic_client_id','oauth_epic_client_secret','turnstile_site_key','turnstile_secret_key'].forEach(k=>body[k]=document.getElementById(k).value);
	['moderation_posts_default','moderation_comments_default','moderation_default_reject_reason','moderation_reject_reasons','id_codec_secret','visit_log_retention_days','visit_log_max_rows','video_embed_domains','pbkdf2_iterations','max_title_length','max_content_length'].forEach(k=>body[k]=document.getElementById(k).value);
	['reward_checkin_points','reward_checkin_experience','reward_post_points','reward_post_experience','reward_reply_points','reward_reply_experience','reward_post_replied_points','reward_post_replied_experience','level_max','level_base_experience','level_growth_multiplier'].forEach(k=>body[k]=document.getElementById(k).value);
	body.locale=CONTENT_LOCALE;body.localized=SETTINGS_LOCALIZED;
	try{await runButton(btn,t('common.processing','处理中...'),async function(done){const res=await fetch('/api/admin/settings',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.saveFailed','保存失败'));done();document.getElementById('settings-message').textContent=t('admin.editor.saved','已保存');});}catch(e){document.getElementById('settings-message').textContent=e.message||String(e);}
});`
	});
}


