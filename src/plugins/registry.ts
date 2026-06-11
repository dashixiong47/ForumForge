import type { DBPlugin } from '../db/types';
import { safeJsonString } from '../utils/json';

export const BUILTIN_PLUGINS = [
	{
		id: 'markdown-editor',
		name: 'Markdown Editor',
		description: 'Adds the built-in Markdown toolbar, preview, and image insertion workflow.',
		version: '1.0.0',
		enabled: 1,
		config: '{"toolbar":["bold","italic","strike","heading","link","image","code","quote","list","table"],"preview":true}',
		css: '.ff-md-toolbar{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.ff-md-preview img,.ff-md-preview video{max-width:100%;border-radius:8px;border:1px solid var(--border)}',
		html: '<template data-forumforge-plugin="markdown-editor"><div class="ff-md-toolbar" data-slot="toolbar"></div><div class="ff-md-preview" data-slot="preview"></div></template>',
		js: '(function(){window.ForumForgePlugins=window.ForumForgePlugins||{};window.ForumForgePlugins.markdownEditor={id:"markdown-editor",features:["toolbar","preview","media-insert"]};})();',
		i18n: {
			'plugin.name': { 'zh-CN': 'Markdown 编辑器', 'en-US': 'Markdown Editor' },
			'plugin.description': { 'zh-CN': '提供 Markdown 工具栏、实时预览和图片插入流程。', 'en-US': 'Adds the built-in Markdown toolbar, preview, and image insertion workflow.' },
			'toolbar.image': { 'zh-CN': '图片', 'en-US': 'Image' },
			'toolbar.preview': { 'zh-CN': '预览', 'en-US': 'Preview' }
		}
	},
	{
		id: 'image-preview',
		name: 'Image Preview',
		description: 'Extracts Markdown images and enables gallery previews in posts.',
		version: '1.0.0',
		enabled: 1,
		config: '{"lightbox":true,"gallery":true}',
		css: '.ff-image-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.ff-image-gallery img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:8px;border:1px solid var(--border)}',
		html: '<template data-forumforge-plugin="image-preview"><figure class="ff-image-gallery" data-slot="images"></figure></template>',
		js: '(function(){window.ForumForgePlugins=window.ForumForgePlugins||{};window.ForumForgePlugins.imagePreview={id:"image-preview",features:["extract-markdown-images","lightbox"]};})();',
		i18n: {
			'plugin.name': { 'zh-CN': '图片预览', 'en-US': 'Image Preview' },
			'plugin.description': { 'zh-CN': '提取 Markdown 图片，并在帖子中启用图库预览。', 'en-US': 'Extracts Markdown images and enables gallery previews in posts.' },
			'gallery.open': { 'zh-CN': '打开图片', 'en-US': 'Open image' },
			'gallery.close': { 'zh-CN': '关闭预览', 'en-US': 'Close preview' }
		}
	}
];

const PLUGIN_TYPES = new Set(['system', 'theme', 'widget', 'integration']);
const PLUGIN_TYPE_ALIASES: Record<string, string> = {
	renderer: 'widget',
	general: 'system',
	extension: 'integration',
};

export function getBuiltinPlugin(id: unknown) {
	const key = String(id || '').trim();
	return BUILTIN_PLUGINS.find((plugin) => plugin.id === key);
}

export function hydrateBuiltinPluginRow(row: DBPlugin): DBPlugin {
	const builtin = getBuiltinPlugin(row.id || row.slug);
	if (!builtin) return row;
	return {
		...row,
		slug: row.slug || builtin.id,
		name: row.name || builtin.name,
		description: row.description || builtin.description,
		version: row.version || builtin.version,
		enabled: row.enabled ?? builtin.enabled,
		config: row.config && row.config !== '{}' ? row.config : builtin.config,
		type: row.type || 'system',
		css: row.css || builtin.css,
		html: row.html || builtin.html,
		js: row.js || builtin.js,
		i18n: row.i18n && row.i18n !== '{}' ? row.i18n : JSON.stringify(builtin.i18n),
	};
}

export function normalizePluginId(value: unknown): string {
	const id = String(value || '').trim().toLowerCase();
	return /^[a-z0-9][a-z0-9-]{1,62}$/.test(id) ? id : '';
}

export function normalizePluginType(value: unknown): string {
	const raw = String(value || '').trim().toLowerCase();
	const type = PLUGIN_TYPE_ALIASES[raw] || raw;
	return PLUGIN_TYPES.has(type) ? type : 'system';
}

export function normalizePluginManifest(raw: unknown): { ok: true; manifest: any } | { ok: false; error: string } {
	if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid plugin manifest' };
	const input = raw as Record<string, any>;
	const id = normalizePluginId(input.id || input.slug);
	const name = String(input.name || '').trim();
	if (!id) return { ok: false, error: 'Plugin id must be lowercase letters, numbers, and hyphens' };
	if (!name) return { ok: false, error: 'Plugin name is required' };
	const type = normalizePluginType(input.type);
	return {
		ok: true,
		manifest: {
			id,
			slug: id,
			name,
			description: String(input.description || '').trim(),
			version: String(input.version || '1.0.0').trim() || '1.0.0',
			enabled: input.enabled === undefined ? 0 : (input.enabled ? 1 : 0),
			config: safeJsonString(input.config, {}),
			author: String(input.author || '').trim(),
			homepage: String(input.homepage || '').trim(),
			icon: String(input.icon || 'Puzzle').trim() || 'Puzzle',
			type,
			css: String(input.css || ''),
			html: String(input.html || ''),
			js: String(input.js || ''),
			head_html: String(input.headHtml ?? input.head_html ?? ''),
			block_types: safeJsonString(input.blockTypes ?? input.block_types, []),
			i18n: safeJsonString(input.i18n ?? input.i18nStrings, {}),
			config_schema: safeJsonString(input.configSchema ?? input.config_schema, {}),
			permissions: safeJsonString(input.permissions, []),
			tags: safeJsonString(input.tags, []),
			source_url: String(input.sourceUrl ?? input.source_url ?? '').trim(),
		}
	};
}

export function comparePluginVersion(a: unknown, b: unknown): number {
	const left = String(a || '0').split(/[.-]/).map((part) => Number.parseInt(part, 10));
	const right = String(b || '0').split(/[.-]/).map((part) => Number.parseInt(part, 10));
	const length = Math.max(left.length, right.length);
	for (let i = 0; i < length; i++) {
		const x = Number.isFinite(left[i]) ? left[i] : 0;
		const y = Number.isFinite(right[i]) ? right[i] : 0;
		if (x !== y) return x > y ? 1 : -1;
	}
	return 0;
}
