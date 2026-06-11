export const FALLBACK_LOCALE = 'en-US';
export const BUILTIN_LOCALES = ['en-US', 'zh-CN'];

export function normalizeLocaleValue(value: unknown): string {
	if (!value) return '';
	const raw = String(value).trim().replace('_', '-');
	if (!raw) return '';
	const lower = raw.toLowerCase();
	if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-hans') return 'zh-CN';
	if (lower === 'en' || lower === 'en-us') return 'en-US';
	const [language, region] = raw.split('-');
	if (!language) return '';
	return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

function localeMatches(candidate: string, supported: string): boolean {
	const normalizedCandidate = normalizeLocaleValue(candidate);
	const normalizedSupported = normalizeLocaleValue(supported);
	if (!normalizedCandidate || !normalizedSupported) return false;
	if (normalizedCandidate === normalizedSupported) return true;
	return normalizedCandidate.split('-')[0] === normalizedSupported.split('-')[0];
}

export function pickSupportedLocale(value: unknown, supported = BUILTIN_LOCALES): string {
	const normalized = normalizeLocaleValue(value);
	if (!normalized) return '';
	return supported.find((locale) => localeMatches(normalized, locale)) || '';
}

export function pickLocaleFromAcceptLanguage(header: string | null, supported = BUILTIN_LOCALES): string {
	if (!header) return '';
	const candidates = header
		.split(',')
		.map((part) => {
			const [localePart, qPart] = part.trim().split(';');
			const quality = qPart?.trim().startsWith('q=') ? Number(qPart.trim().slice(2)) : 1;
			return { locale: localePart, quality: Number.isFinite(quality) ? quality : 1 };
		})
		.filter((item) => item.locale)
		.sort((a, b) => b.quality - a.quality);
	for (const candidate of candidates) {
		const locale = pickSupportedLocale(candidate.locale, supported);
		if (locale) return locale;
	}
	return '';
}
