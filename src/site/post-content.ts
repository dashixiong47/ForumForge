import { renderMarkdown, type MarkdownRenderOptions } from './markdown';

export type PostContentRenderOptions = MarkdownRenderOptions & {
	emptyHtml?: string;
};

export function renderPostArticleHtml(content: string, options?: PostContentRenderOptions): string {
	const source = String(content || '');
	const body = source.trim()
		? renderMarkdown(source, options)
		: (options?.emptyHtml || renderMarkdown(source, options));
	return `<div class="article" data-live-preview><div class="prose">${body}</div></div>`;
}
