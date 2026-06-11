import { escapeHtml } from '../utils/html';

function attr(value: unknown): string {
	return escapeHtml(value).replace(/"/g, '&quot;');
}

function mediaType(url: string): 'image' | 'video' {
	return /\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url) ? 'video' : 'image';
}

export function extractMedia(content: string): Array<{ url: string; alt: string; type: 'image' | 'video' }> {
	const media: Array<{ url: string; alt: string; type: 'image' | 'video' }> = [];
	const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	let match: RegExpExecArray | null;
	while ((match = imageRegex.exec(content || ''))) {
		const url = match[2].trim();
		media.push({ url, alt: match[1] || '', type: mediaType(url) });
	}
	return media;
}

export function stripMarkdown(content: string): string {
	return (content || '')
		.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[#>*_`~-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function readingMinutes(content: string): number {
	const text = stripMarkdown(content);
	return Math.max(1, Math.ceil(text.length / 420));
}

function inlineMarkdown(line: string): string {
	let escaped = escapeHtml(line);
	escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
	escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, (_m, text, url) => {
		return `<a href="${attr(url)}" target="${String(url).startsWith('http') ? '_blank' : '_self'}" rel="noopener noreferrer">${text}</a>`;
	});
	return escaped;
}

export function renderMarkdown(content: string): string {
	const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
	const blocks: string[] = [];
	let listItems: string[] = [];
	const flushList = () => {
		if (listItems.length) {
			blocks.push(`<ul>${listItems.join('')}</ul>`);
			listItems = [];
		}
	};
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			flushList();
			continue;
		}
		const mediaMatch = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
		if (mediaMatch) {
			flushList();
			const url = mediaMatch[2].trim();
			const alt = mediaMatch[1] || '';
			if (mediaType(url) === 'video') {
				blocks.push(`<video controls preload="metadata" src="${attr(url)}"></video>`);
			} else {
				blocks.push(`<img src="${attr(url)}" alt="${attr(alt)}" loading="lazy">`);
			}
			continue;
		}
		const listMatch = line.match(/^[-*]\s+(.+)$/);
		if (listMatch) {
			listItems.push(`<li>${inlineMarkdown(listMatch[1])}</li>`);
			continue;
		}
		flushList();
		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		if (heading) {
			const level = heading[1].length + 1;
			blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
		} else {
			blocks.push(`<p>${inlineMarkdown(line)}</p>`);
		}
	}
	flushList();
	return blocks.join('\n') || '<p class="muted" data-i18n="common.emptyContent">暂无内容</p>';
}
