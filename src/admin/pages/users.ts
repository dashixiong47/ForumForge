import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminUsers(user: UserPayload, data: { users: any[]; roles?: Array<{ role: string }>; page?: number; pageSize?: number; total?: number } | any[]): string {
	const users = Array.isArray(data) ? data : data.users;
	const page = Math.max(1, Number(Array.isArray(data) ? 1 : data.page || 1));
	const pageSize = Math.max(1, Number(Array.isArray(data) ? users.length || 50 : data.pageSize || 50));
	const total = Number(Array.isArray(data) ? users.length : data.total ?? users.length);
	const roles = Array.isArray(data) ? ['user', 'moderator', 'manager', 'admin'] : (data.roles || []).map((row) => String(row.role || '')).filter(Boolean);
	const roleOptions = Array.from(new Set([...roles, 'user', 'moderator', 'manager', 'admin']))
		.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`)
		.join('');
	const rows = users.map((row) => {
		const id = escapeHtml(row.id);
		const initial = escapeHtml(String(row.username || row.email || '?').slice(0, 1).toUpperCase());
		const username = escapeHtml(row.username || '');
		const email = escapeHtml(row.email || '');
		const role = escapeHtml(row.role || 'user');
		const verified = !!row.verified;
		const now = Math.floor(Date.now() / 1000);
		const disabledUntil = Number(row.disabled_until || 0);
		const mutedUntil = Number(row.muted_until || 0);
		const disabled = disabledUntil > now;
		const muted = mutedUntil > now;
		const restrictionStatus = disabled ? 'disabled' : muted ? 'muted' : 'normal';
		const restrictionBadge = disabled
			? `<span class="badge badge-off" title="${escapeHtml(row.disabled_reason || '')}">禁用至 ${escapeHtml(new Date(disabledUntil * 1000).toLocaleString('zh-CN'))}</span>`
			: muted
				? `<span class="badge badge-info" title="${escapeHtml(row.muted_reason || '')}">禁言至 ${escapeHtml(new Date(mutedUntil * 1000).toLocaleString('zh-CN'))}</span>`
				: '<span class="badge badge-ok">正常</span>';
		const createdAt = escapeHtml(row.created_at || '');
		return `<tr data-row data-role="${escapeHtml(row.role || 'user')}" data-status="${row.verified ? 'verified' : 'unverified'}" data-restriction="${restrictionStatus}" data-search="${escapeHtml(`${row.id} ${row.username} ${row.email} ${row.role || ''}`)}">
			<td>${id}</td>
			<td><div class="admin-user-cell"><span class="avatar-sm">${row.avatar_url ? `<img src="${escapeHtml(row.avatar_url)}" alt="">` : initial}</span><div><strong>${username || '-'}</strong><small>${createdAt}</small></div></div></td>
			<td><span class="admin-cell-main">${email || '-'}</span></td>
			<td><span class="badge">${role}</span></td>
			<td><span class="badge ${verified ? 'badge-ok' : 'badge-off'}" data-i18n="${verified ? 'admin.status.verified' : 'admin.status.unverified'}">${verified ? '已验证' : '未验证'}</span></td>
			<td>${restrictionBadge}</td>
			<td>${Number(row.points || 0)} / ${Number(row.experience || 0)} / L${Number(row.level || 1)}</td>
			<td><div class="admin-row-actions">
				${adminButton('admin.common.edit', '编辑', { class: 'btn-sm', 'data-user-edit': id, 'data-username': username, 'data-email': email, 'data-role': role, 'data-verified': verified ? '1' : '0' }, 'btn-primary')}
				${muted ? adminButton('', '解除禁言', { class: 'btn-sm', 'data-user-restrict': id, 'data-action': 'unmute', 'data-username': username }, 'btn-outline') : adminButton('', '禁言', { class: 'btn-sm', 'data-user-restrict': id, 'data-action': 'mute', 'data-username': username }, 'btn-outline')}
				${disabled ? adminButton('', '启用', { class: 'btn-sm', 'data-user-restrict': id, 'data-action': 'enable', 'data-username': username }, 'btn-ok') : adminButton('', '禁用', { class: 'btn-sm', 'data-user-restrict': id, 'data-action': 'disable', 'data-username': username }, 'btn-danger')}
				${adminButton('admin.users.resend', '重发验证', { class: 'btn-sm', 'data-user-resend': id })}
				${adminButton('admin.common.delete', '删除', { class: 'btn-sm', 'data-user-delete': id, 'data-username': username }, 'btn-danger')}
			</div></td>
		</tr>`;
	}).join('') || `<tr><td colspan="8" class="muted" data-i18n="common.none">暂无数据</td></tr>`;
	const toolbar = adminToolbar(`
		${adminInput({ id: 'admin-search', 'data-i18n-placeholder': 'admin.common.searchPlaceholder', placeholder: '搜索...' })}
		${adminSelect('<option value="" data-i18n="admin.users.allRoles">全部角色</option>' + roleOptions, { id: 'user-role-filter' })}
		${adminSelect('<option value="" data-i18n="admin.users.allStatus">全部状态</option><option value="verified" data-i18n="admin.status.verified">已验证</option><option value="unverified" data-i18n="admin.status.unverified">未验证</option>', { id: 'user-status-filter' })}
		${adminSelect('<option value="">全部限制</option><option value="normal">正常</option><option value="muted">禁言中</option><option value="disabled">禁用中</option>', { id: 'user-restriction-filter' })}
		${adminButton('admin.users.add', '新增用户', { class: 'ml-auto', onclick: "openModal('user-create-modal')" }, 'btn-primary')}
	`);
	const table = adminTableShell(
		'users-table',
		`<tr><th data-i18n="admin.table.id">ID</th><th data-i18n="admin.table.username">用户名</th><th data-i18n="admin.table.email">邮箱</th><th data-i18n="admin.table.role">角色</th><th data-i18n="admin.table.status">验证</th><th>限制</th><th data-i18n="admin.users.progress">积分/经验/等级</th><th data-i18n="admin.table.actions">操作</th></tr>`,
		rows,
		`<span><span id="visible-count">${users.length}</span> / ${total}</span>${adminPager('/admin/users', page, pageSize, total)}`
	);
	return renderAdminLayout({
		title: '用户管理',
		subtitle: '创建用户、修改资料、角色、验证状态和密码。',
		titleKey: 'admin.users',
		subtitleKey: 'admin.users.subtitle',
		active: 'users',
		user,
	content: `
<div class="admin-workbench">
	${toolbar}
	${table}
</div>
<div class="modal-ov" id="user-edit-modal"><div class="modal">
	<div class="modal-hd"><h3 data-i18n="admin.common.edit">编辑</h3><button class="modal-close" onclick="closeModal('user-edit-modal')">×</button></div>
	<form id="user-edit" class="grid">
		<input type="hidden" name="id">
		${adminField('admin.table.username', '用户名', adminInput({ name: 'username', required: true }))}
		${adminField('admin.table.email', '邮箱', adminInput({ name: 'email', type: 'email', required: true }))}
		${adminField('admin.table.role', '角色', adminSelect(roleOptions, { name: 'role' }))}
		${adminField('admin.users.password', '密码', adminInput({ name: 'password', type: 'password', 'data-i18n-placeholder': 'admin.users.passwordPlaceholder', placeholder: '留空不改' }))}
		<label class="admin-switch"><input type="checkbox" name="verified"><span class="switch-track" aria-hidden="true"></span><span class="switch-label" data-i18n="admin.status.verified">已验证</span></label>
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('user-edit-modal')" }, 'btn-outline')}${adminButton('admin.common.save', '保存', { type: 'submit' }, 'btn-primary')}</div>
	</form>
</div></div>
<div class="modal-ov" id="user-create-modal"><div class="modal">
	<div class="modal-hd"><h3 data-i18n="admin.users.add">新增用户</h3><button class="modal-close" onclick="closeModal('user-create-modal')">×</button></div>
	<form id="user-create" class="grid">
		${adminField('admin.table.email', '邮箱', adminInput({ name: 'email', type: 'email', required: true }))}
		${adminField('admin.table.username', '用户名', adminInput({ name: 'username', required: true }))}
		${adminField('admin.users.password', '密码', adminInput({ name: 'password', type: 'password', required: true }))}
		${adminField('admin.table.role', '角色', adminSelect(roleOptions, { name: 'role' }))}
		<label class="badge"><input type="checkbox" name="verified" checked> <span data-i18n="admin.status.verified">已验证</span></label>
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('user-create-modal')" }, 'btn-outline')}${adminButton('admin.common.add', '添加', { type: 'submit' }, 'btn-primary')}</div>
	</form>
</div></div>
<div class="modal-ov" id="user-restrict-modal"><div class="modal">
	<div class="modal-hd"><h3 id="user-restrict-title">用户限制</h3><button class="modal-close" onclick="closeModal('user-restrict-modal')">×</button></div>
	<form id="user-restrict" class="grid">
		<input type="hidden" name="id"><input type="hidden" name="action">
		<p class="muted" id="user-restrict-target"></p>
		${adminField('', '时长', adminSelect('<option value="3600">1 小时</option><option value="86400">1 天</option><option value="604800">7 天</option><option value="2592000">30 天</option><option value="0">自定义截止时间</option>', { name: 'duration' }))}
		${adminField('', '自定义截止时间', adminInput({ name: 'until_local', type: 'datetime-local' }))}
		${adminField('', '原因', adminTextarea('', { name: 'reason', rows: 3, maxlength: 500, placeholder: '可选，记录给管理员看的原因' }))}
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('user-restrict-modal')" }, 'btn-outline')}${adminButton('', '确认', { type: 'submit' }, 'btn-primary')}</div>
	</form>
</div></div>
<div class="modal-ov" id="user-delete-modal"><div class="modal">
	<div class="modal-hd"><h3>删除用户</h3><button class="modal-close" onclick="closeModal('user-delete-modal')">×</button></div>
	<form id="user-delete" class="grid">
		<input type="hidden" name="id"><input type="hidden" name="username">
		<p class="muted" id="user-delete-hint"></p>
		${adminField('', '输入用户名确认删除', adminInput({ name: 'confirm', required: true, autocomplete: 'off' }))}
		<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('user-delete-modal')" }, 'btn-outline')}${adminButton('admin.common.delete', '删除', { type: 'submit' }, 'btn-danger')}</div>
	</form>
</div></div>`,
		script: `
function filterRows(){var q=(document.getElementById('admin-search').value||'').toLowerCase();var r=document.getElementById('user-role-filter').value;var s=document.getElementById('user-status-filter').value;var x=document.getElementById('user-restriction-filter').value;var n=0;document.querySelectorAll('[data-row]').forEach(function(row){var ok=(!q||String(row.dataset.search||'').toLowerCase().includes(q))&&(!r||row.dataset.role===r)&&(!s||row.dataset.status===s)&&(!x||row.dataset.restriction===x);row.style.display=ok?'':'none';if(ok)n++;});document.getElementById('visible-count').textContent=String(n);}
['admin-search','user-role-filter','user-status-filter','user-restriction-filter'].forEach(function(id){document.getElementById(id)?.addEventListener('input',filterRows);document.getElementById(id)?.addEventListener('change',filterRows);});
function field(form,name){return form.elements.namedItem(name);}
document.getElementById('user-create')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var payload={email:field(form,'email').value.trim(),username:field(form,'username').value.trim(),password:field(form,'password').value,role:field(form,'role').value,verified:field(form,'verified').checked};var res=await fetch('/api/admin/users',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.users.createFailed','创建失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('user-edit')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');var id=field(form,'id').value;var payload={username:field(form,'username').value.trim(),email:field(form,'email').value.trim(),role:field(form,'role').value,verified:field(form,'verified').checked,password:field(form,'password').value};try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/users/'+id+'/update',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.users.saveFailed','保存失败'));showToast(t('admin.users.saved','用户已保存'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('user-restrict')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');var id=field(form,'id').value;var action=field(form,'action').value;var reason=field(form,'reason').value.trim();var payload={action:action,reason:reason};if(action==='mute'||action==='disable'){var dur=Number(field(form,'duration').value||0);var untilLocal=field(form,'until_local').value;if(dur>0)payload.duration_seconds=dur;else if(untilLocal)payload.until=Math.floor(new Date(untilLocal).getTime()/1000);}try{await runButton(btn,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/users/'+id+'/restrict',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.error||'操作失败');location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.getElementById('user-delete')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');var id=field(form,'id').value;var username=field(form,'username').value;var confirmValue=field(form,'confirm').value.trim();if(confirmValue!==username){showToast('确认用户名不匹配','err');return;}try{await runButton(btn,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/users/'+id,{method:'DELETE',headers:nonceHeaders(true),body:JSON.stringify({confirm:confirmValue})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.users.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('click',async function(e){
	var edit=e.target.closest('[data-user-edit]');var del=e.target.closest('[data-user-delete]');var resend=e.target.closest('[data-user-resend]');var restrict=e.target.closest('[data-user-restrict]');
	if(edit){var form=document.getElementById('user-edit');field(form,'id').value=edit.dataset.userEdit;field(form,'username').value=edit.dataset.username||'';field(form,'email').value=edit.dataset.email||'';field(form,'role').value=edit.dataset.role||'user';field(form,'verified').checked=edit.dataset.verified==='1';field(form,'password').value='';openModal('user-edit-modal');}
	if(restrict){var action=restrict.dataset.action,form=document.getElementById('user-restrict');if(action==='unmute'||action==='enable'){try{await runButton(restrict,t('common.processing','处理中...'),async function(){var res=await fetch('/api/admin/users/'+restrict.dataset.userRestrict+'/restrict',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({action:action})});var data=await res.json();if(!res.ok)throw new Error(data.error||'操作失败');location.reload();});}catch(err){showToast(err.message||String(err),'err');}return;}field(form,'id').value=restrict.dataset.userRestrict;field(form,'action').value=action;field(form,'reason').value='';field(form,'duration').value='86400';field(form,'until_local').value='';document.getElementById('user-restrict-title').textContent=action==='mute'?'禁言用户':'禁用用户';document.getElementById('user-restrict-target').textContent='目标用户：'+(restrict.dataset.username||('#'+restrict.dataset.userRestrict));openModal('user-restrict-modal');}
	if(resend){try{await runButton(resend,t('common.processing','处理中...'),async function(done){var res2=await fetch('/api/admin/users/'+resend.dataset.userResend+'/resend',{method:'POST',headers:nonceHeaders(true),body:'{}'});var data2=await res2.json();if(!res2.ok)throw new Error(data2.error||t('admin.users.resendFailed','发送失败'));done();showToast(t('admin.users.resent','验证邮件已发送'));});}catch(err){showToast(err.message||String(err),'err');}}
	if(del){var df=document.getElementById('user-delete');field(df,'id').value=del.dataset.userDelete;field(df,'username').value=del.dataset.username||'';field(df,'confirm').value='';document.getElementById('user-delete-hint').textContent='此操作会删除该用户及其帖子、评论、点赞等内容。请输入用户名 '+(del.dataset.username||'')+' 确认。';openModal('user-delete-modal');}
});`
	});
}

export function renderAdminPermissions(user: UserPayload, data: { roles: Array<{ role: string; permissions: string[]; user_count?: number }>; roleNames?: Record<string, Record<string, string>> }): string {
	const roles = data.roles || [];
	const roleNames = data.roleNames || {};
	const builtinRoles = new Set(['admin', 'user']);
	const permissionGroups = [
		{ title: '内容管理', titleKey: 'admin.permissions.groupContent', desc: '帖子、评论、审核与媒体资源。', descKey: 'admin.permissions.groupContentDesc', keys: ['posts', 'comments', 'moderation', 'media'] },
		{ title: '站点结构', titleKey: 'admin.permissions.groupStructure', desc: '分类、标签和站点配置。', descKey: 'admin.permissions.groupStructureDesc', keys: ['categories', 'tags', 'settings'] },
		{ title: '系统管理', titleKey: 'admin.permissions.groupSystem', desc: '用户、角色权限、插件和翻译。', descKey: 'admin.permissions.groupSystemDesc', keys: ['dashboard', 'users', 'permissions', 'plugins', 'translations'] },
	];
	const optionByKey = new Map(adminPermissionOptions.map((item) => [item.key, item]));
	const roleCards = roles.map((role, index) => {
		const locked = role.role === 'admin';
		const selected = new Set(role.permissions || []);
		const active = index === 0 ? ' active' : '';
		const permissionCount = locked ? adminPermissionOptions.length : selected.size;
		const displayName = (roleNames[role.role]?.['zh-CN'] || roleNames[role.role]?.['en-US'] || role.role);
		return `<button type="button" class="role-pill${active}" data-role-tab="${escapeHtml(role.role)}">
			<span><strong>${escapeHtml(displayName)}</strong><small>${Number(role.user_count || 0)} <span data-i18n="admin.stats.users">用户</span></small></span>
			<em>${locked ? 'Full' : `${permissionCount}/${adminPermissionOptions.length}`}</em>
		</button>`;
	}).join('');
	const rolePanels = roles.map((role, index) => {
		const locked = role.role === 'admin';
		const builtin = builtinRoles.has(role.role);
		const selected = new Set(role.permissions || []);
		const groups = permissionGroups.map((group) => {
			const toggles = group.keys.map((key) => {
				const perm = optionByKey.get(key);
				if (!perm) return '';
				const checked = locked || selected.has(perm.key);
				return `<label class="permission-toggle${checked ? ' is-on' : ''}${locked ? ' is-locked' : ''}">
					<input type="checkbox" data-role="${escapeHtml(role.role)}" value="${escapeHtml(perm.key)}"${checked ? ' checked' : ''}${locked ? ' disabled' : ''}>
					<span class="toggle-mark"></span>
					<span><strong data-i18n="${escapeHtml(perm.i18n)}">${escapeHtml(perm.label)}</strong><small>${escapeHtml(perm.key)}</small></span>
				</label>`;
			}).join('');
			return `<section class="permission-group">
				<div class="permission-group-hd"><h3 data-i18n="${escapeHtml(group.titleKey)}">${escapeHtml(group.title)}</h3><p data-i18n="${escapeHtml(group.descKey)}">${escapeHtml(group.desc)}</p></div>
				<div class="permission-toggle-grid">${toggles}</div>
			</section>`;
		}).join('');
		const panelName = (roleNames[role.role]?.['zh-CN'] || roleNames[role.role]?.['en-US'] || role.role);
		return `<div class="role-panel${index === 0 ? ' active' : ''}" data-role-panel="${escapeHtml(role.role)}">
			<div class="role-panel-head">
				<div><h2>${escapeHtml(panelName)}<small style="margin-left:8px;font-size:14px;color:var(--muted);font-weight:400">${escapeHtml(role.role)}</small></h2><p data-i18n="${locked ? 'admin.permissions.lockedHint' : 'admin.permissions.editHint'}">${locked ? '系统管理员固定拥有全部权限。' : '勾选该角色可以访问的后台模块。'}</p></div>
				<div class="admin-row-actions">${locked ? `<span class="badge badge-ok" data-i18n="admin.permissions.locked">管理员角色拥有全部权限</span>` : `${builtin ? `<span class="badge" data-i18n="admin.permissions.builtinRole">内置角色</span>` : adminButton('admin.permissions.deleteRole', '删除角色', { class: 'btn-sm', 'data-delete-role': role.role }, 'btn-danger')}${adminButton('admin.common.save', '保存', { 'data-save-role': role.role }, 'btn-primary')}`}</div>
			</div>
			${groups}
		</div>`;
	}).join('');
	return renderAdminLayout({
		title: '权限管理',
		subtitle: '集中维护角色权限，用户管理里只分配角色。',
		titleKey: 'admin.permissions.title',
		subtitleKey: 'admin.permissions.subtitle',
		active: 'permissions',
		user,
		content: `<div class="admin-workbench permission-workbench">
			<div class="permission-layout">
				<aside class="permission-roles">
					<button type="button" class="role-create" onclick="openModal('role-create-modal')"><strong data-i18n="admin.permissions.addRole">新增角色</strong><small data-i18n="admin.permissions.addRoleHint">创建自定义后台角色</small></button>
					${roleCards}
				</aside>
				<section class="permission-editor">${rolePanels}</section>
			</div>
		</div>
		<div class="modal-ov" id="role-create-modal"><div class="modal">
			<div class="modal-hd"><h3 data-i18n="admin.permissions.createRole">创建角色</h3><button class="modal-close" onclick="closeModal('role-create-modal')">×</button></div>
			<form id="role-create" class="grid">
				${adminField('admin.permissions.roleName', '角色标识', adminInput({ name: 'role', required: true, pattern: '[a-z][a-z0-9_-]{1,31}', placeholder: 'operator' }), 'admin.permissions.roleNameHint', '只能使用小写字母、数字、下划线和短横线。')}
				<div class="modal-footer">${adminButton('admin.common.cancel', '取消', { type: 'button', onclick: "closeModal('role-create-modal')" }, 'btn-outline')}${adminButton('admin.permissions.createRole', '创建角色', { type: 'submit' }, 'btn-primary')}</div>
			</form>
		</div></div>`,
		head: `<style>
.permission-workbench{grid-template-rows:minmax(0,1fr);padding-top:0}.permission-layout{min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;overflow:hidden}.permission-roles{min-height:0;overflow:auto;display:grid;align-content:start;gap:8px}.role-create,.role-pill{width:100%;border:1px solid var(--border);border-radius:12px;background:#0d131d;color:var(--text);padding:12px;display:flex;align-items:center;justify-content:space-between;text-align:left}.role-create{border-style:dashed;background:linear-gradient(135deg,rgba(88,166,255,.12),rgba(63,185,80,.05));display:grid;gap:4px}.role-create:hover,.role-pill:hover,.role-pill.active{border-color:rgba(88,166,255,.65);background:linear-gradient(135deg,rgba(88,166,255,.16),rgba(63,185,80,.05))}.role-create small,.role-pill small,.role-pill em{color:var(--muted);font-style:normal;font-size:12px}.role-pill span{display:grid;gap:3px}.permission-editor{min-height:0;overflow:auto}.role-panel{display:none;min-height:100%;border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,rgba(88,166,255,.045),rgba(13,19,32,.86));overflow:hidden}.role-panel.active{display:block}.role-panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border);background:rgba(13,19,32,.72)}.role-panel-head h2{margin:0;font-size:24px}.role-panel-head p{margin:5px 0 0;color:var(--muted)}.permission-group{padding:18px 20px;border-bottom:1px solid var(--border)}.permission-group:last-child{border-bottom:0}.permission-group-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px}.permission-group-hd h3{margin:0;font-size:16px}.permission-group-hd p{margin:0;color:var(--muted)}.permission-toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px}.permission-toggle{border:1px solid var(--border);border-radius:12px;background:#0b1017;padding:12px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;cursor:pointer}.permission-toggle input{position:absolute;opacity:0;pointer-events:none}.permission-toggle strong{display:block}.permission-toggle small{display:block;margin-top:2px;color:var(--muted);font-size:12px}.toggle-mark{width:34px;height:20px;border-radius:999px;background:#30363d;position:relative;transition:.16s}.toggle-mark:after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#c9d1d9;transition:.16s}.permission-toggle.is-on{border-color:rgba(88,166,255,.5);background:rgba(88,166,255,.09)}.permission-toggle.is-on .toggle-mark{background:linear-gradient(135deg,var(--accent),#3fb950)}.permission-toggle.is-on .toggle-mark:after{left:17px;background:#fff}.permission-toggle.is-locked{opacity:.75;cursor:not-allowed}@media(max-width:1100px){.permission-layout{grid-template-columns:1fr}.permission-roles{grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}.permission-toggle-grid{grid-template-columns:1fr}}
		</style>`,
		script: `
function collectRolePermissions(role){return Array.from(document.querySelectorAll('input[data-role="'+role+'"]:checked')).map(function(cb){return cb.value;});}
function showRole(role){document.querySelectorAll('[data-role-tab]').forEach(function(el){el.classList.toggle('active',el.dataset.roleTab===role);});document.querySelectorAll('[data-role-panel]').forEach(function(el){el.classList.toggle('active',el.dataset.rolePanel===role);});}
async function saveRole(role,btn){if(role==='admin'){showToast(t('admin.permissions.locked','管理员角色拥有全部权限'));return;}try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/permissions/'+encodeURIComponent(role),{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({permissions:collectRolePermissions(role)})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.permissions.saveFailed','保存失败'));done();showToast(t('admin.permissions.saved','权限已保存'));setTimeout(function(){location.reload();},350);});}catch(err){showToast(err.message||String(err),'err');}}
document.addEventListener('click',function(e){var btn=e.target.closest('[data-save-role]');if(btn)saveRole(btn.dataset.saveRole,btn);});
document.addEventListener('click',function(e){var tab=e.target.closest('[data-role-tab]');if(tab)showRole(tab.dataset.roleTab);});
document.addEventListener('click',async function(e){var del=e.target.closest('[data-delete-role]');if(!del)return;if(!confirm(t('admin.permissions.deleteConfirm','删除这个角色？请先把用户移动到其他角色。')))return;try{await runButton(del,t('common.deleting','删除中...'),async function(){var res=await fetch('/api/admin/permissions/'+encodeURIComponent(del.dataset.deleteRole),{method:'DELETE',headers:nonceHeaders(false)});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.permissions.deleteFailed','删除失败'));location.reload();});}catch(err){showToast(err.message||String(err),'err');}});
document.addEventListener('change',function(e){var cb=e.target.closest('.permission-toggle input');if(cb)cb.closest('.permission-toggle').classList.toggle('is-on',cb.checked);});
document.getElementById('role-create')?.addEventListener('submit',async function(e){e.preventDefault();var form=this,btn=form.querySelector('button[type="submit"]');try{await runButton(btn,t('common.processing','处理中...'),async function(){var role=form.role.value.trim().toLowerCase();var res=await fetch('/api/admin/permissions',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({role:role})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.permissions.createFailed','创建失败'));location.href='/admin/permissions';});}catch(err){showToast(err.message||String(err),'err');}});
`
	});
}


