import type { DBPlugin } from '../db/types';
import { safeJsonString } from '../utils/json';

export type PluginConfigField = {
	key: string;
	type: string;
	label: string;
	labelKey?: string;
	description: string;
	descriptionKey?: string;
	placeholder: string;
	placeholderKey?: string;
	required: boolean;
	defaultValue: any;
	options: Array<{ label: string; value: string }>;
	arrayItemFields?: Array<{ key: string; label: string; labelKey?: string; placeholder: string; placeholderKey?: string; type: string }>;
	badgeDefinitions?: {
		keyPrefix?: string;
		keyField?: string;
		labelField?: string;
		descriptionField?: string;
		iconField?: string;
		colorField?: string;
		defaultIcon?: string;
		defaultColor?: string;
		defaultDescription?: string;
		labelSuffix?: string;
	};
};

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
	},
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
		resource_types: row.resource_types || safeJsonString((builtin as any).resourceTypes, []),
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

function normalizeConfigOptions(options: unknown): Array<{ label: string; value: string }> {
	if (!Array.isArray(options)) return [];
	return options.map((option) => {
		if (option && typeof option === 'object') {
			const raw = option as Record<string, any>;
			const value = String(raw.value ?? raw.id ?? raw.key ?? '').trim();
			const label = String(raw.label ?? raw.name ?? value).trim();
			return value ? { label: label || value, value } : null;
		}
		const value = String(option ?? '').trim();
		return value ? { label: value, value } : null;
	}).filter(Boolean) as Array<{ label: string; value: string }>;
}

function normalizeConfigArrayItemFields(fields: unknown): Array<{ key: string; label: string; labelKey?: string; placeholder: string; placeholderKey?: string; type: string }> {
	if (!Array.isArray(fields)) return [];
	return fields.map((field) => {
		const raw = field && typeof field === 'object' ? field as Record<string, any> : {};
		const key = String(raw.key ?? raw.name ?? '').trim();
		if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) return null;
		const typeRaw = String(raw.type || 'text').trim().toLowerCase();
		const type = ['text', 'textarea', 'password', 'number', 'boolean', 'select', 'url', 'email', 'json', 'media'].includes(typeRaw) ? typeRaw : 'text';
		return {
			key,
			type,
			label: String(raw.label ?? raw.title ?? key).trim() || key,
			labelKey: String(raw.labelKey ?? raw.label_key ?? '').trim() || undefined,
			placeholder: String(raw.placeholder ?? '').trim(),
			placeholderKey: String(raw.placeholderKey ?? raw.placeholder_key ?? '').trim() || undefined,
		};
	}).filter(Boolean) as Array<{ key: string; label: string; labelKey?: string; placeholder: string; placeholderKey?: string; type: string }>;
}

export function normalizePluginConfigSchema(schema: unknown): { fields: PluginConfigField[] } {
	const raw = typeof schema === 'string'
		? (() => { try { return JSON.parse(schema); } catch { return {}; } })()
		: schema;
	const fieldsRaw = Array.isArray(raw)
		? raw
		: Array.isArray((raw as any)?.fields)
			? (raw as any).fields
			: [];
	const fields = fieldsRaw.map((field: any) => {
		const key = String(field?.key ?? field?.name ?? '').trim();
		if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) return null;
		const typeRaw = String(field?.type || 'text').trim().toLowerCase();
		const type = ['text', 'textarea', 'password', 'number', 'boolean', 'select', 'url', 'email', 'json', 'media'].includes(typeRaw) ? typeRaw : 'text';
		const label = String(field?.label ?? field?.title ?? key).trim() || key;
		const badgeRaw = field?.badgeDefinitions && typeof field.badgeDefinitions === 'object' ? field.badgeDefinitions : null;
		return {
			key,
			type,
			label,
			labelKey: String(field?.labelKey ?? field?.label_key ?? '').trim() || undefined,
			description: String(field?.description ?? field?.help ?? '').trim(),
			descriptionKey: String(field?.descriptionKey ?? field?.description_key ?? field?.helpKey ?? field?.help_key ?? '').trim() || undefined,
			placeholder: String(field?.placeholder ?? '').trim(),
			placeholderKey: String(field?.placeholderKey ?? field?.placeholder_key ?? '').trim() || undefined,
			required: Boolean(field?.required),
			defaultValue: field?.default ?? field?.defaultValue ?? '',
			options: normalizeConfigOptions(field?.options),
			arrayItemFields: normalizeConfigArrayItemFields(field?.arrayItemFields),
			...(badgeRaw ? {
				badgeDefinitions: {
					keyPrefix: String(badgeRaw.keyPrefix ?? '').trim(),
					keyField: String(badgeRaw.keyField ?? 'key').trim() || 'key',
					labelField: String(badgeRaw.labelField ?? 'name').trim() || 'name',
					descriptionField: String(badgeRaw.descriptionField ?? 'description').trim(),
					iconField: String(badgeRaw.iconField ?? 'icon').trim(),
					colorField: String(badgeRaw.colorField ?? 'color').trim(),
					defaultIcon: String(badgeRaw.defaultIcon ?? '').trim(),
					defaultColor: String(badgeRaw.defaultColor ?? '').trim(),
					defaultDescription: String(badgeRaw.defaultDescription ?? '').trim(),
					labelSuffix: String(badgeRaw.labelSuffix ?? '').trim(),
				}
			} : {}),
		};
	}).filter(Boolean) as PluginConfigField[];
	return { fields };
}

