import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminLogs(user: UserPayload, data: {
	logs: AdminLogRow[];
	page: number;
	pageSize: number;
	total: number;
	q: string;
	action: string;
	resourceType: string;
}): string {
	const rows = data.logs.map((row) => {
		const actor = row.username || row.email || (row.user_id ? `#${row.user_id}` : 'system');
		const details = compactLogDetails(row.details);
		return `<tr>
			<td><div class="admin-cell-main">${escapeHtml(row.created_at || '')}</div></td>
			<td><span class="badge">${escapeHtml(row.action || '-')}</span></td>
			<td><div class="admin-cell-main">${escapeHtml(row.resource_type || '-')}</div><div class="admin-cell-sub">${escapeHtml(row.resource_id || '')}</div></td>
			<td><div class="admin-user-cell"><div class="avatar-sm">${escapeHtml(String(actor).slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(actor)}</strong><small>${row.user_id ? `#${escapeHtml(row.user_id)}` : 'system'}</small></div></div></td>
			<td><code>${escapeHtml(row.ip_address || '')}</code></td>
			<td><pre class="log-details">${escapeHtml(details || '-')}</pre></td>
		</tr>`;
	}).join('');
	const toolbar = adminToolbar(`
		<form class="admin-toolbar-form" method="get" action="/admin/logs">
			${adminInput({ name: 'q', value: data.q, placeholder: '搜索 action / 资源 / 详情 / IP...', 'data-i18n-placeholder': 'admin.logs.search' })}
			${adminInput({ name: 'action', value: data.action, placeholder: 'Action', 'data-i18n-placeholder': 'admin.logs.action' })}
			${adminInput({ name: 'resourceType', value: data.resourceType, placeholder: 'Resource', 'data-i18n-placeholder': 'admin.logs.resource' })}
			${adminButton('admin.common.search', '搜索', { type: 'submit' }, 'btn-primary')}
			<a class="btn" href="/admin/logs" data-i18n="admin.common.reset">重置</a>
		</form>
		<span class="badge ml-auto">${data.total} <span data-i18n="admin.common.totalSuffix">条</span></span>
	`);
	const table = adminTableShell(
		'logs-table',
		`<tr>
			<th data-i18n="admin.logs.time">时间</th>
			<th data-i18n="admin.logs.action">动作</th>
			<th data-i18n="admin.logs.resource">资源</th>
			<th data-i18n="admin.logs.user">用户</th>
			<th data-i18n="admin.logs.ip">IP</th>
			<th data-i18n="admin.logs.details">详情</th>
		</tr>`,
		rows || `<tr><td colspan="6" class="muted" data-i18n="admin.common.none">暂无数据</td></tr>`,
		adminPager('/admin/logs', data.page, data.pageSize, data.total, { q: data.q, action: data.action, resourceType: data.resourceType })
	);
	return renderAdminLayout({
		title: '日志管理',
		titleKey: 'admin.logs.title',
		subtitle: '查看邮件发送、后台操作和配置异常。',
		subtitleKey: 'admin.logs.subtitle',
		active: 'logs',
		user,
		head: `<style>
.logs-table th:nth-child(1),.logs-table td:nth-child(1){width:170px}.logs-table th:nth-child(2),.logs-table td:nth-child(2){width:180px}.logs-table th:nth-child(3),.logs-table td:nth-child(3){width:190px}.logs-table th:nth-child(4),.logs-table td:nth-child(4){width:190px}.logs-table th:nth-child(5),.logs-table td:nth-child(5){width:150px}.logs-table th:nth-child(6),.logs-table td:nth-child(6){width:45%}.log-details{margin:0;max-height:74px;overflow:auto;white-space:pre-wrap;font:12px/1.45 var(--mono);color:#b8c7da;background:#0b1017;border:1px solid rgba(96,120,150,.24);border-radius:8px;padding:8px}.admin-toolbar-form{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}.admin-toolbar-form .input{width:220px}
</style>`,
		content: `<div class="admin-workbench">${toolbar}${table}</div>`,
	});
}


