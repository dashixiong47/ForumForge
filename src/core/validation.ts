export function hasControlCharacters(str: string): boolean {
	return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
}

export function isVisuallyEmpty(str: string): boolean {
	if (!str) return true;
	const stripped = str.replace(/[\s\u200B-\u200F\uFEFF\u2028\u2029\u180E\u3164\u115F\u1160\x00-\x1F\x7F]+/g, '');
	return stripped.length === 0;
}

export function hasInvisibleCharacters(str: string): boolean {
	return /[\u200B-\u200F\uFEFF\u2028\u2029\u180E\u3164\u115F\u1160]/.test(str);
}

export function hasRestrictedKeywords(username: string): boolean {
	const restricted = ['管理', 'admin', 'sudo', 'test'];
	return restricted.some((keyword) => username.toLowerCase().includes(keyword.toLowerCase()));
}
