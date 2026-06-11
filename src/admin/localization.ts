import { escapeHtml } from '../utils/html';

export const localeCatalog = [
	{ code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文', country: 'cn' },
	{ code: 'en-US', name: 'English', native: 'English', country: 'us' },
	{ code: 'ja-JP', name: 'Japanese', native: '日本語', country: 'jp' },
	{ code: 'ko-KR', name: 'Korean', native: '한국어', country: 'kr' },
	{ code: 'fr-FR', name: 'French', native: 'Français', country: 'fr' },
	{ code: 'de-DE', name: 'German', native: 'Deutsch', country: 'de' },
	{ code: 'es-ES', name: 'Spanish', native: 'Español', country: 'es' },
	{ code: 'pt-BR', name: 'Portuguese', native: 'Português', country: 'br' },
	{ code: 'ru-RU', name: 'Russian', native: 'Русский', country: 'ru' },
	{ code: 'vi-VN', name: 'Vietnamese', native: 'Tiếng Việt', country: 'vn' },
	{ code: 'id-ID', name: 'Indonesian', native: 'Bahasa Indonesia', country: 'id' },
	{ code: 'th-TH', name: 'Thai', native: 'ไทย', country: 'th' },
	{ code: 'ar-SA', name: 'Arabic', native: 'العربية', country: 'sa' },
];

export type AdminLanguage = { code?: string; locale?: string; name?: string; native_name?: string; native?: string; country?: string };

export type LocalizedValueMap = Record<string, Record<string, string>>;

export function languageCode(language: AdminLanguage): string {
	return String(language.code || language.locale || 'zh-CN');
}

export function languageName(language: AdminLanguage): string {
	return String(language.native_name || language.native || language.name || languageCode(language));
}

export function languageCountry(code: string): string {
	const catalog = localeCatalog.find((item) => item.code === code || item.code.split('-')[0] === code.split('-')[0]);
	return catalog?.country || code.split('-').pop()?.toLowerCase() || 'un';
}

export function normalizeContentLanguages(languages?: AdminLanguage[]): AdminLanguage[] {
	const list = (languages || []).filter((language) => languageCode(language));
	return list.length ? list : localeCatalog.slice(0, 2).map((item) => ({ code: item.code, name: item.name, native_name: item.native, country: item.country }));
}

export function contentLanguageSelector(languages?: AdminLanguage[], active = 'zh-CN'): string {
	const normalized = normalizeContentLanguages(languages);
	const current = normalized.find((language) => languageCode(language) === active) || normalized[0];
	const options = normalized.map((language) => {
		const code = languageCode(language);
		return `<button type="button" class="${code === active ? 'active' : ''}" data-content-locale-option="${escapeHtml(code)}"><span>${escapeHtml(languageName(language))}</span><small>${escapeHtml(code)}</small></button>`;
	}).join('');
	return `<div class="content-lang-switch">
		<span data-i18n="admin.contentLanguage">内容语言</span>
		<input type="hidden" data-content-locale value="${escapeHtml(active)}">
		<div class="content-lang-menu">
			<button class="content-lang-trigger" type="button" data-content-locale-trigger><span data-content-locale-label>${escapeHtml(languageName(current))}</span><small>${escapeHtml(languageCode(current))}</small></button>
			<div class="content-lang-pop">${options}</div>
		</div>
	</div>`;
}

export function localizedValue(localized: LocalizedValueMap | undefined, field: string, locale: string, fallback = ''): string {
	return localized?.[field]?.[locale] ?? localized?.[field]?.['en-US'] ?? localized?.[field]?.['zh-CN'] ?? fallback;
}
