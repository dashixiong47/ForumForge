import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminI18n(user: UserPayload, data: any): string {
	const languages = (data.languages || []).filter((lang: any) => Number(lang.enabled ?? 1) === 1);
	const langData = languages.length ? languages : [{ code: 'zh-CN', name: 'Chinese (Simplified)', native_name: '简体中文' }, { code: 'en-US', name: 'English', native_name: 'English' }];
	const translations = data.translations || [];
	const initialSrc = langData.find((lang: any) => String(lang.code).startsWith('en'))?.code || langData[0]?.code || 'en-US';
	const initialDst = langData.find((lang: any) => String(lang.code).startsWith('zh'))?.code || langData[1]?.code || initialSrc;
	return renderAdminLayout({
		title: '翻译管理',
		subtitle: '管理界面文案、语言目录和翻译 key。支持批量编辑、语言增删和 AI 辅助填充。',
		titleKey: 'admin.i18n.title',
		subtitleKey: 'admin.i18n.subtitle',
		active: 'translations',
		user,
		head: `<style>
.i18n-workbench{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:12px}
.i18n-toolbar{border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.045),rgba(22,27,34,.92));padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:nowrap;overflow-x:auto}
.i18n-toolbar input,.i18n-toolbar select{height:34px;flex:0 0 auto}
.i18n-toolbar select{width:180px}
.i18n-table-shell{min-height:0;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr)}
.i18n-table-scroll{min-height:0;overflow:auto}
.i18n-table-scroll .table{min-width:920px}
.i18n-table-scroll th{position:sticky;top:0;background:#111821;z-index:2}
.i18n-footer{border:1px solid var(--border);border-radius:12px;background:rgba(13,19,32,.72);padding:10px 12px;color:var(--muted)}
.i18n-filter{width:260px;min-width:180px;max-width:260px}.i18n-flag{display:inline-grid;place-items:center;width:22px;height:22px;font-size:15px;flex:0 0 auto}.i18n-key-col{width:210px}.i18n-action-col{width:80px}.i18n-key-name{color:var(--accent);font-family:var(--mono)}.ai-trans-ctrl{display:flex;gap:6px;align-items:center;flex:0 0 auto}.locale-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}.locale-option{justify-content:flex-start;padding:10px}
</style>`,
		content: `
<div class="i18n-workbench">
  <div class="i18n-toolbar">
    ${adminInput({ id: 't-filter', class: 'i18n-filter', 'data-i18n-placeholder': 'admin.i18n.searchKey', placeholder: '搜索 key...', onkeyup: 'renderTable()' })}
    <span class="i18n-flag" id="t-src-flag"></span>
    ${adminSelect('', { id: 't-src', onchange: "updateFlag('t-src-flag',this.value);renderTable()" })}
    <span class="muted-inline">→</span>
    <span class="i18n-flag" id="t-dst-flag"></span>
    ${adminSelect('', { id: 't-dst', onchange: "updateFlag('t-dst-flag',this.value);renderTable()" })}
    ${adminButton('admin.i18n.language', '+ 语言', { class: 'btn-sm', onclick: 'openAddLocale()', 'data-i18n-title': 'admin.i18n.addLanguageTitle', title: '添加翻译语言' }, 'btn-outline')}
    ${adminButton('admin.i18n.removeLanguage', '删除语言', { class: 'btn-sm danger-link', onclick: 'removeLocale()', 'data-i18n-title': 'admin.i18n.removeLanguageTitle', title: '移除当前目标语言' }, 'btn-outline')}
    ${AI_TRANSLATE_CONTROLS}
    <div class="spacer"></div>
    ${adminButton('admin.i18n.addKey', '添加 Key', { class: 'btn-sm', onclick: 'addRow()' }, 'btn-primary')}
    ${adminButton('admin.i18n.batchSave', '批量保存', { class: 'btn-sm', id: 't-save-all', onclick: 'saveAllTranslations()' }, 'btn-ok')}
  </div>
  <div class="i18n-table-shell">
  <div class="i18n-table-scroll">
    <table class="table" id="t-table">
      <thead><tr><th class="i18n-key-col" data-i18n="admin.i18n.scopeKey">Scope / Key</th><th id="t-src-head">原文</th><th id="t-dst-head">翻译</th><th class="i18n-action-col"></th></tr></thead>
      <tbody id="t-body"></tbody>
    </table>
  </div>
  </div>
  <div class="i18n-footer hidden-file" id="t-empty" data-i18n="admin.i18n.emptyKeys">暂无翻译 key，点击“添加 Key”创建。</div>
</div>
${AI_TRANSLATE_MODAL}
<div class="modal-ov" id="add-locale-modal">
  <div class="modal modal-wide">
    <div class="modal-hd"><h3 data-i18n="admin.i18n.addLanguageTitle">添加翻译语言</h3><button class="modal-close" onclick="closeModal('add-locale-modal')">×</button></div>
    ${adminInput({ id: 'locale-filter', class: 'mb-12', 'data-i18n-placeholder': 'admin.i18n.searchLanguage', placeholder: '搜索语言...', oninput: 'renderLocaleGrid()' })}
    <div id="locale-grid" class="locale-grid"></div>
  </div>
</div>`,
		script: `
var ACTIVE_LANGS=${jsonScript(langData)};
var ALL_ROWS=${jsonScript(translations)};
var LOCALES=${jsonScript(localeCatalog)};
var CURRENT_SRC=${jsonScript(initialSrc)}, CURRENT_DST=${jsonScript(initialDst)};
function countryFor(code){var found=LOCALES.find(function(l){return l.code===code;});if(found)return found.country;var p=String(code||'').toLowerCase();if(p.startsWith('zh'))return 'cn';if(p.startsWith('en'))return 'us';return p.split('-').pop()||'us';}
var TRANSLATION_FLAG={cn:'🇨🇳',tw:'🇹🇼',us:'🇺🇸',jp:'🇯🇵',kr:'🇰🇷',fr:'🇫🇷',de:'🇩🇪',es:'🇪🇸',br:'🇧🇷',ru:'🇷🇺',vn:'🇻🇳',id:'🇮🇩',th:'🇹🇭',sa:'🇸🇦'};
function translationFlag(code){return TRANSLATION_FLAG[countryFor(code)]||'🌐';}
function labelFor(code){var found=LOCALES.find(function(l){return l.code===code;});if(found)return found.native+' ('+code+')';var active=ACTIVE_LANGS.find(function(l){return l.code===code;});return active?(active.native_name||active.name||code)+' ('+code+')':code;}
function updateFlag(id,code){var el=document.getElementById(id);if(el)el.textContent=translationFlag(code);}
function renderSelects(){var opts=ACTIVE_LANGS.map(function(l){return '<option value="'+l.code+'">'+labelFor(l.code)+'</option>';}).join('');document.getElementById('t-src').innerHTML=opts;document.getElementById('t-dst').innerHTML=opts;document.getElementById('t-src').value=CURRENT_SRC;document.getElementById('t-dst').value=CURRENT_DST;updateFlag('t-src-flag',CURRENT_SRC);updateFlag('t-dst-flag',CURRENT_DST);}
function keyId(row){return row.scope+'\\u0000'+row.key;}
function uniqueKeys(){var map={};ALL_ROWS.forEach(function(r){map[keyId(r)]={scope:r.scope||'system',key:r.key};});return Object.values(map).sort(function(a,b){return (a.scope+':'+a.key).localeCompare(b.scope+':'+b.key);});}
function val(scope,key,locale){var row=ALL_ROWS.find(function(r){return (r.scope||'system')===scope&&r.key===key&&r.locale===locale;});return row?row.value:'';}
function setCached(scope,key,locale,value){var row=ALL_ROWS.find(function(r){return (r.scope||'system')===scope&&r.key===key&&r.locale===locale;});if(row)row.value=value;else ALL_ROWS.push({scope:scope,key:key,locale:locale,value:value});}
function escClient(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function renderTable(){CURRENT_SRC=document.getElementById('t-src').value;CURRENT_DST=document.getElementById('t-dst').value;var q=document.getElementById('t-filter').value.toLowerCase();var rows=uniqueKeys().filter(function(r){return !q||(r.scope+':'+r.key).toLowerCase().indexOf(q)!==-1;});document.getElementById('t-src-head').textContent=t('admin.i18n.sourceText','原文')+' ('+CURRENT_SRC+')';document.getElementById('t-dst-head').textContent=t('admin.i18n.translation','翻译')+' ('+CURRENT_DST+')';document.getElementById('t-empty').style.display=rows.length?'none':'block';document.getElementById('t-body').innerHTML=rows.map(function(r){var sv=val(r.scope,r.key,CURRENT_SRC),dv=val(r.scope,r.key,CURRENT_DST);return '<tr data-scope="'+escClient(r.scope)+'" data-key="'+escClient(r.key)+'"><td><code>'+escClient(r.scope)+'</code><br><span class="i18n-key-name">'+escClient(r.key)+'</span></td><td><input class="t-cell-edit" data-locale="'+CURRENT_SRC+'" value="'+escClient(sv)+'" oninput="this.dataset.dirty=1;setCached(this.closest(\\'tr\\').dataset.scope,this.closest(\\'tr\\').dataset.key,this.dataset.locale,this.value)"></td><td><input class="t-cell-edit '+(dv?'':'t-missing')+'" data-locale="'+CURRENT_DST+'" value="'+escClient(dv)+'" oninput="this.dataset.dirty=1;this.classList.remove(\\'t-missing\\');setCached(this.closest(\\'tr\\').dataset.scope,this.closest(\\'tr\\').dataset.key,this.dataset.locale,this.value)"></td><td><button class="btn btn-danger btn-sm" onclick="deleteRow(this)">'+escClient(t('admin.common.delete','删除'))+'</button></td></tr>';}).join('');}
function addRow(){var scope=prompt(t('admin.i18n.scopePrompt','Scope'),'system')||'system';var key=prompt(t('admin.i18n.keyPrompt','Key'));if(!key)return;setCached(scope.trim()||'system',key.trim(),CURRENT_SRC,'');setCached(scope.trim()||'system',key.trim(),CURRENT_DST,'');renderTable();}
async function deleteRow(btn){var tr=btn.closest('tr'),scope=tr.dataset.scope,key=tr.dataset.key;if(!confirm(t('admin.i18n.deleteConfirm','删除这个翻译 key？')+' '+scope+':'+key))return;try{await runButton(btn,t('common.deleting','删除中...'),async function(done){var res=await fetch('/api/admin/i18n/translations/'+encodeURIComponent(scope)+'/'+encodeURIComponent(key),{method:'DELETE',headers:nonceHeaders()});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.deleteFailed','删除失败'));ALL_ROWS=ALL_ROWS.filter(function(r){return !((r.scope||'system')===scope&&r.key===key);});renderTable();done();showToast(t('admin.i18n.deleted','已删除'));});}catch(e){showToast(e.message||String(e),'err');}}
async function saveAllTranslations(){var btn=document.getElementById('t-save-all');var entries=[];document.querySelectorAll('#t-body tr').forEach(function(tr){tr.querySelectorAll('input[data-locale]').forEach(function(inp){entries.push({scope:tr.dataset.scope,key:tr.dataset.key,locale:inp.dataset.locale,value:inp.value});});});try{await runButton(btn,t('common.processing','处理中...'),async function(done){var res=await fetch('/api/admin/i18n/translations',{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify({entries:entries})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.saveFailed','保存失败'));document.querySelectorAll('.t-cell-edit').forEach(function(i){i.dataset.dirty='';i.style.borderColor='';});done();showToast(t('admin.i18n.savedPrefix','已保存')+' '+(data.count||entries.length)+' '+t('admin.i18n.rowsSuffix','条'));});}catch(e){showToast(e.message||String(e),'err');}}
function openAddLocale(){openModal('add-locale-modal');renderLocaleGrid();}
function renderLocaleGrid(){var q=(document.getElementById('locale-filter').value||'').toLowerCase();var active=new Set(ACTIVE_LANGS.map(function(l){return l.code;}));document.getElementById('locale-grid').innerHTML=LOCALES.filter(function(l){return !active.has(l.code)&&(!q||(l.code+' '+l.name+' '+l.native).toLowerCase().indexOf(q)!==-1);}).map(function(l){return '<button class="btn btn-outline locale-option" onclick="addLocale(\\''+l.code+'\\')"><span class="lang-flag">'+translationFlag(l.code)+'</span><span>'+escClient(l.native)+'</span><span class="muted">'+escClient(l.code)+'</span></button>';}).join('')||'<div class="muted">'+escClient(t('admin.i18n.noMoreLanguages','没有可添加语言'))+'</div>';}
async function addLocale(code){var meta=LOCALES.find(function(l){return l.code===code;});var res=await fetch('/api/admin/i18n/languages',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({code:code,name:meta.name,native_name:meta.native,enabled:true,sort_order:100})});var data=await res.json();if(!res.ok){showToast(data.error||t('admin.i18n.addFailed','添加失败'),'err');return;}ACTIVE_LANGS.push({code:code,name:meta.name,native_name:meta.native,enabled:1});CURRENT_DST=code;renderSelects();renderTable();closeModal('add-locale-modal');showToast(t('admin.i18n.addedLanguage','已添加语言'));}
async function removeLocale(){var code=document.getElementById('t-dst').value;if(!confirm(t('admin.i18n.disableLanguageConfirm','停用目标语言？')+' '+code))return;var res=await fetch('/api/admin/i18n/languages/'+encodeURIComponent(code),{method:'DELETE',headers:nonceHeaders()});var data=await res.json();if(!res.ok){showToast(data.error||t('admin.i18n.removeFailed','移除失败'),'err');return;}ACTIVE_LANGS=ACTIVE_LANGS.filter(function(l){return l.code!==code;});CURRENT_DST=ACTIVE_LANGS[0]?.code||CURRENT_SRC;renderSelects();renderTable();showToast(t('admin.i18n.removedLanguage','已移除语言'));}
function aiSettings(){try{return JSON.parse(localStorage.getItem('ff_ai_translate')||'{}');}catch(e){return {};}}
function aiOpenConfig(){var s=aiSettings();document.getElementById('ai-api-key').value=s.apiKey||'';document.getElementById('ai-model').value=s.model||'deepseek-v4-flash';document.getElementById('ai-batch-size').value=s.batchSize||20;openModal('ai-config-modal');}
function aiCloseConfig(){closeModal('ai-config-modal');}
function aiSaveControls(){localStorage.setItem('ff_ai_translate',JSON.stringify({apiKey:document.getElementById('ai-api-key').value,model:document.getElementById('ai-model').value,batchSize:Number(document.getElementById('ai-batch-size').value)||20}));}
function aiSaveConfigAndClose(){aiSaveControls();aiCloseConfig();}
async function aiTranslateMissing(){var s=aiSettings();if(!s.apiKey){aiOpenConfig();return;}var limit=Math.max(1,Math.min(100,Number(s.batchSize)||20));var jobs=[];document.querySelectorAll('#t-body tr').forEach(function(tr){if(jobs.length>=limit)return;var src=tr.querySelector('input[data-locale="'+CURRENT_SRC+'"]'),dst=tr.querySelector('input[data-locale="'+CURRENT_DST+'"]');if(src&&dst&&src.value.trim()&&!dst.value.trim())jobs.push({scope:tr.dataset.scope,key:tr.dataset.key,text:src.value,input:dst});});if(!jobs.length){showToast(t('admin.i18n.aiNoMissing','没有需要翻译的空行'),'err');return;}var btn=document.getElementById('ai-trans-btn'),old=btn.textContent;btn.disabled=true;btn.textContent=t('admin.i18n.aiWorking','AI 翻译中...');try{var res=await fetch('/api/admin/i18n/ai-translate',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({apiKey:s.apiKey,model:s.model||'deepseek-v4-flash',sourceLocale:CURRENT_SRC,targetLocale:CURRENT_DST,items:jobs.map(function(j){return {scope:j.scope,key:j.key,text:j.text};})})});var data=await res.json();if(!res.ok)throw new Error(data.error||t('admin.i18n.aiFailed','AI 翻译失败'));(data.translations||[]).forEach(function(item,i){var job=jobs[i];var value=item.value||item.translation||'';job.input.value=value;job.input.classList.remove('t-missing');job.input.dataset.dirty=1;setCached(job.scope,job.key,CURRENT_DST,value);});showToast(t('admin.i18n.aiFilledPrefix','AI 已填充')+' '+(data.translations||[]).length+' '+t('admin.i18n.aiFilledSuffix','行，请检查后保存'));}catch(e){showToast(e.message||String(e),'err');}finally{btn.disabled=false;btn.textContent=old;}}
renderSelects();renderTable();`
	});
}


