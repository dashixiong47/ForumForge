import { escapeHtml, jsonScript } from '../../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../../gamification/progress';
import { publicPostPath, publicUserPath } from '../../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../../assets/brand';
import { extractMedia, readingMinutes, stripMarkdown } from '../markdown';
import { renderPostArticleHtml } from '../post-content';
import type { PageState, SiteCategory, SiteComment, SiteLanguage, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from '../types';
import { SITE_NAME,attr,avatar,brandMark,canManagePost,canViewPostContent,dateText,faviconLinks,hasRealEmail,i18n,i18nText,levelBar,likeButton,mdTool,pageLink,postManageActions,postMedia,postPinBadges,postRow,postTags,profileAvatar,rejectReasonNote,renderComments,renderSiteLayout,roleLabel,siteBrand,siteHtmlResponse,statIcon,statNode,statusBadge,tabPager,toolbarIcon, type HoverProfile,type LayoutOptions,type SiteBrand,type StatKind } from './_shared';

export function renderNewPostPage(options: {
	user: SiteUser;
	env?: Partial<Env> | Record<string, unknown>;
	brand?: SiteBrand;
	categories: SiteCategory[];
	tags: SiteTag[];
	post?: SitePost | null;
	languages?: SiteLanguage[];
	locale?: string;
	postI18nEnabled?: boolean;
	videoEmbedDomains?: string[];
}): string {
	const post = options.post || null;
	const normalizeLocale = (value: unknown) => {
		const raw = String(value || '').trim();
		if (!raw) return '';
		const mapped = raw.toLowerCase() === 'zh' ? 'zh-CN' : raw.toLowerCase() === 'en' ? 'en-US' : raw;
		const match = mapped.match(/^([a-z]{2})(?:[-_]([a-z]{2}))?$/i);
		if (!match) return '';
		return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
	};
	const languages = (options.languages?.length ? options.languages : [
		{ code: 'zh-CN', name: 'Chinese', native_name: '简体中文', enabled: 1 },
		{ code: 'en-US', name: 'English', native_name: 'English', enabled: 1 },
	] as SiteLanguage[]).map((lang) => ({ ...lang, code: normalizeLocale(lang.code) || lang.code }));
	const activeLocale = normalizeLocale(options.locale) || languages[0]?.code || 'zh-CN';
	const canUsePostI18n = Boolean(options.postI18nEnabled || options.user.role === 'admin');
	const translationMap: Record<string, { title: string; content: string }> = {};
	for (const [localeKey, value] of Object.entries(post?.translations || {})) {
		const locale = normalizeLocale((value as any)?.locale || localeKey);
		if (!locale) continue;
		translationMap[locale] = {
			title: String((value as any)?.title || ''),
			content: String((value as any)?.content || ''),
		};
	}
	if (post && !translationMap[activeLocale]) {
		translationMap[activeLocale] = { title: String(post.title || ''), content: String(post.content || '') };
	}
	const initialTranslation = canUsePostI18n
		? (translationMap[activeLocale] || { title: String(post?.title || ''), content: String(post?.content || '') })
		: { title: String(post?.title || ''), content: String(post?.content || '') };
	const initialTitle = initialTranslation.title;
	const initialContent = initialTranslation.content;
	const selectedCategory = String((post as any)?.category_id || '');
	const minViewLevel = Math.max(0, Number(post?.min_view_level || 0));
	const minCommentLevel = Math.max(0, Number(post?.min_comment_level || 0));
	const selectedTags = new Set((post?.tags || []).map((tag) => Number(tag.id)));
	const categoryOptions = [`<option value="" data-i18n="post.uncategorized">无分类</option>`, ...options.categories.map((cat) => `<option value="${cat.id}" ${String(cat.id) === selectedCategory ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`)].join('');
	const tagOptions = options.tags.map((tag) => `<label class="tag-check"><input type="checkbox" name="tag_ids" value="${tag.id}" ${selectedTags.has(Number(tag.id)) ? 'checked' : ''}><span>#${escapeHtml(tag.name)}</span></label>`).join('') || '<span class="muted" data-i18n="compose.noTags">暂无标签</span>';
	const modeTitle = post ? '编辑帖子' : '发布新帖';
	const postStatus = String((post as any)?.status || (post ? 'approved' : '')).toLowerCase();
	const showDraftButton = !post || postStatus === 'draft';
	const emailVerified = Number(options.user.verified || 0) === 1;
	const verifyNotice = emailVerified ? '' : '<div class="status-note"><strong data-i18n="settings.emailUnverifiedTitle">邮箱未验证</strong><span data-i18n="settings.emailUnverifiedHint">请先完成邮箱验证，验证后才能发布内容、评论、点赞、签到和上传帖子媒体。</span><button class="btn" type="button" data-resend-verification data-i18n="settings.resendVerification">重新发送验证邮件</button></div>';
	const languageSwitch = canUsePostI18n ? `<div class="compose-language" data-post-i18n>
				<input type="hidden" name="locale" value="${attr(activeLocale)}">
				<textarea name="translations_json" hidden>${escapeHtml(JSON.stringify(translationMap))}</textarea>
				<label class="compose-language-label" for="compose-locale" data-i18n="compose.postLanguage">帖子语言</label>
				<select id="compose-locale" class="compose-lang-select" data-post-locale>${languages.map((lang) => {
					const code = lang.code;
					const name = lang.native_name || lang.name || code;
					return `<option value="${attr(code)}" ${code === activeLocale ? 'selected' : ''}>${escapeHtml(name)}</option>`;
				}).join('')}</select>
			</div>` : '';
	const composeStyle = `<style>
.form-shell .compose-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding:14px 16px}
.form-shell .compose-head h2{margin:0;border:0;padding:0}
.compose-head-right{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-left:auto;min-width:0}
.compose-language{display:flex;align-items:center;gap:8px;min-width:0}
.compose-language-label{color:var(--muted);font-size:12px;font-weight:800;white-space:nowrap}
.compose-lang-select{height:32px;min-width:138px;border:1px solid rgba(88,166,255,.36);border-radius:999px;background-color:#0d1320;color:#dceaff;padding:0 34px 0 12px;font-weight:900;outline:none;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%239ecbff' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:14px 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.compose-lang-select:hover,.compose-lang-select:focus{border-color:rgba(88,166,255,.78);background-color:#101b2d;box-shadow:0 0 0 3px rgba(88,166,255,.12)}
.content-count{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;color:var(--muted);font-size:12px;font-weight:800;margin:0;white-space:nowrap}
.content-count.is-over{color:var(--danger)}
.compose-editor .panel-body{min-height:0;flex:1;overflow:hidden;display:flex;flex-direction:column}
.compose-editor .panel-body .field{min-height:0;flex:1;margin:0;display:flex;flex-direction:column}
.compose-editor textarea[name="content"]{flex:1;width:100%;min-height:0;height:100%;resize:none}
@media(max-width:900px){.form-shell .compose-head{align-items:flex-start;flex-direction:column}.compose-head-right{width:100%;justify-content:space-between;margin-left:0}.compose-language{min-width:0}.compose-lang-select{min-width:120px;max-width:48vw}}
</style>`;
	const maxTitleLength = Math.max(10, Math.min(500, Number((options as any).maxTitleLength || 100)));
	const maxContentLength = Math.max(100, Math.min(100000, Number((options as any).maxContentLength || 3000)));
	const composeModals = `
<style>
.md-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
.md-modal-ov[hidden]{display:none}
.md-modal{background:var(--panel);border:1px solid var(--border);border-radius:14px;width:min(96vw,540px);max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
.md-modal.wide{width:min(96vw,740px)}
.md-modal-hd{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.md-modal-hd h3{margin:0;font-size:17px}
.md-modal-close{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0 4px;line-height:1}
.md-modal-body{padding:16px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px}
.md-field{display:flex;flex-direction:column;gap:4px}
.md-field label{font-size:13px;color:var(--muted);font-weight:500}
.md-field input,.md-field textarea{background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:8px 12px;font-size:14px;font-family:inherit}
.md-field textarea{resize:vertical;font-family:var(--mono)}
.md-field-row{display:flex;gap:12px;align-items:flex-end}
.md-field-row .md-field{flex:1}
.md-check-row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.md-check{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer}
.md-modal-ft{padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px}
.md-img-preview{min-height:60px;border:1px dashed var(--border);border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--muted);font-size:13px}
.md-img-preview img{max-width:100%;max-height:300px;object-fit:contain}
</style>

<!-- Image modal -->
<div id="md-img-modal" class="md-modal-ov" hidden>
  <div class="md-modal">
    <div class="md-modal-hd"><h3 data-i18n="compose.modal.image">插入图片</h3><button class="md-modal-close" id="md-img-close">×</button></div>
    <div class="md-modal-body">
      <div class="md-field"><label data-i18n="compose.modal.imageUrl">图片地址</label><input id="md-img-url" type="url" placeholder="https://..."></div>
      <div class="md-field"><label data-i18n="compose.modal.imageAlt">描述文字</label><input id="md-img-alt" placeholder="图片描述"></div>
      <div class="md-field-row">
        <div class="md-field"><label data-i18n="compose.modal.imageWidth">宽度 (px, 0=自动)</label><input id="md-img-w" type="number" min="0" max="4096" placeholder="640"></div>
        <div class="md-field"><label data-i18n="compose.modal.imageHeight">高度 (px, 0=自动)</label><input id="md-img-h" type="number" min="0" max="4096" placeholder="360"></div>
      </div>
      <div class="md-check-row">
        <label class="md-check"><input type="checkbox" id="md-img-block" checked><span data-i18n="compose.modal.imageBlock">独立成行</span></label>
        <label class="md-check"><input type="radio" name="md-img-align" value="left" checked><span data-i18n="compose.modal.alignLeft">居左</span></label>
        <label class="md-check"><input type="radio" name="md-img-align" value="center"><span data-i18n="compose.modal.alignCenter">居中</span></label>
        <label class="md-check"><input type="radio" name="md-img-align" value="right"><span data-i18n="compose.modal.alignRight">居右</span></label>
      </div>
      <div class="md-img-preview" id="md-img-preview"><span data-i18n="compose.modal.imagePreviewHint">填入地址后预览</span></div>
    </div>
    <div class="md-modal-ft">
      <button class="btn" id="md-img-cancel" data-i18n="common.cancel">取消</button>
      <button class="btn primary" id="md-img-ok" data-i18n="common.confirm">插入</button>
    </div>
  </div>
</div>

<!-- Link modal -->
<div id="md-lnk-modal" class="md-modal-ov" hidden>
  <div class="md-modal">
    <div class="md-modal-hd"><h3 data-i18n="compose.modal.link">插入链接</h3><button class="md-modal-close" id="md-lnk-close">×</button></div>
    <div class="md-modal-body">
      <div class="md-field"><label data-i18n="compose.modal.linkUrl">链接地址</label><input id="md-lnk-url" type="url" placeholder="https://"></div>
      <div class="md-field"><label data-i18n="compose.modal.linkText">显示文字</label><input id="md-lnk-text" placeholder="链接文字"></div>
    </div>
    <div class="md-modal-ft">
      <button class="btn" id="md-lnk-cancel" data-i18n="common.cancel">取消</button>
      <button class="btn primary" id="md-lnk-ok" data-i18n="common.confirm">插入</button>
    </div>
  </div>
</div>

<!-- Video modal -->
<div id="md-vid-modal" class="md-modal-ov" hidden>
  <div class="md-modal">
    <div class="md-modal-hd"><h3 data-i18n="compose.modal.video">插入视频</h3><button class="md-modal-close" id="md-vid-close">×</button></div>
    <div class="md-modal-body">
      <div class="md-field"><label data-i18n="compose.modal.videoUrl">视频地址</label><input id="md-vid-url" type="url" placeholder="https://youtu.be/..."></div>
      <div class="md-field"><label data-i18n="compose.modal.videoHeight">高度 px</label><input id="md-vid-h" type="number" min="100" max="2000" value="400" step="50"></div>
      <div class="md-check-row">
        <label class="md-check"><input type="checkbox" id="md-vid-block" checked><span data-i18n="compose.modal.imageBlock">独立成行</span></label>
      </div>
    </div>
    <div class="md-modal-ft">
      <button class="btn" id="md-vid-cancel" data-i18n="common.cancel">取消</button>
      <button class="btn primary" id="md-vid-ok" data-i18n="common.confirm">插入</button>
    </div>
  </div>
</div>`;
	const composeModalScript = `
var _mdArea=null;
function openMdModal(id,area){_mdArea=area;document.getElementById(id).removeAttribute('hidden');}
function closeMdModal(id){document.getElementById(id).setAttribute('hidden','');}
document.querySelectorAll('.md-modal-ov').forEach(function(ov){ov.addEventListener('click',function(e){if(e.target===ov)ov.setAttribute('hidden','');});});

// IMAGE MODAL
document.getElementById('md-img-url').addEventListener('input',function(){
  var url=this.value.trim();
  var prev=document.getElementById('md-img-preview');
  if(url){prev.innerHTML='<img src="'+escapeHtmlClient(url)+'" style="max-width:100%;max-height:240px;object-fit:contain">';}
  else{prev.innerHTML='<span data-i18n="compose.modal.imagePreviewHint">填入地址后预览</span>';}
});
['md-img-close','md-img-cancel'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){closeMdModal('md-img-modal');});});
document.getElementById('md-img-ok').addEventListener('click',function(){
  var url=document.getElementById('md-img-url').value.trim();
  if(!url)return;
  var alt=document.getElementById('md-img-alt').value.trim()||siteT('compose.imageAlt','图片描述');
  var w=parseInt(document.getElementById('md-img-w').value)||0;
  var h=parseInt(document.getElementById('md-img-h').value)||0;
  var block=document.getElementById('md-img-block').checked;
  var align=document.querySelector('input[name="md-img-align"]:checked')?.value||'left';
  var size=(w||h)?' ='+(w||'')+'x'+(h||''):'';
  var md='!['+alt+']('+url+size+')';
  if(align==='center')md='<div style="text-align:center">'+md+'</div>';
  else if(align==='right')md='<div style="text-align:right">'+md+'</div>';
  if(block){insertMarkdownBlock(_mdArea,md,_mdArea.selectionStart||_mdArea.value.length,_mdArea.selectionEnd||_mdArea.value.length);}
  else{applyMarkdown(_mdArea,'','',md);}
  closeMdModal('md-img-modal');
});

// LINK MODAL
['md-lnk-close','md-lnk-cancel'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){closeMdModal('md-lnk-modal');});});
document.getElementById('md-lnk-ok').addEventListener('click',function(){
  var url=document.getElementById('md-lnk-url').value.trim();
  if(!url)return;
  var text=document.getElementById('md-lnk-text').value.trim()||url;
  var area=_mdArea;
  var s=area.selectionStart||0,e=area.selectionEnd||0;
  var md='['+text+']('+url+')';
  area.value=area.value.slice(0,s)+md+area.value.slice(e);
  area.focus();area.setSelectionRange(s,s+md.length);
  area.dispatchEvent(new Event('input',{bubbles:true}));
  closeMdModal('md-lnk-modal');
});

// VIDEO MODAL
['md-vid-close','md-vid-cancel'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){closeMdModal('md-vid-modal');});});
document.getElementById('md-vid-ok').addEventListener('click',function(){
  var url=document.getElementById('md-vid-url').value.trim();
  if(!url)return;
  var block=document.getElementById('md-vid-block').checked;
  var md='@[video]('+url+')';
  if(block){insertMarkdownBlock(_mdArea,md,_mdArea.selectionStart||_mdArea.value.length,_mdArea.selectionEnd||_mdArea.value.length);}
  else{applyMarkdown(_mdArea,'@[video](',')',url);}
  closeMdModal('md-vid-modal');
});

// TOOLBAR CLICK OVERRIDES - intercept before existing handler
document.addEventListener('click',function(e2){
  var btn=e2.target.closest('[data-md]');if(!btn)return;
  var area=document.querySelector(btn.dataset.target||'textarea[name="content"]');
  var cmd=btn.dataset.md;
  if(cmd==='image'){e2.stopImmediatePropagation();document.getElementById('md-img-url').value='';document.getElementById('md-img-alt').value='';document.getElementById('md-img-w').value='';document.getElementById('md-img-h').value='';document.getElementById('md-img-preview').innerHTML='<span data-i18n="compose.modal.imagePreviewHint">填入地址后预览</span>';openMdModal('md-img-modal',area);}
  if(cmd==='link'){e2.stopImmediatePropagation();var sel=area.value.slice(area.selectionStart||0,area.selectionEnd||0);document.getElementById('md-lnk-url').value='';document.getElementById('md-lnk-text').value=sel;openMdModal('md-lnk-modal',area);}
  if(cmd==='video'){e2.stopImmediatePropagation();document.getElementById('md-vid-url').value='';openMdModal('md-vid-modal',area);}
},true);
`;
	return renderSiteLayout({
		title: modeTitle,
		user: options.user,
		brand: options.brand,
		categories: options.categories,
		wide: true,
		fixed: true,
		videoEmbedDomains: options.videoEmbedDomains,
		body: `${composeStyle}<form data-action="post" class="form-shell" data-post-status="${attr(postStatus)}">${post ? `<input type="hidden" name="post_id" value="${post.id}">` : ''}
			<section class="panel compose-sidebar"><h2 data-i18n="compose.info">帖子信息</h2><div class="panel-body"><div class="field"><label data-i18n="compose.title">标题</label><input name="title" maxlength="${maxTitleLength}" data-count-target="#compose-title-count" data-i18n-placeholder="compose.titlePlaceholder" placeholder="输入帖子标题..." value="${attr(initialTitle)}" required><div class="content-count" style="justify-content:flex-end;margin-top:4px"><span id="compose-title-count">${initialTitle.length}</span><span>/${maxTitleLength}</span></div></div><div class="field"><label data-i18n="compose.category">分类</label><select name="category_id">${categoryOptions}</select></div><div class="field"><label data-i18n="compose.tags">标签</label><div class="tag-checks">${tagOptions}</div></div><div class="field access-fields"><label data-i18n="compose.accessControl">等级权限</label><div class="level-input-row"><label><span data-i18n="compose.minViewLevel">查看等级</span><input name="min_view_level" type="number" min="0" max="999" value="${minViewLevel}"></label><label><span data-i18n="compose.minCommentLevel">评论等级</span><input name="min_comment_level" type="number" min="0" max="999" value="${minCommentLevel}"></label></div><small class="muted" data-i18n="compose.levelHint">0 表示不限制；作者和管理员不受限制。</small></div>${verifyNotice}<div class="field"><label data-i18n="compose.media">媒体</label><label class="upload-card ${emailVerified ? '' : 'is-disabled'}"><input type="file" accept="image/*,video/*" data-upload data-target="textarea[name=content]" ${emailVerified ? '' : 'disabled'} hidden><span class="upload-icon">${toolbarIcon('upload')}</span><strong data-i18n="compose.uploadMedia">上传媒体</strong><small data-i18n="compose.mediaHint">上传后会自动插入 Markdown，支持图文混排和视频。</small></label></div></div></section>
			<section class="panel compose-editor"><div class="compose-head"><h2 data-i18n="compose.content">内容</h2><div class="compose-head-right">${languageSwitch}<div class="content-count"><span data-i18n="compose.contentCount">正文长度</span><span id="compose-content-count">${initialContent.length}</span><span>/${maxContentLength}</span></div></div></div><div class="md-toolbar" aria-label="Markdown toolbar">
				${mdTool('bold', 'Bold', 'bold', 'compose.toolbar.bold')}
				${mdTool('italic', 'Italic', 'italic', 'compose.toolbar.italic')}
				${mdTool('strike', 'Strike', 'strike', 'compose.toolbar.strike')}
				<span></span>
				${mdTool('h2', 'Heading 2', 'h2', 'compose.toolbar.h2')}
				${mdTool('h3', 'Heading 3', 'h3', 'compose.toolbar.h3')}
				${mdTool('quote', 'Quote', 'quote', 'compose.toolbar.quote')}
				${mdTool('ul', 'List', 'list', 'compose.toolbar.list')}
				${mdTool('ol', 'Numbered list', 'ordered', 'compose.toolbar.ordered')}
				<span></span>
				${mdTool('link', 'Link', 'link', 'compose.toolbar.link')}
				${mdTool('image', 'Image', 'image', 'compose.toolbar.image')}
				${mdTool('video', 'Video', 'video', 'compose.toolbar.video')}
				${mdTool('code', 'Code', 'code', 'compose.toolbar.code')}
				${mdTool('codeblock', 'Code block', 'codeblock', 'compose.toolbar.codeblock')}
			</div><div class="panel-body"><div class="field"><textarea name="content" maxlength="${maxContentLength}" required data-count-target="#compose-content-count" data-preview-source="[data-live-preview]" data-i18n-placeholder="compose.contentPlaceholder" placeholder="支持 Markdown，可直接混排文字、图片和视频...">${escapeHtml(initialContent)}</textarea></div></div></section>
			<section class="panel compose-preview"><h2 data-i18n="compose.preview">预览</h2>${post ? renderPostArticleHtml(initialContent, { videoEmbedDomains: options.videoEmbedDomains }) : renderPostArticleHtml('', { videoEmbedDomains: options.videoEmbedDomains, emptyHtml: '<span class="muted" data-i18n="compose.previewEmpty">预览会在发布后按 Markdown 渲染。</span>' })}<div class="panel-body"><div class="turnstile-box" data-turnstile hidden></div><div class="toolbar toolbar-end"><a class="btn" href="${post ? publicPostPath(post.id, options.env) : '/'}" data-i18n="common.cancel">取消</a>${showDraftButton ? `<button class="btn" type="submit" formnovalidate data-draft="1" ${emailVerified ? '' : 'disabled'} data-i18n="compose.saveDraft">保存草稿</button>` : ''}<button class="btn primary" type="submit" ${emailVerified ? '' : 'disabled'} data-i18n="${post ? 'compose.save' : 'index.newPost'}">${post ? '保存修改' : '发布帖子'}</button></div></div></section>
		</form>${composeModals}`,
		script: composeModalScript,
	});
}


