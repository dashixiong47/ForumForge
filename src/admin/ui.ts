import { escapeHtml } from '../utils/html';

export function tr(key: string, fallback: string): string {
	return `<span data-i18n="${escapeHtml(key)}">${escapeHtml(fallback)}</span>`;
}

export function adminPanel(titleKey: string, title: string, descKey: string, desc: string, body: string, extraClass = ''): string {
	return `<section class="admin-panel${extraClass ? ` ${extraClass}` : ''}">
		<div class="admin-panel-hd"><div><h2 data-i18n="${escapeHtml(titleKey)}">${escapeHtml(title)}</h2><p data-i18n="${escapeHtml(descKey)}">${escapeHtml(desc)}</p></div></div>
		<div class="admin-panel-body">${body}</div>
	</section>`;
}

export function adminField(labelKey: string, label: string, control: string, hintKey?: string, hint?: string): string {
	return `<div class="field"><label data-i18n="${escapeHtml(labelKey)}">${escapeHtml(label)}</label>${control}${hint ? `<p class="field-hint"${hintKey ? ` data-i18n="${escapeHtml(hintKey)}"` : ''}>${escapeHtml(hint)}</p>` : ''}</div>`;
}

export type AdminAttrs = Record<string, string | number | boolean | null | undefined>;

function attrString(attrs: AdminAttrs = {}): string {
	return Object.entries(attrs)
		.filter(([, value]) => value !== false && value !== null && value !== undefined)
		.map(([key, value]) => value === true ? escapeHtml(key) : `${escapeHtml(key)}="${escapeHtml(value)}"`)
		.join(' ');
}

function joinClass(base: string, extra?: string | number | boolean | null): string {
	return [base, extra].filter(Boolean).join(' ');
}

export function adminInput(attrs: AdminAttrs = {}): string {
	const { class: extraClass, ...rest } = attrs;
	return `<input ${attrString({ ...rest, class: joinClass('input', extraClass) })}>`;
}

// Password input wrapped with a show/hide eye toggle button
export function adminPasswordInput(attrs: AdminAttrs = {}): string {
	const id = String(attrs.id || '');
	const { class: extraClass, ...rest } = attrs;
	const inputHtml = `<input ${attrString({ ...rest, type: 'password', class: joinClass('input', extraClass) })}>`;
	const eyeBtn = `<button type="button" class="eye-btn" onclick="togglePwField('${escapeHtml(id)}')" aria-label="显示/隐藏">${icon('eye')}</button>`;
	return `<div class="pw-wrap">${inputHtml}${eyeBtn}</div>`;
}

export function adminTextarea(value = '', attrs: AdminAttrs = {}): string {
	const { class: extraClass, ...rest } = attrs;
	return `<textarea ${attrString({ ...rest, class: joinClass('textarea', extraClass) })}>${escapeHtml(value)}</textarea>`;
}

export function adminSelect(options: string, attrs: AdminAttrs = {}): string {
	const { class: extraClass, ...rest } = attrs;
	return `<select ${attrString({ ...rest, class: joinClass('select', extraClass) })}>${options}</select>`;
}

export function adminButton(labelKey: string, label: string, attrs: AdminAttrs = {}, variant = ''): string {
	const { class: extraClass, ...rest } = attrs;
	const i18nAttr = labelKey ? { 'data-i18n': labelKey } : {};
	return `<button ${attrString({ type: 'button', ...rest, class: joinClass(`btn${variant ? ` ${variant}` : ''}`, extraClass), ...i18nAttr })}>${escapeHtml(label)}</button>`;
}

export function adminSwitch(id: string, labelKey: string, label: string, checked = false, attrs: AdminAttrs = {}): string {
	const { class: extraClass, ...rest } = attrs;
	return `<label ${attrString({ class: joinClass('admin-switch', extraClass), ...rest })}>
		<input type="checkbox" id="${escapeHtml(id)}" ${checked ? 'checked' : ''}>
		<span class="switch-track" aria-hidden="true"></span>
		<span class="switch-label" data-i18n="${escapeHtml(labelKey)}">${escapeHtml(label)}</span>
	</label>`;
}

