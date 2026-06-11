import type { DBSetting } from '../db/types';
import { DEFAULT_LEVEL_SETTINGS, LEVEL_SETTING_KEYS, PROGRESS_REWARD_KEYS } from '../gamification/progress';
import type { UserPayload } from '../core/security';
import type { JsonResponse } from './types';

export type AdminSettingsApiContext = {
	request: Request;
	url: URL;
	method: string;
	db: D1Database;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	apiAdminUser: UserPayload | null;
	authenticateAdminForPath: () => Promise<UserPayload>;
	normalizeLocale: (value: unknown) => string;
	saveLocalizedFields: (scope: string, localized: unknown, allowedFields: string[], fallbacks?: Record<string, string>) => Promise<void>;
	invalidatePublicContent?: (reason?: string) => void;
};

export async function handleAdminSettingsApi(ctx: AdminSettingsApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		db,
		jsonResponse,
		handleError,
		apiAdminUser,
		authenticateAdminForPath,
		normalizeLocale,
		saveLocalizedFields,
		invalidatePublicContent,
	} = ctx;
		if (url.pathname === '/api/admin/settings' && method === 'GET') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();

				const settings = await db.prepare("SELECT key, value FROM settings").all();
				const config: any = {
					turnstile_enabled: false,
					notify_on_user_delete: false,
					notify_on_username_change: false,
					notify_on_avatar_change: false,
					notify_on_manual_verify: false,
					smtp_host: '',
					smtp_port: '',
					smtp_user: '',
					smtp_pass: '',
					smtp_from: '',
					smtp_from_name: 'DSXForge',
					maintenance_enabled: false,
					maintenance_title: '站点维护中',
					maintenance_message: '我们正在升级服务，请稍后再回来。',
					maintenance_until: '',
					site_name: 'ForumForge',
					site_tagline: 'Dense media discussion feed',
					site_icon_url: '',
					id_codec_secret: '',
					oauth_google_enabled: false,
					oauth_google_client_id: '',
					oauth_google_client_secret: '',
					oauth_github_enabled: false,
					oauth_github_client_id: '',
					oauth_github_client_secret: '',
					oauth_epic_enabled: false,
					oauth_epic_client_id: '',
					oauth_epic_client_secret: '',
					moderation_posts_default: 'approved',
					moderation_comments_default: 'approved',
					moderation_default_reject_reason: '内容不符合社区规则，请修改后重新提交。',
					moderation_reject_reasons: '内容不符合社区规则，请修改后重新提交。\n标题或正文信息不足，请补充更多上下文。\n图片、视频或链接无法正常访问，请修正后重新提交。',
					visit_log_retention_days: '90',
					visit_log_max_rows: '100000',
					[LEVEL_SETTING_KEYS.maxLevel]: String(DEFAULT_LEVEL_SETTINGS.maxLevel),
					[LEVEL_SETTING_KEYS.baseExperience]: String(DEFAULT_LEVEL_SETTINGS.baseExperience),
					[LEVEL_SETTING_KEYS.growth]: String(DEFAULT_LEVEL_SETTINGS.growth),
				};
				for (const keys of Object.values(PROGRESS_REWARD_KEYS)) {
					config[keys.points] = '';
					config[keys.experience] = '';
				}
				
				if (settings.results) {
					for (const row of settings.results) {
						const k = row.key as string;
						if (k.startsWith('smtp_') || (k.startsWith('maintenance_') && k !== 'maintenance_enabled') || k === 'site_icon_url' || k === 'site_name' || k === 'site_tagline' || k === 'id_codec_secret' || k.startsWith('oauth_') && (k.endsWith('_client_id') || k.endsWith('_client_secret')) || k.startsWith('reward_') || k.startsWith('moderation_') || k.startsWith('level_') || k.startsWith('visit_log_')) {
							config[k] = (row.value as string) || '';
						} else {
							config[k] = row.value === '1';
						}
					}
				}
				return jsonResponse(config);
			} catch (e) {
				return handleError(e);
			}
		}

		// POST /api/admin/settings
		if (url.pathname === '/api/admin/settings' && method === 'POST') {
			try {
				const userPayload = apiAdminUser || await authenticateAdminForPath();

				const body = await request.json() as any;
				const { turnstile_enabled, notify_on_user_delete, notify_on_username_change, notify_on_avatar_change, notify_on_manual_verify,
					oauth_google_enabled, oauth_github_enabled, oauth_epic_enabled,
					oauth_google_client_id, oauth_google_client_secret, oauth_github_client_id, oauth_github_client_secret, oauth_epic_client_id, oauth_epic_client_secret,
					site_name, site_tagline, site_icon_url, id_codec_secret, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_from_name, maintenance_enabled, maintenance_title, maintenance_message, maintenance_until, moderation_posts_default, moderation_comments_default, moderation_default_reject_reason, moderation_reject_reasons, visit_log_retention_days, visit_log_max_rows } = body;
				
				const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
				const batch = [];

				if (turnstile_enabled !== undefined) batch.push(stmt.bind('turnstile_enabled', turnstile_enabled ? '1' : '0'));
				if (notify_on_user_delete !== undefined) batch.push(stmt.bind('notify_on_user_delete', notify_on_user_delete ? '1' : '0'));
				if (notify_on_username_change !== undefined) batch.push(stmt.bind('notify_on_username_change', notify_on_username_change ? '1' : '0'));
				if (notify_on_avatar_change !== undefined) batch.push(stmt.bind('notify_on_avatar_change', notify_on_avatar_change ? '1' : '0'));
				if (notify_on_manual_verify !== undefined) batch.push(stmt.bind('notify_on_manual_verify', notify_on_manual_verify ? '1' : '0'));
				if (maintenance_enabled !== undefined) batch.push(stmt.bind('maintenance_enabled', maintenance_enabled ? '1' : '0'));
				if (oauth_google_enabled !== undefined) batch.push(stmt.bind('oauth_google_enabled', oauth_google_enabled ? '1' : '0'));
				if (oauth_github_enabled !== undefined) batch.push(stmt.bind('oauth_github_enabled', oauth_github_enabled ? '1' : '0'));
				if (oauth_epic_enabled !== undefined) batch.push(stmt.bind('oauth_epic_enabled', oauth_epic_enabled ? '1' : '0'));
				if (oauth_google_client_id !== undefined) batch.push(stmt.bind('oauth_google_client_id', String(oauth_google_client_id || '').trim()));
				if (oauth_google_client_secret !== undefined) batch.push(stmt.bind('oauth_google_client_secret', String(oauth_google_client_secret || '').trim()));
				if (oauth_github_client_id !== undefined) batch.push(stmt.bind('oauth_github_client_id', String(oauth_github_client_id || '').trim()));
				if (oauth_github_client_secret !== undefined) batch.push(stmt.bind('oauth_github_client_secret', String(oauth_github_client_secret || '').trim()));
				if (oauth_epic_client_id !== undefined) batch.push(stmt.bind('oauth_epic_client_id', String(oauth_epic_client_id || '').trim()));
				if (oauth_epic_client_secret !== undefined) batch.push(stmt.bind('oauth_epic_client_secret', String(oauth_epic_client_secret || '').trim()));

				if (smtp_host !== undefined) batch.push(stmt.bind('smtp_host', smtp_host || ''));
				if (smtp_port !== undefined) batch.push(stmt.bind('smtp_port', smtp_port || ''));
				if (smtp_user !== undefined) batch.push(stmt.bind('smtp_user', smtp_user || ''));
				if (smtp_pass !== undefined) batch.push(stmt.bind('smtp_pass', smtp_pass || ''));
				if (smtp_from !== undefined) batch.push(stmt.bind('smtp_from', smtp_from || ''));
				if (smtp_from_name !== undefined) batch.push(stmt.bind('smtp_from_name', smtp_from_name || ''));
				if (site_name !== undefined) batch.push(stmt.bind('site_name', String(site_name || 'ForumForge').trim().slice(0, 80)));
				if (site_tagline !== undefined) batch.push(stmt.bind('site_tagline', String(site_tagline || '').trim().slice(0, 180)));
				if (site_icon_url !== undefined) batch.push(stmt.bind('site_icon_url', String(site_icon_url || '').trim()));
				if (maintenance_title !== undefined) batch.push(stmt.bind('maintenance_title', String(maintenance_title || '站点维护中').trim().slice(0, 120)));
				if (maintenance_message !== undefined) batch.push(stmt.bind('maintenance_message', String(maintenance_message || '').trim().slice(0, 1000)));
				if (maintenance_until !== undefined) batch.push(stmt.bind('maintenance_until', String(maintenance_until || '').trim().slice(0, 40)));
				if (id_codec_secret !== undefined) {
					const secret = String(id_codec_secret || '').trim();
					if (secret && secret.length < 16) return jsonResponse({ error: 'ID codec secret must be at least 16 characters' }, 400);
					batch.push(stmt.bind('id_codec_secret', secret));
				}
				if (moderation_posts_default !== undefined) batch.push(stmt.bind('moderation_posts_default', moderation_posts_default === 'pending' ? 'pending' : 'approved'));
				if (moderation_comments_default !== undefined) batch.push(stmt.bind('moderation_comments_default', moderation_comments_default === 'pending' ? 'pending' : 'approved'));
				if (moderation_default_reject_reason !== undefined) batch.push(stmt.bind('moderation_default_reject_reason', String(moderation_default_reject_reason || '').slice(0, 500)));
				if (moderation_reject_reasons !== undefined) batch.push(stmt.bind('moderation_reject_reasons', String(moderation_reject_reasons || '').slice(0, 2000)));
				if (visit_log_retention_days !== undefined) batch.push(stmt.bind('visit_log_retention_days', String(Math.max(0, Math.min(3650, Math.floor(Number(visit_log_retention_days) || 0))))));
				if (visit_log_max_rows !== undefined) batch.push(stmt.bind('visit_log_max_rows', String(Math.max(0, Math.min(10000000, Math.floor(Number(visit_log_max_rows) || 0))))));
				for (const keys of Object.values(PROGRESS_REWARD_KEYS)) {
					for (const key of [keys.points, keys.experience]) {
						if (body[key] !== undefined) batch.push(stmt.bind(key, String(Math.max(0, Math.floor(Number(body[key]) || 0)))));
					}
				}
				if (body[LEVEL_SETTING_KEYS.maxLevel] !== undefined) {
					batch.push(stmt.bind(LEVEL_SETTING_KEYS.maxLevel, String(Math.max(1, Math.min(999, Math.floor(Number(body[LEVEL_SETTING_KEYS.maxLevel]) || DEFAULT_LEVEL_SETTINGS.maxLevel))))));
				}
				if (body[LEVEL_SETTING_KEYS.baseExperience] !== undefined) {
					batch.push(stmt.bind(LEVEL_SETTING_KEYS.baseExperience, String(Math.max(1, Math.floor(Number(body[LEVEL_SETTING_KEYS.baseExperience]) || DEFAULT_LEVEL_SETTINGS.baseExperience)))));
				}
				if (body[LEVEL_SETTING_KEYS.growth] !== undefined) {
					batch.push(stmt.bind(LEVEL_SETTING_KEYS.growth, String(Math.max(1, Math.min(10, Number(body[LEVEL_SETTING_KEYS.growth]) || DEFAULT_LEVEL_SETTINGS.growth)))));
				}
				
				if (batch.length > 0) await db.batch(batch);
				if (body.localized && typeof body.localized === 'object') {
					const locale = normalizeLocale(body.locale) || 'zh-CN';
					const localized = body.localized as Record<string, Record<string, string>>;
					if (site_name !== undefined) {
						localized.site_name = localized.site_name || {};
						localized.site_name[locale] = String(site_name || 'ForumForge').trim().slice(0, 80);
					}
					if (site_tagline !== undefined) {
						localized.site_tagline = localized.site_tagline || {};
						localized.site_tagline[locale] = String(site_tagline || '').trim().slice(0, 180);
					}
					await saveLocalizedFields('settings', localized, ['site_name', 'site_tagline']);
				}

				invalidatePublicContent?.('settings:update');
				return jsonResponse({ success: true });
			} catch (e) {
				return handleError(e);
			}
		}


	return null;
}

