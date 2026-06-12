import { escapeHtml } from '../utils/html';
import { marked } from 'marked';

export const DEFAULT_VIDEO_EMBED_DOMAINS = ['youtube.com', 'youtu.be', 'bilibili.com', 'b23.tv'];

export type MarkdownRenderOptions = {
	videoEmbedDomains?: string[] | string | null;
};

function attr(value: unknown): string {
	return escapeHtml(value).replace(/"/g, '&quot;');
}

const SAFE_TAGS = new Set([
	'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
	'iframe', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead',
	'tr', 'ul', 'video', 'source',
]);

function isSafeUrl(value: string): boolean {
	const url = value.trim();
	if (!url) return false;
	if (url.startsWith('/') || url.startsWith('#')) return true;
	return /^(https?:|mailto:)/i.test(url);
}

function isSafeVideoUrl(value: string): boolean {
	const url = value.trim();
	if (!url) return false;
	if (url.startsWith('/')) return true;
	return /^https?:/i.test(url);
}

function normalizeDomain(value: unknown): string {
	const raw = String(value || '').trim().toLowerCase();
	if (!raw) return '';
	const domainLike = raw.replace(/^\*\./, '');
	try {
		const parsed = new URL(domainLike.includes('://') ? domainLike : `https://${domainLike}`);
		return parsed.hostname.replace(/^\*\./, '').replace(/\.$/, '');
	} catch {
		return domainLike.split('/')[0].split(':')[0].replace(/^\*\./, '').replace(/\.$/, '');
	}
}

export function normalizeVideoEmbedDomains(value?: string[] | string | null): string[] {
	const source = Array.isArray(value)
		? value
		: String(value || '').split(/[\s,]+/);
	const domains = source
		.map(normalizeDomain)
		.filter((domain) => /^[a-z0-9.-]+$/i.test(domain) && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.'));
	const merged = [...DEFAULT_VIDEO_EMBED_DOMAINS, ...domains];
	return Array.from(new Set(merged)).slice(0, 100);
}

export function serializeVideoEmbedDomains(value?: string[] | string | null): string {
	return normalizeVideoEmbedDomains(value).join('\n');
}

function hostMatchesDomain(host: string, domain: string): boolean {
	const normalizedHost = normalizeDomain(host);
	const normalizedDomain = normalizeDomain(domain);
	return !!normalizedHost && !!normalizedDomain && (normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`));
}

function allowedVideoEmbedDomains(options?: MarkdownRenderOptions): string[] {
	return normalizeVideoEmbedDomains(options?.videoEmbedDomains);
}

function youtubeEmbedUrl(url: URL): string {
	const host = url.hostname.replace(/^www\./, '').toLowerCase();
	let id = '';
	if (host === 'youtu.be') {
		id = url.pathname.split('/').filter(Boolean)[0] || '';
	} else if (host === 'youtube.com' || host === 'm.youtube.com') {
		if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
		else if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) id = url.pathname.split('/').filter(Boolean)[1] || '';
	}
	if (!/^[a-zA-Z0-9_-]{6,32}$/.test(id)) return '';
	return `https://www.youtube-nocookie.com/embed/${id}`;
}

function bilibiliEmbedUrl(url: URL): string {
	const host = url.hostname.replace(/^www\./, '').toLowerCase();
	if (host !== 'bilibili.com' && host !== 'm.bilibili.com' && host !== 'b23.tv') return '';
	if (url.pathname.startsWith('/blackboard/html5mobileplayer.html')) {
		const bvid = url.searchParams.get('bvid') || '';
		const aid = url.searchParams.get('aid') || '';
		if (/^BV[a-zA-Z0-9]+$/.test(bvid)) return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}`;
		if (/^\d+$/.test(aid)) return `https://player.bilibili.com/player.html?aid=${encodeURIComponent(aid)}`;
		return '';
	}
	const parts = url.pathname.split('/').filter(Boolean);
	const videoIndex = parts.indexOf('video');
	const id = videoIndex >= 0 ? parts[videoIndex + 1] || '' : parts[0] || '';
	if (/^BV[a-zA-Z0-9]+$/.test(id)) return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}`;
	if (/^av\d+$/i.test(id)) return `https://player.bilibili.com/player.html?aid=${encodeURIComponent(id.slice(2))}`;
	return '';
}

function mediaEmbedUrl(value: string, options?: MarkdownRenderOptions): string {
	try {
		const url = new URL(value.trim());
		const dedicated = youtubeEmbedUrl(url) || bilibiliEmbedUrl(url);
		if (dedicated) return dedicated;
		if (allowedVideoEmbedDomains(options).some((domain) => hostMatchesDomain(url.hostname, domain))) {
			return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
		}
		return '';
	} catch {
		return '';
	}
}

function isSafeEmbedUrl(value: string, options?: MarkdownRenderOptions): boolean {
	try {
		const url = new URL(value.trim());
		const host = url.hostname.toLowerCase();
		if (host === 'www.youtube-nocookie.com' && /^\/embed\/[a-zA-Z0-9_-]+$/.test(url.pathname)) return true;
		if (host === 'player.bilibili.com' && url.pathname === '/player.html') {
			const bvid = url.searchParams.get('bvid') || '';
			const aid = url.searchParams.get('aid') || '';
			return /^BV[a-zA-Z0-9]+$/.test(bvid) || /^\d+$/.test(aid);
		}
		return (url.protocol === 'http:' || url.protocol === 'https:')
			&& allowedVideoEmbedDomains(options).some((domain) => hostMatchesDomain(host, domain));
	} catch {
		return false;
	}
}

function sanitizeStyle(value: string): string {
	const rules: string[] = [];
	for (const part of value.split(';')) {
		const [nameRaw, ...rest] = part.split(':');
		const name = String(nameRaw || '').trim().toLowerCase();
		const cssValue = rest.join(':').trim();
		if (!cssValue) continue;
		if ((name === 'color' || name === 'background-color')
			&& (/^#[0-9a-f]{3,8}$/i.test(cssValue)
				|| /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(cssValue)
				|| /^[a-z]+$/i.test(cssValue))) {
			rules.push(`${name}:${cssValue}`);
		}
	}
	return rules.join(';');
}

function sanitizeAttrs(tag: string, attrs: string, options?: MarkdownRenderOptions): string {
	const out: string[] = [];
	const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
	let match: RegExpExecArray | null;
	while ((match = attrRe.exec(attrs || ''))) {
		const name = match[1].toLowerCase();
		const value = String(match[3] ?? match[4] ?? match[5] ?? '');
		if (name.startsWith('on')) continue;
		if (name === 'style' && tag === 'span') {
			const style = sanitizeStyle(value);
			if (style) out.push(`style="${attr(style)}"`);
			continue;
		}
		if (name === 'href' && tag === 'a' && isSafeUrl(value)) {
			out.push(`href="${attr(value)}"`);
			continue;
		}
		if (name === 'src' && ['img', 'video', 'source'].includes(tag) && isSafeUrl(value)) {
			out.push(`src="${attr(value)}"`);
			continue;
		}
		if (name === 'src' && tag === 'iframe' && isSafeEmbedUrl(value, options)) {
			out.push(`src="${attr(value)}"`);
			continue;
		}
		if (name === 'poster' && tag === 'video' && isSafeUrl(value)) {
			out.push(`poster="${attr(value)}"`);
			continue;
		}
		if (['alt', 'title'].includes(name) && ['a', 'img'].includes(tag)) {
			out.push(`${name}="${attr(value)}"`);
			continue;
		}
		if (name === 'title' && tag === 'iframe') {
			out.push(`title="${attr(value)}"`);
			continue;
		}
		if (name === 'class' && ['code', 'pre', 'span'].includes(tag) && /^[a-z0-9_\-\s]+$/i.test(value)) {
			out.push(`class="${attr(value)}"`);
			continue;
		}
		if (name === 'class' && tag === 'iframe' && value === 'video-embed') {
			out.push('class="video-embed"');
			continue;
		}
		if (tag === 'video' && ['controls', 'loop', 'muted', 'playsinline'].includes(name)) {
			out.push(name);
			continue;
		}
		if (tag === 'iframe' && name === 'allowfullscreen') {
			out.push('allowfullscreen');
			continue;
		}
		if (tag === 'iframe' && name === 'loading' && /^(lazy|eager)$/i.test(value)) {
			out.push(`loading="${attr(value.toLowerCase())}"`);
			continue;
		}
		if (tag === 'iframe' && name === 'referrerpolicy' && /^strict-origin-when-cross-origin$/i.test(value)) {
			out.push('referrerpolicy="strict-origin-when-cross-origin"');
			continue;
		}
		if (tag === 'iframe' && name === 'allow' && /^[a-z;\-\s]+$/i.test(value)) {
			out.push(`allow="${attr(value)}"`);
			continue;
		}
		if (tag === 'video' && name === 'preload' && /^(none|metadata|auto)$/i.test(value)) {
			out.push(`preload="${attr(value.toLowerCase())}"`);
		}
	}
	if (tag === 'a') out.push('rel="noopener noreferrer"', 'target="_blank"');
	if (tag === 'img') out.push('loading="lazy"');
	return out.length ? ` ${Array.from(new Set(out)).join(' ')}` : '';
}

function sanitizeMarkdownHtml(html: string, options?: MarkdownRenderOptions): string {
	return String(html || '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<\s*(script|style|object|embed|link|meta|base|form|input|button|textarea|select|option)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
		.replace(/<\s*\/?\s*([a-zA-Z][\w:-]*)([^>]*)>/g, (full, tagRaw, attrsRaw) => {
			const tag = String(tagRaw || '').toLowerCase();
			if (!SAFE_TAGS.has(tag)) return escapeHtml(full);
			const closing = /^<\s*\//.test(full);
			if (closing) return `</${tag}>`;
			const selfClose = /\/\s*>$/.test(full) || ['br', 'hr', 'img', 'source'].includes(tag);
			return `<${tag}${sanitizeAttrs(tag, attrsRaw || '', options)}${selfClose ? '>' : '>'}`;
		});
}

function videoEmbedHtml(url: string, options?: MarkdownRenderOptions): string {
	const value = String(url || '').trim();
	if (!isSafeUrl(value)) return '';
	const embed = mediaEmbedUrl(value, options);
	if (embed) {
		return `<iframe class="video-embed" src="${attr(embed)}" title="Embedded video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen="allowfullscreen"></iframe>`;
	}
	if (isSafeVideoUrl(value)) {
		return `<video controls="controls" preload="metadata" src="${attr(value)}"></video>`;
	}
	return '';
}

function expandVideoEmbeds(source: string, options?: MarkdownRenderOptions): string {
	return source.replace(/^@\[(?:video|视频)\]\(([^)\s]+)\)\s*$/gmi, (full, url) => videoEmbedHtml(url, options) || escapeHtml(full));
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

export function renderMarkdown(content: string, options?: MarkdownRenderOptions): string {
	const source = String(content || '').trim();
	if (!source) return '<p class="muted" data-i18n="common.emptyContent">暂无内容</p>';
	const html = marked.parse(expandVideoEmbeds(source, options), {
		async: false,
		breaks: false,
		gfm: true,
	}) as string;
	return sanitizeMarkdownHtml(html, options);
}
