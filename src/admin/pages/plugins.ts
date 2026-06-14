import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminPlugins(user: UserPayload, plugins: any[], locale = 'zh-CN'): string {
	const fallbackLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
	const cards = plugins.map((plugin) => {
		const id = escapeHtml(plugin.id);
		const type = escapeHtml(plugin.type || 'system');
		const enabled = Number(plugin.enabled || 0) === 1;
		const tags = (parseJson(plugin.tags, []) as any[]).map((tag) => String(tag)).filter(Boolean);
		const blockTypes = (parseJson(plugin.block_types, []) as any[]).map((tag) => String(tag)).filter(Boolean);
		const resourceTypes = (parseJson(plugin.resource_types, []) as any[]).map((tag) => String(tag)).filter(Boolean);
		const tagChips = [
			...blockTypes.map((tag) => `<span class="chip chip-block">${escapeHtml(tag)}</span>`),
			...resourceTypes.map((tag) => `<span class="chip chip-block">res:${escapeHtml(tag)}</span>`),
			...tags.map((tag) => `<span class="chip chip-tag">#${escapeHtml(tag)}</span>`)
		].join('');
		const pluginI18n = parseJson(plugin.i18n, {}) as Record<string, Record<string, string>>;
		const displayName = pluginI18n['plugin.name']?.[locale] || pluginI18n['plugin.name']?.[fallbackLocale] || String(plugin.name || '');
		const displayDesc = pluginI18n['plugin.description']?.[locale] || pluginI18n['plugin.description']?.[fallbackLocale] || String(plugin.description || '');
		const configSchema = parseJson(plugin.config_schema, {});
		const pluginConfig = parseJson(plugin.config, {});
		const configFields = Array.isArray((configSchema as any)?.fields) ? (configSchema as any).fields : (Array.isArray(configSchema) ? configSchema : []);
		const hasConfig = configFields.length > 0;
		return `<article class="ext-card${enabled ? '' : ' disabled'}" data-plugin-id="${id}" data-tags="${escapeHtml(JSON.stringify(tags))}" data-plugin-i18n="${escapeHtml(JSON.stringify(pluginI18n))}" data-plugin-name="${escapeHtml(plugin.name || '')}" data-plugin-description="${escapeHtml(plugin.description || '')}">
			<div class="ext-head">
				<div class="ext-icon">${escapeHtml(plugin.icon || 'Puzzle').slice(0, 2)}</div>
				<div class="ext-main">
					<div class="ext-title"><span data-plugin-title>${escapeHtml(displayName)}</span> <span class="ext-badge">${type}</span></div>
					<div class="ext-meta">v${escapeHtml(plugin.version || '1.0.0')} · <code>${id}</code>${plugin.author ? ` · ${escapeHtml(plugin.author)}` : ''}</div>
				</div>
				${adminButton('admin.plugins.share', '↗', { class: 'btn-sm icon-btn plugin-icon-action', 'data-action': 'share', 'data-id': id, 'data-i18n-title': 'admin.plugins.share', title: '分享', 'aria-label': '分享' })}
			</div>
			<p class="ext-desc" data-plugin-desc>${displayDesc ? escapeHtml(displayDesc) : tr('admin.common.none', '暂无数据')}</p>
			${tagChips ? `<div class="chips">${tagChips}</div>` : ''}
			<div id="plugin-update-${id}" class="plugin-update"></div>
			<div class="ext-actions">
				<div class="plugin-state-row">
					<label class="toggle"><input type="checkbox" ${enabled ? 'checked' : ''} data-action="toggle" data-id="${id}" data-enabled="${enabled ? '0' : '1'}"><span></span></label>
					<span class="ext-state" data-i18n="${enabled ? 'admin.plugins.enabled' : 'admin.plugins.disabled'}">${enabled ? '已启用' : '已停用'}</span>
				</div>
				<div class="plugin-action-grid">
					${adminButton('admin.plugins.config', '配置', { class: 'btn-sm btn-outline', 'data-action': 'config', 'data-id': id, 'data-name': displayName, 'data-schema': JSON.stringify(configSchema), 'data-config': JSON.stringify(pluginConfig), 'data-plugin-i18n': JSON.stringify(pluginI18n), 'data-has-config': hasConfig ? '1' : '0' })}
					<a class="btn btn-sm" href="/admin/plugins/${id}/editor" data-i18n="admin.plugins.editorShort">编辑</a>
					<a class="btn btn-sm btn-outline" href="/api/admin/plugins/${id}/manifest" target="_blank" data-i18n="admin.plugins.manifestShort">清单</a>
					${adminButton('admin.plugins.delete', '删除', { class: 'btn-sm', 'data-action': 'delete', 'data-id': id }, 'btn-danger')}
				</div>
			</div>
		</article>`;
	}).join('') || '<div class="notice" data-i18n="admin.plugins.empty">暂无插件。可以从 JSON、本地文件或 URL 安装。</div>';
	const allTags = [...new Set(plugins.flatMap((plugin) => (parseJson(plugin.tags, []) as any[]).map((tag) => String(tag))))].filter(Boolean).sort();
	return renderAdminLayout({
		title: '插件管理',
		subtitle: '安装、启停、分享和更新插件。插件运行时代码由 Worker SSR 注入并通过后台 API 管理。',
		titleKey: 'admin.plugins.title',
		subtitleKey: 'admin.plugins.subtitle',
		active: 'plugins',
		head: `<style>
.plugin-workbench.admin-workbench{grid-template-rows:auto auto minmax(0,1fr)}.plugin-workbench{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:12px}.plugin-scroll{min-height:0;overflow:auto}.filter-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.filter-lbl{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}.tag-filter{padding:4px 10px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);font-size:12px}.tag-filter.active,.tag-filter:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.1)}
.ext-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}.ext-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:10px;transition:.12s}.ext-card:hover{border-color:#484f58}.ext-card.disabled{opacity:.55}.ext-head{display:flex;gap:12px;align-items:flex-start}.ext-icon{width:42px;height:42px;border-radius:8px;background:rgba(88,166,255,.08);display:grid;place-items:center;color:var(--accent);font-weight:800;flex:0 0 auto}.ext-main{min-width:0;flex:1}.ext-title{font-weight:800}.ext-badge{font-size:10px;border:1px solid rgba(88,166,255,.25);color:var(--accent);border-radius:4px;padding:1px 6px;margin-left:5px}.ext-meta{font-size:12px;color:var(--muted);margin-top:3px}.plugin-icon-action{width:32px;height:32px;padding:0;flex:0 0 auto;border-radius:8px}.ext-desc{color:#aebad0;line-height:1.5;margin:0;min-height:40px}.chips{display:flex;gap:5px;flex-wrap:wrap}.chip{font-size:11px;padding:2px 7px;border-radius:4px}.chip-block{background:rgba(88,166,255,.1);color:var(--accent);border:1px solid rgba(88,166,255,.2);font-family:var(--mono)}.chip-tag{background:rgba(63,185,80,.1);color:var(--ok);border:1px solid rgba(63,185,80,.2)}.ext-actions{border-top:1px solid var(--border);padding-top:10px;margin-top:auto;display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center}.plugin-state-row{display:flex;align-items:center;gap:8px;min-width:84px}.plugin-action-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.plugin-action-grid .btn{min-width:0;width:100%;padding-left:8px;padding-right:8px}.ext-state{font-size:12px;color:var(--muted);line-height:1.1}.toggle{position:relative;width:36px;height:20px;display:inline-flex;flex:0 0 36px}.toggle input{opacity:0;width:0;height:0}.toggle span{position:absolute;inset:0;background:#30363d;border-radius:999px;transition:.2s}.toggle span:before{content:'';position:absolute;width:14px;height:14px;left:3px;top:3px;background:#8b949e;border-radius:50%;transition:.2s}.toggle input:checked+span{background:var(--ok)}.toggle input:checked+span:before{transform:translateX(16px);background:#fff}.plugin-update{display:none;font-size:12px;color:var(--warn);border:1px solid rgba(210,153,29,.25);background:rgba(210,153,29,.08);border-radius:6px;padding:7px 9px}@media(max-width:760px){.plugin-action-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ext-actions{grid-template-columns:1fr}.plugin-state-row{justify-content:space-between}}
.upload-zone{border:2px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center;cursor:pointer;color:var(--muted);margin-bottom:12px}.upload-zone:hover,.upload-zone.drag{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.04)}.install-preview{display:none;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin:10px 0}.install-error{display:none;color:var(--danger);font-size:13px;margin:8px 0}.share-field{display:flex;gap:8px;align-items:center;margin-top:8px}.share-field input{flex:1;min-width:0;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text)}
.config-array{display:grid;gap:8px}.config-array-row{display:grid;grid-template-columns:1fr 1.1fr 1.2fr 92px 1.4fr auto;gap:8px;align-items:end;border:1px solid var(--border);border-radius:10px;background:#0d141d;padding:9px}.config-array-row label{display:grid;gap:4px;min-width:0}.config-array-row label span{font-size:11px;color:var(--muted);font-weight:800}.config-array-row .input{min-width:0}.config-array-add{justify-self:start;margin-top:8px}.config-media-field{display:flex;gap:6px;min-width:0}.config-media-field .input{flex:1}.config-media-field .btn{flex:0 0 auto}.media-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;max-height:420px;overflow:auto}.media-pick-item{border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px;display:grid;gap:6px;text-align:left;color:var(--text);min-width:0}.media-pick-item:hover{border-color:var(--accent);background:rgba(88,166,255,.08)}.media-pick-thumb{height:88px;border-radius:6px;background:#090d14;display:grid;place-items:center;overflow:hidden}.media-pick-thumb img{width:100%;height:100%;object-fit:contain}.media-pick-name{font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.media-pick-upload{border:1px dashed var(--border);border-radius:8px;background:rgba(88,166,255,.03);height:132px;display:grid;place-items:center;color:var(--muted)}.media-pick-upload:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.08)}.media-upload-inner{display:grid;gap:6px;place-items:center}.media-upload-inner strong{font-size:26px;line-height:1}@media(max-width:980px){.config-array-row{grid-template-columns:1fr 1fr}.config-array-row .config-array-del{grid-column:1/-1}}
</style>`,
		user,
		content: `
<div class="plugin-workbench admin-workbench">
<div class="admin-toolbar toolbar-right">
	<span class="badge ml-auto">${plugins.length} <span data-i18n="admin.plugins.countSuffix">个插件</span></span>
	${adminButton('admin.plugins.checkUpdates', '检查更新', { id: 'check-updates' }, 'btn-outline')}
	${adminButton('admin.plugins.install', '安装插件', { onclick: "openModal('install-modal')" }, 'btn-primary')}
</div>
${allTags.length ? `<div class="filter-bar"><span class="filter-lbl">Tag</span>${adminButton('admin.plugins.allTags', '全部', { class: 'tag-filter active', 'data-tag': '' })}${allTags.map((tag) => adminButton('', tag, { class: 'tag-filter', 'data-tag': tag })).join('')}</div>` : ''}
<div class="plugin-scroll"><div class="ext-grid">${cards}</div></div>
</div>
<div class="modal-ov" id="install-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 data-i18n="admin.plugins.install">安装插件</h3><button class="modal-close" onclick="closeModal('install-modal')">×</button></div>
	<div class="toolbar mb-12">
		${adminButton('admin.plugins.themeTemplate', '主题模板', { class: 'btn-sm', 'data-template': 'theme' })}
		${adminButton('admin.plugins.widgetTemplate', '组件模板', { class: 'btn-sm', 'data-template': 'widget' })}
		${adminButton('admin.plugins.systemTemplate', '系统模板', { class: 'btn-sm', 'data-template': 'system' })}
		${adminButton('', '资源模板', { class: 'btn-sm', 'data-template': 'resource' })}
	</div>
	<div class="upload-zone" id="upload-zone" data-i18n="admin.plugins.uploadHint">拖拽或点击上传 plugin JSON</div><input id="file-input" type="file" accept=".json,application/json" class="hidden-file">
	${adminField('admin.plugins.manifestUrl', 'Manifest URL', `<div class="inline-field">${adminInput({ id: 'manifest-url', placeholder: 'https://example.com/plugin.json' })}${adminButton('admin.plugins.loadFromUrl', '从网址加载', { id: 'load-url' })}</div>`)}
	<div class="mt-12">${adminField('admin.plugins.manifestJson', 'Manifest JSON', adminTextarea('', { id: 'manifest-json', class: 'textarea-tall', placeholder: '{"id":"my-plugin","name":"My Plugin"}' }))}</div>
	<div class="install-preview" id="install-preview"></div><div class="install-error" id="install-error"></div>
	<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { onclick: "closeModal('install-modal')" }, 'btn-outline')}${adminButton('admin.plugins.install', '安装', { id: 'install-submit' }, 'btn-primary')}</div>
</div></div>
<div class="modal-ov" id="share-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 data-i18n="admin.plugins.shareTitle">分享插件</h3><button class="modal-close" onclick="closeModal('share-modal')">×</button></div>
	<p class="muted" data-i18n="admin.plugins.shareHint">复制安装链接给其他 ForumForge 站点安装，也可以下载 manifest 文件离线分发。</p>
	<div class="card mt-12"><div class="inline-field"><strong data-i18n="admin.plugins.shareNotify">安装回传</strong><span class="spacer"></span><label class="toggle"><input type="checkbox" id="share-notify"><span></span></label></div><p class="muted" data-i18n="admin.plugins.shareNotifyDesc">允许安装方通知本插件安装次数。</p></div>
	<div class="card mt-12"><strong data-i18n="admin.plugins.installLink">安装链接</strong><div class="share-field">${adminInput({ id: 'share-install-url', readonly: true })}${adminButton('admin.common.copyUrl', '复制', { 'data-copy': 'share-install-url' }, 'btn-primary')}</div></div>
	<div class="card mt-12"><strong data-i18n="admin.plugins.manifestLink">Manifest 链接</strong><div class="share-field">${adminInput({ id: 'share-manifest-url', readonly: true })}${adminButton('admin.common.copyUrl', '复制', { 'data-copy': 'share-manifest-url' }, 'btn-outline')}${adminButton('admin.plugins.download', '下载', { id: 'download-share' }, 'btn-outline')}</div></div>
	<div id="share-status" class="muted mt-12"></div>
</div></div>
<div class="modal-ov" id="config-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 id="config-title" data-i18n="admin.plugins.config">配置</h3><button class="modal-close" onclick="closeModal('config-modal')">×</button></div>
	<form id="plugin-config-form">
		<input type="hidden" name="id">
		<div id="plugin-config-fields" class="plugin-config-fields"></div>
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('config-modal')" }, 'btn-outline')}${adminButton('admin.plugins.saveConfig', '保存配置', { type: 'submit' }, 'btn-primary')}</div>
	</form>
</div></div>`,
		script: `
var templates={theme:{id:'my-theme',slug:'my-theme',name:'My Theme',type:'theme',icon:'T',version:'1.0.0',tags:['ui'],description:'Custom theme',css:':root {\\n  --accent: #58a6ff;\\n}'},widget:{id:'my-widget',slug:'my-widget',name:'My Widget',type:'widget',icon:'W',version:'1.0.0',tags:['ui'],blockTypes:['my-block'],description:'Custom HTML widget',html:'<template data-tag="my-block">\\n  <div class="my-block">{{slot}}</div>\\n</template>',css:'.my-block { padding: 12px; }',js:'ForumForge.registerPlugin({ id: "my-widget", onLoad(){ console.log("loaded"); } });'},system:{id:'my-system',slug:'my-system',name:'My System',type:'system',icon:'S',version:'1.0.0',tags:['system'],description:'Global hook',js:'ForumForge.registerPlugin({ id: "my-system", onLoad(){ console.log("loaded"); } });'},resource:{id:'my-resource',slug:'my-resource',name:'My Resource Plugin',type:'widget',icon:'R',version:'1.0.0',tags:['resource'],resourceTypes:['my-resource'],description:'Stores short Markdown links as plugin resources.',js:'ForumForge.registerPlugin({ id: "my-resource", resourceRenderers: { "my-resource": { hydrate(root){ console.log("hydrate my-resource", root); } } } });'}};
var currentShare={id:'',manifestUrl:''};
function parseDataJson(value,fallback){try{return JSON.parse(value||'');}catch(e){return fallback;}}
function escClient(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function pluginText(i18n,key,fallback){if(!key)return fallback||'';try{var dict=i18n&&i18n[key],loc=ADMIN_LOCALE||'zh-CN',base=String(loc||'').split('-')[0];if(dict)return dict[loc]||dict[base]||(base==='zh'?dict['zh-CN']:base==='en'?dict['en-US']:'')||dict['zh-CN']||dict['en-US']||fallback||key;}catch(e){}return fallback||key;}
function applyPluginCardI18n(){document.querySelectorAll('.ext-card[data-plugin-i18n]').forEach(function(card){var i18n=parseDataJson(card.dataset.pluginI18n,{}),title=card.querySelector('[data-plugin-title]'),desc=card.querySelector('[data-plugin-desc]');if(title)title.textContent=pluginText(i18n,'plugin.name',card.dataset.pluginName||'');if(desc)desc.textContent=pluginText(i18n,'plugin.description',card.dataset.pluginDescription||'')||t('admin.common.none','暂无数据');});}
function normalizeConfigFields(schema){var raw=Array.isArray(schema)?schema:(schema&&Array.isArray(schema.fields)?schema.fields:[]);return raw.map(function(f){var key=String((f&&f.key)||(f&&f.name)||'').trim();if(!key)return null;var type=String((f&&f.type)||'text').toLowerCase();if(['text','textarea','password','number','boolean','select','url','email','json','media'].indexOf(type)===-1)type='text';var opts=Array.isArray(f&&f.options)?f.options.map(function(o){if(o&&typeof o==='object')return {label:String(o.label||o.name||o.value||''),labelKey:String(o.labelKey||o.label_key||''),value:String(o.value||o.id||o.key||'')};var v=String(o||'');return {label:v,labelKey:'',value:v};}).filter(function(o){return o.value;}):[];return {key:key,type:type,label:String((f&&f.label)||(f&&f.title)||key),labelKey:String((f&&f.labelKey)||(f&&f.label_key)||''),description:String((f&&f.description)||(f&&f.help)||''),descriptionKey:String((f&&f.descriptionKey)||(f&&f.description_key)||(f&&f.helpKey)||(f&&f.help_key)||''),placeholder:String((f&&f.placeholder)||''),placeholderKey:String((f&&f.placeholderKey)||(f&&f.placeholder_key)||''),required:!!(f&&f.required),defaultValue:f&&(f.default!==undefined?f.default:f.defaultValue),options:opts,arrayItemFields:Array.isArray(f&&f.arrayItemFields)?f.arrayItemFields:[]};}).filter(Boolean);}
function configArrayRow(field,item){item=item||{};var i18n=field.i18n||{},cols=field.arrayItemFields.length?field.arrayItemFields:[{key:'key',label:'Key'},{key:'name',label:'Name'},{key:'icon',label:'Image'},{key:'color',label:'Color'},{key:'description',label:'Tooltip'}];return '<div class="config-array-row">'+cols.map(function(c){var type=String(c.type||'text').toLowerCase(),key=String(c.key||''),label=pluginText(i18n,c.labelKey||c.label_key,c.label||key),ph=pluginText(i18n,c.placeholderKey||c.placeholder_key,c.placeholder||'');var input='<input class="input" data-array-prop="'+escClient(key)+'" value="'+escClient(item[key]||'')+'" placeholder="'+escClient(ph)+'">';if(type==='media')input='<div class="config-media-field">'+input+'<button class="btn btn-sm config-media-pick" type="button">'+escClient(t('admin.media.select','选择'))+'</button></div>';return '<label><span>'+escClient(label)+'</span>'+input+'</label>';}).join('')+'<button class="btn btn-sm btn-danger config-array-del" type="button">'+escClient(t('common.delete','删除'))+'</button></div>';}
function renderConfigField(field,config,i18n){field.i18n=i18n||{};var value=config[field.key];if((value===undefined||value===null||value==='')&&field.defaultValue!==undefined)value=field.defaultValue;var req=field.required?' required':'';var labelText=pluginText(i18n,field.labelKey,field.label);var descText=pluginText(i18n,field.descriptionKey,field.description);var phText=pluginText(i18n,field.placeholderKey,field.placeholder);var label='<label>'+escClient(labelText)+(field.required?' <span class="danger">*</span>':'')+'</label>';var hint=descText?'<p class="field-hint">'+escClient(descText)+'</p>':'';var ph=phText?' placeholder="'+escClient(phText)+'"':'';var control='';if(field.type==='textarea'){control='<textarea class="textarea" name="'+escClient(field.key)+'"'+req+ph+'>'+escClient(value||'')+'</textarea>';}else if(field.type==='json'&&Array.isArray(value)){control='<div class="config-array" data-config-array="'+escClient(field.key)+'" data-array-fields="'+escClient(JSON.stringify(field.arrayItemFields||[]))+'" data-array-i18n="'+escClient(JSON.stringify(i18n||{}))+'">'+value.map(function(item){return configArrayRow(field,item);}).join('')+'</div><button class="btn btn-sm config-array-add" type="button" data-array-target="'+escClient(field.key)+'">'+escClient(t('common.add','新增'))+'</button>';}else if(field.type==='json'){var jsonValue=typeof value==='string'?value:JSON.stringify(value===undefined?null:value,null,2);control='<textarea class="textarea textarea-tall" data-config-json="1" name="'+escClient(field.key)+'"'+req+ph+'>'+escClient(jsonValue||'')+'</textarea>';}else if(field.type==='boolean'){control='<label class="toggle-row"><input type="checkbox" name="'+escClient(field.key)+'" '+(value===true||value==='true'||value===1||value==='1'?'checked':'')+'><span>'+escClient(phText||labelText)+'</span></label>';}else if(field.type==='select'){control='<select class="select" name="'+escClient(field.key)+'"'+req+'><option value="">'+escClient(t('admin.plugins.selectPlaceholder','请选择'))+'</option>'+field.options.map(function(o){var optionLabel=pluginText(i18n,o.labelKey,o.label||o.value);return '<option value="'+escClient(o.value)+'" '+(String(value||'')===o.value?'selected':'')+'>'+escClient(optionLabel)+'</option>';}).join('')+'</select>';}else if(field.type==='media'){control='<div class="config-media-field"><input class="input" type="text" name="'+escClient(field.key)+'" value="'+escClient(value||'')+'"'+req+ph+'><button class="btn btn-sm config-media-pick" type="button">'+escClient(t('admin.media.select','选择'))+'</button></div>';}else{var inputType=field.type==='password'?'password':field.type==='number'?'number':field.type==='url'?'url':field.type==='email'?'email':'text';control='<input class="input" type="'+inputType+'" name="'+escClient(field.key)+'" value="'+escClient(value||'')+'"'+req+ph+'>'; }return '<div class="field">'+label+control+hint+'</div>';}
function openPluginConfig(btn){var id=btn.dataset.id,schema=parseDataJson(btn.dataset.schema,{}),config=parseDataJson(btn.dataset.config,{}),i18n=parseDataJson(btn.dataset.pluginI18n,{}),fields=normalizeConfigFields(schema),box=document.getElementById('plugin-config-fields'),form=document.getElementById('plugin-config-form');form.querySelector('[name="id"]').value=id;document.getElementById('config-title').textContent=(btn.dataset.name||id)+' · '+t('admin.plugins.config','配置');if(!fields.length){box.innerHTML='<div class="notice">'+escClient(t('admin.plugins.noConfig','这个插件没有声明可配置项。'))+'</div>';}else{box.innerHTML=fields.map(function(field){return renderConfigField(field,config,i18n);}).join('');}openModal('config-modal');}
function readPluginConfigForm(){var form=document.getElementById('plugin-config-form'),body={};form.querySelectorAll('[name]').forEach(function(el){if(el.name==='id')return;if(el.type==='checkbox')body[el.name]=el.checked;else if(el.type==='number')body[el.name]=el.value===''?'':Number(el.value);else if(el.dataset.configJson==='1'){try{body[el.name]=el.value.trim()?JSON.parse(el.value):null;}catch(e){throw new Error(el.name+': JSON '+e.message);}}else body[el.name]=el.value;});form.querySelectorAll('[data-config-array]').forEach(function(box){body[box.dataset.configArray]=Array.from(box.querySelectorAll('.config-array-row')).map(function(row){var item={};row.querySelectorAll('[data-array-prop]').forEach(function(inp){item[inp.dataset.arrayProp]=inp.value.trim();});return item;}).filter(function(item){return item.key||item.name;});});return body;}
if(window.ForumForgePluginUI){window.ForumForgePluginUI.config={normalizeFields:normalizeConfigFields,renderField:renderConfigField,renderFields:function(schema,config,i18n){return normalizeConfigFields(schema).map(function(field){return renderConfigField(field,config||{},i18n||{});}).join('');},readForm:function(form){var old=document.getElementById('plugin-config-form');if(form&&form.id!=='plugin-config-form'){var body={};form.querySelectorAll('[name]').forEach(function(el){if(el.type==='checkbox')body[el.name]=el.checked;else if(el.type==='number')body[el.name]=el.value===''?'':Number(el.value);else if(el.dataset.configJson==='1'){body[el.name]=el.value.trim()?JSON.parse(el.value):null;}else body[el.name]=el.value;});form.querySelectorAll('[data-config-array]').forEach(function(box){body[box.dataset.configArray]=Array.from(box.querySelectorAll('.config-array-row')).map(function(row){var item={};row.querySelectorAll('[data-array-prop]').forEach(function(inp){item[inp.dataset.arrayProp]=inp.value.trim();});return item;}).filter(function(item){return item.key||item.name;});});return body;}return readPluginConfigForm();}};}
function loadManifestText(text){var err=document.getElementById('install-error'),prev=document.getElementById('install-preview');err.style.display='none';try{var d=JSON.parse(text);document.getElementById('manifest-json').value=JSON.stringify(d,null,2);prev.innerHTML='<strong>'+escClient(d.name||d.id)+'</strong><div class="muted">v'+escClient(d.version||'1.0.0')+' · '+escClient(d.id||d.slug||'')+'</div><p>'+escClient(d.description||'')+'</p>';prev.style.display='block';}catch(e){err.textContent='JSON: '+e.message;err.style.display='block';prev.style.display='none';}}
document.querySelectorAll('[data-template]').forEach(function(btn){btn.addEventListener('click',function(){loadManifestText(JSON.stringify(templates[btn.dataset.template]||{},null,2));});});
document.getElementById('upload-zone').addEventListener('click',function(){document.getElementById('file-input').click();});
document.getElementById('upload-zone').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
document.getElementById('upload-zone').addEventListener('dragleave',function(){this.classList.remove('drag');});
document.getElementById('upload-zone').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag');var f=e.dataTransfer.files[0];if(f){var r=new FileReader();r.onload=function(ev){loadManifestText(ev.target.result);};r.readAsText(f,'utf-8');}});
document.getElementById('file-input').addEventListener('change',function(e){var f=e.target.files[0];if(f){var r=new FileReader();r.onload=function(ev){loadManifestText(ev.target.result);};r.readAsText(f,'utf-8');this.value='';}});
document.getElementById('load-url').addEventListener('click',async function(){var btn=this,url=document.getElementById('manifest-url').value.trim();if(!url)return;try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/plugins/fetch-manifest',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({url:url})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.loadFailed','加载失败'));loadManifestText(JSON.stringify(data.manifest,null,2));done();});}catch(e){showToast(e.message||String(e),'err');}});
document.getElementById('install-submit').addEventListener('click',async function(){var btn=this;try{await runButton(btn,t('common.processing','处理中...'),async function(){var manifest=JSON.parse(document.getElementById('manifest-json').value);var res=await fetch('/api/admin/plugins',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(manifest)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.installFailed','安装失败'));location.reload();});}catch(e){showToast(e.message||String(e),'err');}});
document.getElementById('check-updates').addEventListener('click',async function(){var btn=this;try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/plugins/check-updates',{method:'POST',headers:nonceHeaders(true),body:'{}'});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.checkFailed','检查失败'));var found=0;(data.updates||[]).forEach(function(u){var box=document.getElementById('plugin-update-'+u.id);if(!box)return;if(u.hasUpdate){found++;box.style.display='block';box.innerHTML=escClient(t('admin.plugins.updateAvailable','发现新版本'))+' '+escClient(u.remoteVersion)+' <button class="btn btn-sm" data-action="update" data-id="'+escClient(u.id)+'">'+escClient(t('admin.plugins.update','更新'))+'</button>';}else if(u.error){box.style.display='block';box.textContent=t('admin.plugins.checkFailed','检查失败')+'：'+u.error;}});done();if(!found)showToast(t('admin.plugins.noUpdates','没有可用更新'));});}catch(e){showToast(e.message||String(e),'err');}});
document.querySelectorAll('.tag-filter').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.tag-filter').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');var tag=btn.dataset.tag;document.querySelectorAll('.ext-card').forEach(function(card){var tags=[];try{tags=JSON.parse(card.dataset.tags||'[]');}catch(e){}card.style.display=!tag||tags.indexOf(tag)!==-1?'':'none';});});});
document.addEventListener('change',async function(e){var cb=e.target.closest('input[data-action="toggle"]');if(!cb)return;try{var id=cb.dataset.id;var res=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/toggle',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({enabled:cb.checked})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.plugins.actionFailed','操作失败'));location.reload();}catch(err){showToast(err.message||String(err),'err');cb.checked=!cb.checked;}});
document.getElementById('plugin-config-form').addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]'),id=form.querySelector('[name="id"]').value;try{await runButton(btn,t('common.processing','处理中...'),async function(){var r=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/config',{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({config:readPluginConfigForm()})});var d=await r.json();if(!r.ok)throw new Error(d.error||t('admin.plugins.saveFailed','保存失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('plugin-config-form').addEventListener('click',function(e){var pick=e.target.closest('.config-media-pick');if(pick){var input=pick.closest('.config-media-field')?.querySelector('input')||null;if(input&&window.ForumForgePluginUI){window.ForumForgePluginUI.bindMediaInput(input,{includePosts:false,accept:'image/*'}).catch(function(){});}return;}var del=e.target.closest('.config-array-del');if(del){del.closest('.config-array-row')?.remove();return;}var add=e.target.closest('.config-array-add');if(add){var box=document.querySelector('[data-config-array="'+add.dataset.arrayTarget+'"]');if(!box)return;var fields=parseDataJson(box.dataset.arrayFields,[]),i18n=parseDataJson(box.dataset.arrayI18n,{});box.insertAdjacentHTML('beforeend',configArrayRow({arrayItemFields:fields,i18n:i18n},{}));}});
document.addEventListener('click',async function(e){var btn=e.target.closest('[data-action]');if(!btn)return;var id=btn.dataset.id;try{if(btn.dataset.action==='config'){openPluginConfig(btn);return;}if(btn.dataset.action==='delete'){if(!confirm(t('admin.plugins.deleteConfirmPrefix','删除插件')+' '+id+' ?'))return;await runButton(btn,t('common.deleting','删除中...'),async function(){var r=await fetch('/api/admin/plugins/'+encodeURIComponent(id),{method:'DELETE',headers:nonceHeaders()});var d=await r.json();if(!r.ok)throw new Error(d.error||t('admin.plugins.deleteFailed','删除失败'));location.reload();});}if(btn.dataset.action==='share'){await runButton(btn,t('common.processing','处理中...'),async function(done){currentShare.id=id;openModal('share-modal');var r2=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/share');var d2=await r2.json();if(!r2.ok)throw new Error(d2.error||t('admin.plugins.shareFailed','分享失败'));currentShare.manifestUrl=d2.manifestUrl;document.getElementById('share-install-url').value=d2.installUrl||'';document.getElementById('share-manifest-url').value=d2.manifestUrl||'';document.getElementById('share-notify').checked=!!d2.shareNotify;done();});}if(btn.dataset.action==='update'){await runButton(btn,t('common.processing','处理中...'),async function(){var r3=await fetch('/api/admin/plugins/'+encodeURIComponent(id)+'/update-from-url',{method:'POST',headers:nonceHeaders(true),body:'{}'});var d3=await r3.json();if(!r3.ok)throw new Error(d3.error||t('admin.plugins.updateFailed','更新失败'));location.reload();});}}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('share-notify').addEventListener('change',async function(){if(!currentShare.id)return;var r=await fetch('/api/admin/plugins/'+encodeURIComponent(currentShare.id)+'/share-notify',{method:'PUT',headers:nonceHeaders(true),body:'{}'});var d=await r.json();if(!r.ok){showToast(d.error||t('admin.plugins.saveFailed','保存失败'),'err');return;}this.checked=!!d.shareNotify;showToast(t('admin.editor.saved','已保存'));});
document.querySelectorAll('[data-copy]').forEach(function(btn){btn.addEventListener('click',function(){var el=document.getElementById(btn.dataset.copy);navigator.clipboard?.writeText(el.value);showToast(t('admin.common.copied','已复制 URL'));});});
document.getElementById('download-share').addEventListener('click',async function(){if(!currentShare.id)return;var r=await fetch('/api/admin/plugins/'+encodeURIComponent(currentShare.id)+'/manifest');var manifest=await r.json();var blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(manifest.slug||manifest.id||'plugin')+'.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0);});
var installParam=new URLSearchParams(location.search).get('install');if(installParam){openModal('install-modal');document.getElementById('manifest-url').value=installParam;document.getElementById('load-url').click();}
window.addEventListener('forumforge:localechange',applyPluginCardI18n);
applyPluginCardI18n();
`
	});
}

