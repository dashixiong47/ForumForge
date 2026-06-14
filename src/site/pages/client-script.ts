// Embedded client-side runtime script for all site pages (extracted from ssr.ts).
export function appScript(): string {
	return `
window.ForumForge=window.ForumForge||{};
ForumForge.plugins=ForumForge.plugins||{};
ForumForge.toolbarActions=ForumForge.toolbarActions||{};
ForumForge.resourceRenderers=ForumForge.resourceRenderers||{};
ForumForge.postSubmitHooks=ForumForge.postSubmitHooks||[];
ForumForge.registerPlugin=ForumForge.registerPlugin||function(plugin){
 plugin=plugin||{};
 if(!plugin.id)return;
 ForumForge.plugins[plugin.id]=plugin;
 if(plugin.toolbarActions)Object.keys(plugin.toolbarActions).forEach(function(k){ForumForge.toolbarActions[k]=plugin.toolbarActions[k];});
 if(plugin.resourceRenderers)Object.keys(plugin.resourceRenderers).forEach(function(k){ForumForge.resourceRenderers[k]=plugin.resourceRenderers[k];});
 if(typeof plugin.onPostSubmit==='function')ForumForge.postSubmitHooks.push(plugin.onPostSubmit);
 if(typeof plugin.onLoad==='function'){try{plugin.onLoad({ForumForge:ForumForge});}catch(e){console.error('Plugin onLoad failed',plugin.id,e);}}
};
ForumForge.register=ForumForge.registerPlugin;
function syncPluginSettingSlots(){
 document.querySelectorAll('.plugin-settings-slot').forEach(function(slot){
  var has=!!String(slot.innerHTML||'').trim();
  slot.classList.toggle('has-content',has);
 });
}
function watchPluginSettingSlots(){
 var slots=document.querySelectorAll('.plugin-settings-slot');
 slots.forEach(function(slot){
  if(slot.dataset.pluginSlotWatched)return;
  slot.dataset.pluginSlotWatched='1';
  if(window.MutationObserver){
   new MutationObserver(syncPluginSettingSlots).observe(slot,{childList:true,subtree:true,characterData:true});
  }
 });
 syncPluginSettingSlots();
}
function ffBadgeEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function ffBadgeAttr(s){return ffBadgeEsc(s).replace(/'/g,'&#39;');}
function ffBadgeIsImage(v){var s=String(v||'').trim().replace(/\\\\/g,'/');return /^(https?:\\/\\/|\\/|\\.\\/|\\.\\.\\/|assets\\/|data:image\\/)/i.test(s)||/\\.(png|jpe?g|gif|webp|svg|avif)(\\?.*)?$/i.test(s);}
function ffBadgeChip(b){var color=String(b&&b.color||'').trim();var icon=String(b&&b.icon||'').trim();var label=String(b&&b.label||b&&b.badge_key||'').trim();var desc=String(b&&b.description||label).trim();var style=color?' style="border-color:'+ffBadgeEsc(color)+'66;color:'+ffBadgeEsc(color)+';background:'+ffBadgeEsc(color)+'1f"':'';var fallback=(label||'?').slice(0,1).toUpperCase();var media=icon?(ffBadgeIsImage(icon)?'<img class="badge-chip-img" src="'+ffBadgeAttr(icon)+'" alt="">':'<span class="badge-chip-icon">'+ffBadgeEsc(icon.slice(0,2))+'</span>'):'<span class="badge-chip-icon">'+ffBadgeEsc(fallback)+'</span>';return '<span class="badge-chip badge-chip-icon-only"'+style+' title="'+ffBadgeAttr(desc)+'" aria-label="'+ffBadgeAttr(label)+'">'+media+'</span>';}
function ffLoadUserBadges(uid){
 ForumForge._badgeCache=ForumForge._badgeCache||{};
 if(ForumForge._badgeCache[uid])return ForumForge._badgeCache[uid];
 ForumForge._badgeCache[uid]=fetch('/api/users/'+encodeURIComponent(uid)+'/badges').then(function(r){return r.ok?r.json():[];}).then(function(items){return Array.isArray(items)?items:[];}).catch(function(){return [];});
 return ForumForge._badgeCache[uid];
}
function hydrateUserBadges(root){
 root=root||document;
 root.querySelectorAll('.ff-user-badge-slot[data-user-id],.user-card-badges[data-user-id]').forEach(function(slot){
  var uid=slot.getAttribute('data-user-id');
  if(!uid||uid==='0'||slot.dataset.badgesLoading==='1')return;
  slot.dataset.badgesLoading='1';
  ffLoadUserBadges(uid).then(function(items){
   slot.innerHTML=items.length?items.map(ffBadgeChip).join(''):'';
   slot.classList.toggle('has-badges',items.length>0);
  }).finally(function(){delete slot.dataset.badgesLoading;});
 });
}
ForumForge.hydrateUserBadges=hydrateUserBadges;
ForumForge.loadEnabledPlugins=ForumForge.loadEnabledPlugins||async function(){
 if(ForumForge._pluginsLoaded){hydrateUserBadges(document);return;}
 if(ForumForge._loadingPlugins)return;
 ForumForge._loadingPlugins=true;
 try{
  var res=await fetch('/api/plugins',{headers:{Accept:'application/json'}});
  if(!res.ok){hydrateUserBadges(document);return;}
  var plugins=await res.json();
  ForumForge.enabledPlugins=plugins||[];
  (plugins||[]).forEach(function(p){
   if(p.css){var style=document.createElement('style');style.setAttribute('data-plugin-css',p.id||p.slug||'');style.textContent=p.css;document.head.appendChild(style);}
   if(p.headHtml){var tpl=document.createElement('template');tpl.innerHTML=p.headHtml;document.head.appendChild(tpl.content.cloneNode(true));}
   if(p.html){var host=document.createElement('div');host.hidden=true;host.setAttribute('data-plugin-html',p.id||p.slug||'');host.innerHTML=p.html;document.body.appendChild(host);}
   if(p.js){try{new Function('ForumForge','plugin',p.js)(ForumForge,p);}catch(e){console.error('Plugin script failed',p.id||p.slug,e);}}
  });
  hydrateUserBadges(document);
  ForumForge._pluginsLoaded=true;
 }finally{ForumForge._loadingPlugins=false;}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){watchPluginSettingSlots();hydrateUserBadges(document);ForumForge.loadEnabledPlugins().then(function(){syncPluginSettingSlots();hydrateUserBadges(document);});});else setTimeout(function(){watchPluginSettingSlots();hydrateUserBadges(document);ForumForge.loadEnabledPlugins().then(function(){syncPluginSettingSlots();hydrateUserBadges(document);});},0);
function nonceHeaders(json){const h={'X-Timestamp':String(Math.floor(Date.now()/1000)),'X-Nonce':crypto.randomUUID()};if(json)h['Content-Type']='application/json';return h;}
async function api(url, options){const res=await fetch(url,options);const data=await res.json().catch(()=>({}));if(!res.ok){const err=new Error(data.error||siteT('common.requestFailed','请求失败'));err.data=data;throw err;}return data;}
async function applyPostSubmitPlugins(payload,form){
 if(window.ForumForge&&ForumForge.loadEnabledPlugins)await ForumForge.loadEnabledPlugins();
 const hooks=(window.ForumForge&&ForumForge.postSubmitHooks)||[];
 for(const hook of hooks){
  const result=await hook({payload:payload,form:form,ForumForge:window.ForumForge});
  if(result&&typeof result==='object')Object.assign(payload,result);
 }
 return payload;
}
let _toastCss=0;function showMessage(text,type){if(!text)return;if(!_toastCss){_toastCss=1;const s=document.createElement('style');s.textContent='#ff-toasts{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;max-width:360px}#ff-toasts .tt{pointer-events:auto;padding:11px 15px;border-radius:10px;border:1px solid;font-size:13px;font-weight:600;line-height:1.4;box-shadow:0 8px 32px rgba(0,0,0,.45);animation:tt-in .2s ease}#ff-toasts .tt.ok{background:#0d2a14;border-color:#238636;color:#3fb950}#ff-toasts .tt.error{background:#2a0d0d;border-color:#da3633;color:#f85149}#ff-toasts .tt.info{background:#111b2b;border-color:#30363d;color:#e6edf3}@keyframes tt-in{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}';document.head.appendChild(s);}let c=document.getElementById('ff-toasts');if(!c){c=document.createElement('div');c.id='ff-toasts';document.body.appendChild(c);}const el=document.createElement('div');el.className='tt '+(type==='ok'?'ok':type==='error'?'error':'info');el.textContent=text;c.appendChild(el);setTimeout(()=>el.remove(),4000);}
function escapeHtmlClient(text){return String(text||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function isClientVisuallyEmpty(text){return !String(text||'').replace(/[\\s\\u200B-\\u200F\\uFEFF\\u2028\\u2029\\u180E\\u3164\\u115F\\u1160\\x00-\\x1F\\x7F]+/g,'').length;}
function cookieLocale(){const m=document.cookie.match(/(?:^|; )ff_locale=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
function normalizeClientLocale(value){const raw=String(value||'').trim().replace('_','-');const low=raw.toLowerCase();if(!raw)return '';if(low==='zh'||low==='zh-cn'||low==='zh-hans')return 'zh-CN';if(low==='en'||low==='en-us')return 'en-US';const parts=raw.split('-');return parts[1]?parts[0].toLowerCase()+'-'+parts[1].toUpperCase():parts[0].toLowerCase();}
function pickBrowserLocale(langs){const supported=(langs&&langs.length?langs:[{code:'en-US'},{code:'zh-CN'}]).map(languageCode);const nav=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language]).map(normalizeClientLocale);for(const item of nav){const hit=supported.find((code)=>normalizeClientLocale(code)===item||normalizeClientLocale(code).split('-')[0]===item.split('-')[0]);if(hit)return hit;}return supported.includes('en-US')?'en-US':(supported[0]||'en-US');}
let SITE_I18N={}, SITE_LANGUAGES=[], SITE_LOCALE=localStorage.getItem('ff.locale')||cookieLocale()||pickBrowserLocale()||document.documentElement.lang||'en-US';
const LOCALE_COUNTRY={'zh-CN':'cn','zh':'cn','zh-TW':'tw','en-US':'us','en':'us','ja-JP':'jp','ja':'jp','ko-KR':'kr','ko':'kr','fr-FR':'fr','fr':'fr','de-DE':'de','de':'de','es-ES':'es','es':'es','pt-BR':'br','pt':'br','ru-RU':'ru','ru':'ru','vi-VN':'vn','vi':'vn','id-ID':'id','id':'id','th-TH':'th','th':'th','ar-SA':'sa','ar':'sa'};
function localeCountry(code){return LOCALE_COUNTRY[code]||LOCALE_COUNTRY[String(code||'').split('-')[0]]||String(code||'').toLowerCase();}
const COUNTRY_FLAG={cn:'🇨🇳',tw:'🇹🇼',us:'🇺🇸',jp:'🇯🇵',kr:'🇰🇷',fr:'🇫🇷',de:'🇩🇪',es:'🇪🇸',br:'🇧🇷',ru:'🇷🇺',vn:'🇻🇳',id:'🇮🇩',th:'🇹🇭',sa:'🇸🇦'};
const FLAG_SVG={
 cn:'<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#de2910"/><path fill="#ffde00" d="M5.1 2.1l.5 1.5h1.6l-1.3.9.5 1.5-1.3-.9-1.3.9.5-1.5-1.3-.9h1.6zM9.6 2.2l.3.6.7.1-.5.5.1.7-.6-.3-.6.3.1-.7-.5-.5.7-.1zM11.1 4.7l.2.6.7.1-.5.4.1.7-.6-.3-.6.3.1-.7-.5-.4.7-.1zM11 7.7l.2.6.7.1-.5.4.1.7-.6-.3-.6.3.1-.7-.5-.4.7-.1zM9.5 10.2l.3.6.7.1-.5.5.1.7-.6-.3-.6.3.1-.7-.5-.5.7-.1z"/></svg>',
 us:'<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#fff"/><path fill="#b22234" d="M0 0h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24V16H0z"/><rect width="10.5" height="8.6" rx="2" fill="#3c3b6e"/><path fill="#fff" d="M1.2 1.2h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM2.2 2.6h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM1.2 4h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zM2.2 5.4h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7zm2 0h.7v.7h-.7z"/></svg>'
};
function flagEmoji(code){const country=localeCountry(code);return FLAG_SVG[country]||COUNTRY_FLAG[country]||'🌐';}
function languageCode(lang){return lang.code||lang.locale||'zh-CN';}
function languageName(lang){return lang.native_name||lang.name||languageCode(lang);}
function siteT(key,fallback){return SITE_I18N[key]||fallback||key;}
function setButtonLoading(btn,label){
 if(!btn)return function(){};
 const oldHtml=btn.innerHTML,oldText=btn.textContent,oldDisabled=btn.disabled;
 btn.disabled=true;btn.dataset.loading='1';
 if(label)btn.innerHTML='<span class="spin"></span><span>'+escapeHtmlClient(label)+'</span>';
 return function(nextHtml){btn.disabled=oldDisabled;delete btn.dataset.loading;if(nextHtml!==undefined)btn.innerHTML=nextHtml;else btn.innerHTML=oldHtml;if(!btn.textContent&&oldText)btn.textContent=oldText;};
}
async function runButtonAction(btn,label,work){
 const done=setButtonLoading(btn,label||siteT('common.processing','处理中...'));
 try{return await work(done);}catch(err){done();throw err;}
}
function applySiteI18n(){
 document.querySelectorAll('[data-i18n]').forEach((el)=>{const k=el.getAttribute('data-i18n');if(k&&SITE_I18N[k])el.textContent=SITE_I18N[k];});
 document.querySelectorAll('[data-i18n-title]').forEach((el)=>{const k=el.getAttribute('data-i18n-title');if(k&&SITE_I18N[k])el.setAttribute('title',SITE_I18N[k]);});
 document.querySelectorAll('[data-i18n-title]').forEach((el)=>{const k=el.getAttribute('data-i18n-title');if(k&&SITE_I18N[k])el.setAttribute('aria-label',SITE_I18N[k]);});
 document.querySelectorAll('[data-i18n-placeholder]').forEach((el)=>{const k=el.getAttribute('data-i18n-placeholder');if(k&&SITE_I18N[k])el.setAttribute('placeholder',SITE_I18N[k]);});
}
function renderLanguageSwitchers(){
 const langs=SITE_LANGUAGES.length?SITE_LANGUAGES:[{code:'zh-CN',native_name:'简体中文'},{code:'en-US',native_name:'English'}];
 document.querySelectorAll('[data-language-switch]').forEach((sel)=>{
  sel.innerHTML=langs.map((lang)=>{const code=lang.code||lang.locale;const name=lang.native_name||lang.name||code;return '<option value="'+escapeHtmlClient(code)+'">'+escapeHtmlClient(name)+'</option>';}).join('');
  sel.value=SITE_LOCALE;
  sel.onchange=()=>setSiteLocale(sel.value);
 });
 document.querySelectorAll('[data-language-picker]').forEach((picker)=>{
  const btn=picker.querySelector('[data-language-button]');
  const menu=picker.querySelector('[data-language-menu]');
  const flag=picker.querySelector('[data-language-flag]');
  const name=picker.querySelector('[data-language-name]');
  const current=langs.find((lang)=>languageCode(lang)===SITE_LOCALE)||langs[0];
  if(flag)flag.innerHTML=flagEmoji(languageCode(current));
  if(name)name.textContent=languageName(current);
  if(menu){
   menu.innerHTML=langs.map((lang)=>{const code=languageCode(lang);return '<li data-code="'+escapeHtmlClient(code)+'" class="'+(code===SITE_LOCALE?'active':'')+'"><span class="lang-flag">'+flagEmoji(code)+'</span><span>'+escapeHtmlClient(languageName(lang))+'</span><small>('+escapeHtmlClient(code)+')</small></li>';}).join('');
   menu.querySelectorAll('li').forEach((li)=>{li.onclick=(e)=>{e.stopPropagation();menu.classList.remove('open');setSiteLocale(li.dataset.code);};});
  }
  if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.onclick=(e)=>{e.stopPropagation();document.querySelectorAll('[data-language-menu].open').forEach((m)=>{if(m!==menu)m.classList.remove('open');});menu?.classList.toggle('open');};}
 });
}
document.addEventListener('click',(e)=>{if(!e.target.closest?.('[data-language-picker]'))document.querySelectorAll('[data-language-menu].open').forEach((m)=>m.classList.remove('open'));});
function setSiteLocale(locale){
 SITE_LOCALE=locale||SITE_LOCALE;
 localStorage.setItem('ff.locale',SITE_LOCALE);
 document.cookie='ff_locale='+encodeURIComponent(SITE_LOCALE)+'; Path=/; Max-Age=31536000; SameSite=Lax';
 location.reload();
}
function loadSiteI18n(locale){
 return fetch('/api/i18n?locale='+encodeURIComponent(locale||SITE_LOCALE)).then((r)=>r.json()).then((d)=>{
  SITE_LANGUAGES=d.languages||SITE_LANGUAGES;
  const hadStoredLocale=!!(localStorage.getItem('ff.locale')||cookieLocale());
  const nextLocale=hadStoredLocale?(d.locale||locale||SITE_LOCALE):pickBrowserLocale(SITE_LANGUAGES);
  if(!hadStoredLocale&&nextLocale&&nextLocale!==(d.locale||locale))return loadSiteI18n(nextLocale);
  SITE_LOCALE=nextLocale||d.locale||locale||SITE_LOCALE;
  SITE_I18N=d.messages||{};
  localStorage.setItem('ff.locale',SITE_LOCALE);
  document.cookie='ff_locale='+encodeURIComponent(SITE_LOCALE)+'; Path=/; Max-Age=31536000; SameSite=Lax';
  document.documentElement.lang=SITE_LOCALE;
  renderLanguageSwitchers();
  applySiteI18n();
  document.documentElement.classList.remove('i18n-pending');
 }).catch(()=>{document.documentElement.classList.remove('i18n-pending');renderLanguageSwitchers();});
}
loadSiteI18n(SITE_LOCALE);
let ACTIVE_FLOATING_MENU=null;
function floatingMenuLayer(){
 let layer=document.getElementById('ff-floating-menu');
 if(!layer){layer=document.createElement('div');layer.id='ff-floating-menu';layer.className='floating-menu';layer.hidden=true;document.body.appendChild(layer);}
 return layer;
}
function hideFloatingLayer(){
 const layer=document.getElementById('ff-floating-menu');
 if(layer){layer.hidden=true;layer.innerHTML='';}
 ACTIVE_FLOATING_MENU=null;
}
async function loadNotifications(markRead){
 const panel=document.querySelector('[data-notification-panel]');
 if(!panel)return;
 panel.innerHTML='<div class="notif-empty">'+escapeHtmlClient(siteT('notifications.loading','加载中...'))+'</div>';
 try{
  const data=await api('/api/user/notifications?limit=20',{method:'GET'});
  const items=data.items||[];
  const count=document.querySelector('[data-notification-count]');
  if(count){count.textContent=String(data.unread_count||0);count.hidden=!Number(data.unread_count||0);}
  panel.innerHTML=items.length?items.map((item)=>'<a class="notif-item '+(item.is_read?'':'unread')+'" href="'+escapeHtmlClient(item.url||'/me')+'" data-notif-id="'+item.id+'"><strong>'+escapeHtmlClient(item.title)+'</strong><span>'+escapeHtmlClient(item.body||'')+'</span><small>'+escapeHtmlClient(item.created_at||'')+'</small></a>').join(''):'<div class="notif-empty">'+escapeHtmlClient(siteT('notifications.empty','暂无消息'))+'</div>';
  if(markRead&&items.length){await api('/api/user/notifications/read',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({ids:items.map((i)=>i.id)})});if(count){count.textContent='0';count.hidden=true;}}
 }catch(err){panel.innerHTML='<div class="notif-empty">'+escapeHtmlClient(err.message||String(err))+'</div>';}
}
function positionFloatingMenu(host, panel){
 if(!host||!panel)return;
 const layer=floatingMenuLayer();
 const trigger=host.querySelector('summary')||host;
 const rect=trigger.getBoundingClientRect();
 layer.innerHTML=panel.innerHTML;
 layer.hidden=false;
 layer.dataset.kind=host.matches('.user-menu')?'user':'post';
 const width=layer.offsetWidth||240;
 const height=layer.offsetHeight||160;
 let left=rect.right-width;
 let top=rect.bottom+8;
 if(top+height>window.innerHeight-8)top=Math.max(8,rect.top-height-8);
 left=Math.max(8,Math.min(window.innerWidth-width-8,left));
 layer.style.left=left+'px';
 layer.style.top=top+'px';
 ACTIVE_FLOATING_MENU=host;
}
function closeFloatingMenus(except){
 document.querySelectorAll('.user-menu[open],.post-actions[open]').forEach((menu)=>{if(menu!==except)menu.removeAttribute('open');});
 if(!except)hideFloatingLayer();
}
document.addEventListener('toggle',(e)=>{
 const menu=e.target;
 if(!menu.matches?.('.user-menu,.post-actions'))return;
 const panel=menu.querySelector('.menu-panel,.post-action-menu');
 if(menu.open){closeFloatingMenus(menu); positionFloatingMenu(menu,panel);}
 else if(ACTIVE_FLOATING_MENU===menu){hideFloatingLayer();}
},true);
document.addEventListener('click',(e)=>{
 if(e.target.closest?.('#ff-floating-menu'))return;
 if(e.target.closest?.('.user-menu,.post-actions'))return;
 closeFloatingMenus(null);
});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeFloatingMenus(null);});
window.addEventListener('resize',()=>closeFloatingMenus(null));
window.addEventListener('scroll',()=>closeFloatingMenus(null),true);
function closeMediaLightbox(){
 const box=document.querySelector('.media-lightbox');
 if(!box)return;
 const media=box.querySelector('video');
 if(media)media.pause();
 box.hidden=true;
 box.querySelector('.media-lightbox-inner').innerHTML='';
}
function openMediaLightbox(url,type){
 if(!url)return;
 let box=document.querySelector('.media-lightbox');
 if(!box){
  box=document.createElement('div');
  box.className='media-lightbox';
  box.hidden=true;
  box.innerHTML='<button class="media-lightbox-close" type="button" aria-label="Close">×</button><div class="media-lightbox-inner"></div>';
  document.body.appendChild(box);
  box.querySelector('.media-lightbox-close').addEventListener('click',closeMediaLightbox);
  box.addEventListener('click',(e)=>{if(e.target===box)closeMediaLightbox();});
 }
 const inner=box.querySelector('.media-lightbox-inner');
 const safe=escapeHtmlClient(url);
 inner.innerHTML=type==='video'?'<video src="'+safe+'" controls autoplay playsinline></video>':'<img src="'+safe+'" alt="">';
 box.hidden=false;
}
document.addEventListener('click',(e)=>{
 const trigger=e.target.closest?.('[data-lightbox]');
 if(!trigger)return;
 e.preventDefault();
 e.stopPropagation();
 openMediaLightbox(trigger.getAttribute('data-lightbox'),trigger.getAttribute('data-lightbox-type')||'image');
});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeMediaLightbox();});
function previewInline(line){
 let html=escapeHtmlClient(line);
 const safeStyle=(style)=>String(style||'').split(';').map((part)=>{
  const idx=part.indexOf(':');
  if(idx<0)return '';
  const name=part.slice(0,idx).trim().toLowerCase();
  const value=part.slice(idx+1).trim();
  if(!/^(color|background-color)$/.test(name))return '';
  if(!/^#[0-9a-fA-F]{3,8}$/.test(value)&&!/^rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}(?:\\s*,\\s*(?:0|1|0?\\.\\d+))?\\s*\\)$/i.test(value)&&!/^[a-zA-Z]+$/.test(value))return '';
  return name+':'+value;
 }).filter(Boolean).join(';');
 html=html.replace(/&lt;span\\s+style=(?:&quot;|&#39;)\\s*([^&<>]*?)\\s*(?:&quot;|&#39;)&gt;/g,(_m,style)=>{const cleaned=safeStyle(style);return cleaned?'<span style="'+escapeHtmlClient(cleaned)+'">':_m;});
 html=html.replace(/&lt;\\/span&gt;/g,'</span>').replace(/&lt;strong&gt;/g,'<strong>').replace(/&lt;\\/strong&gt;/g,'</strong>');
 html=html.replace(/\`([^\`]+)\`/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/\\*([^*]+)\\*/g,'<em>$1</em>');
 html=html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+|mailto:[^)\\s]+|\\/[^)\\s]+|#[^)\\s]+)\\)/g,(_m,text,url)=>'<a href="'+escapeHtmlClient(url)+'" target="'+(String(url).startsWith('http')?'_blank':'_self')+'" rel="noopener noreferrer">'+text+'</a>');
 return html;
}
function previewVideoEmbed(url){
 const value=String(url||'').trim();
 let id='';
 let bili='';
 try{
  const u=new URL(value);
  const host=u.hostname.replace(/^www\\./,'').toLowerCase();
  if(host==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';
  if(host==='youtube.com'||host==='m.youtube.com'){
   if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
   else if(u.pathname.startsWith('/embed/')||u.pathname.startsWith('/shorts/'))id=u.pathname.split('/').filter(Boolean)[1]||'';
  }
  if(host==='bilibili.com'||host==='m.bilibili.com'||host==='b23.tv'){
   if(u.pathname.startsWith('/blackboard/html5mobileplayer.html')){
    const bvid=u.searchParams.get('bvid')||'';
    const aid=u.searchParams.get('aid')||'';
    if(/^BV[a-zA-Z0-9]+$/.test(bvid))bili='https://player.bilibili.com/player.html?bvid='+encodeURIComponent(bvid);
    else if(/^\\d+$/.test(aid))bili='https://player.bilibili.com/player.html?aid='+encodeURIComponent(aid);
   }else{
    const parts=u.pathname.split('/').filter(Boolean);
    const videoIndex=parts.indexOf('video');
    const vid=videoIndex>=0?(parts[videoIndex+1]||''):(parts[0]||'');
    if(/^BV[a-zA-Z0-9]+$/.test(vid))bili='https://player.bilibili.com/player.html?bvid='+encodeURIComponent(vid);
    else if(/^av\\d+$/i.test(vid))bili='https://player.bilibili.com/player.html?aid='+encodeURIComponent(vid.slice(2));
   }
  }
 }catch(_e){}
 const normalizeDomain=(v)=>{try{const raw=String(v||'').trim().toLowerCase().replace(/^\\*\\./,'');if(!raw)return '';const parsed=new URL(raw.includes('://')?raw:'https://'+raw);return parsed.hostname.replace(/^\\*\\./,'').replace(/\\.$/,'');}catch(_e){return String(v||'').trim().toLowerCase().split('/')[0].split(':')[0].replace(/^\\*\\./,'').replace(/\\.$/,'');}};
 const hostAllowed=(host)=>{const h=normalizeDomain(host);const list=(window.FF_VIDEO_EMBED_DOMAINS||['youtube.com','youtu.be','bilibili.com','b23.tv']).map(normalizeDomain).filter(Boolean);return list.some((d)=>h===d||h.endsWith('.'+d));};
 if(/^[a-zA-Z0-9_-]{6,32}$/.test(id))return '<iframe class="video-embed" src="https://www.youtube-nocookie.com/embed/'+escapeHtmlClient(id)+'" title="Embedded video" loading="lazy" allowfullscreen></iframe>';
 if(bili)return '<iframe class="video-embed" src="'+escapeHtmlClient(bili)+'" title="Embedded video" loading="lazy" allowfullscreen></iframe>';
 try{const u=new URL(value);if((u.protocol==='http:'||u.protocol==='https:')&&hostAllowed(u.hostname))return '<iframe class="video-embed" src="'+escapeHtmlClient(u.toString())+'" title="Embedded video" loading="lazy" allowfullscreen></iframe>';}catch(_e){}
 if(/^https?:\\/\\//i.test(value)||value.startsWith('/'))return '<video controls preload="metadata" src="'+escapeHtmlClient(value)+'"></video>';
 return '<p class="muted">'+escapeHtmlClient(value)+'</p>';
}
function renderPreview(text){
 const source=String(text||'').replace(/\\r\\n/g,'\\n');
 if(!source.trim())return '<p class="muted">'+escapeHtmlClient(siteT('common.previewEmpty','预览会在这里显示。'))+'</p>';
 const blocks=[];
 let quote=[];
 let codeBlock=null;
 const fenceMark=String.fromCharCode(96,96,96);
 const flushQuote=()=>{if(quote.length){blocks.push('<blockquote>'+quote.map((line)=>'<p>'+previewInline(line)+'</p>').join('')+'</blockquote>');quote=[];}};
 const flushCode=()=>{if(codeBlock){const lang=String(codeBlock.lang||'').replace(/[^a-z0-9_-]/gi,'').slice(0,24);blocks.push('<pre><code'+(lang?' class="language-'+lang+'"':'')+'>'+escapeHtmlClient(codeBlock.lines.join('\\n'))+'</code></pre>');codeBlock=null;}};
 for(const raw of source.split('\\n')){
  const line=raw.trim();
  if(codeBlock){
   if(line.startsWith(fenceMark)){flushCode();continue;}
   codeBlock.lines.push(raw);
   continue;
  }
  if(line.startsWith(fenceMark)){flushQuote();codeBlock={lang:line.slice(fenceMark.length).trim().split(/\\s+/)[0]||'',lines:[]};continue;}
  if(!line){flushQuote();continue;}
  const media=line.match(/^!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+=(\\d{0,4})x(\\d{0,4}))?.*\\)$/);
  if(media){flushQuote();const url=media[2];const width=Math.max(80,Math.min(1600,Number(media[3]||0)||0));const height=Math.max(60,Math.min(1200,Number(media[4]||0)||0));const style=(width||height)?' style="'+(width?'width:'+width+'px;':(height?'width:auto;':''))+(height?'height:'+height+'px;':'')+'max-width:100%"':'';blocks.push(/\\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url)?'<video controls preload="metadata" src="'+escapeHtmlClient(url)+'"></video>':'<img class="md-image" src="'+escapeHtmlClient(url)+'" alt="'+escapeHtmlClient(media[1].replace(/\\|\\d{0,4}x\\d{0,4}$/,''))+'" data-lightbox="'+escapeHtmlClient(url)+'" data-lightbox-type="image"'+style+'>');continue;}
  const video=line.match(/^@\\[(?:video|视频)\\]\\(([^)\\s]+)\\)$/i);
  if(video){flushQuote();blocks.push(previewVideoEmbed(video[1]));continue;}
  const quoted=line.match(/^>\\s?(.*)$/);
  if(quoted){quote.push(quoted[1]);continue;}
  flushQuote();
  const heading=line.match(/^(#{1,6})\\s+(.+)$/);
  if(heading){const level=Math.min(6,heading[1].length);blocks.push('<h'+level+'>'+previewInline(heading[2])+'</h'+level+'>');continue;}
  blocks.push('<p>'+previewInline(line)+'</p>');
 }
 flushQuote();
 flushCode();
 return blocks.join('');
}
function postTranslationStore(form){
 const holder=form?.querySelector?.('textarea[name="translations_json"]');
 if(!holder)return {};
 try{return JSON.parse(holder.value||'{}')||{};}catch{return {};}
}
function writePostTranslationStore(form,data){
 const holder=form?.querySelector?.('textarea[name="translations_json"]');
 if(holder)holder.value=JSON.stringify(data||{});
}
function syncCurrentPostTranslation(form){
 const root=form?.querySelector?.('[data-post-i18n]');
 if(!root)return {};
 const locale=normalizeClientLocale(form.locale?.value||SITE_LOCALE);
 if(!locale)return {};
 const data=postTranslationStore(form);
 data[locale]={title:form.title?.value||'',content:form.content?.value||''};
 writePostTranslationStore(form,data);
 return {locale,translations:data};
}
function switchPostLocale(control){
 const form=control.closest('form');
 if(!form)return;
 syncCurrentPostTranslation(form);
 const next=normalizeClientLocale(control.value||control.dataset.postLocale||'');
 if(!next)return;
 const data=postTranslationStore(form);
 const record=data[next]||{title:'',content:''};
 if(form.locale)form.locale.value=next;
 if(control.value!==next)control.value=next;
 if(form.title)form.title.value=record.title||'';
 if(form.content){
  form.content.value=record.content||'';
  form.content.dispatchEvent(new Event('input',{bubbles:true}));
 }
}
function updateInputCounter(input){
 const target=document.querySelector(input?.dataset?.countTarget||'');
 if(!target)return;
 const value=String(input.value||'');
 target.textContent=String(value.length);
 const max=Number(input.getAttribute('maxlength')||0);
 const wrap=target.closest('.content-count')||target.parentElement;
 if(wrap&&max)wrap.classList.toggle('is-over',value.length>max);
}
async function loadClientConfig(){
 if(window.__APP_CONFIG__)return window.__APP_CONFIG__;
 if(typeof loadConfig==='function')return loadConfig();
 const res=await fetch('/api/config',{headers:{Accept:'application/json'}});
 window.__APP_CONFIG__=res.ok?await res.json():{};
 return window.__APP_CONFIG__;
}
async function ensureTurnstile(form,createHolder){
 const cfg=await loadClientConfig();
 if(!cfg.turnstile_enabled||!cfg.turnstile_site_key)return {};
 let holder=form.querySelector('[data-turnstile]');
 if(!holder&&createHolder){
  holder=document.createElement('div');
  holder.className='turnstile-box';
  holder.setAttribute('data-turnstile','');
  holder.hidden=true;
  document.body.appendChild(holder);
 }
 if(!holder)return {};
 await new Promise((resolve,reject)=>{
  if(window.turnstile)return resolve();
  if(document.querySelector('script[data-turnstile-api]')){let n=0;const t=setInterval(()=>{if(window.turnstile){clearInterval(t);resolve();}else if(++n>80){clearInterval(t);reject(new Error('Turnstile loading timeout'));}},100);return;}
  const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.defer=true;s.dataset.turnstileApi='1';s.onload=resolve;s.onerror=()=>reject(new Error('Turnstile failed to load'));document.head.appendChild(s);
 });
 holder.hidden=false;
 // Reuse an existing fresh token without re-rendering
 if(holder.dataset.widgetId){const existing=turnstile.getResponse(holder.dataset.widgetId);if(existing)return {'cf-turnstile-response':existing};}
 // Render once with callback — avoids the double-render caused by no-callback first render
 const token=await new Promise((resolve,reject)=>{
  if(holder.dataset.widgetId){try{turnstile.remove(holder.dataset.widgetId);}catch(e){}}
  holder.dataset.widgetId=turnstile.render(holder,{sitekey:cfg.turnstile_site_key,theme:'dark',callback:resolve,'error-callback':()=>reject(new Error('Turnstile verification failed'))});
  setTimeout(()=>reject(new Error('Turnstile verification timeout')),120000);
 });
 return {'cf-turnstile-response':token};
}
document.addEventListener('submit',async(e)=>{
 const form=e.target.closest('[data-action]'); if(!form)return; e.preventDefault(); showMessage('');
 const submit=e.submitter||form.querySelector('button[type="submit"]');
 const release=setButtonLoading(submit,siteT('common.processing','处理中...'));
 let keepLoading=false;
 try{
  const action=form.dataset.action;
  if(action==='login'){
   const turnstilePayload=await ensureTurnstile(form);
   const data=await api('/api/login',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email:form.email.value,password:form.password.value,...turnstilePayload})});
   if(data.token)localStorage.setItem('token',data.token); keepLoading=true; location.href='/'; return;
  }
  if(action==='register'){
   const turnstilePayload=await ensureTurnstile(form);
   const data=await api('/api/register',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email:form.email.value,password:form.password.value,code:form.code?.value||'',locale:SITE_LOCALE,...turnstilePayload})});
   if(data.token)localStorage.setItem('token',data.token);
   showMessage(data.message||siteT('auth.registerDone','注册成功，已完成邮箱验证。'),'ok'); keepLoading=true; setTimeout(()=>{location.href=data.redirect||'/';},500); return;
  }
  if(action==='forgot'){
   const turnstilePayload=await ensureTurnstile(form);
   const startForgotCd=(sec)=>{keepLoading=true;let _fl=sec;submit.disabled=true;submit.textContent=siteT('auth.forgotResendIn','重新发送')+'('+_fl+'s)';const _ft=setInterval(()=>{_fl--;submit.textContent=siteT('auth.forgotResendIn','重新发送')+'('+_fl+'s)';if(_fl<=0){clearInterval(_ft);submit.disabled=false;submit.textContent=siteT('auth.forgot','找回密码');}},1000);};
   try{
    await api('/api/auth/forgot-password',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email:form.email.value,locale:SITE_LOCALE,...turnstilePayload})});
    showMessage(siteT('auth.forgotSent','如果邮箱存在，重置链接会发送到该邮箱。'),'ok');
    startForgotCd(60);
   }catch(err){
    const cd=Number(err.data?.cooldown||0);
    if(cd>0){startForgotCd(cd);showMessage(err.message||String(err),'error');}
    else throw err;
   }
   return;
  }
  if(action==='reset'){
   if(form.password.value!==form.password_confirm.value){showMessage(siteT('auth.passwordMismatch','两次输入的密码不一致。'),'error');return;}
   await api('/api/auth/reset-password',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({token:form.token.value,password:form.password.value})});
   showMessage(siteT('auth.resetDone','密码已重置，请登录。'),'ok'); keepLoading=true; location.href='/login'; return;
  }
  if(action==='comment'){
   const commentContent=form.content?.value||'';
   if(isClientVisuallyEmpty(commentContent)){showMessage(siteT('comment.emptyInput','评论不能为空。'),'error');form.content?.focus();return;}
   if(commentContent.length>3000){showMessage(siteT('comment.tooLong','评论不能超过 3000 个字符。'),'error');form.content?.focus();return;}
   const turnstilePayload=await ensureTurnstile(form);
   const data=await api('/api/posts/'+form.post_id.value+'/comments',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({content:commentContent,parent_id:form.parent_id.value||null,...turnstilePayload})});
   if(data.status==='pending'){form.content.value='';showMessage(siteT('comment.pending','评论已提交，等待审核。'),'ok');return;}
   keepLoading=true; location.reload(); return;
  }
  if(action==='post'){
   const tagIds=[...form.querySelectorAll('input[name="tag_ids"]:checked')].map(i=>Number(i.value));
   const saveDraft=submit?.dataset?.draft==='1';
   const needsTurnstile=!saveDraft&&(!form.post_id?.value||String(form.dataset.postStatus||'')==='draft');
   const turnstilePayload=needsTurnstile?await ensureTurnstile(form):{};
   const i18nPayload=syncCurrentPostTranslation(form);
   const payload=await applyPostSubmitPlugins({title:form.title.value,category_id:form.category_id.value||null,tag_ids:tagIds,content:form.content.value,min_view_level:Math.max(0,Number(form.min_view_level?.value||0)),min_comment_level:Math.max(0,Number(form.min_comment_level?.value||0)),status:saveDraft?'draft':'publish',locale:i18nPayload.locale,translations:i18nPayload.translations,...turnstilePayload},form);
   if(form.post_id?.value){
    const data=await api('/api/posts/'+form.post_id.value,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify(payload)});
    if(saveDraft||data.status==='draft'){showMessage(siteT('compose.draftSaved','草稿已保存。'),'ok');return;}
    keepLoading=true;location.href=data.status==='pending'?'/?pending=post':(data.url||('/posts/'+form.post_id.value));return;
   }
   const data=await api('/api/posts',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});
   if(saveDraft||data.status==='draft'){
    if(data.id&&!form.post_id){const id=document.createElement('input');id.type='hidden';id.name='post_id';id.value=String(data.id);form.prepend(id);}
    showMessage(siteT('compose.draftSaved','草稿已保存。'),'ok');return;
   }
   keepLoading=true;location.href=data.status==='pending'?'/?pending=post':(data.url||('/posts/'+data.id));return;
  }
   if(action==='settings'){
    const getSettingInput=(name)=>form.elements.namedItem(name)||document.querySelector('[name="'+name+'"]');
    const usernameInput=getSettingInput('username');
    const avatarInput=getSettingInput('avatar_url');
    const emailNotificationsInput=getSettingInput('email_notifications');
    const showPublicPostsInput=getSettingInput('show_public_posts');
    await api('/api/user/profile',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({username:usernameInput?.value||'',avatar_url:avatarInput?.value||'',email_notifications:emailNotificationsInput?emailNotificationsInput.checked:true,show_public_posts:showPublicPostsInput?showPublicPostsInput.checked:true})});
    showMessage(siteT('settings.profileSaved','资料已保存。'),'ok'); return;
   }
  if(action==='set-password'){
   const oldPassword=form.elements.namedItem('old_password');
   const passwordInput=form.elements.namedItem('password');
   const confirmInput=form.elements.namedItem('password_confirm');
   const data=await api('/api/user/set-password',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({old_password:oldPassword?.value||'',password:passwordInput?.value||'',password_confirm:confirmInput?.value||''})});
   showMessage(data.message||siteT('settings.passwordSaved','密码已设置。'),'ok'); form.reset(); return;
  }
 }catch(err){showMessage(err.message||String(err),'error');}
 finally{if(!keepLoading)release();}
});
document.addEventListener('input',(e)=>{
 const input=e.target.closest?.('[data-count-target]');
 if(!input)return;
 updateInputCounter(input);
});
document.querySelectorAll('[data-count-target]').forEach(updateInputCounter);
document.addEventListener('change',(e)=>{
 const localeSelect=e.target.closest?.('[data-post-locale]');
 if(localeSelect){switchPostLocale(localeSelect);}
});
document.addEventListener('click',async(e)=>{
 const registerCode=e.target.closest('[data-register-send-code]');
 if(registerCode){
  const form=registerCode.closest('form');
  const email=form?.email?.value||'';
  if(!email){showMessage(siteT('auth.emailRequired','请输入邮箱。'),'error');return;}
  try{const turnstilePayload=await ensureTurnstile(form);await runButtonAction(registerCode,siteT('common.processing','处理中...'),async(done)=>{
   const data=await api('/api/register/send-code',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email,locale:SITE_LOCALE,...turnstilePayload})});
   showMessage(data.message||siteT('auth.registerCodeSent','验证码已发送，请查收邮件。'),'ok');
   form?.code?.focus();
   startRegisterCodeCountdown(registerCode);
   done(siteT('auth.codeSent','已发送'));
  });}catch(err){const cd=Number(err.data?.cooldown||0);if(cd>0)startRegisterCodeCountdown(registerCode,cd);showMessage(err.message||String(err),'error');}
  return;
 }
 const notif=e.target.closest('[data-notification-toggle]'); if(notif){const root=notif.closest('.notifications');root?.classList.toggle('open');if(root?.classList.contains('open'))loadNotifications(true);return;}
 if(!e.target.closest?.('.notifications'))document.querySelectorAll('.notifications.open').forEach((el)=>el.classList.remove('open'));
 const tab=e.target.closest('[data-tab-target]'); if(tab){const root=tab.closest('[data-tabs]'); if(root){root.querySelectorAll('[data-tab-target]').forEach((item)=>item.classList.toggle('active',item===tab)); root.querySelectorAll('[data-tab-panel]').forEach((panel)=>panel.hidden=panel.dataset.tabPanel!==tab.dataset.tabTarget);} return;}
 const reply=e.target.closest('[data-reply]'); if(reply){const id=reply.dataset.reply; const input=document.querySelector('[name="parent_id"]'); const area=document.querySelector('textarea[name="content"]'); if(input)input.value=id;if(area){area.focus();area.placeholder=siteT('comment.replyPlaceholder','回复 #')+id;}}
 const like=e.target.closest('[data-like]'); if(like){try{await runButtonAction(like,siteT('common.processing','处理中...'),async(done)=>{const data=await api('/api/posts/'+like.dataset.like+'/like',{method:'POST',headers:nonceHeaders(false)});const count=Number(data.like_count??0);const liked=!!data.liked;const likeSvg='<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';like.classList.toggle('active',liked);like.classList.toggle('is-liked',liked);done(likeSvg+'<span data-like-count>'+count+'</span>');document.querySelectorAll('[data-like-static="'+like.dataset.like+'"]').forEach((el)=>{el.classList.toggle('active',liked);el.classList.toggle('is-liked',liked);const n=el.querySelector('[data-like-count]');if(n)n.textContent=String(count);});});}catch(err){showMessage(err.message||String(err),'error');}}
 const checkin=e.target.closest('[data-checkin]'); if(checkin){try{await runButtonAction(checkin,siteT('common.processing','处理中...'),async(done)=>{const data=await api('/api/user/checkin',{method:'POST',headers:nonceHeaders(true),body:'{}'});done(siteT('index.side.checkedIn','今日已签到'));checkin.disabled=true;checkin.dataset.i18n='index.side.checkedIn';const card=checkin.closest('.daily-card');if(card){const vals=card.querySelectorAll('.daily-stat strong');if(vals[0])vals[0].textContent=data.level??vals[0].textContent;if(vals[1])vals[1].textContent=data.points??vals[1].textContent;if(vals[2])vals[2].textContent=data.experience??vals[2].textContent;const bar=card.querySelector('.levelbar');if(bar){const xp=Number(data.experience||0),level=Number(data.level||1),next=Math.max(100,level*level*100);bar.value=Math.max(4,Math.min(100,Math.round((xp/next)*100)));}}});}catch(err){alert(err.message||String(err));}}
 const resend=e.target.closest('[data-resend-verification]'); if(resend){try{await runButtonAction(resend,siteT('common.processing','处理中...'),async(done)=>{const data=await api('/api/user/resend-verification',{method:'POST',headers:nonceHeaders(true),body:'{}'});done(data.message||siteT('settings.verifyMailSent','验证邮件已发送。'));showMessage(data.message||siteT('settings.verifyMailSent','验证邮件已发送。'),'ok');});}catch(err){showMessage(err.message||String(err),'error');}return;}
 const otpBtn=e.target.closest('button[data-action="send-email-code"],button[data-action="verify-email-code"]');
 if(otpBtn){
  const action=otpBtn.dataset.action;
  if(action==='send-email-code'){
   try{await runButtonAction(otpBtn,siteT('common.processing','处理中...'),async(done)=>{
    const newEmail=document.getElementById('new_email_input')?.value||'';
    if(!newEmail){showMessage(siteT('settings.emailRequired','请输入新邮箱地址。'),'error');done(siteT('settings.sendCode','发送验证码'));return;}
    await api('/api/user/send-email-code',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({new_email:newEmail,locale:SITE_LOCALE})});
    document.getElementById('email-code-step')?.removeAttribute('hidden');
    document.getElementById('email-code-input')?.focus();
    showMessage(siteT('settings.emailCodeSent','验证码已发送，请查收邮件。'),'ok');
    startEmailCodeCountdown();
    done(siteT('settings.sendCode','发送验证码'));
   });}catch(err){showMessage(err.message||String(err),'error');}
   return;
  }
  if(action==='verify-email-code'){
   try{await runButtonAction(otpBtn,siteT('common.processing','处理中...'),async(done)=>{
    const code=document.getElementById('email-code-input')?.value||'';
    if(!code){showMessage(siteT('settings.codeRequired','请输入验证码。'),'error');done(siteT('settings.verifyAndBind','验证并绑定'));return;}
    const data=await api('/api/user/verify-email-code',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({code})});
    const emailRow=document.querySelector('.current-email-value');
    if(emailRow&&data.new_email)emailRow.textContent=data.new_email;
    const warnBadge=document.querySelector('.email-current .badge-warn,.current-email-row .badge-warn');
    if(warnBadge){warnBadge.className='badge badge-ok';warnBadge.textContent=siteT('settings.verified','已验证');}
    document.getElementById('email-code-step')?.setAttribute('hidden','');
    const emailInput=document.getElementById('new_email_input');
    if(emailInput)emailInput.value='';
    showMessage(siteT('settings.emailBound','邮箱绑定成功。'),'ok');
    done(siteT('settings.verifyAndBind','验证并绑定'));
   });}catch(err){showMessage(err.message||String(err),'error');}
   return;
  }
 }
 const delPost=e.target.closest('[data-post-delete]'); if(delPost){if(!confirm(siteT('post.deleteConfirm','确定删除这个帖子？')))return;try{await runButtonAction(delPost,siteT('common.deleting','删除中...'),async()=>{const id=delPost.dataset.postDelete;const url=delPost.dataset.admin==='1'?'/api/admin/posts/'+id:'/api/posts/'+id;await api(url,{method:'DELETE',headers:nonceHeaders(false)});location.href=delPost.dataset.redirect||'/';});}catch(err){alert(err.message||String(err));}}
 const publishDraft=e.target.closest('[data-post-publish]'); if(publishDraft){try{await runButtonAction(publishDraft,siteT('common.processing','处理中...'),async()=>{const id=publishDraft.dataset.postPublish;const turnstilePayload=await ensureTurnstile(document.body,true);const data=await api('/api/posts/'+id+'/publish',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(turnstilePayload)});location.href=data.status==='pending'?'/?pending=post':(data.url||('/posts/'+id));});}catch(err){alert(err.message||String(err));}return;}
 const pinPost=e.target.closest('[data-post-pin]'); if(pinPost){try{await runButtonAction(pinPost,siteT('common.processing','处理中...'),async()=>{await api('/api/admin/posts/'+pinPost.dataset.postPin+'/pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:pinPost.dataset.pinned!=='1'})});location.reload();});}catch(err){alert(err.message||String(err));}}
 const categoryPinPost=e.target.closest('[data-post-category-pin]'); if(categoryPinPost){try{await runButtonAction(categoryPinPost,siteT('common.processing','处理中...'),async()=>{await api('/api/admin/posts/'+categoryPinPost.dataset.postCategoryPin+'/category-pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:categoryPinPost.dataset.pinned!=='1'})});location.reload();});}catch(err){alert(err.message||String(err));}}
 const delComment=e.target.closest('[data-comment-delete]'); if(delComment){if(!confirm(siteT('comment.deleteConfirm','确定删除这条评论？')))return;try{await runButtonAction(delComment,siteT('common.deleting','删除中...'),async()=>{const id=delComment.dataset.commentDelete;const url=delComment.dataset.admin==='1'?'/api/admin/comments/'+id:'/api/comments/'+id;await api(url,{method:'DELETE',headers:nonceHeaders(false)});location.reload();});}catch(err){alert(err.message||String(err));}}
});
let _emailCodeTimer=null;
function startEmailCodeCountdown(){
 const btn=document.getElementById('resend-code-btn');
 if(!btn)return;
 let left=60;
 btn.disabled=true;
 btn.textContent=siteT('settings.resendCodeIn','重新发送')+'('+left+'s)';
 clearInterval(_emailCodeTimer);
 _emailCodeTimer=setInterval(()=>{
  left--;
  btn.textContent=siteT('settings.resendCodeIn','重新发送')+'('+left+'s)';
  if(left<=0){clearInterval(_emailCodeTimer);btn.disabled=false;btn.textContent=siteT('settings.resendCode','重新发送');}
 },1000);
}
let _registerCodeTimer=null;
function startRegisterCodeCountdown(btn,initial){
 if(_registerCodeTimer)clearInterval(_registerCodeTimer);
 let left=initial||60;
 btn.disabled=true;
 btn.textContent=siteT('auth.resendCodeIn','重新发送')+'('+left+'s)';
 _registerCodeTimer=setInterval(()=>{
  left-=1;
  btn.textContent=siteT('auth.resendCodeIn','重新发送')+'('+left+'s)';
  if(left<=0){clearInterval(_registerCodeTimer);btn.disabled=false;btn.textContent=siteT('auth.sendCode','发送验证码');}
 },1000);
}
document.addEventListener('change',async(e)=>{
 const file=e.target.closest('[data-upload]'); if(!file||!file.files?.[0])return;
 const target=document.querySelector(file.dataset.target||'textarea[name="content"]'); const fd=new FormData(); fd.append('file',file.files[0]); fd.append('type',file.dataset.type||'post');
 const cursorTarget=target&&typeof target.selectionStart==='number'?target:null;
 const cursorStart=cursorTarget?cursorTarget.selectionStart:0;
 const cursorEnd=cursorTarget?cursorTarget.selectionEnd:cursorStart;
 showMessage(siteT('common.uploading','正在上传...'));
 try{const res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});const data=await res.json();if(!res.ok)throw new Error(data.error||siteT('common.uploadFailed','上传失败')); if(target){if(file.dataset.type==='avatar'||!cursorTarget){target.value=data.url;}else{insertMarkdownBlock(cursorTarget,'![]('+data.url+')',cursorStart,cursorEnd);} target.dispatchEvent(new Event('input',{bubbles:true}));} showMessage(siteT('common.uploadDone','上传完成。'),'ok');}
 catch(err){showMessage(err.message||String(err),'error');}
});
let _previewTimer=null;
let _previewSeq=0;
function scheduleMarkdownPreview(area){
 const preview=document.querySelector(area.dataset.previewSource);
 if(!preview)return;
 const seq=++_previewSeq;
 clearTimeout(_previewTimer);
 _previewTimer=setTimeout(async()=>{
  try{
   const data=await api('/api/markdown/preview',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({content:area.value||''})});
   if(seq===_previewSeq){preview.outerHTML=data.html||'';if(window.ForumForge&&ForumForge.loadEnabledPlugins)await ForumForge.loadEnabledPlugins();}
  }catch(_err){
   if(seq===_previewSeq){preview.outerHTML='<div class="article" data-live-preview><div class="prose">'+renderPreview(area.value)+'</div></div>';if(window.ForumForge&&ForumForge.loadEnabledPlugins)await ForumForge.loadEnabledPlugins();}
  }
 },180);
}
document.addEventListener('input',(e)=>{const area=e.target.closest('textarea[data-preview-source]');if(!area)return;scheduleMarkdownPreview(area);});
function insertMarkdownBlock(area,text,start,end){
 if(!area)return;
 const value=area.value||'';
 const before=value.slice(0,start);
 const after=value.slice(end);
 const prefix=before&&!before.endsWith('\\n')?'\\n\\n':'';
 const suffix=after&&!after.startsWith('\\n')?'\\n\\n':'';
 const insert=prefix+text+suffix;
 area.value=before+insert+after;
 const cursor=start+insert.length;
 area.focus();
 area.setSelectionRange(cursor,cursor);
 area.dispatchEvent(new Event('input',{bubbles:true}));
}
function applyMarkdown(area, before, after, placeholder){
 if(!area)return;
 const start=area.selectionStart||0,end=area.selectionEnd||0,value=area.value||'',selected=value.slice(start,end)||placeholder||'';
 const next=value.slice(0,start)+before+selected+after+value.slice(end);
 area.value=next; area.focus();
 const cursor=start+before.length+selected.length;
 area.setSelectionRange(start+before.length,cursor);
 area.dispatchEvent(new Event('input',{bubbles:true}));
}
document.addEventListener('click',(e)=>{
 const btn=e.target.closest('[data-md]');
 if(!btn)return;
 const area=document.querySelector(btn.dataset.target||'textarea[name="content"]');
 const cmd=btn.dataset.md;
 if(cmd==='bold')applyMarkdown(area,'**','**',siteT('compose.sampleText','文本'));
 if(cmd==='italic')applyMarkdown(area,'*','*',siteT('compose.sampleText','文本'));
 if(cmd==='strike')applyMarkdown(area,'~~','~~',siteT('compose.sampleText','文本'));
 if(cmd==='h2')applyMarkdown(area,'## ','',siteT('compose.headingText','标题'));
 if(cmd==='h3')applyMarkdown(area,'### ','',siteT('compose.headingText','标题'));
 if(cmd==='quote')applyMarkdown(area,'> ','',siteT('compose.quoteText','引用内容'));
 if(cmd==='ul')applyMarkdown(area,'- ','',siteT('compose.listText','列表项'));
 if(cmd==='ol')applyMarkdown(area,'1. ','',siteT('compose.listText','列表项'));
 if(cmd==='code')applyMarkdown(area,String.fromCharCode(96),String.fromCharCode(96),'code');
 if(cmd==='codeblock')applyMarkdown(area,String.fromCharCode(96,96,96)+'\\n','\\n'+String.fromCharCode(96,96,96),'code');
 if(cmd==='link')applyMarkdown(area,'[','](https://)',siteT('compose.linkText','链接'));
 if(cmd==='image')applyMarkdown(area,'![','](https://example.com/image.png =640x360)',siteT('compose.imageAlt','图片描述'));
 if(cmd==='video')applyMarkdown(area,'@[video](',')','https://youtu.be/video-id');
});
`;
}

