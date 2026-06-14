import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminCategories(user: UserPayload, data: { categories: any[]; languages?: AdminLanguage[] } | any[]): string {
	const categories = Array.isArray(data) ? data : data.categories;
	const languages = Array.isArray(data) ? undefined : data.languages;
	const activeContentLocale = languageCode(normalizeContentLanguages(languages)[0]);
	const categoryDefaults: Record<string, { description: string; hero_title: string; hero_description: string }> = {
		all: { description: 'All forum posts.', hero_title: 'Media-first forum feed', hero_description: 'Scan posts fast. Media stays clear.' },
		'1': { description: 'Official updates and release notes.', hero_title: 'Announcements', hero_description: 'Official updates, releases, and site news.' },
		'2': { description: 'Progress notes for projects and plugins.', hero_title: 'Build Logs', hero_description: 'Track implementation notes and release progress.' },
		'3': { description: 'Media-rich examples and demos.', hero_title: 'Showcase', hero_description: 'Media-rich posts, previews, and demos.' },
		'4': { description: 'Proposals and product decisions.', hero_title: 'Ideas', hero_description: 'Short proposals and design discussions.' },
	};
	const rows = categories.map((row) => {
		const localized = (row.localized || {}) as LocalizedValueMap;
		const defaults = categoryDefaults[String(row.id)] || { description: '', hero_title: row.name || '', hero_description: '' };
		const description = localizedValue(localized, 'description', activeContentLocale, row.description || defaults.description);
		const heroTitle = localizedValue(localized, 'hero_title', activeContentLocale, row.hero_title || defaults.hero_title);
		const heroDescription = localizedValue(localized, 'hero_description', activeContentLocale, row.hero_description || defaults.hero_description);
		const name = localizedValue(localized, 'name', activeContentLocale, row.name || '');
		const iconUrl = String(row.icon_url || '');
		const isSystemAll = String(row.id) === 'all';
		const enabled = isSystemAll || Number(row.enabled ?? 1) !== 0;
		const adminOnly = !isSystemAll && Number(row.admin_only ?? 0) !== 0;
		return `<article class="cat-edit ${isSystemAll ? 'cat-edit-system' : ''}" data-category-row data-category-id="${escapeHtml(row.id)}" data-system-category="${isSystemAll ? '1' : '0'}" data-category-fixed="${isSystemAll ? '1' : '0'}" data-localized="${escapeHtml(JSON.stringify(localized))}">
		<div class="cat-drag-slot">
			${isSystemAll ? '' : `<button class="cat-drag-handle" type="button" draggable="true" title="拖动排序" aria-label="拖动排序" data-i18n-title="admin.categories.dragHandle" data-category-drag-handle><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="4" r="1.2"></circle><circle cx="11" cy="4" r="1.2"></circle><circle cx="5" cy="8" r="1.2"></circle><circle cx="11" cy="8" r="1.2"></circle><circle cx="5" cy="12" r="1.2"></circle><circle cx="11" cy="12" r="1.2"></circle></svg></button>`}
		</div>
		<div class="cat-icon-col">
			<button class="cat-icon-card" type="button" data-category-icon-pick>
				<span class="cat-icon-preview">${iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="">` : '<span>#</span>'}</span>
				<small data-i18n="admin.categories.icon">分类图标</small>
			</button>
			<input type="hidden" name="icon_url" value="${escapeHtml(iconUrl)}">
		</div>
		<div class="cat-main">
			<div class="cat-main-top">
				${adminField('admin.categories.name', '分类名称', adminInput({ name: 'name', value: name, 'data-i18n-field': 'name' }))}
				${adminField('admin.categories.description', '分类说明', adminInput({ name: 'description', value: description, 'data-i18n-field': 'description' }))}
			</div>
			<div class="cat-main-hero">
				${adminField('admin.categories.heroTitle', '首页标题', adminInput({ name: 'hero_title', value: heroTitle, 'data-i18n-field': 'hero_title' }))}
				${adminField('admin.categories.heroDescription', '首页文案', adminTextarea(heroDescription, { name: 'hero_description', 'data-i18n-field': 'hero_description' }))}
			</div>
		</div>
		<div class="cat-side">
			<span class="badge cat-count"><strong>${Number(row.post_count || 0)}</strong><span data-i18n="index.hero.posts">帖子</span></span>
			<div class="cat-switches">
				${isSystemAll ? '<span class="cat-system-note" data-i18n="admin.categories.systemCategory">系统分类</span>' : adminSwitch(`category-enabled-${escapeHtml(row.id)}`, 'admin.common.enabled', '启用', enabled, { class: 'cat-enabled-switch', 'data-category-enabled': true })}
				${isSystemAll ? '' : adminSwitch(`category-admin-only-${escapeHtml(row.id)}`, 'admin.categories.adminOnly', '仅管理员可选', adminOnly, { class: 'cat-enabled-switch', 'data-category-admin-only': true })}
			</div>
			<div class="cat-actions">
				${adminButton('admin.common.save', '保存', { 'data-save-category': true }, 'btn-primary btn-sm')}
				${isSystemAll ? '' : adminButton('admin.common.delete', '删除', { 'data-delete-category': true }, 'btn-danger btn-sm')}
			</div>
		</div>
	</article>`;
	}).join('') || `<div class="notice" data-i18n="admin.common.none">暂无数据</div>`;
	return renderAdminLayout({
		title: '分类管理',
		subtitle: '管理分类名称、说明和分类首页文案。',
		titleKey: 'admin.categories',
		subtitleKey: 'admin.categories.subtitle',
		active: 'categories',
		head: `<style>
				.cat-layout{height:100%;min-height:0;display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;overflow:hidden}.cat-form{min-height:0;overflow:auto;background:linear-gradient(180deg,rgba(22,34,51,.72),rgba(13,17,23,.96))}.cat-form form{align-content:start}.cat-create-grid{display:grid;grid-template-columns:92px minmax(0,1fr);gap:12px;align-items:start}.cat-create-fields{display:grid;gap:10px}.cat-create-options{display:grid;gap:8px}.cat-list-shell{min-height:0;border:1px solid var(--border);border-radius:14px;background:rgba(12,18,28,.72);overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}.cat-list-head{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(90deg,rgba(88,166,255,.08),rgba(63,185,80,.04),transparent)}.cat-list{min-height:0;overflow:auto;display:grid;align-content:start;gap:12px;padding:12px}.cat-edit{border:1px solid rgba(88,166,255,.18);border-radius:16px;background:linear-gradient(135deg,rgba(20,31,46,.9),rgba(12,18,28,.94));padding:14px;display:grid;grid-template-columns:34px 92px minmax(0,1fr) 146px;gap:12px;align-items:stretch;transition:border-color .16s ease,background .16s ease,opacity .16s ease,box-shadow .16s ease}.cat-edit:hover{border-color:rgba(88,166,255,.46);box-shadow:0 16px 48px rgba(0,0,0,.18)}.cat-edit.dragging{opacity:.55;border-color:var(--accent);background:rgba(88,166,255,.08)}.cat-drag-ghost{opacity:.96!important;border-color:var(--accent)!important;background:linear-gradient(180deg,rgba(23,34,52,.98),rgba(15,23,36,.98))!important;box-shadow:0 18px 48px rgba(0,0,0,.42)}.cat-edit-system{border-color:rgba(88,166,255,.42);background:linear-gradient(135deg,rgba(88,166,255,.16),rgba(14,26,42,.95))}.cat-drag-slot{display:grid;align-content:center;justify-content:center}.cat-drag-handle{width:28px;height:48px;border:1px solid rgba(96,120,150,.3);border-radius:12px;background:#0b111c;color:#8aa4c7;display:grid;place-items:center;cursor:grab;touch-action:none}.cat-drag-handle:hover{color:#dbeafe;border-color:rgba(88,166,255,.56);background:rgba(88,166,255,.12)}.cat-drag-handle:active{cursor:grabbing}.cat-drag-handle svg{width:16px;height:16px;fill:currentColor}.cat-icon-col{display:grid;align-content:center}.cat-icon-card{height:92px;border:1px dashed rgba(96,120,150,.42);border-radius:14px;background:rgba(88,166,255,.05);color:var(--text);display:grid;place-items:center;gap:6px;padding:8px;cursor:pointer}.cat-icon-card:hover{border-color:var(--accent);background:rgba(88,166,255,.1)}.cat-icon-preview{width:46px;height:46px;border:1px solid var(--border);border-radius:14px;background:#090d14;display:grid;place-items:center;overflow:hidden}.cat-icon-preview img{width:100%;height:100%;object-fit:contain}.cat-icon-preview>span{font-weight:900;color:#9fb4d0}.cat-icon-card small{font-size:11px;color:var(--muted);text-align:center}.cat-main{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.cat-main-top{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(260px,1fr);gap:10px}.cat-main-hero{display:grid;grid-template-columns:minmax(220px,.65fr) minmax(300px,1fr);gap:10px}.cat-main .field:last-child{grid-column:auto}.cat-main .textarea{min-height:74px;resize:vertical}.cat-side{display:grid;grid-template-rows:auto auto 1fr;gap:10px;align-content:start}.cat-switches{display:grid;gap:8px}.cat-enabled-switch{height:34px;justify-content:center;border:1px solid var(--border);border-radius:999px;padding:0 10px;background:#0d1320;white-space:nowrap}.cat-system-note{height:34px;border:1px solid var(--border);border-radius:999px;display:grid;place-items:center;color:var(--muted);font-size:12px;background:#0d1320}.cat-actions{align-self:end;display:grid;gap:8px}.cat-actions .btn,.cat-side>.btn{width:100%}.cat-count{height:42px;min-height:42px;display:flex;align-items:center;justify-content:center;gap:5px;text-align:center;padding:0 12px;border-radius:999px}.cat-count strong{font-size:18px;line-height:1;color:#e6edf3}.cat-count span{font-size:12px;color:var(--muted);line-height:1}.cat-hint{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.media-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;max-height:420px;overflow:auto}.media-pick-item{border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px;display:grid;gap:6px;text-align:left;color:var(--text);min-width:0}.media-pick-item:hover{border-color:var(--accent);background:rgba(88,166,255,.08)}.media-pick-thumb{height:88px;border-radius:6px;background:#090d14;display:grid;place-items:center;overflow:hidden}.media-pick-thumb img{width:100%;height:100%;object-fit:contain}.media-pick-name{font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.media-pick-upload{border:1px dashed var(--border);border-radius:8px;background:rgba(88,166,255,.03);height:132px;display:grid;place-items:center;color:var(--muted)}.media-pick-upload:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.08)}.media-upload-inner{display:grid;gap:6px;place-items:center}.media-upload-inner strong{font-size:26px;line-height:1}@media(max-width:1180px){.cat-layout{grid-template-columns:1fr}.cat-form{max-height:360px}.cat-edit{grid-template-columns:34px 92px minmax(0,1fr)}.cat-side{grid-column:2/-1;grid-template-columns:120px minmax(0,1fr) 120px;grid-template-rows:auto;align-items:center}.cat-actions{align-self:auto}}@media(max-width:760px){.cat-layout,.cat-edit,.cat-main-top,.cat-main-hero,.cat-create-grid{grid-template-columns:1fr}.cat-list-shell{min-height:360px}.cat-drag-slot{justify-content:start}.cat-side{grid-column:auto;grid-template-columns:1fr}.cat-count{min-width:84px}}
</style>`,
		user,
		content: `
<div class="admin-workbench">
<div class="cat-layout">
	<section class="card cat-form">
		<h2 data-i18n="admin.categories.add">新增分类</h2>
		<p class="cat-hint" data-i18n="admin.categories.heroHint">用户打开该分类时会显示这组文案。留空则使用分类名和默认说明。</p>
		<form id="category-create" class="grid mt-12">
			<div class="cat-create-grid">
				<button class="cat-icon-card" type="button" data-category-icon-pick>
					<span class="cat-icon-preview"><span>#</span></span>
					<small data-i18n="admin.categories.icon">分类图标</small>
				</button>
				<div class="cat-create-fields">
					${adminField('admin.categories.name', '分类名称', adminInput({ name: 'name', required: true }))}
					${adminField('admin.categories.description', '分类说明', adminInput({ name: 'description' }))}
				</div>
			</div>
			<input type="hidden" name="icon_url" value="">
			${adminField('admin.categories.heroTitle', '首页标题', adminInput({ name: 'hero_title' }))}
			${adminField('admin.categories.heroDescription', '首页文案', adminTextarea('', { name: 'hero_description' }))}
			<div class="cat-create-options">
				${adminSwitch('category-create-enabled', 'admin.common.enabled', '启用', true, { class: 'cat-enabled-switch', 'data-category-enabled': true })}
				${adminSwitch('category-create-admin-only', 'admin.categories.adminOnly', '仅管理员可选', false, { class: 'cat-enabled-switch', 'data-category-admin-only': true })}
			</div>
			${adminButton('admin.common.add', '添加', { type: 'submit' }, 'btn-primary')}
		</form>
	</section>
	<section class="cat-list-shell">
		<div class="cat-list-head"><strong data-i18n="admin.categories">分类管理</strong>${contentLanguageSelector(languages, activeContentLocale)}<span class="muted">${categories.length} <span data-i18n="index.hero.categories">分类</span></span></div>
		<div class="cat-list" data-category-list>${rows}</div>
	</section>
</div>
</div>
</div>
<div class="modal-ov" id="category-media-modal">
	<div class="modal modal-wide">
		<div class="modal-hd">
			<h3 data-i18n="admin.settings.pickMedia">选择媒体</h3>
			<button class="modal-close" type="button" onclick="closeModal('category-media-modal')">×</button>
		</div>
		<div class="toolbar mb-12">
			${adminInput({ id: 'category-media-search', class: 'wide-input', 'data-i18n-placeholder': 'admin.settings.searchMedia', placeholder: '搜索媒体文件...' })}
			<div class="toolbar-right"><span class="muted" id="category-media-count"></span></div>
		</div>
		<div class="media-pick-grid" id="category-media-grid"></div>
		<div class="pager mt-12" id="category-media-pager"></div>
		<input id="category-media-upload" class="hidden-file" type="file" accept="image/*,video/*">
	</div>
</div>`,
		script: `
let CONTENT_LOCALE=document.querySelector('[data-content-locale]')?.value||'${activeContentLocale}';
let CATEGORY_MEDIA_TARGET=null, categoryMediaPage=1;
function readLocalized(root){try{return JSON.parse(root.dataset.localized||'{}')||{};}catch(e){return {};}}
function writeCurrentLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;map[field]=map[field]||{};map[field][CONTENT_LOCALE]=input.value||'';});root.dataset.localized=JSON.stringify(map);return map;}
function applyLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;var values=map[field]||{};input.value=values[CONTENT_LOCALE]||values['en-US']||values['zh-CN']||input.value||'';});}
document.querySelector('[data-content-locale]')?.addEventListener('change',function(){document.querySelectorAll('[data-category-id]').forEach(writeCurrentLocalized);CONTENT_LOCALE=this.value;document.querySelectorAll('[data-category-id]').forEach(applyLocalized);});
function categoryPayload(root){var localized=writeCurrentLocalized(root);return {locale:CONTENT_LOCALE,name:root.querySelector('[name="name"]').value.trim(),description:root.querySelector('[name="description"]').value.trim(),hero_title:root.querySelector('[name="hero_title"]').value.trim(),hero_description:root.querySelector('[name="hero_description"]').value.trim(),icon_url:root.querySelector('[name="icon_url"]')?.value||'',enabled:root.dataset.systemCategory==='1'?true:!!root.querySelector('[data-category-enabled] input')?.checked,admin_only:root.dataset.systemCategory==='1'?false:!!root.querySelector('[data-category-admin-only] input')?.checked,localized:localized};}
function mediaUploadCard(){return '<button class="media-pick-upload" type="button" data-category-upload-media><div class="media-upload-inner"><strong>+</strong><span data-i18n="admin.media.uploadSystem">上传系统媒体</span></div></button>';}
async function loadCategoryMediaPicker(page){categoryMediaPage=page||1;var grid=document.getElementById('category-media-grid');grid.innerHTML=mediaUploadCard()+'<div class="notice" data-i18n="admin.media.loading">加载中...</div>';try{var res=await fetch('/api/admin/media?includePosts=0&page='+categoryMediaPage+'&pageSize=18');var data=await res.json();if(!res.ok)throw new Error(data.error||'加载失败');var q=(document.getElementById('category-media-search').value||'').toLowerCase();var items=(data.items||[]).filter(function(item){return !q||String(item.filename||item.key||'').toLowerCase().includes(q);});document.getElementById('category-media-count').textContent=String(data.total||0);grid.innerHTML=mediaUploadCard()+items.map(function(item){var url=String(item.url||'');var name=String(item.filename||item.key||'media');var isVideo=String(item.media_type||'').toLowerCase()==='video'||String(item.mime_type||'').startsWith('video/');return '<button class="media-pick-item" type="button" data-url="'+url.replace(/"/g,'&quot;')+'"><div class="media-pick-thumb">'+(isVideo?'<span>Video</span>':'<img src="'+url.replace(/"/g,'&quot;')+'" alt="">')+'</div><div class="media-pick-name" title="'+name.replace(/"/g,'&quot;')+'">'+name+'</div></button>';}).join('');var totalPages=Math.max(1,Math.ceil(Number(data.total||0)/Number(data.pageSize||18)));document.getElementById('category-media-pager').innerHTML='<div class="toolbar-right"><button class="btn btn-sm" '+(categoryMediaPage<=1?'disabled':'')+' onclick="loadCategoryMediaPicker('+(categoryMediaPage-1)+')" data-i18n="admin.common.previous">上一页</button><span class="muted">'+categoryMediaPage+' / '+totalPages+'</span><button class="btn btn-sm" '+(categoryMediaPage>=totalPages?'disabled':'')+' onclick="loadCategoryMediaPicker('+(categoryMediaPage+1)+')" data-i18n="admin.common.next">下一页</button></div>';applyAdminI18n();}catch(e){grid.innerHTML='<div class="notice">'+(e.message||String(e))+'</div>';}}
function setCategoryIcon(url){if(!CATEGORY_MEDIA_TARGET)return;var input=CATEGORY_MEDIA_TARGET.querySelector('[name="icon_url"]');var preview=CATEGORY_MEDIA_TARGET.querySelector('.cat-icon-preview');if(input)input.value=url||'';if(preview)preview.innerHTML=url?'<img src="'+String(url).replace(/"/g,'&quot;')+'" alt="">':'<span>#</span>';}
document.addEventListener('click',function(e){var pick=e.target.closest('[data-category-icon-pick]');if(pick){CATEGORY_MEDIA_TARGET=pick.closest('[data-category-id]')||pick.closest('form');openModal('category-media-modal');loadCategoryMediaPicker(1);}});
document.getElementById('category-media-search')?.addEventListener('input',function(){loadCategoryMediaPicker(1);});
document.getElementById('category-media-grid')?.addEventListener('click',function(e){var upload=e.target.closest('[data-category-upload-media]');if(upload){document.getElementById('category-media-upload').click();return;}var item=e.target.closest('[data-url]');if(!item)return;setCategoryIcon(item.dataset.url||'');closeModal('category-media-modal');});
document.getElementById('category-media-upload')?.addEventListener('change',async function(){if(!this.files||!this.files[0])return;var fd=new FormData();fd.append('file',this.files[0]);fd.append('type','system');try{var res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});var data=await res.json();if(!res.ok)throw new Error(data.error||'上传失败');setCategoryIcon(data.url||'');await loadCategoryMediaPicker(1);}catch(err){showToast(err.message||String(err),'err');}this.value='';});
document.getElementById('category-create')?.addEventListener('submit',async function(e){e.preventDefault();var btn=this.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/categories',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(categoryPayload(document.getElementById('category-create')))});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.createFailed','创建失败'));showToast(t('admin.categories.created','分类已创建'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){var save=e.target.closest('[data-save-category]');var del=e.target.closest('[data-delete-category]');if(save){var card=save.closest('[data-category-id]');var url=card.dataset.systemCategory==='1'?'/api/admin/categories/all':'/api/admin/categories/'+card.dataset.categoryId;try{await runButton(save,t('common.processing','处理中...'),async function(done){var res=await fetch(url,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify(categoryPayload(card))});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.saveFailed','保存失败'));done();showToast(t('admin.categories.saved','分类已保存'));});}catch(err){showToast(err.message||String(err),'err');}}if(del){var card=del.closest('[data-category-id]');if(card.dataset.systemCategory==='1')return;if(!confirm(t('admin.categories.deleteConfirm','删除这个分类？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/categories/'+card.dataset.categoryId,{method:'DELETE',headers:nonceHeaders(false)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}});
var CATEGORY_DRAG_ROW=null,CATEGORY_DRAG_GHOST=null,CATEGORY_DRAG_SAVING=false,CATEGORY_DRAG_ORDER=[];
function sortableCategoryRows(){return Array.from(document.querySelectorAll('[data-category-row]')).filter(function(row){return row.dataset.systemCategory!=='1';});}
function categoryOrder(){return sortableCategoryRows().map(function(row){return Number(row.dataset.categoryId);}).filter(function(id){return Number.isInteger(id)&&id>0;});}
function rememberCategoryOrder(){CATEGORY_DRAG_ORDER=sortableCategoryRows().slice();}
function restoreCategoryOrder(){var list=document.querySelector('[data-category-list]');if(!list||!CATEGORY_DRAG_ORDER.length)return;CATEGORY_DRAG_ORDER.forEach(function(row){list.appendChild(row);});}
async function saveCategoryOrder(){var ids=categoryOrder();if(!ids.length)return;CATEGORY_DRAG_SAVING=true;try{var res=await fetch('/api/admin/categories/reorder',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.categories.orderFailed','排序保存失败'));showToast(t('admin.categories.orderSaved','分类顺序已保存'));}catch(err){restoreCategoryOrder();showToast(err.message||String(err),'err');}finally{CATEGORY_DRAG_SAVING=false;CATEGORY_DRAG_ORDER=[];}}
function removeCategoryDragGhost(){if(CATEGORY_DRAG_GHOST&&CATEGORY_DRAG_GHOST.parentNode)CATEGORY_DRAG_GHOST.parentNode.removeChild(CATEGORY_DRAG_GHOST);CATEGORY_DRAG_GHOST=null;}
function clearCategoryDragVisuals(){removeCategoryDragGhost();document.querySelectorAll('[data-category-row].dragging').forEach(function(row){row.classList.remove('dragging');});}
function setCategoryDragImage(e,row,handle){removeCategoryDragGhost();var rect=row.getBoundingClientRect();var hRect=handle.getBoundingClientRect();var ghost=row.cloneNode(true);ghost.classList.add('cat-drag-ghost');ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';ghost.style.position='fixed';ghost.style.left='-9999px';ghost.style.top='-9999px';ghost.style.pointerEvents='none';document.body.appendChild(ghost);CATEGORY_DRAG_GHOST=ghost;e.dataTransfer.setDragImage(ghost,Math.max(0,hRect.left-rect.left+hRect.width/2),Math.max(0,hRect.top-rect.top+hRect.height/2));}
document.addEventListener('dragstart',function(e){var handle=e.target.closest('[data-category-drag-handle]');if(!handle)return;var row=handle.closest('[data-category-row]');if(!row||row.dataset.systemCategory==='1')return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.dataset.categoryId||'');setCategoryDragImage(e,row,handle);CATEGORY_DRAG_ROW=row;rememberCategoryOrder();row.classList.add('dragging');});
document.addEventListener('dragover',function(e){if(!CATEGORY_DRAG_ROW)return;var target=e.target.closest('[data-category-row]');if(!target||target===CATEGORY_DRAG_ROW||target.dataset.systemCategory==='1')return;e.preventDefault();var rect=target.getBoundingClientRect();var before=e.clientY<rect.top+rect.height/2;target.parentNode.insertBefore(CATEGORY_DRAG_ROW,before?target:target.nextSibling);});
document.addEventListener('drop',function(e){if(!CATEGORY_DRAG_ROW)return;e.preventDefault();clearCategoryDragVisuals();});
document.addEventListener('dragend',function(){var row=CATEGORY_DRAG_ROW;clearCategoryDragVisuals();if(!row||CATEGORY_DRAG_SAVING){CATEGORY_DRAG_ROW=null;return;}CATEGORY_DRAG_ROW=null;saveCategoryOrder();});
document.addEventListener('pointerup',function(){if(!CATEGORY_DRAG_ROW)return;clearCategoryDragVisuals();});
window.addEventListener('blur',function(){clearCategoryDragVisuals();CATEGORY_DRAG_ROW=null;});
`
	});
}

export function renderAdminTags(user: UserPayload, data: { tags: any[]; languages?: AdminLanguage[] } | any[]): string {
	const tags = Array.isArray(data) ? data : data.tags;
	const languages = Array.isArray(data) ? undefined : data.languages;
	const activeContentLocale = languageCode(normalizeContentLanguages(languages)[0]);
	const rows = tags.map((row) => {
		const localized = (row.localized || {}) as LocalizedValueMap;
		const name = localizedValue(localized, 'name', activeContentLocale, row.name || '');
		return `<tr data-row data-tag-id="${escapeHtml(row.id)}" data-localized="${escapeHtml(JSON.stringify(localized))}" data-search="${escapeHtml(`${row.id} ${row.name}`)}">
		<td class="admin-check"><input type="checkbox" data-tag-check value="${escapeHtml(row.id)}"></td>
		<td>${escapeHtml(row.id)}</td>
		<td>${adminInput({ 'data-tag-name': row.id, 'data-i18n-field': 'name', value: name })}</td>
		<td>${Number(row.post_count || 0)}</td>
		<td>${escapeHtml(row.created_at || '')}</td>
		<td><div class="admin-row-actions">
			${adminButton('admin.common.save', '保存', { 'data-tag-save': row.id }, 'btn-sm btn-primary')}
			${adminButton('admin.common.delete', '删除', { 'data-tag-delete': row.id }, 'btn-sm btn-danger')}
		</div></td>
	</tr>`;
	}).join('') || `<tr><td colspan="6" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminButton('admin.tags.bulkDelete', '批量删除', { id: 'tag-bulk-delete' }, 'btn-danger')}
		${contentLanguageSelector(languages, activeContentLocale)}
		<form id="tag-create" class="tag-create ml-auto">
			${adminInput({ name: 'name', 'data-i18n-field': 'name', 'data-i18n-placeholder': 'admin.tags.namePlaceholder', placeholder: '新标签名称', required: true })}
			${adminButton('admin.common.add', '添加', { type: 'submit', class: 'btn-sm' }, 'btn-primary')}
		</form>
	`);
	const table = adminTableShell(
		'tags-table',
		`<tr><th class="admin-check"><input id="tag-check-all" type="checkbox"></th><th data-i18n="admin.table.id">ID</th><th data-i18n="admin.table.name">名称</th><th data-i18n="admin.table.postCount">帖子数</th><th data-i18n="admin.table.createdAt">创建时间</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${tags.length}</span> / ${tags.length}</span><span data-i18n="admin.tags.footer">标签用于组织帖子主题。</span>`
	);
	return renderAdminLayout({
		title: '标签管理',
		subtitle: '创建、搜索、重命名和删除帖子标签。',
		titleKey: 'admin.tags',
		subtitleKey: 'admin.tags.subtitle',
		active: 'tags',
		user,
		head: '<style>.tag-create{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}.tag-create .input{width:260px}</style>',
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>`,
		script: `
let CONTENT_LOCALE=document.querySelector('[data-content-locale]')?.value||'${activeContentLocale}';
function readLocalized(root){try{return JSON.parse(root.dataset.localized||'{}')||{};}catch(e){return {};}}
function writeCurrentLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;map[field]=map[field]||{};map[field][CONTENT_LOCALE]=input.value||'';});root.dataset.localized=JSON.stringify(map);return map;}
function applyLocalized(root){var map=readLocalized(root);root.querySelectorAll('[data-i18n-field]').forEach(function(input){var field=input.dataset.i18nField;var values=map[field]||{};input.value=values[CONTENT_LOCALE]||values['en-US']||values['zh-CN']||input.value||'';});}
document.querySelector('[data-content-locale]')?.addEventListener('change',function(){document.querySelectorAll('[data-tag-id]').forEach(writeCurrentLocalized);CONTENT_LOCALE=this.value;document.querySelectorAll('[data-tag-id]').forEach(applyLocalized);});
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=!q||String(row.dataset.search||'').toLowerCase().includes(q);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
document.getElementById('admin-search')?.addEventListener('input',filterRows);
document.getElementById('tag-check-all')?.addEventListener('change',function(){document.querySelectorAll('[data-tag-check]').forEach(function(cb){cb.checked=document.getElementById('tag-check-all').checked;});});
document.getElementById('tag-bulk-delete')?.addEventListener('click',async function(){var ids=Array.from(document.querySelectorAll('[data-tag-check]:checked')).map(function(cb){return Number(cb.value);});if(!ids.length){showToast(t('admin.tags.noSelection','请选择标签'),'err');return;}if(!confirm(t('admin.tags.bulkDeleteConfirm','删除选中的标签？帖子本身不会删除。')))return;try{await runButton(this,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/tags/bulk-delete',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.tags.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('tag-create')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var localized={name:{}};localized.name[CONTENT_LOCALE]=form.name.value.trim();var res=await fetch('/api/admin/tags',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({locale:CONTENT_LOCALE,name:form.name.value.trim(),localized:localized})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.tags.createFailed','创建失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var save=e.target.closest('[data-tag-save]');var del=e.target.closest('[data-tag-delete]');
	if(save){var id=save.dataset.tagSave;var row=save.closest('[data-tag-id]');var input=document.querySelector('[data-tag-name="'+id+'"]');var localized=writeCurrentLocalized(row);try{await runButton(save,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/tags/'+id,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({locale:CONTENT_LOCALE,name:input.value.trim(),localized:localized})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.tags.saveFailed','保存失败'));done();showToast(t('admin.tags.saved','标签已保存'));});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){var id2=del.dataset.tagDelete;if(!confirm(t('admin.tags.deleteConfirm','删除这个标签？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res2=await fetch('/api/admin/tags/'+id2,{method:'DELETE',headers:nonceHeaders(false)});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.tags.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}