export function validatePluginConfig(schema: unknown, config: unknown, options: { requireRequired?: boolean } = {}): { ok: true; config: Record<string, any> } | { ok: false; error: string; field?: string } {
	const requireRequired = options.requireRequired !== false;
	const normalizedSchema = normalizePluginConfigSchema(schema);
	const input = config && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, any> : {};
	const output: Record<string, any> = {};
	for (const field of normalizedSchema.fields) {
		let value = input[field.key];
		if ((value === undefined || value === null || value === '') && field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') value = field.defaultValue;
		if (field.type === 'boolean') {
			value = value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
		} else if (field.type === 'number') {
			if (value === undefined || value === null || value === '') {
				value = '';
			} else {
				const n = Number(value);
				if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number`, field: field.key };
				value = n;
			}
		} else if (field.type === 'json') {
			if (typeof value === 'string') {
				if (!value.trim()) {
					value = field.defaultValue ?? null;
				} else {
					try {
						value = JSON.parse(value);
					} catch {
						return { ok: false, error: `${field.label} must be valid JSON`, field: field.key };
					}
				}
			}
			if (value === undefined) value = null;
		} else {
			value = String(value ?? '').trim();
		}
		if (field.required && requireRequired) {
			const missing = field.type === 'boolean' ? value !== true : value === '';
			if (missing) return { ok: false, error: `${field.label} is required`, field: field.key };
		}
		if (field.type === 'select' && value !== '' && field.options.length && !field.options.some((option) => option.value === value)) {
			return { ok: false, error: `${field.label} has an invalid value`, field: field.key };
		}
		output[field.key] = value;
	}
	for (const [key, value] of Object.entries(input)) {
		if (!(key in output) && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) output[key] = value;
	}
	return { ok: true, config: output };
}

export function normalizePluginManifest(raw: unknown): { ok: true; manifest: any } | { ok: false; error: string } {
	if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid plugin manifest' };
	const input = raw as Record<string, any>;
	const id = normalizePluginId(input.id || input.slug);
	const name = String(input.name || '').trim();
	if (!id) return { ok: false, error: 'Plugin id must be lowercase letters, numbers, and hyphens' };
	if (!name) return { ok: false, error: 'Plugin name is required' };
	const type = normalizePluginType(input.type);
	const configSchema = normalizePluginConfigSchema(input.configSchema ?? input.config_schema);
	const configResult = validatePluginConfig(configSchema, input.config || {}, { requireRequired: Boolean(input.enabled) });
	if (!configResult.ok) return configResult;
	return {
		ok: true,
		manifest: {
			id,
			slug: id,
			name,
			description: String(input.description || '').trim(),
			version: String(input.version || '1.0.0').trim() || '1.0.0',
			enabled: input.enabled === undefined ? 0 : (input.enabled ? 1 : 0),
			config: safeJsonString(configResult.config, {}),
			author: String(input.author || '').trim(),
			homepage: String(input.homepage || '').trim(),
			icon: String(input.icon || 'Puzzle').trim() || 'Puzzle',
			type,
			css: String(input.css || ''),
			html: String(input.html || ''),
			js: String(input.js || ''),
			head_html: String(input.headHtml ?? input.head_html ?? ''),
			block_types: safeJsonString(input.blockTypes ?? input.block_types, []),
			resource_types: safeJsonString(input.resourceTypes ?? input.resource_types, []),
			i18n: safeJsonString(input.i18n ?? input.i18nStrings, {}),
			config_schema: safeJsonString(configSchema, {}),
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
