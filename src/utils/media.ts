export function extractImageUrls(content: string): string[] {
	if (!content) return [];
	const urls: string[] = [];
	const regex = /!\[.*?\]\((.*?)\)/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		urls.push(match[1]);
	}
	return urls;
}

export function extractMediaUrls(content: string): string[] {
	if (!content) return [];
	const urls = new Set<string>();
	const push = (value: string) => {
		const cleaned = String(value || '').trim().replace(/^<|>$/g, '');
		if (cleaned) urls.add(cleaned);
	};

	let match: RegExpExecArray | null;
	const markdownImage = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	while ((match = markdownImage.exec(content)) !== null) push(match[1]);

	const htmlMedia = /<(?:img|video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
	while ((match = htmlMedia.exec(content)) !== null) push(match[1]);

	const rawMediaUrl = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|avif|mp4|webm|ogg|mov)(?:\?[^\s"'<>]*)?)/gi;
	while ((match = rawMediaUrl.exec(content)) !== null) push(match[1]);

	return Array.from(urls);
}

export function mediaTypeFromValue(mimeType: string, value: string): 'image' | 'video' | 'other' {
	const mime = String(mimeType || '').toLowerCase();
	const path = String(value || '').split('?')[0].toLowerCase();
	if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(path)) return 'image';
	if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/.test(path)) return 'video';
	return 'other';
}
