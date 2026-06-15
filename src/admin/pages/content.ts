import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminPosts(user: UserPayload, data: { posts: any[]; categories: any[]; page?: number; pageSize?: number; total?: number }, env?: Partial<Env> | Record<string, unknown>): string {
	const page = Math.max(1, Number(data.page || 1));
	const pageSize = Math.max(1, Number(data.pageSize || 50));
	const total = Number(data.total ?? data.posts.length);
	const categoryOptions = [`<option value="" data-i18n="post.uncategorized">未分类</option>`]
		.concat((data.categories || []).map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || '')}</option>`)).join('');
	const rows = (data.posts || []).map((row) => {
		const id = escapeHtml(row.id);
		const categoryId = row.category_id ?? '';
		const excerpt = String(row.content || '').replace(/[#*_>`\[\]()!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 130);
		const postStatus = String(row.status || 'approved');
		const status = postStatus === 'draft' ? 'draft'
			: postStatus === 'pending' ? 'pending'
			: postStatus === 'rejected' ? 'rejected'
			: row.is_pinned ? 'global-pinned'
			: row.is_category_pinned ? 'category-pinned'
			: 'normal';
		const statusBadge = postStatus === 'draft'
			? '<span class="badge" data-i18n="post.draft">草稿</span>'
			: postStatus === 'pending'
			? '<span class="badge badge-warn" data-i18n="admin.status.pending">待审核</span>'
			: postStatus === 'rejected'
			? '<span class="badge badge-err" data-i18n="admin.status.rejected">已拒绝</span>'
			: row.is_pinned
			? '<span class="badge badge-ok" data-i18n="post.globalPinned">全局置顶</span>'
			: row.is_category_pinned
			? '<span class="badge badge-info" data-i18n="post.categoryPinned">分类置顶</span>'
			: '<span class="badge badge-off" data-i18n="admin.status.normal">普通</span>';
		return `<tr data-row data-category="${escapeHtml(categoryId)}" data-status="${status}" data-search="${escapeHtml(`${row.id} ${row.title} ${row.username} ${row.category_name || ''} ${excerpt}`)}">
			<td class="admin-check"><input type="checkbox" data-post-check value="${id}"></td>
			<td class="admin-title-cell">
				<a href="${escapeHtml(publicPostPath(row.id, env))}">${escapeHtml(row.title || '')}</a>
				<p>${escapeHtml(excerpt)}</p>
			</td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${escapeHtml(String(row.username || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(row.username || '')}</strong><small>#${escapeHtml(row.author_id || '')}</small></div></div></td>
			<td>${adminSelect(categoryOptions.replace(`value="${escapeHtml(categoryId)}"`, `value="${escapeHtml(categoryId)}" selected`), { 'data-post-category': id })}</td>
			<td>${Number(row.comment_count || 0)} / ${Number(row.view_count || 0)}</td>
			<td>${statusBadge}</td>
			<td>${escapeHtml(row.published_at || row.created_at || '')}</td>
			<td><div class="admin-row-actions">
				<a class="btn btn-sm" href="${escapeHtml(publicPostPath(row.id, env))}" data-i18n="admin.common.view">查看</a>
				<a class="btn btn-sm" href="${escapeHtml(publicPostPath(row.id, env))}/edit" data-i18n="admin.common.edit">编辑</a>
				${adminButton('admin.posts.move', '移动', { class: 'btn-sm', 'data-post-move': id })}
				${adminButton(row.is_pinned ? 'post.unpinGlobal' : 'post.pinGlobal', row.is_pinned ? '取消全局置顶' : '全局置顶', { class: 'btn-sm', 'data-post-pin': id, 'data-pinned': row.is_pinned ? '0' : '1' })}
				${adminButton(row.is_category_pinned ? 'post.unpinCategory' : 'post.pinCategory', row.is_category_pinned ? '取消分类置顶' : '分类置顶', { class: 'btn-sm', 'data-post-category-pin': id, 'data-pinned': row.is_category_pinned ? '0' : '1' })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-post-delete': id }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="8" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminSelect(`<option value="" data-i18n="admin.posts.allCategories">全部分类</option>${(data.categories || []).map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || '')}</option>`).join('')}`, { id: 'post-category-filter' })}
		${adminSelect('<option value="" data-i18n="admin.posts.allStatus">全部状态</option><option value="draft" data-i18n="post.draft">草稿</option><option value="pending" data-i18n="admin.status.pending">待审核</option><option value="rejected" data-i18n="admin.status.rejected">已拒绝</option><option value="global-pinned" data-i18n="post.globalPinned">全局置顶</option><option value="category-pinned" data-i18n="post.categoryPinned">分类置顶</option><option value="normal" data-i18n="admin.status.normal">普通</option>', { id: 'post-status-filter' })}
		${adminButton('admin.posts.bulkDelete', '批量删除', { id: 'post-bulk-delete' }, 'btn-danger')}
	`);
	const table = adminTableShell(
		'posts-table',
		`<tr><th class="admin-check"><input id="post-check-all" type="checkbox"></th><th data-i18n="admin.table.title">标题</th><th data-i18n="admin.table.author">作者</th><th data-i18n="admin.table.category">分类</th><th data-i18n="admin.posts.commentsViews">评论/浏览</th><th data-i18n="admin.table.status">状态</th><th data-i18n="admin.table.publishedAt">发布时间</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${data.posts.length}</span> / ${total}</span>${adminPager('/admin/posts', page, pageSize, total)}`
	);
	return renderAdminLayout({
		title: '帖子管理',
		subtitle: '搜索、移动、置顶、编辑和删除帖子。',
		titleKey: 'admin.posts',
		subtitleKey: 'admin.posts.subtitle',
		active: 'posts',
		user,
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var c=document.getElementById('post-category-filter').value;var s=document.getElementById('post-status-filter').value;var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=(!q||String(row.dataset.search||'').toLowerCase().includes(q))&&(!c||String(row.dataset.category||'')===c)&&(!s||String(row.dataset.status||'')===s);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
['admin-search','post-category-filter','post-status-filter'].forEach(function(id){document.getElementById(id)?.addEventListener('input',filterRows);document.getElementById(id)?.addEventListener('change',filterRows);});
document.getElementById('post-check-all')?.addEventListener('change',function(){document.querySelectorAll('[data-post-check]').forEach(function(cb){cb.checked=document.getElementById('post-check-all').checked;});});
document.getElementById('post-bulk-delete')?.addEventListener('click',async function(){var ids=Array.from(document.querySelectorAll('[data-post-check]:checked')).map(function(cb){return Number(cb.value);});if(!ids.length){showToast(t('admin.posts.noSelection','请选择帖子'),'err');return;}if(!confirm(t('admin.posts.bulkDeleteConfirm','删除选中的帖子？')))return;try{await runButton(this,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/posts/bulk-delete',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.posts.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var pin=e.target.closest('[data-post-pin]');var categoryPin=e.target.closest('[data-post-category-pin]');var move=e.target.closest('[data-post-move]');var del=e.target.closest('[data-post-delete]');
	if(pin){try{await runButton(pin,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/posts/'+pin.dataset.postPin+'/pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:pin.dataset.pinned==='1'})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.posts.pinFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
	if(categoryPin){try{await runButton(categoryPin,t('common.processing','处理中...'),async function(){var res0=await fetch('/api/admin/posts/'+categoryPin.dataset.postCategoryPin+'/category-pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:categoryPin.dataset.pinned==='1'})});var data0=await res0.json();if(!res0.ok)throw new Error(data0.error||t('admin.posts.pinFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
	if(move){var sel=document.querySelector('[data-post-category="'+move.dataset.postMove+'"]');try{await runButton(move,t('common.processing','处理中...'),async function(done){var res2=await fetch('/api/admin/posts/'+move.dataset.postMove+'/move',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({category_id:sel.value||null})});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.posts.moveFailed','移动失败'));done();showToast(t('admin.posts.moved','帖子已移动'));});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){if(!confirm(t('admin.posts.deleteConfirm','删除这个帖子？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res3=await fetch('/api/admin/posts/'+del.dataset.postDelete,{method:'DELETE',headers:nonceHeaders(false)});var data3=await res3.json();if(!res3.ok)throw new Error(data3.error||t('admin.posts.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}


export function renderAdminComments(user: UserPayload, data: { comments: any[]; page?: number; pageSize?: number; total?: number } | any[], env?: Partial<Env> | Record<string, unknown>): string {
	const comments = Array.isArray(data) ? data : data.comments;
	const page = Math.max(1, Number(Array.isArray(data) ? 1 : data.page || 1));
	const pageSize = Math.max(1, Number(Array.isArray(data) ? comments.length || 50 : data.pageSize || 50));
	const total = Number(Array.isArray(data) ? comments.length : data.total ?? comments.length);
	const rows = comments.map((row) => {
		const id = escapeHtml(row.id);
		const content = String(row.content || '');
		const excerpt = content.replace(/\s+/g, ' ').trim().slice(0, 180);
		return `<tr data-row data-search="${escapeHtml(`${row.id} ${row.content} ${row.username} ${row.post_title}`)}">
			<td class="admin-check"><input type="checkbox" data-comment-check value="${id}"></td>
			<td>${id}</td>
			<td><div class="admin-cell-main">${escapeHtml(excerpt || '...')}</div>${row.parent_id ? `<div class="admin-cell-sub">↳ #${escapeHtml(row.parent_id)}</div>` : ''}<textarea class="hidden-file" data-comment-content="${id}">${escapeHtml(content)}</textarea></td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${escapeHtml(String(row.username || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(row.username || '')}</strong><small>${escapeHtml(row.created_at || '')}</small></div></div></td>
			<td><a class="admin-cell-main" href="${escapeHtml(publicPostPath(row.post_id, env))}">${escapeHtml(row.post_title || '')}</a></td>
			<td><div class="admin-row-actions">
				<a class="btn btn-sm" href="${escapeHtml(publicPostPath(row.post_id, env))}#comment-${id}" data-i18n="admin.common.view">查看</a>
				${adminButton('admin.common.edit', '编辑', { class: 'btn-sm', 'data-comment-edit': id })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-comment-delete': id }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="6" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminButton('admin.comments.bulkDelete', '批量删除', { id: 'comment-bulk-delete' }, 'btn-danger')}
		<span class="badge ml-auto">${total} <span data-i18n="admin.comments.countSuffix">条评论</span></span>
	`);
	const table = adminTableShell(
		'comments-table',
		`<tr><th class="admin-check"><input id="comment-check-all" type="checkbox"></th><th data-i18n="admin.table.id">ID</th><th data-i18n="admin.table.content">内容</th><th data-i18n="admin.table.author">作者</th><th data-i18n="admin.table.post">帖子</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${comments.length}</span> / ${total}</span>${adminPager('/admin/comments', page, pageSize, total)}`
	);
	return renderAdminLayout({
		title: '评论管理',
		subtitle: '搜索、编辑和删除用户评论。',
		titleKey: 'admin.comments',
		subtitleKey: 'admin.comments.subtitle',
		active: 'comments',
		user,
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>
<div class="modal-ov" id="comment-edit-modal"><div class="modal modal-wide">
	<div class="modal-hd"><h3 data-i18n="admin.comments.editTitle">编辑评论</h3><button class="modal-close" type="button" onclick="closeModal('comment-edit-modal')">×</button></div>
	${adminTextarea('', { id: 'comment-edit-content', class: 'textarea-tall' })}
	<input type="hidden" id="comment-edit-id">
	<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { onclick: "closeModal('comment-edit-modal')" }, 'btn-outline')}${adminButton('admin.common.save', '保存', { id: 'comment-edit-save' }, 'btn-primary')}</div>
</div></div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=!q||String(row.dataset.search||'').toLowerCase().includes(q);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
document.getElementById('admin-search')?.addEventListener('input',filterRows);
document.getElementById('comment-check-all')?.addEventListener('change',function(){document.querySelectorAll('[data-comment-check]').forEach(function(cb){cb.checked=document.getElementById('comment-check-all').checked;});});
document.getElementById('comment-bulk-delete')?.addEventListener('click',async function(){var ids=Array.from(document.querySelectorAll('[data-comment-check]:checked')).map(function(cb){return Number(cb.value);});if(!ids.length){showToast(t('admin.comments.noSelection','请选择评论'),'err');return;}if(!confirm(t('admin.comments.bulkDeleteConfirm','删除选中的评论？')))return;try{await runButton(this,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/comments/bulk-delete',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:ids})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.comments.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('comment-edit-save')?.addEventListener('click',async function(){var btn=this;var id=document.getElementById('comment-edit-id').value;var content=document.getElementById('comment-edit-content').value;try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/comments/'+id,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({content:content})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.comments.saveFailed','保存失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var edit=e.target.closest('[data-comment-edit]');var del=e.target.closest('[data-comment-delete]');
	if(edit){var id=edit.dataset.commentEdit;document.getElementById('comment-edit-id').value=id;document.getElementById('comment-edit-content').value=document.querySelector('[data-comment-content="'+id+'"]').value;openModal('comment-edit-modal');}
	if(del){var id2=del.dataset.commentDelete;if(!confirm(t('admin.comments.deleteConfirm','删除这条评论？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res2=await fetch('/api/admin/comments/'+id2,{method:'DELETE',headers:nonceHeaders(false)});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.comments.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

export function renderAdminModeration(user: UserPayload, data: { items: any[]; status: string; page?: number; pageSize?: number; total?: number; defaultRejectReason?: string; rejectReasons?: string }, env?: Partial<Env> | Record<string, unknown>): string {
	const status = ['pending', 'approved', 'rejected'].includes(String(data.status)) ? String(data.status) : 'pending';
	const page = Math.max(1, Number(data.page || 1));
	const pageSize = Math.max(1, Number(data.pageSize || 50));
	const total = Number(data.total || data.items.length);
	const statusBadge = (value: string) => {
		if (value === 'approved') return '<span class="badge badge-ok" data-i18n="admin.moderation.approved">已通过</span>';
		if (value === 'rejected') return '<span class="badge badge-off" data-i18n="admin.moderation.rejected">已拒绝</span>';
		return '<span class="badge" data-i18n="admin.moderation.pending">待审核</span>';
	};
	const rows = data.items.map((row) => {
		const id = escapeHtml(row.id);
		const type = escapeHtml(row.type);
		const title = row.type === 'post' ? row.title : row.post_title;
		const content = row.type === 'post' ? row.content : row.content;
		const viewHref = row.type === 'post' ? publicPostPath(row.id, env) : `${publicPostPath(row.post_id, env)}#comment-${id}`;
		return `<tr data-row data-type="${type}" data-id="${id}" data-search="${escapeHtml(`${row.type} ${title || ''} ${content || ''} ${row.username || ''}`)}">
			<td class="admin-check"><input type="checkbox" data-moderation-check data-type="${type}" data-id="${id}"></td>
			<td><span class="badge" data-i18n="${row.type === 'post' ? 'admin.posts' : 'admin.comments'}">${row.type === 'post' ? '帖子' : '评论'}</span></td>
			<td><div class="admin-title-cell"><a href="${viewHref}" target="_blank" rel="noopener">${escapeHtml(title || '-')}</a><p>${escapeHtml(String(content || '').replace(/[#>*_`~[\]()!-]/g, '').slice(0, 180))}</p></div></td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${escapeHtml(String(row.username || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(row.username || '-')}</strong><small>${escapeHtml(row.created_at || '')}</small></div></div></td>
			<td>${statusBadge(String(row.status || 'pending'))}</td>
			<td><div class="admin-row-actions">
				${adminButton('admin.moderation.approve', '通过', { class: 'btn-sm', 'data-moderate': 'approved' }, 'btn-primary')}
				${adminButton('admin.moderation.reject', '拒绝', { class: 'btn-sm', 'data-moderate': 'rejected' })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-moderate-delete': '1' }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="6" class="muted" data-i18n="admin.moderation.empty">暂无待审核内容</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		<div class="admin-filter-tabs">
			<a class="${status === 'pending' ? 'active' : ''}" href="/admin/moderation?status=pending&pageSize=${pageSize}" data-i18n="admin.moderation.pending">待审核</a>
			<a class="${status === 'approved' ? 'active' : ''}" href="/admin/moderation?status=approved&pageSize=${pageSize}" data-i18n="admin.moderation.approved">已通过</a>
			<a class="${status === 'rejected' ? 'active' : ''}" href="/admin/moderation?status=rejected&pageSize=${pageSize}" data-i18n="admin.moderation.rejected">已拒绝</a>
		</div>
		<div class="toolbar-divider"></div>
		${adminButton('admin.moderation.bulkApprove', '批量通过', { id: 'moderation-bulk-approve', class: 'btn-sm' }, 'btn-primary')}
		${adminButton('admin.moderation.bulkReject', '批量拒绝', { id: 'moderation-bulk-reject', class: 'btn-sm' })}
		${adminButton('admin.moderation.bulkDelete', '批量删除', { id: 'moderation-bulk-delete', class: 'btn-sm' }, 'btn-danger')}
		<span class="badge ml-auto">${total} <span data-i18n="admin.common.totalSuffix">条</span></span>
	`);
	const defaultRejectReason = String(data.defaultRejectReason || '内容不符合社区规则，请修改后重新提交。');
	const rejectReasons = String(data.rejectReasons || defaultRejectReason).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
	if (!rejectReasons.includes(defaultRejectReason)) rejectReasons.unshift(defaultRejectReason);
	const rejectOptions = rejectReasons.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('');
	const table = adminTableShell(
		'moderation-table',
		`<tr><th class="admin-check"><input type="checkbox" id="moderation-check-all"></th><th data-i18n="admin.table.type">类型</th><th data-i18n="admin.table.content">内容</th><th data-i18n="admin.table.author">作者</th><th data-i18n="admin.table.status">状态</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${data.items.length}</span> / ${total}</span>${adminPager('/admin/moderation', page, pageSize, total, { status })}`
	);
	return renderAdminLayout({
		title: '审核管理',
		subtitle: '审核待发布的帖子和评论。',
		titleKey: 'admin.moderation.title',
		subtitleKey: 'admin.moderation.subtitle',
		active: 'moderation',
		user,
		content: `<div class="admin-workbench">${toolbar}${table}</div>
<div class="modal-ov" id="reject-modal"><div class="modal">
	<div class="modal-hd"><h3 data-i18n="admin.moderation.rejectDialogTitle">拒绝内容</h3><button class="modal-close" type="button" data-reject-cancel>×</button></div>
	<div class="field"><label data-i18n="admin.moderation.rejectReasonSelect">选择理由</label><select id="reject-reason-select">${rejectOptions}</select></div>
	<div class="field"><label data-i18n="admin.moderation.rejectExtra">补充说明</label><textarea id="reject-extra" rows="4" maxlength="500" data-i18n-placeholder="admin.moderation.rejectExtraPlaceholder" placeholder="可选，写给用户看的额外说明..."></textarea></div>
	<div class="modal-footer"><button class="btn" type="button" data-reject-cancel data-i18n="admin.common.cancel">取消</button><button class="btn btn-primary" type="button" id="reject-confirm" data-i18n="admin.moderation.confirmReject">确认拒绝</button></div>
</div></div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=!q||String(row.dataset.search||'').toLowerCase().includes(q);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
document.getElementById('admin-search')?.addEventListener('input',filterRows);
document.getElementById('moderation-check-all')?.addEventListener('change',function(){var checked=this.checked;document.querySelectorAll('[data-row]').forEach(function(row){if(row.style.display==='none')return;var cb=row.querySelector('[data-moderation-check]');if(cb)cb.checked=checked;});});
var DEFAULT_REJECT_REASON=${jsonScript(defaultRejectReason)};
var PENDING_REJECT=null;
function openRejectDialog(){return new Promise(function(resolve){var modal=document.getElementById('reject-modal');var select=document.getElementById('reject-reason-select');var extra=document.getElementById('reject-extra');if(select&&!select.value)select.value=DEFAULT_REJECT_REASON;if(extra)extra.value='';PENDING_REJECT=resolve;modal?.classList.add('open');setTimeout(function(){select?.focus();},0);});}
function closeRejectDialog(value){var modal=document.getElementById('reject-modal');modal?.classList.remove('open');if(PENDING_REJECT){PENDING_REJECT(value);PENDING_REJECT=null;}}
function rejectReasonValue(){var base=(document.getElementById('reject-reason-select')?.value||DEFAULT_REJECT_REASON).trim();var extra=(document.getElementById('reject-extra')?.value||'').trim();return extra?base+'\\n'+extra:base;}
document.querySelectorAll('[data-reject-cancel]').forEach(function(btn){btn.addEventListener('click',function(){closeRejectDialog('');});});
document.getElementById('reject-confirm')?.addEventListener('click',function(){closeRejectDialog(rejectReasonValue());});
function selectedModerationItems(){return Array.from(document.querySelectorAll('[data-moderation-check]:checked')).map(function(cb){return {type:cb.dataset.type,id:Number(cb.dataset.id)};}).filter(function(item){return item.id>0&&(item.type==='post'||item.type==='comment');});}
async function bulkModeration(action,status,btn){var items=selectedModerationItems();if(!items.length){showToast(t('admin.moderation.noSelection','请选择内容'),'err');return;}var reason='';if(action==='status'&&status==='rejected'){reason=await openRejectDialog();if(!reason)return;}var msg=action==='delete'?t('admin.moderation.bulkDeleteConfirm','删除选中的内容？'):status==='approved'?t('admin.moderation.bulkApproveConfirm','通过选中的内容？'):t('admin.moderation.bulkRejectConfirm','拒绝选中的内容？');if(!confirm(msg))return;try{await runButton(btn,action==='delete'?t('common.deleting','删除中...'):t('common.processing','处理中...'),async function(){var body={items:items};if(action==='status'){body.status=status;body.reason=reason;}var res=await fetch('/api/admin/moderation/bulk-'+action,{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.moderation.updateFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
document.getElementById('moderation-bulk-approve')?.addEventListener('click',function(){bulkModeration('status','approved',this);});
document.getElementById('moderation-bulk-reject')?.addEventListener('click',function(){bulkModeration('status','rejected',this);});
document.getElementById('moderation-bulk-delete')?.addEventListener('click',function(){bulkModeration('delete',null,this);});
document.addEventListener('click',async function(e){
	var act=e.target.closest('[data-moderate]');var del=e.target.closest('[data-moderate-delete]');
	if(act){var row=act.closest('[data-row]');var reason='';if(act.dataset.moderate==='rejected'){reason=await openRejectDialog();if(!reason)return;}try{await runButton(act,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/moderation/'+row.dataset.type+'/'+row.dataset.id,{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({status:act.dataset.moderate,reason:reason})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.moderation.updateFailed','操作失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){var row2=del.closest('[data-row]');if(!confirm(t('admin.moderation.deleteConfirm','删除这条内容？')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res2=await fetch('/api/admin/moderation/'+row2.dataset.type+'/'+row2.dataset.id,{method:'DELETE',headers:nonceHeaders(false)});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.moderation.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}}
});`
	});
}