export function renderPluginEditor(user: UserPayload, plugin: any, locale = 'zh-CN'): string {
	const pluginId = String(plugin.id || plugin.slug || '');
	const safePluginId = escapeHtml(pluginId);
	const activeTheme = DEFAULT_THEME;
	const pluginI18n = parseJson(plugin.i18n, {}) as Record<string, any>;
	const fallbackLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
	const displayName = pluginI18n['plugin.name']?.[locale] || pluginI18n['plugin.name']?.[fallbackLocale] || String(plugin.name || '');
	const displayDesc = pluginI18n['plugin.description']?.[locale] || pluginI18n['plugin.description']?.[fallbackLocale] || String(plugin.description || '');
	const code = {
		css: String(plugin.css || ''),
		html: String(plugin.html || ''),
		headHtml: String(plugin.head_html || ''),
		js: String(plugin.js || ''),
		blockTypes: JSON.stringify(parseJson(plugin.block_types, []), null, 2),
		resourceTypes: JSON.stringify(parseJson(plugin.resource_types, []), null, 2),
		configSchema: JSON.stringify(parseJson(plugin.config_schema, {}), null, 2),
		permissions: JSON.stringify(parseJson(plugin.permissions, []), null, 2),
		tags: JSON.stringify(parseJson(plugin.tags, []), null, 2),
		config: JSON.stringify(parseJson(plugin.config, {}), null, 2),
	};
	const typeOptions = ['system', 'theme', 'widget', 'integration']
		.map((type) => `<option value="${type}" ${String(plugin.type || 'system') === type ? 'selected' : ''}>${type}</option>`)
		.join('');
return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(displayName || pluginId)} - 插件编辑器</title>
${FAVICON_LINKS}
<script src="${ACE}/ace.min.js"></script><script src="${ACE}/ext-language_tools.min.js"></script><script src="${ACE}/ext-searchbox.min.js"></script><script src="${ACE}/ext-beautify.min.js"></script><script src="${ACE}/theme-${activeTheme}.min.js"></script>
<style>
:root{color-scheme:dark;--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--danger:#f85149;--ok:#3fb950;--warn:#d2991d;--radius:8px;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;--mono:"Cascadia Code","Consolas",monospace;--z-base:0;--z-header:1000;--z-dropdown:1100;--z-modal:2000;--z-toast:2200}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--font);font-size:14px;color:var(--text);background:var(--bg);height:100vh;overflow:hidden;display:flex;flex-direction:column}a{color:var(--accent);text-decoration:none}input,select,textarea{font:inherit;color:inherit}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}.ace_editor{font-family:var(--mono)!important;font-size:13px!important}
.topbar{position:relative;z-index:var(--z-header);isolation:isolate;height:48px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:0 14px;flex:0 0 auto;min-width:0}.topbar strong{color:var(--accent);min-width:0;max-width:28vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.t-right{margin-left:auto;display:flex;gap:7px;align-items:center;flex:0 0 auto;min-width:max-content}.muted{color:var(--muted);white-space:nowrap}.enable-row{position:relative;min-height:40px;border:1px solid var(--border);border-radius:12px;background:#0d141d;display:flex;gap:9px;align-items:center;margin-top:8px;padding:8px 10px;color:#d7dee9;font-weight:750}.enable-row input{position:absolute;opacity:0;pointer-events:none}.enable-row:before{content:'';width:34px;height:20px;border-radius:999px;background:#30363d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03);transition:.16s}.enable-row:after{content:'';position:absolute;width:14px;height:14px;left:13px;border-radius:50%;background:#8b949e;transition:.16s}.enable-row:has(input:checked):before{background:linear-gradient(90deg,var(--accent),#3fb950)}.enable-row:has(input:checked):after{transform:translateX(14px);background:#fff}.lang-picker{position:relative;z-index:var(--z-dropdown);flex:0 0 auto}.lang-btn{height:32px;min-width:118px;display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:999px;background:#0d1320;color:var(--text);padding:0 10px;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap;flex:0 0 auto}.lang-btn [data-language-name]{white-space:nowrap}.lang-btn:hover{border-color:var(--accent);background:#111b2a}.lang-btn>svg{opacity:.55;flex:0 0 auto}.lang-flag svg{width:20px;height:14px;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}.lang-menu{position:absolute;right:0;top:calc(100% + 7px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:0 22px 70px rgba(0,0,0,.55);display:none;max-height:360px;overflow:auto;z-index:var(--z-dropdown)}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border-radius:8px;cursor:pointer;color:#d8dee9}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.1);color:var(--accent)}.lang-menu li small{color:var(--muted);font-size:11px}.fi{line-height:1}.ide-body{position:relative;z-index:var(--z-base);flex:1;display:flex;overflow:hidden;min-height:0;background:var(--bg)}.ide-sb{width:300px;background:linear-gradient(180deg,rgba(22,27,34,.98),rgba(13,17,23,.98));border-right:1px solid var(--border);overflow:auto;padding:14px;flex:0 0 auto}.ide-sb h3{font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:.06em;margin:0 0 12px}.fg{margin-bottom:11px}.fg label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted);letter-spacing:.04em;margin-bottom:5px}.fg input,.fg select,.fg textarea,.i18n-locale-input,.i18n-table input,.sel-theme{width:100%;min-height:34px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);background:#0b1017;color:var(--text);outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.02);transition:border-color .14s,background-color .14s,box-shadow .14s}.fg select,.sel-theme{appearance:none;-webkit-appearance:none;padding-right:30px;background-color:#0b1017;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%239fb4cc' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px 14px}.fg select:hover,.sel-theme:hover{border-color:#3a4656;background-color:#0d141d;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%23c9d8ea' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px 14px}.t-right .sel-theme{width:132px;flex:0 0 132px}.fg textarea{min-height:82px;resize:vertical}.fg input:focus,.fg select:focus,.fg textarea:focus,.i18n-locale-input:focus,.i18n-table input:focus,.sel-theme:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.12);background-color:#0d141d}.ide-main{flex:1;min-width:0;display:flex;flex-direction:column}.ed-tabs{height:44px;background:#111821;border-bottom:1px solid var(--border);display:flex;align-items:center;flex:0 0 auto;overflow-x:auto;padding:0 10px;gap:4px}.ed-tab{height:32px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;font-size:12px;font-weight:750;color:#a8b8cc;border:1px solid transparent;border-radius:8px;background:none;cursor:pointer;white-space:nowrap}.ed-tab:hover{color:var(--text);background:rgba(88,166,255,.06);border-color:rgba(88,166,255,.14)}.ed-tab.active{color:#fff;border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.14);box-shadow:inset 0 -2px 0 var(--accent)}.ed-tabs-right{margin-left:auto;display:flex;gap:6px;align-items:center;padding-left:8px;background:#111821}.ed-wrap{flex:1;position:relative;overflow:hidden;min-height:0}.ed-panel{display:none;position:absolute;inset:0}.ed-panel.active{display:block}.ed-panel-ace{position:absolute;inset:0}.i18n-panel{position:absolute;inset:0;overflow:auto;padding:16px;background:var(--bg)}.i18n-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:10px}.i18n-localebar{display:flex;gap:8px;align-items:center;margin-bottom:12px}.i18n-locale-input{width:120px}.i18n-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}.i18n-table th,.i18n-table td{border-bottom:1px solid var(--border);padding:8px;text-align:left}.i18n-table th{font-size:11px;text-transform:uppercase;color:var(--muted);background:#111821}.i18n-table input{font-size:13px}.btn{padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;background:transparent;color:var(--text);text-decoration:none}.btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.05)}.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn-primary:hover{color:#fff;opacity:.86}.btn-ok{background:var(--ok);border-color:var(--ok);color:#fff}.btn-danger{background:var(--danger);border-color:var(--danger);color:#fff}.btn-sm{padding:4px 9px;font-size:12px}.sep{border:0;border-top:1px solid var(--border);margin:12px 0}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:999px;font-size:13px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:var(--z-toast)}.toast.show{opacity:1}.toast-ok{background:#122d1f;border:1px solid #1a3d2a;color:var(--ok)}.toast-err{background:#2d1216;border:1px solid #5a1e27;color:var(--danger)}
</style></head><body>
<div class="topbar"><a class="btn btn-sm" href="/admin/plugins" data-i18n="admin.editor.backList">返回列表</a><strong>${escapeHtml(displayName || pluginId)}</strong><span class="muted" data-i18n="admin.editor.titleSuffix">插件编辑器</span><div class="t-right"><div class="lang-picker" data-language-picker><button class="lang-btn" type="button" data-language-button aria-label="Language"><span class="lang-flag" data-language-flag>🇨🇳</span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button><ul class="lang-menu" data-language-menu></ul></div>${adminSelect('', { id: 'sel-theme', class: 'sel-theme' })}<a class="btn btn-sm" href="/api/admin/plugins/${safePluginId}/manifest" target="_blank" data-i18n="admin.editor.manifest">Manifest</a></div></div>
<div class="ide-body">
	<aside class="ide-sb">
		<h3 data-i18n="admin.editor.basic">基础信息</h3>
		<div class="fg"><label data-i18n="admin.editor.name">名称</label>${adminInput({ id: 'f-name', value: displayName })}</div>
		<div class="fg"><label data-i18n="admin.editor.idSlug">ID / Slug</label>${adminInput({ id: 'f-slug', value: plugin.slug || pluginId })}</div>
		<div class="fg"><label data-i18n="admin.editor.version">版本</label>${adminInput({ id: 'f-version', value: plugin.version || '1.0.0' })}</div>
		<div class="fg"><label data-i18n="admin.editor.type">类型</label>${adminSelect(typeOptions, { id: 'f-type' })}</div>
		<div class="fg"><label data-i18n="admin.editor.author">作者</label>${adminInput({ id: 'f-author', value: plugin.author || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.homepage">主页</label>${adminInput({ id: 'f-homepage', value: plugin.homepage || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.icon">图标</label>${adminInput({ id: 'f-icon', value: plugin.icon || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.sourceUrl">Source URL</label>${adminInput({ id: 'f-source-url', value: plugin.source_url || '' })}</div>
		<div class="fg"><label data-i18n="admin.editor.description">描述</label>${adminTextarea(displayDesc, { id: 'f-description' })}</div>
		<label class="enable-row"><input type="checkbox" id="f-enabled" ${Number(plugin.enabled || 0) === 1 ? 'checked' : ''}> <span data-i18n="admin.editor.enablePlugin">启用插件</span></label>
	</aside>
	<main class="ide-main">
		<div class="ed-tabs">
			<button class="ed-tab active" data-tab="css">CSS<span id="dot-css"></span></button>
			<button class="ed-tab" data-tab="html">HTML<span id="dot-html"></span></button>
			<button class="ed-tab" data-tab="js"><span data-i18n="admin.editor.tabJs">JavaScript</span><span id="dot-js"></span></button>
			<button class="ed-tab" data-tab="head"><span data-i18n="admin.editor.tabHeadHtml">Head HTML</span><span id="dot-head"></span></button>
			<button class="ed-tab" data-tab="blockTypes"><span data-i18n="admin.editor.tabBlockTypes">Block Types</span></button>
			<button class="ed-tab" data-tab="resourceTypes"><span>Resource Types</span></button>
			<button class="ed-tab" data-tab="i18n"><span data-i18n="admin.editor.tabI18n">i18n</span></button>
			<button class="ed-tab" data-tab="schema"><span data-i18n="admin.editor.tabConfigSchema">Config Schema</span></button>
			<button class="ed-tab" data-tab="permissions"><span data-i18n="admin.editor.tabPermissions">Permissions</span></button>
			<button class="ed-tab" data-tab="tags"><span data-i18n="admin.editor.tabTags">Tags</span></button>
			<button class="ed-tab" data-tab="config"><span data-i18n="admin.editor.tabConfig">Config</span></button>
			<div class="ed-tabs-right"><button class="btn btn-sm" onclick="formatActive()" data-i18n="admin.editor.format">格式化</button><button class="btn btn-ok btn-sm" onclick="saveAll()" data-i18n="admin.editor.save">保存</button></div>
		</div>
		<div class="ed-wrap">
			<div class="ed-panel active" id="panel-css"><div class="ed-panel-ace" id="ace-css"></div></div>
			<div class="ed-panel" id="panel-html"><div class="ed-panel-ace" id="ace-html"></div></div>
			<div class="ed-panel" id="panel-head"><div class="ed-panel-ace" id="ace-head"></div></div>
			<div class="ed-panel" id="panel-js"><div class="ed-panel-ace" id="ace-js"></div></div>
			<div class="ed-panel" id="panel-blockTypes"><div class="ed-panel-ace" id="ace-blockTypes"></div></div>
			<div class="ed-panel" id="panel-resourceTypes"><div class="ed-panel-ace" id="ace-resourceTypes"></div></div>
			<div class="ed-panel" id="panel-i18n">
				<div class="i18n-panel">
					<div class="i18n-toolbar">
						<div class="muted" data-i18n="admin.editor.i18nHint">插件自己的多语言文案会写入 manifest，分享给别人后仍可使用。</div>
						<button class="btn btn-primary btn-sm" type="button" onclick="addI18nRow()" data-i18n="admin.editor.addI18nKey">添加 Key</button>
					</div>
					<div class="i18n-localebar">
						<input class="i18n-locale-input" id="plugin-i18n-locale" placeholder="ja-JP" data-i18n-placeholder="admin.editor.addLocalePlaceholder">
						<button class="btn btn-sm" type="button" onclick="addI18nLocale()" data-i18n="admin.editor.addLocale">添加语言</button>
					</div>
					<table class="i18n-table">
						<thead id="plugin-i18n-head"></thead>
						<tbody id="plugin-i18n-body"></tbody>
					</table>
				</div>
			</div>
			<div class="ed-panel" id="panel-schema"><div class="ed-panel-ace" id="ace-schema"></div></div>
			<div class="ed-panel" id="panel-permissions"><div class="ed-panel-ace" id="ace-permissions"></div></div>
			<div class="ed-panel" id="panel-tags"><div class="ed-panel-ace" id="ace-tags"></div></div>
			<div class="ed-panel" id="panel-config"><div class="ed-panel-ace" id="ace-config"></div></div>
		</div>
	</main>
</div><div class="toast" id="toast"></div>
<script>
ace.config.set('basePath','${ACE}');
var ACE_THEMES=${jsonScript(ACE_THEMES)}, ACTIVE_THEME=localStorage.getItem('ff.ace.theme')||'${activeTheme}', activeTab='css', changed={};
function cookieLocale(){var m=document.cookie.match(/(?:^|; )ff_locale=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
var LOCALE_COUNTRY={'zh-CN':'cn','zh':'cn','zh-TW':'tw','en-US':'us','en':'us','ja-JP':'jp','ja':'jp','ko-KR':'kr','ko':'kr','fr-FR':'fr','fr':'fr','de-DE':'de','de':'de','es-ES':'es','es':'es','pt-BR':'br','pt':'br','ru-RU':'ru','ru':'ru','vi-VN':'vn','vi':'vn','id-ID':'id','id':'id','th-TH':'th','th':'th','ar-SA':'sa','ar':'sa'};
function localeCountry(code){return LOCALE_COUNTRY[code]||LOCALE_COUNTRY[String(code||'').split('-')[0]]||String(code||'').toLowerCase();}
var COUNTRY_FLAG={cn:'🇨🇳',tw:'🇹🇼',us:'🇺🇸',jp:'🇯🇵',kr:'🇰🇷',fr:'🇫🇷',de:'🇩🇪',es:'🇪🇸',br:'🇧🇷',ru:'🇷🇺',vn:'🇻🇳',id:'🇮🇩',th:'🇹🇭',sa:'🇸🇦'};
var FLAG_SVG={
 cn:'<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#de2910"/><path fill="#ffde00" d="M5.1 2.1l.5 1.5h1.6l-1.3.9.5 1.5-1.3-.9-1.3.9.5-1.5-1.3-.9h1.6zM9.6 2.2l.3.6.7.1-.5.5.1.7-.6-.3-.6.3.1-.7-.5-.5.7-.1zM11.1 4.7l.2.6.7.1-.5.4.1.7-.6-.3-.6.3.1-.7-.5-.4.7-.1zM11 7.7l.2.6.7.1-.5.4.1.7-.6-.3-.6.3.1-.7-.5-.4.7-.1zM9.5 10.2l.3.6.7.1-.5.5.1.7-.6-.3-.6.3.1-.7-.5-.5.7-.1z"/></svg>',
 us:'<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#fff"/><path fill="#b22234" d="M0 0h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24V16H0z"/><rect width="10.5" height="8.6" rx="2" fill="#3c3b6e"/><path fill="#fff" d="M1.2 1.2h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM2.2 2.6h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM1.2 4h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM2.2 5.4h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7z"/></svg>'
};
function flagEmoji(code){var country=localeCountry(code);return FLAG_SVG[country]||COUNTRY_FLAG[country]||'🌐';}
function langCode(lang){return lang.code||lang.locale||'zh-CN';}
function langName(lang){return lang.native_name||lang.name||langCode(lang);}
function normalizeClientLocale(value){var raw=String(value||'').trim().replace('_','-'),low=raw.toLowerCase();if(!raw)return '';if(low==='zh'||low==='zh-cn'||low==='zh-hans')return 'zh-CN';if(low==='en'||low==='en-us')return 'en-US';var parts=raw.split('-');return parts[1]?parts[0].toLowerCase()+'-'+parts[1].toUpperCase():parts[0].toLowerCase();}
function pickBrowserLocale(langs){var supported=(langs&&langs.length?langs:[{code:'en-US'},{code:'zh-CN'}]).map(langCode);var nav=((navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language])||[]).map(normalizeClientLocale);for(var i=0;i<nav.length;i++){var item=nav[i];var hit=supported.find(function(code){var normalized=normalizeClientLocale(code);return normalized===item||normalized.split('-')[0]===item.split('-')[0];});if(hit)return hit;}return supported.indexOf('en-US')>=0?'en-US':(supported[0]||'en-US');}
var ADMIN_I18N={}, ADMIN_LANGUAGES=[], ADMIN_LOCALE=localStorage.getItem('ff.locale')||cookieLocale()||pickBrowserLocale()||document.documentElement.lang||'en-US', PLUGIN_I18N_RAW=${jsonScript(pluginI18n)}, PLUGIN_I18N_LOCALES=['zh-CN','en-US'];
function t(key,fallback){return (ADMIN_I18N&&ADMIN_I18N[key])||fallback||key;}
function applyEditorI18n(){
	document.querySelectorAll('[data-i18n]').forEach(function(el){var k=el.getAttribute('data-i18n');if(k&&ADMIN_I18N[k])el.textContent=ADMIN_I18N[k];});
	document.querySelectorAll('[data-i18n-title]').forEach(function(el){var k=el.getAttribute('data-i18n-title');if(k&&ADMIN_I18N[k])el.setAttribute('title',ADMIN_I18N[k]);});
	document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){var k=el.getAttribute('data-i18n-placeholder');if(k&&ADMIN_I18N[k])el.setAttribute('placeholder',ADMIN_I18N[k]);});
}
function renderLanguageSwitchers(){var langs=ADMIN_LANGUAGES.length?ADMIN_LANGUAGES:[{code:'zh-CN',native_name:'简体中文'},{code:'en-US',native_name:'English'}];document.querySelectorAll('[data-language-switch]').forEach(function(sel){sel.innerHTML=langs.map(function(lang){var code=lang.code||lang.locale,name=lang.native_name||lang.name||code;return '<option value="'+escClient(code)+'">'+escClient(name)+'</option>';}).join('');sel.value=ADMIN_LOCALE;sel.onchange=function(){loadEditorI18n(this.value);};});document.querySelectorAll('[data-language-picker]').forEach(function(picker){var btn=picker.querySelector('[data-language-button]'),menu=picker.querySelector('[data-language-menu]'),flag=picker.querySelector('[data-language-flag]'),name=picker.querySelector('[data-language-name]');var current=langs.find(function(lang){return langCode(lang)===ADMIN_LOCALE;})||langs[0];if(flag)flag.innerHTML=flagEmoji(langCode(current));if(name)name.textContent=langName(current);if(menu){menu.innerHTML=langs.map(function(lang){var code=langCode(lang);return '<li data-code="'+escClient(code)+'" class="'+(code===ADMIN_LOCALE?'active':'')+'"><span class="lang-flag">'+flagEmoji(code)+'</span><span>'+escClient(langName(lang))+'</span><small>('+escClient(code)+')</small></li>';}).join('');menu.querySelectorAll('li').forEach(function(li){li.onclick=function(e){e.stopPropagation();menu.classList.remove('open');loadEditorI18n(li.dataset.code);};});}if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.onclick=function(e){e.stopPropagation();document.querySelectorAll('[data-language-menu].open').forEach(function(m){if(m!==menu)m.classList.remove('open');});if(menu)menu.classList.toggle('open');};}});}
document.addEventListener('click',function(e){if(!e.target.closest('[data-language-picker]'))document.querySelectorAll('[data-language-menu].open').forEach(function(m){m.classList.remove('open');});});
function loadEditorI18n(locale){return fetch('/api/i18n?locale='+encodeURIComponent(locale||ADMIN_LOCALE)).then(function(r){return r.json();}).then(function(d){ADMIN_LANGUAGES=d.languages||ADMIN_LANGUAGES;var hadStoredLocale=!!(localStorage.getItem('ff.locale')||cookieLocale());var nextLocale=hadStoredLocale?(d.locale||locale||ADMIN_LOCALE):pickBrowserLocale(ADMIN_LANGUAGES);if(!hadStoredLocale&&nextLocale&&nextLocale!==(d.locale||locale))return loadEditorI18n(nextLocale);ADMIN_LOCALE=nextLocale||d.locale||locale||ADMIN_LOCALE;ADMIN_I18N=d.messages||{};localStorage.setItem('ff.locale',ADMIN_LOCALE);document.cookie='ff_locale='+encodeURIComponent(ADMIN_LOCALE)+'; Path=/; Max-Age=31536000; SameSite=Lax';document.documentElement.lang=ADMIN_LOCALE;renderLanguageSwitchers();applyEditorI18n();}).catch(function(){renderLanguageSwitchers();});}
loadEditorI18n(ADMIN_LOCALE);
function nonceValue(){try{var c=window.crypto;if(c&&c.randomUUID)return c.randomUUID();if(c&&c.getRandomValues){var a=new Uint8Array(16),s='',i,h;c.getRandomValues(a);for(i=0;i<a.length;i++){h=a[i].toString(16);s+=(h.length<2?'0':'')+h;}return s;}}catch(e){}return String(Date.now())+'-'+Math.random().toString(16).slice(2)+'-'+Math.random().toString(16).slice(2);}
function nonceHeaders(json){var h={'X-Timestamp':String(Math.floor(Date.now()/1000)),'X-Nonce':nonceValue()};if(json)h['Content-Type']='application/json';return h;}
function showToast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast toast-'+(type==='err'?'err':'ok')+' show';clearTimeout(t._tmr);t._tmr=setTimeout(function(){t.className='toast';},2200);}
function makeEditor(id,mode,value){var ed=ace.edit('ace-'+id);ed.setTheme('ace/theme/'+ACTIVE_THEME);ed.session.setMode('ace/mode/'+mode);ed.setOptions({fontSize:'13px',tabSize:2,useSoftTabs:true,showPrintMargin:false,wrap:true,enableBasicAutocompletion:true,enableLiveAutocompletion:true,scrollPastEnd:.3});ed.setValue(value||'',-1);ed.session.on('change',function(){changed[id]=true;var dot=document.getElementById('dot-'+id);if(dot)dot.textContent=' ●';});return ed;}
var editors={
 css:makeEditor('css','css',${jsonScript(code.css)}),
 html:makeEditor('html','html',${jsonScript(code.html)}),
 head:makeEditor('head','html',${jsonScript(code.headHtml)}),
 js:makeEditor('js','javascript',${jsonScript(code.js)}),
 blockTypes:makeEditor('blockTypes','json',${jsonScript(code.blockTypes)}),
 resourceTypes:makeEditor('resourceTypes','json',${jsonScript(code.resourceTypes)}),
 schema:makeEditor('schema','json',${jsonScript(code.configSchema)}),
 permissions:makeEditor('permissions','json',${jsonScript(code.permissions)}),
 tags:makeEditor('tags','json',${jsonScript(code.tags)}),
 config:makeEditor('config','json',${jsonScript(code.config)})
};
document.getElementById('sel-theme').innerHTML=ACE_THEMES.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');document.getElementById('sel-theme').value=ACTIVE_THEME;document.getElementById('sel-theme').addEventListener('change',function(){ACTIVE_THEME=this.value;localStorage.setItem('ff.ace.theme',ACTIVE_THEME);Object.values(editors).forEach(function(ed){ed.setTheme('ace/theme/'+ACTIVE_THEME);});});
document.querySelectorAll('[data-tab]').forEach(function(btn){btn.addEventListener('click',function(){switchTab(btn.dataset.tab);});});
function switchTab(tab){activeTab=tab;document.querySelectorAll('[data-tab]').forEach(function(b){b.classList.toggle('active',b.dataset.tab===tab);});document.querySelectorAll('.ed-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+tab);});if(editors[tab])setTimeout(function(){editors[tab].resize(true);editors[tab].focus();},20);}
function formatActive(){if(!editors[activeTab])return;try{var beautify=ace.require('ace/ext/beautify');beautify.beautify(editors[activeTab].session);}catch(e){showToast(t('admin.editor.formatMissing','格式化插件未加载'),'err');}}
function readJson(id,fallback){var raw=editors[id].getValue().trim();if(!raw)return fallback;return JSON.parse(raw);}
function escClient(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function normalizePluginI18nRows(){
	var localeSet={'zh-CN':true,'en-US':true}, rows=[];
	Object.keys(PLUGIN_I18N_RAW||{}).sort().forEach(function(key){
		var value=PLUGIN_I18N_RAW[key], row={key:key,values:{}};
		if(value&&typeof value==='object'){
			Object.keys(value).forEach(function(locale){localeSet[locale]=true;row.values[locale]=String(value[locale]||'');});
		}else{
			row.values['en-US']=String(value||'');
		}
		rows.push(row);
	});
	PLUGIN_I18N_LOCALES=Object.keys(localeSet).sort(function(a,b){if(a==='zh-CN')return -1;if(b==='zh-CN')return 1;if(a==='en-US')return -1;if(b==='en-US')return 1;return a.localeCompare(b);});
	return rows.length?rows:[{key:'plugin.title',values:{'zh-CN':'','en-US':''}}];
}
var PLUGIN_I18N_ROWS=normalizePluginI18nRows();
function renderPluginI18n(){
	var head=document.getElementById('plugin-i18n-head'), body=document.getElementById('plugin-i18n-body');
	head.innerHTML='<tr><th data-i18n="admin.editor.i18nKey">Key</th>'+PLUGIN_I18N_LOCALES.map(function(locale){return '<th>'+escClient(locale)+'</th>';}).join('')+'<th></th></tr>';
	body.innerHTML=PLUGIN_I18N_ROWS.map(function(row,i){
		return '<tr data-i="'+i+'"><td><input data-i18n-key value="'+escClient(row.key)+'"></td>'+PLUGIN_I18N_LOCALES.map(function(locale){return '<td><input data-i18n-locale="'+escClient(locale)+'" value="'+escClient(row.values[locale]||'')+'"></td>';}).join('')+'<td><button class="btn btn-danger btn-sm" onclick="removeI18nRow('+i+')">×</button></td></tr>';
	}).join('');
	applyEditorI18n();
}
function readPluginI18n(){
	var out={};
	document.querySelectorAll('#plugin-i18n-body tr').forEach(function(tr){
		var key=tr.querySelector('[data-i18n-key]').value.trim();
		if(!key)return;
		var values={};
		tr.querySelectorAll('[data-i18n-locale]').forEach(function(inp){values[inp.dataset.i18nLocale]=inp.value;});
		out[key]=values;
	});
	return out;
}
function syncPluginI18nRows(){
	PLUGIN_I18N_ROWS=[];
	document.querySelectorAll('#plugin-i18n-body tr').forEach(function(tr){
		var row={key:tr.querySelector('[data-i18n-key]').value.trim(),values:{}};
		tr.querySelectorAll('[data-i18n-locale]').forEach(function(inp){row.values[inp.dataset.i18nLocale]=inp.value;});
		PLUGIN_I18N_ROWS.push(row);
	});
}
function addI18nRow(){syncPluginI18nRows();var values={};PLUGIN_I18N_LOCALES.forEach(function(locale){values[locale]='';});PLUGIN_I18N_ROWS.push({key:'',values:values});renderPluginI18n();}
function removeI18nRow(i){syncPluginI18nRows();PLUGIN_I18N_ROWS.splice(i,1);renderPluginI18n();}
function addI18nLocale(){syncPluginI18nRows();var input=document.getElementById('plugin-i18n-locale');var locale=(input.value||'').trim();if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)){showToast(t('admin.editor.addLocaleInvalid','Locale 格式应类似 ja-JP'),'err');return;}if(PLUGIN_I18N_LOCALES.indexOf(locale)===-1)PLUGIN_I18N_LOCALES.push(locale);PLUGIN_I18N_ROWS.forEach(function(row){if(row.values[locale]===undefined)row.values[locale]='';});input.value='';renderPluginI18n();}
async function saveAll(){try{var body={id:${jsonScript(pluginId)},slug:document.getElementById('f-slug').value.trim(),name:document.getElementById('f-name').value.trim(),version:document.getElementById('f-version').value.trim(),type:document.getElementById('f-type').value,author:document.getElementById('f-author').value.trim(),homepage:document.getElementById('f-homepage').value.trim(),icon:document.getElementById('f-icon').value.trim(),sourceUrl:document.getElementById('f-source-url').value.trim(),description:document.getElementById('f-description').value,enabled:document.getElementById('f-enabled').checked,css:editors.css.getValue(),html:editors.html.getValue(),headHtml:editors.head.getValue(),js:editors.js.getValue(),blockTypes:readJson('blockTypes',[]),resourceTypes:readJson('resourceTypes',[]),i18n:readPluginI18n(),configSchema:readJson('schema',{}),permissions:readJson('permissions',[]),tags:readJson('tags',[]),config:readJson('config',{})};var res=await fetch('/api/admin/plugins/'+encodeURIComponent(${jsonScript(pluginId)}),{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.error||'保存失败');changed={};document.querySelectorAll('[id^="dot-"]').forEach(function(d){d.textContent='';});showToast(t('admin.editor.saved','已保存'));}catch(e){showToast(e.message||String(e),'err');}}
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveAll();}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='F'){e.preventDefault();formatActive();}});
renderPluginI18n();
setTimeout(function(){editors.css.resize(true);},50);
</script></body></html>`;
}


export function renderAdminPluginShell(user: UserPayload, pluginId: string, pluginName: string, pluginJs = '', pluginCss = ''): string {
	const safeId = escapeHtml(pluginId);
	const safeName = escapeHtml(pluginName);
	return renderAdminLayout({
		title: pluginName,
		active: 'plugins',
		user,
		head: pluginCss ? `<style>${pluginCss}</style>` : '',
		content: `<div class="admin-workbench"><div class="admin-toolbar"><a class="btn btn-sm btn-outline" href="/admin/plugins">返回</a><span style="font-weight:750">${safeName}</span><span class="spacer"></span><a class="btn btn-sm" href="/admin/plugins/${safeId}/editor">编辑代码</a></div><div id="ff-plugin-admin-root" data-plugin-id="${safeId}" style="min-height:200px"></div></div>`,
		script: pluginJs || undefined,
	});
}
