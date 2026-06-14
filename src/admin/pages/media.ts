import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminMedia(user: UserPayload, data: any, env?: Partial<Env> | Record<string, unknown>): string {
	const page = Math.max(1, Number(data.page || 1));
	const pageSize = Math.max(1, Number(data.pageSize || 24));
	const total = Number(data.total || 0);
	const includePosts = !!data.includePosts;
	const query = String(data.query || '');
	const type = String(data.type || '');
	const pageParams = { includePosts: includePosts ? '1' : '0', q: query, type };
	const mediaTypeOptions = [
		['', 'admin.media.allTypes', '全部类型'],
		['image', 'admin.media.imageType', '图片'],
		['video', 'admin.media.videoType', '视频'],
		['file', 'admin.media.fileType', '文件'],
	].map(([value, key, label]) => `<option value="${value}"${type === value ? ' selected' : ''} data-i18n="${key}">${label}</option>`).join('');
	const items = (data.items || []) as any[];
	const cards = items.length ? items.map((item) => {
		const scope = String(item.scope || 'system');
		const scopeKey = scope === 'system' ? 'admin.media.system' : 'admin.media.post';
		const scopeLabel = scope === 'system' ? '系统' : '帖子';
		const preview = isVideoMedia(item)
			? `<video class="media-thumb" src="${escapeHtml(item.url)}" controls muted preload="metadata"></video>`
			: `<img class="media-thumb" src="${escapeHtml(item.url)}" loading="lazy" alt="${escapeHtml(item.filename || 'media')}">`;
		const postLine = item.post_id
			? `<a class="muted" href="${escapeHtml(publicPostPath(item.post_id, env))}">#${escapeHtml(item.post_id)} ${escapeHtml(item.post_title || '')}</a>`
			: '<span class="muted" data-i18n="admin.media.systemLibrary">系统资源库</span>';
		const deleteButton = scope === 'system' && item.id
			? adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-delete-media': item.id }, 'btn-danger')
			: '';
		return `
<article class="media-card">
	<div class="media-preview">${preview}</div>
	<div class="media-body">
		<div class="media-line"><strong title="${escapeHtml(item.filename || item.key || '')}">${escapeHtml(item.filename || item.key || 'media')}</strong><span class="badge" data-i18n="${scopeKey}">${scopeLabel}</span></div>
		<div class="muted">${escapeHtml(item.media_type || 'media')} · ${item.mime_type ? escapeHtml(item.mime_type) : '<span data-i18n="admin.media.unknownType">未知类型</span>'} · ${Number(item.size_bytes || 0) ? formatBytes(item.size_bytes) : '<span data-i18n="admin.media.unknownSize">未知大小</span>'}</div>
		<div>${postLine}</div>
		<div class="media-actions">
			<a class="btn btn-sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" data-i18n="admin.common.open">打开</a>
			${adminButton('admin.common.copyUrl', '复制 URL', { class: 'btn-sm', 'data-copy-url': item.url })}
			${deleteButton}
		</div>
	</div>
</article>`;
	}).join('') : '<div class="notice" data-i18n="admin.media.empty">暂无媒体。系统媒体可通过上方按钮上传；开启“包含帖子媒体”后会同时扫描帖子里的图片和视频。</div>';
	const toolbar = adminToolbar(`
		<form class="media-filter" method="get" action="/admin/media">
			${adminInput({ name: 'q', value: query, 'data-i18n-placeholder': 'admin.media.searchPlaceholder', placeholder: '搜索文件名、帖子或路径...' })}
			${adminSelect(mediaTypeOptions, { name: 'type' })}
			<input type="hidden" name="includePosts" value="${includePosts ? '1' : '0'}">
			${adminButton('admin.common.search', '搜索', { type: 'submit', class: 'btn-sm' }, 'btn-primary')}
			<a class="btn btn-sm" href="/admin/media?includePosts=${includePosts ? '1' : '0'}" data-i18n="admin.common.reset">重置</a>
		</form>
		<div class="media-actions-bar ml-auto">
			<label class="btn btn-primary btn-sm" for="system-media-file" data-i18n="admin.media.uploadSystem">上传系统媒体</label>
			<input id="system-media-file" class="hidden-file" type="file" accept="image/*,video/*">
			<label class="media-switch"><input id="include-posts" type="checkbox" ${includePosts ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span><span data-i18n="admin.media.includePosts">包含帖子媒体</span></label>
		</div>
	`, 'media-toolbar');
	const mediaShell = `<div class="admin-table-shell">
		<div class="admin-table-scroll"><div class="media-grid">${cards}</div></div>
		<div class="admin-footer">
			<span><span data-i18n="admin.media.totalPrefix">共</span> ${total} <span data-i18n="admin.media.totalSuffix">个媒体</span></span>
			${adminPager('/admin/media', page, pageSize, total, pageParams)}
		</div>
	</div>`;
	return renderAdminLayout({
		title: '媒体管理',
		titleKey: 'admin.media.title',
		subtitle: '管理系统媒体，并可按需查看所有帖子中的图片和视频。默认只显示系统媒体。',
		subtitleKey: 'admin.media.subtitle',
		active: 'media',
		user,
		head: `<style>
.media-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:nowrap}
.media-filter,.media-actions-bar{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
.media-filter .input{width:260px}.media-filter .select{width:180px}
.media-switch{display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:650}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:12px}
.media-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;min-width:0}
.media-preview{height:158px;background:var(--bg);border-bottom:1px solid var(--border);display:grid;place-items:center;overflow:hidden}
.media-thumb{width:100%;height:100%;object-fit:contain;background:#090d14}
.media-body{display:grid;gap:7px;padding:12px;min-width:0}
.media-line{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.media-line strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.media-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin-top:3px}
		</style>`,
		content: `
<div class="admin-workbench">
	${toolbar}
	${mediaShell}
</div>`,
		script: `
document.getElementById('include-posts')?.addEventListener('change',function(){var u=new URL(location.href);u.searchParams.set('includePosts',this.checked?'1':'0');u.searchParams.set('page','1');location.href=u.pathname+'?'+u.searchParams.toString();});
document.getElementById('system-media-file')?.addEventListener('change',async function(){
	if(!this.files||!this.files[0])return;
	var fd=new FormData();fd.append('file',this.files[0]);fd.append('type','system');
	try{
		var res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});
		var data=await res.json();
		if(!res.ok)throw new Error(data.error||t('common.uploadFailed','上传失败'));
		location.reload();
	}catch(e){showToast(e.message||String(e),'err');}
});
document.addEventListener('click',async function(e){
	var copy=e.target.closest('[data-copy-url]');
	if(copy){await navigator.clipboard?.writeText(copy.dataset.copyUrl);showToast(t('admin.common.copied','已复制 URL'));return;}
	var del=e.target.closest('[data-delete-media]');
	if(del){
		if(!confirm(t('admin.media.deleteConfirm','删除这个系统媒体？')))return;
		var res=await fetch('/api/admin/media/'+encodeURIComponent(del.dataset.deleteMedia),{method:'DELETE',headers:nonceHeaders(false)});
		var data=await res.json();
		if(!res.ok){showToast(data.error||t('admin.common.delete','删除')+'失败','err');return;}
		location.reload();
	}
});`
	});
}


