import type { DBSetting } from '../db/types';
import { FALLBACK_LOCALE } from '../core/locale';
import { isLocalRequest } from '../core/env';
import { DEFAULT_VIDEO_EMBED_DOMAINS } from '../site/markdown';
import { renderPostArticleHtml } from '../site/post-content';
import type { ApiContext } from './types';

export async function handlePublicApi(ctx: ApiContext): Promise<Response | null> {
	const {
		request,
		url,
		method,
		env,
		db,
		jsonResponse,
		handleError,
		requestLocale,
		normalizeLocale,
		getEnabledLanguages,
		getSystemTranslations,
		loadLocalizedMaps,
	} = ctx;

	if (url.pathname === '/api/markdown/preview' && method === 'POST') {
		try {
			const body = await request.json().catch(() => ({})) as { content?: unknown };
			const setting = await db.prepare("SELECT value FROM settings WHERE key = 'video_embed_domains'").first<DBSetting>().catch(() => null);
			return jsonResponse({
				html: renderPostArticleHtml(String(body.content || '').slice(0, 3000), {
					videoEmbedDomains: setting?.value || DEFAULT_VIDEO_EMBED_DOMAINS,
				}),
			});
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/config' && method === 'GET') {
		try {
			const [setting, localeSetting, siteNameSetting, userCount, languages, tsKeyRow, tsSecretRow, maxTitleRow, maxContentRow] = await Promise.all([
				db.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first<DBSetting>(),
				db.prepare("SELECT value FROM settings WHERE key = 'default_locale'").first<DBSetting>(),
				db.prepare("SELECT value FROM settings WHERE key = 'site_name'").first<DBSetting>(),
				db.prepare('SELECT COUNT(*) as count FROM users').first('count'),
				getEnabledLanguages(),
				db.prepare("SELECT value FROM settings WHERE key = 'turnstile_site_key'").first<DBSetting>(),
				db.prepare("SELECT value FROM settings WHERE key = 'turnstile_secret_key'").first<DBSetting>(),
				db.prepare("SELECT value FROM settings WHERE key = 'max_title_length'").first<DBSetting>(),
				db.prepare("SELECT value FROM settings WHERE key = 'max_content_length'").first<DBSetting>(),
			]);

			const dbEnabled = setting ? setting.value === '1' : false;
			const siteKey = tsKeyRow?.value || (env as any).TURNSTILE_SITE_KEY || '';
			const secretKey = tsSecretRow?.value || (env as any).TURNSTILE_SECRET_KEY || '';
			const turnstileFullyConfigured = !!(dbEnabled && siteKey && secretKey && !isLocalRequest(url));
			const maxTitleLength = Math.max(10, Math.min(500, parseInt(maxTitleRow?.value || '') || 100));
			const maxContentLength = Math.max(100, Math.min(100000, parseInt(maxContentRow?.value || '') || 3000));
			const locale = normalizeLocale(url.searchParams.get('locale')) || requestLocale();
			const localized = await loadLocalizedMaps(['settings']);
			const siteLocalized = localized.get('settings') || {};

			return jsonResponse({
				site_name: siteLocalized.site_name?.[locale] || siteLocalized.site_name?.['en-US'] || siteLocalized.site_name?.['zh-CN'] || siteNameSetting?.value || 'ForumForge',
				site_tagline: siteLocalized.site_tagline?.[locale] || siteLocalized.site_tagline?.['en-US'] || siteLocalized.site_tagline?.['zh-CN'] || 'Dense media discussion feed',
				default_locale: localeSetting?.value || locale || FALLBACK_LOCALE,
				supported_locales: languages.map((language: any) => language.code),
				languages,
				turnstile_enabled: turnstileFullyConfigured,
				turnstile_site_key: siteKey,
				max_title_length: maxTitleLength,
				max_content_length: maxContentLength,
				user_count: userCount || 0,
				jwt_secret_configured: !!(env as any).JWT_SECRET && String((env as any).JWT_SECRET).length >= 32
			});
		} catch (e) {
			return handleError(e);
		}
	}

	if (url.pathname === '/api/i18n' && method === 'GET') {
		try {
			const requested = normalizeLocale(url.searchParams.get('locale')) || requestLocale();
			const languages = await getEnabledLanguages();
			const languageCodes = new Set(languages.map((language: any) => String(language.code)));
			const locale = languageCodes.has(requested)
				? requested
				: (languageCodes.has(FALLBACK_LOCALE) ? FALLBACK_LOCALE : String((languages[0] as any)?.code || FALLBACK_LOCALE));
			const messages = await getSystemTranslations(locale);
			return jsonResponse({ locale, languages, messages });
		} catch (e) {
			return handleError(e);
		}
	}

	return null;
}
