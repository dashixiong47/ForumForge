import { escapeHtml } from '../utils/html';
import { marked } from 'marked';

function attr(value: unknown): string {
	return escapeHtml(value).replace(/"/g, '&quot;');
}

const SAFE_TAGS = new Set([
	'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
	'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead',
	'tr', 'ul', 'video', 'source',
]);

function isSafeUrl(value: string): boolean {
	const url = value.trim();
	if (!url) return false;
	if (url.startsWith('/') || url.startsWith('#')) return true;
	return /^(https?:|mailto:)/i.test(url);
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

function sanitizeAttrs(tag: string, attrs: string): string {
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
		if (name === 'poster' && tag === 'video' && isSafeUrl(value)) {
			out.push(`poster="${attr(value)}"`);
			continue;
		}
		if (['alt', 'title'].includes(name) && ['a', 'img'].includes(tag)) {
			out.push(`${name}="${attr(value)}"`);
			continue;
		}
		if (name === 'class' && ['code', 'pre', 'span'].includes(tag) && /^[a-z0-9_\-\s]+$/i.test(value)) {
			out.push(`class="${attr(value)}"`);
			continue;
		}
		if (tag === 'video' && ['controls', 'loop', 'muted', 'playsinline'].includes(name)) {
			out.push(name);
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

function sanitizeMarkdownHtml(html: string): string {
	return String(html || '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
		.replace(/<\s*\/?\s*([a-zA-Z][\w:-]*)([^>]*)>/g, (full, tagRaw, attrsRaw) => {
			const tag = String(tagRaw || '').toLowerCase();
			if (!SAFE_TAGS.has(tag)) return escapeHtml(full);
			const closing = /^<\s*\//.test(full);
			if (closing) return `</${tag}>`;
			const selfClose = /\/\s*>$/.test(full) || ['br', 'hr', 'img', 'source'].includes(tag);
			return `<${tag}${sanitizeAttrs(tag, attrsRaw || '')}${selfClose ? '>' : '>'}`;
		});
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
	const source = String(content || '').trim();
	if (!source) return '<p class="muted" data-i18n="common.emptyContent">暂无内容</p>';
	const html = marked.parse(source, {
		async: false,
		breaks: false,
		gfm: true,
	}) as string;
	return sanitizeMarkdownHtml(html);
}