export function adminToolbar(body: string, extraClass = ''): string {
	return `<div class="admin-toolbar${extraClass ? ` ${extraClass}` : ''}">${body}</div>`;
}

export function adminTableShell(tableClass: string, thead: string, tbody: string, footer = ''): string {
	return `<div class="admin-table-shell">
		<div class="admin-table-scroll">
			<table class="table${tableClass ? ` ${tableClass}` : ''}">
				<thead>${thead}</thead>
				<tbody>${tbody}</tbody>
			</table>
		</div>
		${footer ? `<div class="admin-footer">${footer}</div>` : ''}
	</div>`;
}

export function adminMetricCard(labelKey: string, label: string, value: unknown): string {
	return `<section class="metric-card">
		<span data-i18n="${escapeHtml(labelKey)}">${escapeHtml(label)}</span>
		<strong>${escapeHtml(value)}</strong>
	</section>`;
}

export function adminMiniTable(titleKey: string, title: string, headers: Array<{ key: string; label: string }>, rows: string, colSpan: number): string {
	const thead = headers.map((header) => `<th data-i18n="${escapeHtml(header.key)}">${escapeHtml(header.label)}</th>`).join('');
	return `<section class="admin-panel mini-table-panel">
		<div class="admin-panel-hd"><div><h2 data-i18n="${escapeHtml(titleKey)}">${escapeHtml(title)}</h2></div></div>
		<div class="admin-table-scroll">
			<table class="table mini-table">
				<thead><tr>${thead}</tr></thead>
				<tbody>${rows || `<tr><td colspan="${colSpan}" class="muted" data-i18n="common.none">暂无数据</td></tr>`}</tbody>
			</table>
		</div>
	</section>`;
}

export function adminPager(path: string, page: number, pageSize: number, total: number, params: Record<string, string | number | boolean | null | undefined> = {}): string {
	const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
	const build = (targetPage: number, targetPageSize = pageSize) => {
		const query = new URLSearchParams();
		Object.entries(params).forEach(([key, value]) => {
			if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
		});
		query.set('page', String(targetPage));
		query.set('pageSize', String(targetPageSize));
		return `${path}?${query.toString()}`;
	};
	const prevDisabled = page <= 1;
	const nextDisabled = page >= totalPages;
	const pageSizeSelect = `<label class="pager-size"><span data-i18n="admin.common.pageSize">每页</span><select onchange="location.href=this.value">${[20, 50, 100].map((size) => `<option value="${escapeHtml(build(1, size))}"${size === pageSize ? ' selected' : ''}>${size}</option>`).join('')}</select></label>`;
	return `<div class="pager">
		<a class="btn btn-sm${prevDisabled ? ' is-disabled' : ''}" href="${escapeHtml(build(page - 1))}"${prevDisabled ? ' aria-disabled="true"' : ''} data-i18n="admin.common.previous">上一页</a>
		<span>${page} / ${totalPages} <span data-i18n="admin.common.pageSuffix">页</span> · ${total} <span data-i18n="admin.common.totalSuffix">条</span></span>
		<a class="btn btn-sm${nextDisabled ? ' is-disabled' : ''}" href="${escapeHtml(build(page + 1))}"${nextDisabled ? ' aria-disabled="true"' : ''} data-i18n="admin.common.next">下一页</a>
		${pageSizeSelect}
	</div>`;
}

export function icon(name: string): string {
	const attrs = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
	const paths: Record<string, string> = {
		chart: '<path d="M3 3v18h18"/><path d="M7 14v3"/><path d="M12 9v8"/><path d="M17 5v12"/>',
		post: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
		comment: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h6"/>',
		shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/>',
		users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
		folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
		tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/>',
		media: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 15-4-4a2 2 0 0 0-2.8 0L9 16"/><path d="m3 15 3-3a2 2 0 0 1 2.8 0l2.2 2.2"/>',
		plugin: '<path d="M9 2v5"/><path d="M15 2v5"/><path d="M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0Z"/><path d="M12 19v3"/>',
		log: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
		globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/>',
		settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.36.24.72.6 1 1 .26.4.4.82.4 1.1V12a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
		eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
		'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
	};
	return `<svg ${attrs}>${paths[name] || paths.post}</svg>`;
}
