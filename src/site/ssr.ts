import { escapeHtml } from '../utils/html';
import { DEFAULT_LEVEL_SETTINGS, nextLevelExperience, type LevelSettings } from '../gamification/progress';
import { publicPostPath, publicUserPath } from '../core/id-codec';
import { FORUMFORGE_ICON_DATA_URL } from '../assets/brand';
import { extractMedia, readingMinutes, renderMarkdown, stripMarkdown } from './markdown';
import type {
	PageState,
	SiteCategory,
	SiteComment,
	SiteNotification,
	SitePost,
	SiteProgressLog,
	SiteTag,
	SiteUser,
} from './types';

export type { PageState, SiteCategory, SiteComment, SiteNotification, SitePost, SiteProgressLog, SiteTag, SiteUser } from './types';

type LayoutOptions = {
	title: string;
	user?: SiteUser | null;
	categories?: SiteCategory[];
	allCategory?: SiteCategory;
	activeCategory?: string;
	body: string;
	script?: string;
	wide?: boolean;
	fixed?: boolean;
};

const SITE_NAME = 'ForumForge';
const FAVICON_LINKS = `<link rel="icon" type="image/svg+xml" href="${attr(FORUMFORGE_ICON_DATA_URL)}">
<link rel="shortcut icon" href="${attr(FORUMFORGE_ICON_DATA_URL)}">`;

export function siteHtmlResponse(html: string, status = 200, headers?: HeadersInit): Response {
	return new Response(html, {
		status,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			...(headers || {}),
		},
	});
}

function attr(value: unknown): string {
	return escapeHtml(value).replace(/"/g, '&quot;');
}

function avatar(user?: Partial<SiteUser> | null, fallback = '?'): string {
	if (user?.avatar_url) {
		return `<img class="avatar" src="${attr(user.avatar_url)}" alt="">`;
	}
	return `<span class="avatar">${escapeHtml(String(fallback || '?').slice(0, 1).toUpperCase())}</span>`;
}

type HoverProfile = Partial<SiteUser> & {
	author_name?: string;
	author_avatar?: string;
	author_id?: number;
	author_role?: string;
	author_points?: number;
	author_experience?: number;
	author_level?: number;
};

function profileAvatar(profile?: HoverProfile | null, fallback = '?', env?: Partial<Env> | Record<string, unknown>): string {
	const username = profile?.username || profile?.author_name || String(fallback || 'User');
	const id = Number(profile?.id ?? profile?.author_id ?? 0);
	const normalized: Partial<SiteUser> = {
		id,
		username,
		avatar_url: profile?.avatar_url || profile?.author_avatar,
		role: profile?.role || profile?.author_role,
		points: profile?.points ?? profile?.author_points,
		experience: profile?.experience ?? profile?.author_experience,
		level: profile?.level ?? profile?.author_level,
	};
	const role = normalized.role || 'user';
	const level = Math.max(1, Number(normalized.level || 1));
	const points = Math.max(0, Number(normalized.points || 0));
	const xp = Math.max(0, Number(normalized.experience || 0));
	const avatarNode = id > 0
		? `<a class="user-avatar-link" href="${publicUserPath(id, env)}" aria-label="${attr(username)}">${avatar(normalized, username)}</a>`
		: avatar(normalized, username);
	const cardAvatar = id > 0
		? `<a class="user-avatar-link" href="${publicUserPath(id, env)}" aria-label="${attr(username)}">${avatar(normalized, username)}</a>`
		: avatar(normalized, username);
	return `<span class="user-hover" tabindex="0">${avatarNode}
		<span class="user-card" role="tooltip">
			<span class="user-card-head">${cardAvatar}<span><strong>${escapeHtml(username)}</strong><small>${escapeHtml(role)}</small></span></span>
			<span class="user-card-stats"><span><b>${level}</b><small data-i18n="index.side.level">等级</small></span><span><b>${points}</b><small data-i18n="index.side.points">积分</small></span><span><b>${xp}</b><small data-i18n="index.side.experience">经验</small></span></span>
		</span>
	</span>`;
}

function dateText(value?: string): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
}

function i18n(key: string, fallback: string): string {
	return `<span data-i18n="${attr(key)}">${escapeHtml(fallback)}</span>`;
}

function i18nText(key: string, fallback: string): string {
	return `<span data-i18n="${attr(key)}">${escapeHtml(fallback)}</span>`;
}

type StatKind = 'like' | 'comment' | 'view';

function statIcon(kind: StatKind): string {
	if (kind === 'like') {
		return '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';
	}
	if (kind === 'comment') {
		return '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></svg>';
	}
	return '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function statNode(kind: StatKind, count: number, attrs = '', active = false): string {
	const activeClass = kind === 'like' && active ? ' active is-liked' : '';
	const countAttr = kind === 'like' ? ' data-like-count' : '';
	return `<span class="stat stat-${kind}${activeClass}"${attrs}>${statIcon(kind)}<span${countAttr}>${Number(count || 0)}</span></span>`;
}

function likeButton(post: SitePost): string {
	return `<button class="btn stat stat-like ${post.liked ? 'active is-liked' : ''}" type="button" data-like="${post.id}">${statIcon('like')}<span data-like-count>${Number(post.like_count || 0)}</span></button>`;
}

function appScript(): string {
	return `
function nonceHeaders(json){const h={'X-Timestamp':String(Math.floor(Date.now()/1000)),'X-Nonce':crypto.randomUUID()};if(json)h['Content-Type']='application/json';return h;}
async function api(url, options){const res=await fetch(url,options);const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||siteT('common.requestFailed','请求失败'));return data;}
function showMessage(text,type){const el=document.querySelector('[data-message]');if(!el)return;el.textContent=text||'';el.dataset.type=type||'';}
function escapeHtmlClient(text){return String(text||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cookieLocale(){const m=document.cookie.match(/(?:^|; )ff_locale=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
function normalizeClientLocale(value){const raw=String(value||'').trim().replace('_','-');const low=raw.toLowerCase();if(!raw)return '';if(low==='zh'||low==='zh-cn'||low==='zh-hans')return 'zh-CN';if(low==='en'||low==='en-us')return 'en-US';const parts=raw.split('-');return parts[1]?parts[0].toLowerCase()+'-'+parts[1].toUpperCase():parts[0].toLowerCase();}
function pickBrowserLocale(langs){const supported=(langs&&langs.length?langs:[{code:'en-US'},{code:'zh-CN'}]).map(languageCode);const nav=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language]).map(normalizeClientLocale);for(const item of nav){const hit=supported.find((code)=>normalizeClientLocale(code)===item||normalizeClientLocale(code).split('-')[0]===item.split('-')[0]);if(hit)return hit;}return supported.includes('en-US')?'en-US':(supported[0]||'en-US');}
let SITE_I18N={}, SITE_LANGUAGES=[], SITE_LOCALE=localStorage.getItem('ff.locale')||cookieLocale()||pickBrowserLocale()||document.documentElement.lang||'en-US';
const LOCALE_COUNTRY={'zh-CN':'cn','zh':'cn','zh-TW':'tw','en-US':'us','en':'us','ja-JP':'jp','ja':'jp','ko-KR':'kr','ko':'kr','fr-FR':'fr','fr':'fr','de-DE':'de','de':'de','es-ES':'es','es':'es','pt-BR':'br','pt':'br','ru-RU':'ru','ru':'ru','vi-VN':'vn','vi':'vn','id-ID':'id','id':'id','th-TH':'th','th':'th','ar-SA':'sa','ar':'sa'};
function localeCountry(code){return LOCALE_COUNTRY[code]||LOCALE_COUNTRY[String(code||'').split('-')[0]]||String(code||'').toLowerCase();}
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
  if(flag)flag.className='fi fi-'+localeCountry(languageCode(current));
  if(name)name.textContent=languageName(current);
  if(menu){
   menu.innerHTML=langs.map((lang)=>{const code=languageCode(lang);return '<li data-code="'+escapeHtmlClient(code)+'" class="'+(code===SITE_LOCALE?'active':'')+'"><span class="fi fi-'+escapeHtmlClient(localeCountry(code))+'"></span><span>'+escapeHtmlClient(languageName(lang))+'</span><small>('+escapeHtmlClient(code)+')</small></li>';}).join('');
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
function renderPreview(text){return String(text||'').split(/\\n{2,}/).map((block)=>{const media=block.trim().match(/^!\\[([^\\]]*)\\]\\(([^)\\s]+).*\\)$/);if(media){const url=media[2];return /\\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url)?'<video controls preload="metadata" src="'+escapeHtmlClient(url)+'"></video>':'<img src="'+escapeHtmlClient(url)+'" alt="'+escapeHtmlClient(media[1])+'">';}return '<p>'+escapeHtmlClient(block).replace(/\\n/g,'<br>')+'</p>';}).join('')||'<p class="muted">'+escapeHtmlClient(siteT('common.previewEmpty','预览会在这里显示。'))+'</p>';}
async function loadClientConfig(){
 if(window.__APP_CONFIG__)return window.__APP_CONFIG__;
 if(typeof loadConfig==='function')return loadConfig();
 const res=await fetch('/api/config',{headers:{Accept:'application/json'}});
 window.__APP_CONFIG__=res.ok?await res.json():{};
 return window.__APP_CONFIG__;
}
async function ensureTurnstile(form){
 if(!form.querySelector('[data-turnstile]'))return {};
 const cfg=await loadClientConfig();
 if(!cfg.turnstile_enabled||!cfg.turnstile_site_key)return {};
 await new Promise((resolve,reject)=>{
  if(window.turnstile)return resolve();
  if(document.querySelector('script[data-turnstile-api]')){let n=0;const timer=setInterval(()=>{if(window.turnstile){clearInterval(timer);resolve();}else if(++n>80){clearInterval(timer);reject(new Error('Turnstile loading timeout'));}},100);return;}
  const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.defer=true;s.dataset.turnstileApi='1';s.onload=resolve;s.onerror=()=>reject(new Error('Turnstile failed to load'));document.head.appendChild(s);
 });
 const holder=form.querySelector('[data-turnstile]');
 holder.hidden=false;
 if(!holder.dataset.widgetId){holder.dataset.widgetId=turnstile.render(holder,{sitekey:cfg.turnstile_site_key,theme:'dark'});}
 let token=turnstile.getResponse(holder.dataset.widgetId);
 if(!token){
  token=await new Promise((resolve,reject)=>{
   turnstile.reset(holder.dataset.widgetId);
   turnstile.remove(holder.dataset.widgetId);
   holder.dataset.widgetId=turnstile.render(holder,{sitekey:cfg.turnstile_site_key,theme:'dark',callback:resolve,'error-callback':()=>reject(new Error('Turnstile verification failed'))});
   setTimeout(()=>reject(new Error('Turnstile verification timeout')),120000);
  });
 }
 return {'cf-turnstile-response':token};
}
document.addEventListener('submit',async(e)=>{
 const form=e.target.closest('[data-action]'); if(!form)return; e.preventDefault(); showMessage('');
 const submit=form.querySelector('button[type="submit"]');
 const release=setButtonLoading(submit,siteT('common.processing','处理中...'));
 let keepLoading=false;
 try{
  const action=form.dataset.action;
  const turnstilePayload=await ensureTurnstile(form);
  if(action==='login'){
   const data=await api('/api/login',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email:form.email.value,password:form.password.value,...turnstilePayload})});
   if(data.token)localStorage.setItem('token',data.token); keepLoading=true; location.href='/'; return;
  }
  if(action==='register'){
   const data=await api('/api/register',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email:form.email.value,password:form.password.value,...turnstilePayload})});
   if(data.token)localStorage.setItem('token',data.token);
   showMessage(data.message||siteT('auth.registerVerifySent','注册成功，请前往邮箱完成验证。'),'ok'); keepLoading=true; setTimeout(()=>{location.href=data.redirect||'/';},700); return;
  }
  if(action==='forgot'){
   await api('/api/auth/forgot-password',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({email:form.email.value})});
   showMessage(siteT('auth.forgotSent','如果邮箱存在，重置链接会发送到该邮箱。'),'ok'); return;
  }
  if(action==='reset'){
   await api('/api/auth/reset-password',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({token:form.token.value,password:form.password.value})});
   showMessage(siteT('auth.resetDone','密码已重置，请登录。'),'ok'); keepLoading=true; location.href='/login'; return;
  }
  if(action==='comment'){
   const data=await api('/api/posts/'+form.post_id.value+'/comments',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({content:form.content.value,parent_id:form.parent_id.value||null,...turnstilePayload})});
   if(data.status==='pending'){form.content.value='';showMessage(siteT('comment.pending','评论已提交，等待审核。'),'ok');return;}
   keepLoading=true; location.reload(); return;
  }
  if(action==='post'){
   const tagIds=[...form.querySelectorAll('input[name="tag_ids"]:checked')].map(i=>Number(i.value));
   const payload={title:form.title.value,category_id:form.category_id.value||null,tag_ids:tagIds,content:form.content.value,min_view_level:Math.max(0,Number(form.min_view_level?.value||0)),min_comment_level:Math.max(0,Number(form.min_comment_level?.value||0))};
   if(form.post_id?.value){const data=await api('/api/posts/'+form.post_id.value,{method:'PUT',headers:nonceHeaders(true),body:JSON.stringify(payload)});keepLoading=true;location.href=data.url||('/posts/'+form.post_id.value);return;}
   const data=await api('/api/posts',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify(payload)});keepLoading=true;location.href=data.status==='pending'?'/?pending=post':(data.url||('/posts/'+data.id));return;
  }
  if(action==='settings'){
   await api('/api/user/profile',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({username:form.username.value,avatar_url:form.avatar_url.value,email_notifications:form.email_notifications.checked,show_public_posts:form.show_public_posts?form.show_public_posts.checked:true})});
   showMessage(siteT('settings.profileSaved','资料已保存。'),'ok'); return;
  }
  if(action==='change-email'){
   const emailInput=form.elements.namedItem('new_email');
   const data=await api('/api/user/change-email',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({new_email:emailInput?.value||''})});
   showMessage(data.message||siteT('settings.emailChangeSent','确认邮件已发送，请前往新邮箱完成绑定。'),'ok'); form.reset(); return;
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
 const target=document.querySelector(input.dataset.countTarget);
 if(target)target.textContent=String((input.value||'').length);
});
document.addEventListener('click',async(e)=>{
 const notif=e.target.closest('[data-notification-toggle]'); if(notif){const root=notif.closest('.notifications');root?.classList.toggle('open');if(root?.classList.contains('open'))loadNotifications(true);return;}
 if(!e.target.closest?.('.notifications'))document.querySelectorAll('.notifications.open').forEach((el)=>el.classList.remove('open'));
 const tab=e.target.closest('[data-tab-target]'); if(tab){const root=tab.closest('[data-tabs]'); if(root){root.querySelectorAll('[data-tab-target]').forEach((item)=>item.classList.toggle('active',item===tab)); root.querySelectorAll('[data-tab-panel]').forEach((panel)=>panel.hidden=panel.dataset.tabPanel!==tab.dataset.tabTarget);} return;}
 const reply=e.target.closest('[data-reply]'); if(reply){const id=reply.dataset.reply; const input=document.querySelector('[name="parent_id"]'); const area=document.querySelector('textarea[name="content"]'); if(input)input.value=id;if(area){area.focus();area.placeholder=siteT('comment.replyPlaceholder','回复 #')+id;}}
 const like=e.target.closest('[data-like]'); if(like){try{await runButtonAction(like,siteT('common.processing','处理中...'),async(done)=>{const data=await api('/api/posts/'+like.dataset.like+'/like',{method:'POST',headers:nonceHeaders(false)});const count=Number(data.like_count??0);const liked=!!data.liked;const likeSvg='<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';like.classList.toggle('active',liked);like.classList.toggle('is-liked',liked);done(likeSvg+'<span data-like-count>'+count+'</span>');document.querySelectorAll('[data-like-static="'+like.dataset.like+'"]').forEach((el)=>{el.classList.toggle('active',liked);el.classList.toggle('is-liked',liked);const n=el.querySelector('[data-like-count]');if(n)n.textContent=String(count);});});}catch(err){showMessage(err.message||String(err),'error');}}
 const checkin=e.target.closest('[data-checkin]'); if(checkin){try{await runButtonAction(checkin,siteT('common.processing','处理中...'),async(done)=>{const data=await api('/api/user/checkin',{method:'POST',headers:nonceHeaders(true),body:'{}'});done(siteT('index.side.checkedIn','今日已签到'));checkin.disabled=true;checkin.dataset.i18n='index.side.checkedIn';const card=checkin.closest('.daily-card');if(card){const vals=card.querySelectorAll('.daily-stat strong');if(vals[0])vals[0].textContent=data.level??vals[0].textContent;if(vals[1])vals[1].textContent=data.points??vals[1].textContent;if(vals[2])vals[2].textContent=data.experience??vals[2].textContent;const bar=card.querySelector('.levelbar');if(bar){const xp=Number(data.experience||0),level=Number(data.level||1),next=Math.max(100,level*level*100);bar.value=Math.max(4,Math.min(100,Math.round((xp/next)*100)));}}});}catch(err){alert(err.message||String(err));}}
 const resend=e.target.closest('[data-resend-verification]'); if(resend){try{await runButtonAction(resend,siteT('common.processing','处理中...'),async(done)=>{const data=await api('/api/user/resend-verification',{method:'POST',headers:nonceHeaders(true),body:'{}'});done(data.message||siteT('settings.verifyMailSent','验证邮件已发送。'));showMessage(data.message||siteT('settings.verifyMailSent','验证邮件已发送。'),'ok');});}catch(err){showMessage(err.message||String(err),'error');}return;}
 const delPost=e.target.closest('[data-post-delete]'); if(delPost){if(!confirm(siteT('post.deleteConfirm','确定删除这个帖子？')))return;try{await runButtonAction(delPost,siteT('common.deleting','删除中...'),async()=>{const id=delPost.dataset.postDelete;const url=delPost.dataset.admin==='1'?'/api/admin/posts/'+id:'/api/posts/'+id;await api(url,{method:'DELETE',headers:nonceHeaders(false)});location.href=delPost.dataset.redirect||'/';});}catch(err){alert(err.message||String(err));}}
 const pinPost=e.target.closest('[data-post-pin]'); if(pinPost){try{await runButtonAction(pinPost,siteT('common.processing','处理中...'),async()=>{await api('/api/admin/posts/'+pinPost.dataset.postPin+'/pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:pinPost.dataset.pinned!=='1'})});location.reload();});}catch(err){alert(err.message||String(err));}}
 const categoryPinPost=e.target.closest('[data-post-category-pin]'); if(categoryPinPost){try{await runButtonAction(categoryPinPost,siteT('common.processing','处理中...'),async()=>{await api('/api/admin/posts/'+categoryPinPost.dataset.postCategoryPin+'/category-pin',{method:'POST',headers:nonceHeaders(true),body:JSON.stringify({pinned:categoryPinPost.dataset.pinned!=='1'})});location.reload();});}catch(err){alert(err.message||String(err));}}
 const delComment=e.target.closest('[data-comment-delete]'); if(delComment){if(!confirm(siteT('comment.deleteConfirm','确定删除这条评论？')))return;try{await runButtonAction(delComment,siteT('common.deleting','删除中...'),async()=>{const id=delComment.dataset.commentDelete;const url=delComment.dataset.admin==='1'?'/api/admin/comments/'+id:'/api/comments/'+id;await api(url,{method:'DELETE',headers:nonceHeaders(false)});location.reload();});}catch(err){alert(err.message||String(err));}}
});
document.addEventListener('change',async(e)=>{
 const file=e.target.closest('[data-upload]'); if(!file||!file.files?.[0])return;
 const target=document.querySelector(file.dataset.target||'textarea[name="content"]'); const fd=new FormData(); fd.append('file',file.files[0]); fd.append('type',file.dataset.type||'post');
 showMessage(siteT('common.uploading','正在上传...'));
 try{const res=await fetch('/api/upload',{method:'POST',headers:nonceHeaders(false),body:fd});const data=await res.json();if(!res.ok)throw new Error(data.error||siteT('common.uploadFailed','上传失败')); if(target){if(file.dataset.type==='avatar'){target.value=data.url;}else{const text='![]('+data.url+')'; target.value=(target.value?target.value+'\\n\\n':'')+text;} target.dispatchEvent(new Event('input'));} showMessage(siteT('common.uploadDone','上传完成。'),'ok');}
 catch(err){showMessage(err.message||String(err),'error');}
});
document.addEventListener('input',(e)=>{const area=e.target.closest('textarea[data-preview-source]');if(!area)return;const preview=document.querySelector(area.dataset.previewSource);if(preview)preview.innerHTML=renderPreview(area.value);});
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
 if(cmd==='image')applyMarkdown(area,'![','](https://)',siteT('compose.imageAlt','图片描述'));
});
`;
}

export function renderSiteLayout(options: LayoutOptions): string {
	const categories = options.categories || [];
	const user = options.user || null;
	const categoryLinks = [
		`<a class="side-link ${!options.activeCategory ? 'active' : ''}" href="/"><span>#</span><span>${escapeHtml(options.allCategory?.name || '全部')}</span></a>`,
		...categories.map((cat) => `<a class="side-link ${options.activeCategory === String(cat.id) ? 'active' : ''}" href="/?category_id=${cat.id}"><span>•</span><span>${escapeHtml(cat.name)}</span><small>${Number(cat.post_count || 0)}</small></a>`),
	].join('');
	const userMenu = user
		? `<details class="user-menu"><summary>${avatar(user, user.username)}<span>${escapeHtml(user.username)}</span></summary><div class="menu-panel"><div class="menu-head">${avatar(user, user.username)}<strong>${escapeHtml(user.username)}</strong><small>${escapeHtml(user.email)}</small></div><a href="/me" data-i18n="me.title">我的内容</a><a href="/settings" data-i18n="nav.profileSettings">个人设置</a>${user.role === 'admin' ? '<a href="/admin" data-i18n="nav.adminPanel">管理后台</a>' : ''}<a href="/logout" data-i18n="nav.logout">退出登录</a></div></details>`
		: `<a class="btn ghost" href="/login" data-i18n="nav.login">登录</a><a class="btn primary" href="/register" data-i18n="nav.register">注册</a>`;
	const notificationBell = user
		? `<div class="notifications"><button class="icon-btn" type="button" data-notification-toggle title="Notifications">🔔<span class="notif-count" data-notification-count ${Number(user.unread_count || 0) ? '' : 'hidden'}>${Number(user.unread_count || 0)}</span></button><div class="notif-panel" data-notification-panel></div></div>`
		: '';
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)} - ${SITE_NAME}</title>
${FAVICON_LINKS}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/css/flag-icons.min.css">
<script>try{var ffLocale=localStorage.getItem('ff.locale')||((document.cookie.match(/(?:^|; )ff_locale=([^;]+)/)||[])[1]&&decodeURIComponent((document.cookie.match(/(?:^|; )ff_locale=([^;]+)/)||[])[1]));if(ffLocale&&ffLocale!==document.documentElement.lang)document.documentElement.classList.add('i18n-pending');}catch(e){}</script>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--panel2:#0f1623;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--danger:#f85149;--radius:8px;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;--mono:"Cascadia Code","Consolas",monospace;--z-base:0;--z-header:1000;--z-dropdown:1100;--z-floating:1200;--z-modal:2000;--z-toast:2200}
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:rgba(88,166,255,.48) rgba(15,23,36,.78)}*::-webkit-scrollbar{width:10px;height:10px}*::-webkit-scrollbar-track{background:rgba(15,23,36,.78);border-radius:999px}*::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(88,166,255,.68),rgba(96,120,150,.42));border:2px solid rgba(15,23,36,.9);border-radius:999px}*::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,rgba(88,166,255,.92),rgba(139,148,158,.58))}html,body{height:100%;margin:0}body{background:var(--bg);color:var(--text);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.i18n-pending [data-i18n]{color:transparent!important;background:linear-gradient(90deg,rgba(96,120,150,.16),rgba(96,120,150,.28),rgba(96,120,150,.16));background-size:180% 100%;border-radius:6px;animation:i18nPulse 1s ease-in-out infinite}@keyframes i18nPulse{0%{background-position:100% 0}100%{background-position:-100% 0}}a{color:inherit;text-decoration:none}button,input,textarea,select{font:inherit;color:inherit}img,video{max-width:100%}
.app{height:100vh;display:grid;grid-template-columns:228px minmax(0,1fr)}.side{border-right:1px solid rgba(96,120,150,.22);background:linear-gradient(180deg,#101827 0%,#0b111d 58%,#090d14 100%);display:flex;flex-direction:column;min-height:0}.brand{height:58px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid rgba(96,120,150,.2);font-weight:850;letter-spacing:.01em}.brand span:first-child{width:22px;height:22px;display:grid;place-items:center;border:1px solid rgba(88,166,255,.45);border-radius:7px;color:#8cc8ff;background:rgba(88,166,255,.09)}.side-title{padding:18px 14px 8px;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.side-link{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:9px;margin:3px 8px;padding:9px 10px;border-radius:9px;color:#c7d3e2;border:1px solid transparent}.side-link:hover,.side-link.active{background:rgba(88,166,255,.1);border-color:rgba(88,166,255,.16);color:#fff}.side-link small{color:var(--muted);font-size:11px}
.workspace{min-width:0;display:flex;flex-direction:column;height:100vh}.topbar{position:relative;z-index:var(--z-header);isolation:isolate;height:58px;border-bottom:1px solid rgba(96,120,150,.22);display:flex;align-items:center;gap:12px;padding:0 16px;background:rgba(13,19,32,.92);backdrop-filter:blur(16px)}.search{width:min(560px,44vw);background:#0f1724;border:1px solid rgba(96,120,150,.3);border-radius:10px;padding:9px 12px;outline:none}.search:focus{border-color:rgba(88,166,255,.75);box-shadow:0 0 0 3px rgba(88,166,255,.12)}.top-actions{margin-left:auto;display:flex;align-items:center;gap:8px}.lang-picker{position:relative;z-index:var(--z-dropdown)}.lang-btn{height:36px;display:flex;align-items:center;gap:8px;border:1px solid rgba(96,120,150,.34);border-radius:999px;background:#0f1724;color:var(--text);padding:0 11px;font-size:13px;font-weight:750;cursor:pointer}.lang-btn:hover{border-color:var(--accent);background:#131d2c}.lang-btn svg{opacity:.55}.lang-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid rgba(96,120,150,.34);border-radius:12px;background:#161b22;box-shadow:0 22px 70px rgba(0,0,0,.55);display:none;max-height:360px;overflow:auto;z-index:var(--z-dropdown)}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border-radius:8px;cursor:pointer;color:#d8dee9}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.1);color:#58a6ff}.lang-menu li small{color:var(--muted);font-size:11px}.fi{line-height:1}.content{position:relative;z-index:var(--z-base);min-height:0;flex:1;overflow:hidden;padding:18px}.content.wide{padding:12px}.content.fixed{overflow:hidden}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--border);background:transparent;border-radius:var(--radius);padding:7px 11px;color:var(--text);cursor:pointer;font-weight:650;transition:.15s}.btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.05)}.btn:disabled,.btn[data-loading="1"]{cursor:wait;opacity:.72;pointer-events:none}.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:750}.btn.primary:hover{color:#fff;opacity:.86}.btn.ghost{background:transparent}.btn.danger{border-color:#6e1f26;color:#ff7b72}.btn.active{border-color:rgba(88,166,255,.54);color:#dff0ff;background:rgba(88,166,255,.12)}.spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.22);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.stat{display:inline-flex;align-items:center;gap:5px;color:var(--muted);line-height:1;font-variant-numeric:tabular-nums}.stat-icon{width:15px;height:15px;display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:fill .15s,color .15s,filter .15s,transform .15s}.stat-like{color:#7fb7ff}.stat-comment{color:#cdbbff}.stat-view{color:#89d7ff}.stat-like.active,.stat-like.is-liked{color:#58a6ff}.stat-like.active .stat-icon,.stat-like.is-liked .stat-icon{fill:currentColor;filter:drop-shadow(0 0 7px rgba(88,166,255,.5));transform:translateY(-.5px)}.btn.stat{padding:7px 10px}.btn.stat.active,.btn.stat.is-liked{border-color:rgba(88,166,255,.54);background:rgba(88,166,255,.12)}.stats .stat{min-width:34px}.muted{color:var(--muted)}.pill{border:1px solid var(--border);background:#111827;border-radius:999px;padding:2px 7px;font-size:12px;color:#9fb1c5}.message[data-type=error]{color:var(--danger)}.message[data-type=ok]{color:var(--green)}
.avatar{width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;background:#212a3a;color:#c9d1d9;object-fit:cover;flex:0 0 auto}.user-hover{position:relative;display:inline-grid;place-items:center;line-height:1;z-index:25}.user-avatar-link{display:inline-grid;border-radius:999px;line-height:1}.user-avatar-link .avatar{cursor:pointer}.user-avatar-link:hover .avatar{box-shadow:0 0 0 2px rgba(88,166,255,.35)}.user-card{position:absolute;left:0;top:calc(100% + 10px);width:238px;display:grid;gap:10px;padding:12px;border:1px solid rgba(88,166,255,.34);border-radius:14px;background:linear-gradient(180deg,rgba(18,28,44,.98),rgba(9,14,24,.98));box-shadow:0 24px 70px rgba(0,0,0,.58),0 0 0 1px rgba(255,255,255,.02) inset;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-4px);transition:.14s;z-index:var(--z-floating);color:var(--text)}.user-card:before{content:"";position:absolute;left:10px;top:-6px;width:10px;height:10px;transform:rotate(45deg);background:rgba(18,28,44,.98);border-left:1px solid rgba(88,166,255,.34);border-top:1px solid rgba(88,166,255,.34)}.user-hover:hover .user-card,.user-hover:focus-within .user-card{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0)}.user-card-head{display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;align-items:center}.user-card-head .avatar{width:42px;height:42px;font-size:16px}.user-card-head strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.user-card-head small{display:inline-flex;margin-top:4px;color:#8cc8ff;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.user-card-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.user-card-stats span{display:grid;place-items:center;align-content:center;min-height:54px;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826}.user-card-stats b{font-size:17px;line-height:1}.user-card-stats small{margin-top:4px;color:var(--muted);font-size:11px}.user-card-badges{display:flex;flex-wrap:wrap;gap:6px}.badge-chip{border:1px solid rgba(88,166,255,.3);border-radius:999px;background:rgba(88,166,255,.1);color:#cfe6ff;padding:4px 8px;font-size:11px;font-weight:800}.muted-badge{border-color:rgba(96,120,150,.24);background:#0d1320;color:var(--muted)}.icon-btn{position:relative;width:36px;height:36px;border:1px solid var(--border);border-radius:10px;background:#0f1724;color:#c9d1d9;display:grid;place-items:center;cursor:pointer}.icon-btn:hover{border-color:var(--accent);color:#fff;background:#132033}.notif-count{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--danger);color:#fff;font-size:11px;font-weight:900;line-height:18px}.notifications{position:relative;z-index:var(--z-dropdown)}.notif-panel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:min(360px,calc(100vw - 24px));max-height:420px;overflow:auto;border:1px solid rgba(96,120,150,.34);border-radius:14px;background:#0d1320;box-shadow:0 24px 80px rgba(0,0,0,.55);padding:8px}.notifications.open .notif-panel{display:grid;gap:6px}.notif-item{display:grid;gap:3px;padding:10px;border-radius:10px;border:1px solid rgba(96,120,150,.18);background:#101826}.notif-item:hover{border-color:rgba(88,166,255,.38);background:#142033}.notif-item.unread{border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.1)}.notif-item strong{font-size:13px}.notif-item span{color:#b9c8da;font-size:12px;line-height:1.45}.notif-item small,.notif-empty{color:var(--muted);font-size:12px}.notif-empty{padding:14px;text-align:center}.user-menu{position:relative;z-index:var(--z-dropdown)}.user-menu[open]{z-index:var(--z-dropdown)}.user-menu summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;border:1px solid var(--border);border-radius:999px;padding:4px 9px;background:var(--panel)}.user-menu summary::-webkit-details-marker{display:none}.menu-panel{display:none}.floating-menu{position:fixed;z-index:var(--z-floating);display:grid;gap:4px;width:max-content;min-width:128px;max-width:min(260px,calc(100vw - 16px));border:1px solid rgba(96,120,150,.34);border-radius:12px;background:#0d1320;box-shadow:0 22px 70px rgba(0,0,0,.58);padding:8px}.floating-menu[hidden]{display:none}.floating-menu a{display:block;padding:9px 10px;border-radius:7px}.floating-menu a:hover{background:#21262d}.floating-menu .btn{width:100%;justify-content:flex-start;padding:7px 9px;font-size:12px;border-color:transparent}.floating-menu .btn:hover{background:#162238}.menu-head{display:grid;grid-template-columns:36px 1fr;gap:2px 10px;padding:8px 10px 12px;border-bottom:1px solid var(--border);margin-bottom:6px;min-width:220px}.menu-head .avatar{grid-row:1/3;width:36px;height:36px}.menu-head small{color:var(--muted)}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.page-head h1{font-size:20px;margin:0}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.toolbar-end{justify-content:flex-end}.btn-compact{padding:3px 7px}.stats-start{justify-content:flex-start}.no-margin{margin:0}.feed-title{margin:0;font-size:20px}.feed-shell{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}.feed-main{min-width:0}.feed-hero{position:relative;overflow:hidden;border:1px solid rgba(96,120,150,.24);border-radius:16px;background:linear-gradient(135deg,rgba(18,29,45,.96),rgba(10,15,24,.98));padding:16px 18px;margin-bottom:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center}.feed-hero:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:linear-gradient(180deg,var(--accent),var(--green));opacity:.95}.hero-copy{position:relative;min-width:0}.hero-kicker{color:#8cc8ff;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.14em}.feed-hero h1{margin:4px 0 6px;font-size:24px;line-height:1.08;letter-spacing:-.015em}.feed-hero p{position:relative;max-width:960px;margin:0;color:#aebdd0;white-space:normal}.hero-stats{position:relative;display:grid;grid-template-columns:repeat(3,108px);gap:8px}.hero-stat{border:1px solid rgba(96,120,150,.24);border-radius:12px;background:rgba(5,10,18,.42);padding:10px 11px;min-width:0;text-align:center;display:grid;place-items:center;align-content:center}.hero-stat strong{display:block;font-size:19px;line-height:1}.hero-stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}.feed-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 12px}.seg{display:flex;gap:4px;padding:4px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d}.seg .btn{border:0;border-radius:9px;padding:7px 12px}.seg .btn.active{background:#1b2738;color:#fff}.post-list{display:grid;gap:10px;align-content:start}.post-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 164px;gap:16px;height:148px;min-height:0;overflow:visible;padding:14px 16px;border:1px solid rgba(96,120,150,.22);border-radius:16px;background:linear-gradient(180deg,rgba(18,26,39,.92),rgba(10,16,26,.96));box-shadow:0 16px 40px rgba(0,0,0,.14)}.post-row:hover{z-index:20;border-color:rgba(88,166,255,.38);background:linear-gradient(180deg,rgba(20,31,48,.96),rgba(12,19,31,.98));transform:translateY(-1px)}.post-row.featured{grid-template-columns:minmax(0,1fr) minmax(260px,34%);height:184px;min-height:0;border-color:rgba(88,166,255,.38)}.post-title{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:850;margin:0 0 7px;line-height:1.25}.post-row.featured .post-title{font-size:22px;letter-spacing:-.015em}.post-excerpt{color:#adbad0;margin:8px 0 11px;max-width:980px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.post-row.featured .post-excerpt{-webkit-line-clamp:3}.meta,.stats{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:12px}.stats{justify-content:flex-end}.post-side{display:flex;flex-direction:column;align-items:stretch;gap:10px;min-width:0;height:100%;overflow:hidden;border-radius:12px}.thumbs{height:100%;min-height:92px;border:1px solid rgba(96,120,150,.24);border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#172338,#0f1828);display:grid;position:relative}.post-row.featured .thumbs{height:100%}.thumbs img,.thumbs video{width:100%;height:100%;object-fit:cover;border:0;border-radius:0}.thumbs img[src=""],.thumbs img:not([src]){display:none}.thumbs.multi{grid-template-columns:1fr 1fr}.thumbs.multi img:first-child,.thumbs.multi video:first-child{grid-row:span 2}.thumbs.empty{display:grid;place-items:center;color:#8aa2bd;background:linear-gradient(135deg,#18243a,#0d1422)}.thumbs.empty:before{content:"Discussion";font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.feed-aside{display:grid;gap:12px;align-self:start;position:sticky;top:14px}.side-card{border:1px solid rgba(96,120,150,.22);border-radius:16px;background:#0b111d;padding:14px}.side-card h3{margin:0 0 10px;font-size:14px}.topic-list{display:grid;gap:8px}.topic-list a{display:flex;align-items:center;justify-content:space-between;gap:8px;border-radius:10px;padding:8px 9px;background:#101826;color:#c8d5e6}.topic-list a:hover{background:#162238}.daily-card{background:linear-gradient(180deg,rgba(88,166,255,.08),rgba(13,19,32,.96));text-align:center}.daily-card .btn{width:100%;height:38px}.daily-desc{color:#9fb0c8;margin:0 0 12px;line-height:1.55}.daily-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}.daily-stat{border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:8px;min-height:66px;text-align:center;display:grid;place-items:center;align-content:center}.daily-stat strong{display:block;font-size:18px}.daily-stat span{display:block;color:var(--muted);font-size:11px;margin-top:3px}.levelbar{appearance:none;width:100%;height:7px;border:0;border-radius:999px;background:#111827;overflow:hidden;margin:8px 0 12px}.levelbar::-webkit-progress-bar{background:#111827;border-radius:999px}.levelbar::-webkit-progress-value{background:linear-gradient(90deg,var(--accent),var(--green));border-radius:999px}.levelbar::-moz-progress-bar{background:linear-gradient(90deg,var(--accent),var(--green));border-radius:999px}.pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px}.home-board{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr)}.home-board .feed-hero{margin-bottom:12px}.home-board .feed-controls{margin:0 0 12px}.home-board .feed-shell{min-height:0;height:100%;align-items:stretch}.home-board .feed-main{min-height:0;display:flex;flex-direction:column}.home-board .post-list{min-height:0;flex:1;overflow:auto;align-content:start;padding-right:4px;padding-bottom:8px}.home-board .pagination{flex:0 0 auto;margin-top:0;padding-top:10px;border-top:1px solid rgba(96,120,150,.18);background:linear-gradient(180deg,rgba(13,17,23,0),rgba(13,17,23,.72))}.home-board .feed-aside{position:static;align-self:stretch;min-height:0;height:100%;display:flex;flex-direction:column;overflow:hidden}.home-board .side-card{min-height:0}.home-board .side-card:last-child{flex:1;overflow:hidden}.home-board .topic-list{min-height:0;overflow:auto;padding-right:2px}
.detail-grid{height:100%;min-height:0;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(360px,.85fr);gap:12px}.detail-panel{min-height:0;border:1px solid var(--border);border-radius:8px;background:#0b111d;display:flex;flex-direction:column}.detail-head{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px}.detail-head h1{margin:0 0 8px;font-size:22px}.detail-actions{margin-left:auto;display:flex;gap:8px}.article{min-height:0;flex:1;overflow:auto;padding:18px 20px}.prose{width:100%;max-width:none}.prose h2,.prose h3,.prose h4{border-bottom:1px solid var(--border);padding-bottom:6px}.prose p{margin:0 0 14px}.prose img,.prose video{display:block;max-height:520px;width:auto;border-radius:8px;border:1px solid var(--border);margin:12px 0;object-fit:contain}.public-profile{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;overflow:hidden}.public-profile-hero{padding:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;background:radial-gradient(circle at 12% 0,rgba(88,166,255,.18),transparent 40%),linear-gradient(135deg,rgba(18,29,45,.96),rgba(10,15,24,.98))}.public-profile-main{display:flex;align-items:center;gap:14px;min-width:0}.public-profile-main .avatar{width:70px;height:70px;font-size:28px;border:1px solid rgba(96,120,150,.35)}.public-profile-main h1{margin:4px 0 4px;font-size:28px}.public-profile-main p{margin:0;color:var(--muted)}.public-profile-stats{display:grid;grid-template-columns:repeat(3,96px);gap:8px}.public-profile-hero .levelbar{grid-column:1/-1;margin:0}.public-profile-hero .meta{grid-column:1/-1}.public-profile-posts{min-height:0;display:flex;flex-direction:column;overflow:hidden}.profile-section-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}.profile-section-head h2{padding:0;border:0}.public-profile-list{min-height:0;flex:1;overflow:auto;display:grid;gap:10px;padding:12px}.public-profile-posts>.pagination{padding:10px 12px;margin:0;border-top:1px solid var(--border)}.setting-field-narrow{max-width:460px}.setting-field-narrow input{max-width:460px}.field-foot{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px;margin-top:6px;margin-bottom:0;line-height:1.3}.settings-view{height:100%;min-height:0;width:100%;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:14px;overflow:hidden}.settings-profile-panel{grid-row:1/3;padding:18px;display:grid;align-content:start;gap:14px;background:radial-gradient(circle at 50% 0,rgba(88,166,255,.16),transparent 42%),linear-gradient(135deg,rgba(88,166,255,.08),rgba(63,185,80,.035),rgba(10,16,26,.98))}.settings-profile-panel .settings-avatar-card{display:grid;gap:10px;justify-items:center}.settings-profile-panel .avatar{width:92px;height:92px;font-size:32px;border:1px solid rgba(96,120,150,.35);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-profile-title{text-align:center}.settings-profile-title h1{margin:4px 0 6px;font-size:26px}.settings-profile-title p{margin:0;color:var(--muted);overflow:hidden;text-overflow:ellipsis}.settings-main{min-height:0;overflow:auto;padding-right:4px}.settings-section-grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:14px;align-items:start}.settings-section.wide{grid-column:1/-1}.settings-section .panel-body{display:grid;gap:12px}.settings-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,360px));gap:12px 16px;align-items:start}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}.settings-form-grid .field{margin:0}.settings-form-grid .field input{max-width:100%}.settings-option-list{display:grid;gap:10px;max-width:520px}.settings-toggle{min-height:40px;display:flex;align-items:center;gap:9px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#101826;padding:8px 11px}.settings-toggle input{width:15px!important;height:15px;accent-color:var(--accent);flex:0 0 auto}.settings-toggle span{font-weight:800}.settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}.settings-actions .btn{min-width:128px}.settings-card .panel-body{display:grid;gap:10px}.settings-big{font-size:34px;font-weight:900;line-height:1;color:#fff}.settings-links{display:grid;gap:8px}.settings-links .btn{width:100%;justify-content:center}.settings-status{display:grid;gap:8px}.settings-status>div{display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 10px}.settings-status span{color:var(--muted)}.settings-save{grid-column:2;justify-content:flex-end;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;padding:12px}.settings-save .message{margin-right:auto}@media(max-width:1180px){.settings-view{grid-template-columns:260px minmax(0,1fr)}.settings-section-grid{grid-template-columns:1fr}}@media(max-width:860px){.settings-view{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto}.settings-profile-panel{grid-row:auto}.settings-save{grid-column:1}.settings-form-grid.password-grid{grid-template-columns:1fr}}
.comments{min-height:0;display:flex;flex-direction:column}.comment-form{padding:12px;border-bottom:1px solid var(--border)}.comment-form textarea{height:54px;min-height:54px;resize:vertical}.comment-form textarea:focus{height:54px}.comment-list{min-height:0;flex:1;overflow:auto;padding:12px}.comment{border:1px solid var(--border);border-radius:7px;padding:10px;margin-bottom:8px;background:#0d1320}.comment.child{margin-left:28px;background:#101826}.comment-top{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin-bottom:6px}.comment-actions{margin-left:auto;display:flex;gap:6px}.comment-body{white-space:pre-wrap}.turnstile-box{display:flex;justify-content:flex-start;margin:10px 0}.turnstile-box[hidden]{display:none!important}.post-actions{position:relative;z-index:12;flex:0 0 auto}.post-actions summary{list-style:none}.post-actions summary::-webkit-details-marker{display:none}.post-action-trigger{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#8b949e;cursor:pointer;font-size:18px;line-height:1}.post-action-trigger:hover{color:#fff;background:rgba(88,166,255,.12)}.post-action-menu{display:none}.me-page{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px}.me-tabs{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.me-tab-nav{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border);background:#0d1320}.me-tab-nav button{border:1px solid rgba(96,120,150,.22);border-radius:10px;background:transparent;padding:7px 13px;color:#b9c8da;cursor:pointer;font-weight:750}.me-tab-nav button:hover{border-color:rgba(88,166,255,.45);color:#fff}.me-tab-nav button.active{background:rgba(88,166,255,.14);border-color:rgba(88,166,255,.42);color:#fff}.me-tab-body{min-height:0;overflow:hidden;padding:12px}.me-tab-panel{height:100%;min-height:0;overflow:auto}.me-tab-panel[hidden]{display:none!important}.me-level-panel{display:grid;grid-template-columns:repeat(3,minmax(0,160px));gap:10px;margin-bottom:12px}.me-level-panel>div{min-height:82px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#101826;display:grid;place-items:center;align-content:center;text-align:center}.me-level-panel strong{display:block;font-size:28px}.progress-log{margin-top:14px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;overflow:hidden}.progress-log h3{margin:0;padding:12px 14px;font-size:16px}.progress-log-list{display:grid;gap:6px;padding:12px;border-top:1px solid rgba(96,120,150,.22)}.progress-row{display:grid;grid-template-columns:minmax(150px,1.1fr) 96px 96px minmax(160px,1.3fr) 128px;align-items:center;gap:10px;border:1px solid rgba(96,120,150,.18);border-radius:10px;background:#101826;padding:9px 12px}.progress-row.is-head{position:sticky;top:0;z-index:1;background:#0d1320;color:#8b949e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.progress-row strong{font-size:13px}.progress-target{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.progress-delta{border:1px solid rgba(88,166,255,.22);border-radius:999px;background:rgba(88,166,255,.08);padding:4px 8px;color:#cfe6ff;font-weight:800;text-align:center}.me-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.me-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.compact-list{display:grid;gap:8px;align-content:start}.compact-item{border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#0b111d;padding:12px;display:grid;gap:7px}.compact-item-head{display:flex;justify-content:space-between;gap:10px}.compact-item-title{font-weight:800}.status-approved{border-color:rgba(63,185,80,.28);color:#a7f3c0}.status-pending{border-color:rgba(230,184,82,.35);color:#f0d48a}.status-rejected{border-color:rgba(248,81,73,.35);color:#ff9a94}.status-note{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-radius:10px;padding:9px 10px;background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.22);color:#ffd7d4}.status-note span{color:#f4b2ad}.status-note .btn{margin-left:auto}.notif-row.unread{border-color:rgba(88,166,255,.45);background:rgba(88,166,255,.08)}.me-pager{padding-top:8px;margin-top:4px}.form-shell{height:100%;min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr) minmax(0,1fr);gap:12px;overflow:hidden}.panel{border:1px solid var(--border);border-radius:8px;background:#0b111d;min-height:0}.panel h2{font-size:18px;margin:0;padding:14px 16px;border-bottom:1px solid var(--border)}.panel-body{padding:14px 16px}.field{display:grid;gap:7px;margin-bottom:14px}.field label{font-weight:700}.field input,.field textarea,.field select{width:100%;border:1px solid var(--border);border-radius:6px;background:#0d1320;padding:9px 10px}.field textarea{min-height:220px;resize:vertical}.comment-form .field textarea{height:54px;min-height:54px}.comment-form .field textarea:focus{height:54px;min-height:54px}.compose-sidebar,.compose-editor,.compose-preview{display:flex;flex-direction:column;overflow:hidden}.compose-sidebar .panel-body{min-height:0;flex:1;overflow:auto}.md-toolbar{display:flex;align-items:center;gap:4px;padding:7px 10px;border-bottom:1px solid rgba(96,120,150,.22);background:linear-gradient(180deg,#101826,#0d1320);flex:0 0 auto;overflow:auto}.md-toolbar button{width:30px;height:30px;border:1px solid transparent;border-radius:8px;background:transparent;color:#9fb1c7;display:grid;place-items:center;cursor:pointer;transition:.14s;padding:0;line-height:1}.md-toolbar button svg{width:16px;height:16px;display:block;stroke-width:2}.md-toolbar button:hover{border-color:rgba(88,166,255,.32);background:rgba(88,166,255,.1);color:#fff}.md-toolbar button:active{transform:translateY(1px)}.md-toolbar>span{width:1px;height:18px;background:rgba(96,120,150,.35);margin:0 5px;flex:0 0 auto}.compose-editor .panel-body{min-height:0;flex:1;overflow:hidden;display:flex;flex-direction:column}.compose-editor .field{min-height:0;flex:1;margin:0}.compose-editor textarea{height:100%;min-height:0;resize:none;overflow:auto}.compose-preview .editor-preview{min-height:0;flex:1;overflow:auto}.compose-preview .panel-body{flex:0 0 auto;border-top:1px solid var(--border);padding:12px 16px}.checks{display:flex;flex-wrap:wrap;gap:8px}.check{display:flex;gap:6px;align-items:center;border:1px solid var(--border);border-radius:999px;padding:5px 9px}.tag-checks{display:flex;flex-wrap:wrap;gap:7px;align-items:flex-start}.tag-check{position:relative;display:inline-flex;align-items:center;min-width:0;max-width:100%;height:30px;border:1px solid rgba(96,120,150,.28);border-radius:999px;background:#101826;color:#b9c8dc;padding:0 10px 0 8px;font-size:12px;font-weight:800;cursor:pointer;transition:.14s}.tag-check input{width:14px!important;height:14px;margin:0 6px 0 0;padding:0;accent-color:var(--accent);flex:0 0 auto}.tag-check span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag-check:hover{border-color:rgba(88,166,255,.48);background:#132033;color:#fff}.tag-check:has(input:checked){border-color:rgba(88,166,255,.62);background:rgba(88,166,255,.14);color:#e6f1ff;box-shadow:inset 0 0 0 1px rgba(88,166,255,.1)}.upload-card{min-height:88px;border:1px dashed rgba(96,120,150,.36);border-radius:12px;background:linear-gradient(180deg,rgba(88,166,255,.06),rgba(13,19,32,.4));display:grid;grid-template-columns:34px minmax(0,1fr);gap:4px 10px;align-items:center;padding:12px;cursor:pointer;transition:.14s}.upload-card:hover{border-color:rgba(88,166,255,.58);background:linear-gradient(180deg,rgba(88,166,255,.1),rgba(13,19,32,.5))}.upload-card.is-disabled{opacity:.56;cursor:not-allowed}.upload-card.is-disabled:hover{border-color:rgba(96,120,150,.36);background:linear-gradient(180deg,rgba(88,166,255,.06),rgba(13,19,32,.4))}.upload-icon{grid-row:1/3;width:34px;height:34px;border:1px solid rgba(88,166,255,.28);border-radius:10px;background:rgba(88,166,255,.1);display:grid;place-items:center;color:#8cc8ff}.upload-card strong{font-size:13px}.upload-card small{color:var(--muted);line-height:1.45}.editor-preview{height:100%;overflow:auto;padding:16px;color:#c9d1d9;white-space:pre-wrap}.auth{height:100%;min-height:0;overflow:auto;display:grid;place-items:center}.auth-card{width:min(440px,100%);border:1px solid var(--border);border-radius:10px;background:#0b111d;padding:24px}.auth-card h1{margin-top:0}.settings-view{height:100%;min-height:0;width:100%;display:grid;grid-template-columns:280px minmax(520px,1fr) 320px;grid-template-rows:minmax(0,1fr) auto;gap:14px;overflow:hidden}.settings-hero{padding:18px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;background:radial-gradient(circle at 50% 0,rgba(88,166,255,.16),transparent 42%),linear-gradient(135deg,rgba(88,166,255,.08),rgba(63,185,80,.035),rgba(10,16,26,.98))}.settings-avatar-card{display:grid;gap:10px;justify-items:center}.settings-avatar-card .avatar{width:96px;height:96px;font-size:32px;border:1px solid rgba(96,120,150,.35);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-avatar-card img.avatar{object-fit:cover}.settings-profile-title h1{margin:4px 0 6px;font-size:28px}.settings-profile-title p{margin:0;color:var(--muted)}.settings-grid{min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.settings-aside{min-height:0;overflow:auto;display:grid;align-content:start;gap:14px}.settings-card .panel-body{display:grid;gap:10px}.settings-big{font-size:34px;font-weight:900;line-height:1;color:#fff}.settings-links{grid-template-columns:1fr}.settings-links .btn{width:100%;justify-content:center}.settings-status{display:grid;gap:8px}.settings-status>div{display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 10px}.settings-status span{color:var(--muted)}.settings-save{grid-column:1/-1;justify-content:flex-end;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;padding:12px}.settings-save .message{margin-right:auto}@media(max-width:1280px){.settings-view{grid-template-columns:260px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}.settings-aside{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden}}@media(max-width:980px){.settings-view{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto}.settings-hero,.settings-grid{grid-template-columns:1fr}.settings-aside{grid-template-columns:1fr;overflow:auto}.settings-hero .daily-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.progress-row{grid-template-columns:1fr 80px 80px}.progress-row.is-head .progress-target,.progress-row.is-head .progress-time,.progress-row .progress-target,.progress-row .progress-time{display:none}}
.settings-view{height:100%;min-height:0;width:100%;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:14px;overflow:hidden}.settings-profile-panel{grid-row:1/3;padding:18px;display:grid;align-content:start;gap:14px;background:radial-gradient(circle at 50% 0,rgba(88,166,255,.16),transparent 42%),linear-gradient(135deg,rgba(88,166,255,.08),rgba(63,185,80,.035),rgba(10,16,26,.98))}.settings-profile-panel .settings-avatar-card{display:grid;gap:10px;justify-items:center}.settings-profile-panel .avatar{width:92px;height:92px;font-size:32px;border:1px solid rgba(96,120,150,.35);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-profile-title{text-align:center}.settings-profile-title h1{margin:4px 0 6px;font-size:26px}.settings-profile-title p{margin:0;color:var(--muted);overflow:hidden;text-overflow:ellipsis}.settings-main{min-height:0;overflow:auto;padding-right:4px}.settings-section-grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:14px;align-items:start}.settings-section.wide{grid-column:1/-1}.settings-section .panel-body{display:grid;gap:12px}.settings-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,360px));gap:12px 16px;align-items:start}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}.settings-form-grid .field{margin:0}.settings-form-grid .field input{max-width:100%}.settings-option-list{display:grid;gap:10px;max-width:520px}.settings-toggle{min-height:40px;display:flex;align-items:center;gap:9px;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#101826;padding:8px 11px}.settings-toggle input{width:15px!important;height:15px;accent-color:var(--accent);flex:0 0 auto}.settings-toggle span{font-weight:800}.settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}.settings-actions .btn{min-width:128px}.settings-card .panel-body{display:grid;gap:10px}.settings-big{font-size:34px;font-weight:900;line-height:1;color:#fff}.settings-links{display:grid;gap:8px}.settings-links .btn{width:100%;justify-content:center}.settings-status{display:grid;gap:8px}.settings-status>div{display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(96,120,150,.22);border-radius:10px;background:#101826;padding:9px 10px}.settings-status span{color:var(--muted)}.settings-save{grid-column:2;justify-content:flex-end;border:1px solid rgba(96,120,150,.22);border-radius:12px;background:#0b111d;padding:12px}.settings-save .message{margin-right:auto}@media(max-width:1180px){.settings-view{grid-template-columns:260px minmax(0,1fr)}.settings-section-grid{grid-template-columns:1fr}}@media(max-width:860px){.settings-view{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto}.settings-profile-panel{grid-row:auto}.settings-save{grid-column:1}.settings-form-grid.password-grid{grid-template-columns:1fr}}
.settings-main{min-height:0;overflow:auto;padding-right:4px}.settings-section-grid{min-height:100%;display:grid;grid-template-columns:repeat(2,minmax(320px,1fr));grid-template-rows:minmax(250px,.9fr) minmax(220px,.7fr) minmax(270px,1fr);gap:14px;align-items:stretch}.settings-section{min-height:0;display:flex;flex-direction:column}.settings-section .panel-body{flex:1;display:flex;flex-direction:column;gap:12px}.settings-section.email-section,.settings-section.password-section{grid-column:1/-1}.settings-section.email-section .panel-body{min-height:220px}.settings-section.password-section .panel-body{min-height:270px}.settings-section .settings-actions{margin-top:auto}.settings-section .settings-form-grid,.settings-section .settings-option-list{flex:0 0 auto}.settings-section .muted{max-width:720px}.settings-form-grid{grid-template-columns:repeat(auto-fit,minmax(240px,360px))}.settings-form-grid.password-grid{grid-template-columns:repeat(3,minmax(220px,320px))}.settings-section .field-foot{margin-top:6px;margin-bottom:0;line-height:1.3}@media(max-width:1180px){.settings-section-grid{grid-template-columns:1fr;grid-template-rows:none}.settings-section.email-section,.settings-section.password-section{grid-column:auto}.settings-section.email-section .panel-body,.settings-section.password-section .panel-body{min-height:0}.settings-form-grid.password-grid{grid-template-columns:repeat(auto-fit,minmax(220px,320px))}}
.field select{appearance:none;-webkit-appearance:none;padding-right:34px;background-color:#0d1320;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%239fb4cc' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px;transition:border-color .14s,background-color .14s,box-shadow .14s}.field select:hover{border-color:#3a4656;background-color:#101826;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16'%3E%3Cpath fill='%23c9d8ea' d='M4.2 6.2 8 10l3.8-3.8z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px 14px}.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.12);outline:none}
.me-tab-panel{overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr) auto}.me-scroll-list{min-height:0;overflow:auto;display:grid;gap:8px;align-content:start;padding-right:4px}.me-level-content{min-height:0;overflow:auto;padding-right:4px;width:100%;max-width:none;margin:0}.me-level-content .me-level-panel{grid-template-columns:repeat(3,minmax(140px,160px));justify-content:center}.me-level-content .levelbar{display:block;width:100%;max-width:680px;margin:14px auto 12px}.me-level-content>.muted{text-align:center}.me-level-content .progress-log{width:100%;max-width:none;box-sizing:border-box}.me-pager{position:relative;margin:8px 0 0;padding-top:10px;border-top:1px solid rgba(96,120,150,.18);background:#0b111d}.me-actions{display:none}
@media(max-width:1180px){.feed-shell{grid-template-columns:1fr}.feed-aside{position:static;grid-template-columns:repeat(2,minmax(0,1fr))}.post-row.featured{grid-template-columns:minmax(0,1fr) 240px}.home-board .feed-shell{grid-template-rows:minmax(0,1fr) auto}.home-board .feed-aside{height:auto;max-height:220px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:980px){body{overflow:hidden}.app{height:100vh;grid-template-columns:1fr}.side{display:none}.workspace{height:100vh;min-height:0}.content{overflow:hidden}.content:not(.fixed){overflow:hidden}.detail-grid,.form-shell{height:100%;grid-template-columns:1fr}.detail-panel{min-height:420px}.search{width:100%}.topbar{height:auto;min-height:56px;flex-wrap:wrap}.top-actions{margin-left:0}.feed-aside{grid-template-columns:1fr}.post-row,.post-row.featured,.feed-hero{grid-template-columns:1fr}.hero-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.stats{justify-content:flex-start}.feed-hero h1{font-size:24px}.home-board{grid-template-rows:auto auto minmax(0,1fr)}.home-board .feed-hero p{display:none}.home-board .feed-shell{grid-template-columns:1fr}.home-board .feed-aside{display:none}}
.home-board .post-list{padding-top:3px;scroll-padding-top:3px}.post-row,.post-row.featured{grid-template-columns:minmax(0,1fr) 178px;height:158px;border-color:rgba(96,120,150,.22)}.post-main{min-width:0;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:6px}.post-title,.post-row.featured .post-title{min-width:0;margin:0;font-size:18px;letter-spacing:0}.post-title span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pin-badge{flex:0 0 auto;font-size:11px;border-radius:999px}.pin-badge.global{color:#ffd166;border-color:rgba(255,209,102,.38);background:rgba(255,209,102,.1)}.pin-badge.category{color:#8cc8ff;border-color:rgba(88,166,255,.38);background:rgba(88,166,255,.1)}.post-excerpt,.post-row.featured .post-excerpt{margin:0;-webkit-line-clamp:2}.stats{justify-content:flex-start;gap:16px;margin-top:2px}.stats span{display:inline-flex;align-items:center;gap:4px}.thumbs{min-height:0}.thumbs.media-1{grid-template-columns:1fr}.thumbs.media-2{grid-template-columns:1fr 1fr}.thumbs.media-3{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.thumbs.media-3>*:first-child{grid-row:1/3}.thumbs.media-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}@media(max-width:980px){.post-row,.post-row.featured{grid-template-columns:1fr;height:auto;min-height:158px}.post-side{height:116px}}
.top-actions .notifications{display:flex;align-items:center;justify-content:center}.top-actions .notifications .notif-panel{left:50%;right:auto;transform:translateX(-50%);width:360px;max-width:min(360px,calc(100vw - 24px))}@media(max-width:760px){.top-actions .notifications .notif-panel{left:auto;right:0;transform:none}}
.level-input-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.level-input-row label{display:grid;gap:6px;font-size:12px;color:#b9c8da}.level-input-row input{height:34px;padding:7px 8px}.locked-excerpt{color:#f0d48a}.locked-thumb{border-style:dashed;background:linear-gradient(135deg,rgba(230,184,82,.08),rgba(88,166,255,.04))}.access-note{display:grid;gap:5px;border:1px solid rgba(88,166,255,.24);border-radius:12px;background:rgba(88,166,255,.08);padding:12px 14px;color:#cfe6ff}.access-note.locked{min-height:180px;place-content:center;text-align:center}.access-note strong{color:#fff;font-size:15px}.access-note span{color:#9fb4cc}
</style>
</head>
<body>
<div class="app">
	<aside class="side">
		<a class="brand" href="/"><span>▣</span><span>${SITE_NAME}</span></a>
		<div class="side-title" data-i18n="site.categories">分类</div>
		<nav>${categoryLinks}</nav>
	</aside>
	<div class="workspace">
		<header class="topbar">
			<form action="/" method="get"><input class="search" name="q" data-i18n-placeholder="nav.searchPlaceholder" placeholder="搜索帖子..." value=""></form>
			<div class="lang-picker" data-language-picker>
				<button class="lang-btn" type="button" data-language-button aria-label="Language"><span class="fi fi-cn" data-language-flag></span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button>
				<ul class="lang-menu" data-language-menu></ul>
			</div>
			<div class="top-actions">
				${notificationBell}
				<a class="btn" href="/" data-i18n="nav.home">首页</a>
				${user ? '<a class="btn primary" href="/new-post" data-i18n="index.newPost">发布新帖</a>' : ''}
				${userMenu}
			</div>
		</header>
		<main class="content ${options.wide ? 'wide' : ''} ${options.fixed ? 'fixed' : ''}">${options.body}</main>
	</div>
</div>
<script>${appScript()}${options.script || ''}</script>
</body>
</html>`;
}

function postTags(post: SitePost): string {
	const tags = post.tags || [];
	if (!tags.length) return '';
	return tags.map((tag) => `<span class="pill">#${escapeHtml(tag.name)}</span>`).join('');
}

function postMedia(post: SitePost): string {
	const media = extractMedia(post.content).slice(0, 4);
	if (!media.length) return '<div class="thumbs empty"></div>';
	return `<div class="thumbs media-${media.length}">${media.map((item) => item.type === 'video'
		? `<video src="${attr(item.url)}" muted preload="metadata"></video>`
		: `<img src="${attr(item.url)}" alt="${attr(item.alt)}" loading="lazy">`
	).join('')}</div>`;
}

function levelBar(progress: number): string {
	const value = Math.max(0, Math.min(100, Math.round(progress)));
	return `<progress class="levelbar" value="${value}" max="100"></progress>`;
}

function pageLink(tab: string, page: number, labelKey: string, label: string, disabled: boolean): string {
	const href = `/me?tab=${encodeURIComponent(tab)}&${encodeURIComponent(tab)}_page=${Math.max(1, page)}`;
	return disabled
		? `<span class="btn muted" data-i18n="${labelKey}">${label}</span>`
		: `<a class="btn" href="${href}" data-i18n="${labelKey}">${label}</a>`;
}

function tabPager(tab: string, state?: PageState): string {
	if (!state) return '';
	const lastPage = Math.max(1, Math.ceil(Number(state.total || 0) / Math.max(1, Number(state.pageSize || 10))));
	return `<div class="pagination me-pager">
		${pageLink(tab, Number(state.page || 1) - 1, 'pagination.previous', '上一页', Number(state.page || 1) <= 1)}
		<span class="muted">${Number(state.page || 1)} / ${lastPage} <span data-i18n="pagination.page">页</span>，<span data-i18n="pagination.total">共</span> ${Number(state.total || 0)}</span>
		${pageLink(tab, Number(state.page || 1) + 1, 'pagination.next', '下一页', Number(state.page || 1) >= lastPage)}
	</div>`;
}

function toolbarIcon(name: string): string {
	const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
	const icons: Record<string, string> = {
		bold: `<svg ${common}><path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>`,
		italic: `<svg ${common}><path d="M19 5h-8"/><path d="M13 19H5"/><path d="M15 5 9 19"/></svg>`,
		strike: `<svg ${common}><path d="M16 6.5A4 4 0 0 0 12.5 5H10a3 3 0 0 0-1.6 5.5"/><path d="M14 13.5A3 3 0 0 1 12 19H8.5A4 4 0 0 1 5 17.5"/><path d="M4 12h16"/></svg>`,
		h2: `<svg ${common}><path d="M4 6v12"/><path d="M12 6v12"/><path d="M4 12h8"/><path d="M16 12a2 2 0 1 1 4 0c0 2-4 3-4 6h4"/></svg>`,
		h3: `<svg ${common}><path d="M4 6v12"/><path d="M12 6v12"/><path d="M4 12h8"/><path d="M16 8h4l-3 4a3 3 0 1 1-1 5"/></svg>`,
		quote: `<svg ${common}><path d="M9 7H5a2 2 0 0 0-2 2v4h4v4h2z"/><path d="M21 7h-4a2 2 0 0 0-2 2v4h4v4h2z"/></svg>`,
		list: `<svg ${common}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
		ordered: `<svg ${common}><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M4 14a2 2 0 1 1 2 2c0 1-2 1.5-2 3h2"/></svg>`,
		link: `<svg ${common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>`,
		image: `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-4-4a2 2 0 0 0-2.8 0L8 17"/></svg>`,
		code: `<svg ${common}><path d="m9 18-6-6 6-6"/><path d="m15 6 6 6-6 6"/></svg>`,
		codeblock: `<svg ${common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9-3 3 3 3"/><path d="m14 9 3 3-3 3"/></svg>`,
		upload: `<svg ${common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>`,
	};
	return icons[name] || '';
}

function mdTool(command: string, title: string, icon: string, titleKey: string): string {
	return `<button type="button" title="${attr(title)}" aria-label="${attr(title)}" data-i18n-title="${attr(titleKey)}" data-md="${attr(command)}">${toolbarIcon(icon)}</button>`;
}

function rejectReasonNote(reason?: string): string {
	const text = String(reason || '').trim();
	return text ? escapeHtml(text) : '<span data-i18n="me.rejectReasonEmpty">管理员未填写额外说明。</span>';
}

function statusBadge(status?: string): string {
	const value = String(status || 'approved');
	if (value === 'pending') return '<span class="pill status-pending" data-i18n="me.postStatus.pending">待审核</span>';
	if (value === 'rejected') return '<span class="pill status-rejected" data-i18n="me.postStatus.rejected">已拒绝</span>';
	return '<span class="pill status-approved" data-i18n="me.postStatus.approved">已发布</span>';
}

function canManagePost(user: SiteUser | null | undefined, post: SitePost): boolean {
	return !!user && (user.role === 'admin' || Number(user.id) === Number(post.author_id));
}

function postManageActions(user: SiteUser | null | undefined, post: SitePost, redirect = '/', env?: Partial<Env> | Record<string, unknown>): string {
	if (!canManagePost(user, post)) return '';
	const isAdmin = user?.role === 'admin';
	const postPath = publicPostPath(post.id, env);
	return `<details class="post-actions">
		<summary><span class="post-action-trigger" role="button" aria-label="Post actions">⋯</span></summary>
		<div class="post-action-menu">
			${isAdmin ? `<button class="btn ghost" type="button" data-post-pin="${post.id}" data-pinned="${Number(post.is_pinned || 0)}" data-i18n="${post.is_pinned ? 'post.unpinGlobal' : 'post.pinGlobal'}">${post.is_pinned ? '取消全局置顶' : '全局置顶'}</button>` : ''}
			${isAdmin ? `<button class="btn ghost" type="button" data-post-category-pin="${post.id}" data-pinned="${Number(post.is_category_pinned || 0)}" data-i18n="${post.is_category_pinned ? 'post.unpinCategory' : 'post.pinCategory'}">${post.is_category_pinned ? '取消分类置顶' : '分类置顶'}</button>` : ''}
			<a class="btn ghost" href="${postPath}/edit" data-i18n="post.edit">编辑</a>
			<button class="btn ghost danger" type="button" data-post-delete="${post.id}" data-admin="${isAdmin ? 1 : 0}" data-redirect="${attr(redirect)}" data-i18n="post.delete">删除</button>
		</div>
	</details>`;
}

function postPinBadges(post: SitePost): string {
	const badges: string[] = [];
	if (post.is_pinned) badges.push('<span class="pill pin-badge global" data-i18n="post.globalPinned">全局置顶</span>');
	if (post.is_category_pinned) badges.push('<span class="pill pin-badge category" data-i18n="post.categoryPinned">分类置顶</span>');
	return badges.join('');
}

function canViewPostContent(user: SiteUser | null | undefined, post: SitePost): boolean {
	const required = Math.max(0, Number(post.min_view_level || 0));
	if (required <= 0) return true;
	if (!user) return false;
	if (Number(user.id) === Number(post.author_id)) return true;
	if (user.role === 'admin') return true;
	return Number(user.level || 0) >= required;
}

function postRow(post: SitePost, _featured = false, user?: SiteUser | null, env?: Partial<Env> | Record<string, unknown>): string {
	const author = {
		id: post.author_id,
		author_id: post.author_id,
		avatar_url: post.author_avatar,
		username: post.author_name || 'User',
		role: post.author_role,
		points: post.author_points,
		experience: post.author_experience,
		level: post.author_level,
	};
	const canView = canViewPostContent(user, post);
	const minViewLevel = Math.max(0, Number(post.min_view_level || 0));
	const excerpt = canView ? stripMarkdown(post.content).slice(0, 220) : '';
	const postPath = publicPostPath(post.id, env);
	return `<article class="post-row">
		<div class="post-main">
			<div class="compact-item-head"><a class="post-title" href="${postPath}">${postPinBadges(post)}<span>${escapeHtml(post.title)}</span></a>${postManageActions(user, post, '/', env)}</div>
			<div class="meta">${profileAvatar(author, post.author_name || 'U', env)}<strong>${escapeHtml(post.author_name || 'User')}</strong><span>·</span><span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.created_at))}</span><span>·</span><span>${readingMinutes(post.content)} <span data-i18n="post.minRead">分钟阅读</span></span>${postTags(post)}</div>
			${canView ? `<p class="post-excerpt">${escapeHtml(excerpt)}</p>` : `<p class="post-excerpt locked-excerpt"><span data-i18n="post.viewLevelLocked">查看等级不足</span> · <span data-i18n="post.needLevel">需要等级</span> ${minViewLevel}</p>`}
			<div class="stats stats-start">${statNode('like', Number(post.like_count || 0), ` data-like-static="${post.id}"`, !!post.liked)}${statNode('comment', Number(post.comment_count || 0))}${statNode('view', Number(post.view_count || 0))}</div>
		</div>
		<div class="post-side">${canView ? postMedia(post) : '<div class="thumbs empty locked-thumb"></div>'}</div>
	</article>`;
}

export function renderHomePage(options: {
	user?: SiteUser | null;
	env?: Partial<Env> | Record<string, unknown>;
	categories: SiteCategory[];
	allCategory?: SiteCategory;
	posts: SitePost[];
	total: number;
	page: number;
	pageSize: number;
	activeCategory?: string;
	q?: string;
	sortBy?: string;
	levelSettings?: LevelSettings;
}): string {
	const rows = options.posts.map((post) => postRow(post, false, options.user, options.env)).join('') || '<div class="panel-body muted" data-i18n="index.empty.posts">暂无帖子</div>';
	const lastPage = Math.max(1, Math.ceil(options.total / options.pageSize));
	const sortBy = ['comments', 'views'].includes(String(options.sortBy || '')) ? String(options.sortBy) : 'time';
	const queryBase = `${options.activeCategory ? `category_id=${encodeURIComponent(options.activeCategory)}&` : ''}${options.q ? `q=${encodeURIComponent(options.q)}&` : ''}`;
	const sortLink = (value: string) => `/?${queryBase}sort_by=${value}`;
	const activeCategory = options.categories.find((cat) => String(cat.id) === String(options.activeCategory || ''));
	const heroCategory = activeCategory || (!options.activeCategory ? options.allCategory : undefined);
	const customHeroTitle = heroCategory ? (heroCategory.hero_title || heroCategory.name || '') : '';
	const customHeroDesc = heroCategory ? (heroCategory.hero_description || heroCategory.description || '') : '';
	const heroTitle = escapeHtml(customHeroTitle || '高密度图文讨论流');
	const heroDesc = escapeHtml(customHeroDesc || '快速扫读图文、视频和长文讨论。');
	const today = new Date().toISOString().slice(0, 10);
	const points = Number(options.user?.points || 0);
	const xp = Number(options.user?.experience || 0);
	const level = Number(options.user?.level || 1);
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const checkedIn = !!options.user && options.user.last_checkin_date === today;
	const dailyCard = options.user
		? `<div class="side-card daily-card"><h3 data-i18n="index.side.dailyCheckin">每日签到</h3><p class="daily-desc" data-i18n="index.side.dailyDesc">签到获取积分和经验。</p><div class="daily-stats"><div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div><div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div><div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div></div>${levelBar(progress)}<button class="btn primary" type="button" data-checkin ${checkedIn ? 'disabled' : ''} data-i18n="${checkedIn ? 'index.side.checkedIn' : 'index.side.checkinAction'}">${checkedIn ? '今日已签到' : '签到'}</button></div>`
		: `<div class="side-card daily-card"><h3 data-i18n="index.side.dailyCheckin">每日签到</h3><p class="daily-desc" data-i18n="index.side.dailyDesc">签到获取积分和经验。</p><a class="btn primary" href="/login" data-i18n="index.side.loginToCheckin">登录后签到</a></div>`;
	const topPosts = options.posts.slice(0, 5).map((post) => `<a href="${publicPostPath(post.id, options.env)}"><span>${escapeHtml(post.title)}</span><small>${Number(post.view_count || 0)}</small></a>`).join('') || '<span class="muted" data-i18n="index.empty.trends">暂无趋势</span>';
	return renderSiteLayout({
		title: '最新帖子',
		user: options.user,
		categories: options.categories,
		allCategory: options.allCategory,
		activeCategory: options.activeCategory,
		fixed: true,
		body: `<div class="home-board"><section class="feed-hero">
			<div class="hero-copy">
				<div class="hero-kicker" data-i18n="index.hero.kicker">ForumForge</div>
				<h1>${heroTitle}</h1>
				<p>${heroDesc}</p>
			</div>
			<div class="hero-stats"><div class="hero-stat"><strong>${options.total}</strong><span data-i18n="index.hero.posts">帖子</span></div><div class="hero-stat"><strong>${options.categories.length}</strong><span data-i18n="index.hero.categories">分类</span></div><div class="hero-stat"><strong>${options.posts.reduce((sum, post) => sum + Number(post.comment_count || 0), 0)}</strong><span data-i18n="index.hero.pageComments">本页评论</span></div></div>
		</section>
		<div class="feed-controls"><div><h1 class="feed-title" data-i18n="index.title">最新帖子</h1><div class="muted" data-i18n="index.feed.subtitle">重点内容突出，普通帖子保持紧凑。</div></div><div class="seg"><a class="btn ${sortBy === 'time' ? 'active' : ''}" href="${sortLink('time')}" data-i18n="index.sort.latest">最新</a><a class="btn ${sortBy === 'comments' ? 'active' : ''}" href="${sortLink('comments')}" data-i18n="index.sort.comments">评论</a><a class="btn ${sortBy === 'views' ? 'active' : ''}" href="${sortLink('views')}" data-i18n="index.sort.views">浏览</a></div></div>
		<div class="feed-shell">
			<section class="feed-main"><div class="post-list">${rows}</div><div class="pagination"><a class="btn ${options.page <= 1 ? 'muted' : ''}" href="/?page=${Math.max(1, options.page - 1)}" data-i18n="pagination.previous">上一页</a><span class="muted">${options.page} / ${lastPage} <span data-i18n="pagination.page">页</span>，<span data-i18n="pagination.total">共</span> ${options.total} <span data-i18n="index.hero.posts">帖子</span></span><a class="btn ${options.page >= lastPage ? 'muted' : ''}" href="/?page=${Math.min(lastPage, options.page + 1)}" data-i18n="pagination.next">下一页</a></div></section>
			<aside class="feed-aside">${dailyCard}<div class="side-card"><h3 data-i18n="index.side.trends">本页趋势</h3><div class="topic-list">${topPosts}</div></div></aside>
		</div></div>`,
	});
}

function renderComments(comments: SiteComment[], parentId: number | null = null, depth = 0, user?: SiteUser | null, env?: Partial<Env> | Record<string, unknown>): string {
	return comments
		.filter((comment) => Number(comment.parent_id || 0) === Number(parentId || 0))
		.map((comment) => {
			const children = renderComments(comments, Number(comment.id), depth + 1, user, env);
			const canDelete = !!user && (user.role === 'admin' || Number(user.id) === Number(comment.author_id));
			return `<div class="comment ${depth ? 'child' : ''}" id="comment-${comment.id}">
				<div class="comment-top">${profileAvatar({ id: comment.author_id, author_id: comment.author_id, avatar_url: comment.avatar_url, username: comment.username, role: comment.role, points: comment.points, experience: comment.experience, level: comment.level }, comment.username || 'U', env)}<strong>${escapeHtml(comment.username || 'User')}</strong><span>${escapeHtml(dateText(comment.created_at))}</span><div class="comment-actions"><button class="btn ghost btn-compact" type="button" data-reply="${comment.id}" data-i18n="comment.reply">回复</button>${canDelete ? `<button class="btn ghost danger btn-compact" type="button" data-comment-delete="${comment.id}" data-admin="${user?.role === 'admin' ? 1 : 0}" data-i18n="post.delete">删除</button>` : ''}</div></div>
				<div class="comment-body">${escapeHtml(comment.content)}</div>
			</div>${children}`;
		})
		.join('');
}

export function renderPostPage(options: {
	user?: SiteUser | null;
	env?: Partial<Env> | Record<string, unknown>;
	categories: SiteCategory[];
	post: SitePost;
	comments: SiteComment[];
}): string {
	const post = options.post;
	const userLevel = Number(options.user?.level || 0);
	const isPrivileged = options.user?.role === 'admin' || Number(options.user?.id || 0) === Number(post.author_id || 0);
	const minViewLevel = Math.max(0, Number(post.min_view_level || 0));
	const minCommentLevel = Math.max(0, Number(post.min_comment_level || 0));
	const canView = isPrivileged || userLevel >= minViewLevel;
	const canComment = isPrivileged || userLevel >= minCommentLevel;
	const form = !options.user
		? `<div class="comment-form"><a class="btn primary" href="/login" data-i18n="comment.loginToReply">登录后评论</a></div>`
		: canComment
			? `<form class="comment-form" data-action="comment"><input type="hidden" name="post_id" value="${post.id}"><input type="hidden" name="parent_id" value=""><div class="field comment-field"><textarea name="content" data-i18n-placeholder="comment.placeholder" placeholder="写下你的评论..."></textarea></div><div class="turnstile-box" data-turnstile hidden></div><div class="toolbar toolbar-end"><button class="btn primary" type="submit" data-i18n="comment.submit">发布评论</button></div><div class="message" data-message></div></form>`
			: `<div class="comment-form"><div class="access-note"><strong data-i18n="post.commentLevelLocked">评论等级不足</strong><span><span data-i18n="post.needLevel">需要等级</span> ${minCommentLevel} · <span data-i18n="post.currentLevel">当前等级</span> ${userLevel}</span></div></div>`;
	const articleBody = canView
		? `<div class="prose">${renderMarkdown(post.content)}</div>`
		: `<div class="access-note locked"><strong data-i18n="post.viewLevelLocked">查看等级不足</strong><span><span data-i18n="post.needLevel">需要等级</span> ${minViewLevel} · <span data-i18n="post.currentLevel">当前等级</span> ${userLevel}</span></div>`;
	const commentsBody = canView ? renderComments(options.comments, null, 0, options.user, options.env) : '<div class="muted" data-i18n="post.commentsHidden">达到查看等级后可查看评论。</div>';
	return renderSiteLayout({
		title: post.title,
		user: options.user,
		categories: options.categories,
		wide: true,
		fixed: true,
		body: `<div class="detail-grid">
			<article class="detail-panel">
				<header class="detail-head"><div>${profileAvatar({ id: post.author_id, author_id: post.author_id, avatar_url: post.author_avatar, username: post.author_name, role: post.author_role, points: post.author_points, experience: post.author_experience, level: post.author_level }, post.author_name || 'U', options.env)}</div><div><h1>${escapeHtml(post.title)}</h1><div class="meta"><strong>${escapeHtml(post.author_name || 'User')}</strong><span>·</span><span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.created_at))}</span>${postTags(post)}</div></div><div class="detail-actions">${likeButton(post)}<span class="btn stat stat-view">${statIcon('view')}<span>${Number(post.view_count || 0)}</span></span>${postManageActions(options.user, post, '/', options.env)}</div></header>
				<div class="article">${articleBody}</div>
			</article>
			<section class="detail-panel comments"><header class="detail-head"><h1 data-i18n="comment.title">评论</h1><span class="pill">${canView ? options.comments.length : 0} <span data-i18n="comment.countSuffix">条</span></span></header>${canView ? form : ''}<div class="comment-list">${commentsBody || '<div class="muted" data-i18n="comment.empty">暂无评论</div>'}</div></section>
		</div>`,
	});
}

export function renderPublicUserPage(options: {
	profile: SiteUser;
	viewer?: SiteUser | null;
	env?: Partial<Env> | Record<string, unknown>;
	categories: SiteCategory[];
	posts: SitePost[];
	pagination?: PageState;
	showPosts: boolean;
	postCount?: number;
	commentCount?: number;
	levelSettings?: LevelSettings;
}): string {
	const profile = options.profile;
	const level = Math.max(1, Number(profile.level || 1));
	const points = Math.max(0, Number(profile.points || 0));
	const xp = Math.max(0, Number(profile.experience || 0));
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const page = options.pagination?.page || 1;
	const pageSize = options.pagination?.pageSize || 12;
	const total = options.pagination?.total || 0;
	const lastPage = Math.max(1, Math.ceil(total / pageSize));
	const postsBody = options.showPosts
		? (options.posts.map((post) => postRow(post, false, options.viewer, options.env)).join('') || '<div class="panel-body muted" data-i18n="user.noPosts">暂无公开帖子</div>')
		: '<div class="panel-body muted" data-i18n="user.postsHidden">该用户已关闭公开帖子列表。</div>';
	const pager = options.showPosts
		? `<div class="pagination"><a class="btn ${page <= 1 ? 'muted' : ''}" href="${publicUserPath(profile.id, options.env)}?page=${Math.max(1, page - 1)}" data-i18n="pagination.previous">上一页</a><span class="muted">${page} / ${lastPage} <span data-i18n="pagination.page">页</span>，<span data-i18n="pagination.total">共</span> ${total}</span><a class="btn ${page >= lastPage ? 'muted' : ''}" href="${publicUserPath(profile.id, options.env)}?page=${Math.min(lastPage, page + 1)}" data-i18n="pagination.next">下一页</a></div>`
		: '';
	return renderSiteLayout({
		title: profile.username,
		user: options.viewer,
		categories: options.categories,
		fixed: true,
		body: `<div class="public-profile">
			<section class="panel public-profile-hero">
				<div class="public-profile-main">${avatar(profile, profile.username)}<div><div class="hero-kicker" data-i18n="user.profileTitle">玩家资料</div><h1>${escapeHtml(profile.username)}</h1><p>${escapeHtml(profile.role || 'user')}</p></div></div>
				<div class="public-profile-stats">
					<div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div>
					<div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div>
					<div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div>
				</div>
				${levelBar(progress)}
				<div class="meta"><span data-i18n="user.joined">加入时间</span><span>${escapeHtml(dateText(profile.created_at))}</span><span>·</span><span>${Number(options.postCount || 0)} <span data-i18n="index.hero.posts">帖子</span></span><span>·</span><span>${Number(options.commentCount || 0)} <span data-i18n="index.hero.pageComments">回复</span></span></div>
			</section>
			<section class="panel public-profile-posts"><header class="profile-section-head"><h2 data-i18n="user.posts">发帖</h2>${options.showPosts ? `<span class="pill">${total}</span>` : ''}</header><div class="public-profile-list">${postsBody}</div>${pager}</section>
		</div>`,
	});
}

export function renderMyContentPage(options: {
	user: SiteUser;
	env?: Partial<Env> | Record<string, unknown>;
	categories: SiteCategory[];
	posts: SitePost[];
	comments: SiteComment[];
	progressLogs: SiteProgressLog[];
	notifications?: SiteNotification[];
	activeTab?: 'posts' | 'replies' | 'level' | 'notifications';
	pagination?: {
		posts?: PageState;
		replies?: PageState;
		level?: PageState;
		notifications?: PageState;
	};
	levelSettings?: LevelSettings;
}): string {
	const activeTab = options.activeTab || 'posts';
	const points = Number(options.user.points || 0);
	const xp = Number(options.user.experience || 0);
	const level = Number(options.user.level || 1);
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const posts = options.posts.map((post) => `<article class="compact-item">
		<div class="compact-item-head"><a class="compact-item-title" href="${publicPostPath(post.id, options.env)}">${escapeHtml(post.title)}</a>${postManageActions(options.user, post, '/me', options.env)}</div>
		<div class="meta">${statusBadge(post.status)}<span>${post.category_name ? escapeHtml(post.category_name) : i18nText('post.uncategorized', '未分类')}</span><span>·</span><span>${escapeHtml(dateText(post.created_at))}</span><span>·</span>${statNode('comment', Number(post.comment_count || 0))}<span>·</span>${statNode('view', Number(post.view_count || 0))}</div>
		<p class="post-excerpt no-margin">${escapeHtml(stripMarkdown(post.content).slice(0, 160))}</p>
		${String(post.status || '') === 'rejected' ? `<div class="status-note rejected"><strong data-i18n="me.rejectReason">拒绝理由</strong><span>${rejectReasonNote(post.rejection_reason)}</span><a class="btn" href="${publicPostPath(post.id, options.env)}/edit" data-i18n="me.editAndResubmit">修改后重新提交</a></div>` : ''}
	</article>`).join('') || '<div class="panel-body muted" data-i18n="me.emptyPosts">你还没有发布帖子。</div>';
	const comments = options.comments.map((comment) => `<article class="compact-item">
		<div class="compact-item-head"><a class="compact-item-title" href="${publicPostPath(comment.post_id, options.env)}">${comment.post_title ? escapeHtml(comment.post_title) : i18nText('me.viewPost', '查看帖子')}</a><button class="btn ghost danger" type="button" data-comment-delete="${comment.id}" data-admin="0" data-i18n="post.delete">删除</button></div>
		<div class="meta">${statusBadge(comment.status)}<span>${escapeHtml(dateText(comment.created_at))}</span></div>
		<div class="comment-body">${escapeHtml(comment.content)}</div>
		${String(comment.status || '') === 'rejected' ? `<div class="status-note rejected"><strong data-i18n="me.rejectReason">拒绝理由</strong><span>${rejectReasonNote(comment.rejection_reason)}</span></div>` : ''}
	</article>`).join('') || '<div class="panel-body muted" data-i18n="me.emptyComments">你还没有发表评论。</div>';
	const notifications = (options.notifications || []).map((item) => `<a class="compact-item notif-row ${Number(item.is_read || 0) ? '' : 'unread'}" href="${attr(item.url || (item.post_id ? publicPostPath(item.post_id, options.env) : '/me'))}">
		<div class="compact-item-head"><span class="compact-item-title">${escapeHtml(item.title)}</span><span class="pill">${escapeHtml(dateText(item.created_at))}</span></div>
		<p class="post-excerpt no-margin">${escapeHtml(item.body || '')}</p>
	</a>`).join('') || '<div class="panel-body muted" data-i18n="notifications.empty">暂无消息</div>';
	const sourceMeta = (source: string) => {
		if (source === 'checkin') return { key: 'me.progressSource.checkin', text: '签到' };
		if (source === 'create_post') return { key: 'me.progressSource.createPost', text: '发帖' };
		if (source === 'reply_post') return { key: 'me.progressSource.replyPost', text: '回复帖子' };
		if (source === 'post_replied') return { key: 'me.progressSource.postReplied', text: '被回复帖子' };
		return { key: '', text: source };
	};
	const progressRows = options.progressLogs.map((log) => {
		const source = sourceMeta(log.source);
		const pointsDelta = Number(log.points_delta || 0);
		const xpDelta = Number(log.experience_delta || 0);
		const sourceLabel = source.key ? `<strong data-i18n="${source.key}">${source.text}</strong>` : `<strong>${escapeHtml(source.text)}</strong>`;
		const target = log.post_id && log.post_title
			? `<a href="${publicPostPath(log.post_id, options.env)}" class="muted">${escapeHtml(log.post_title)}</a>`
			: `<span class="muted" data-i18n="me.progressNoTarget">无关联帖子</span>`;
		return `<article class="progress-row">
			<div>${sourceLabel}</div>
			<div class="progress-delta">${pointsDelta >= 0 ? '+' : ''}${pointsDelta}</div>
			<div class="progress-delta">${xpDelta >= 0 ? '+' : ''}${xpDelta}</div>
			<div class="progress-target">${target}</div>
			<time class="progress-time muted">${escapeHtml(dateText(log.created_at))}</time>
		</article>`;
	}).join('');
	const progressLogs = progressRows
		? `<article class="progress-row is-head">
			<div data-i18n="me.progressSource">来源</div>
			<div data-i18n="me.progressPoints">积分变化</div>
			<div data-i18n="me.progressExperience">经验变化</div>
			<div data-i18n="me.progressTarget">关联帖子</div>
			<div data-i18n="me.progressTime">时间</div>
		</article>${progressRows}`
		: '<div class="muted" data-i18n="me.progressEmpty">还没有积分或经验记录。</div>';
	return renderSiteLayout({
		title: '我的内容',
		user: options.user,
		categories: options.categories,
		wide: true,
		fixed: true,
		body: `<div class="me-page">
			<div class="page-head"><div><h1 data-i18n="me.title">我的内容</h1><div class="muted" data-i18n="me.subtitle">管理帖子、回复和成长记录。</div></div><a class="btn primary" href="/new-post" data-i18n="index.newPost">发布新帖</a></div>
			<section class="panel me-tabs" data-tabs>
				<div class="me-tab-nav">
					<button type="button" class="${activeTab === 'posts' ? 'active' : ''}" data-tab-target="posts" data-i18n="me.posts">我的帖子</button>
					<button type="button" class="${activeTab === 'replies' ? 'active' : ''}" data-tab-target="replies" data-i18n="me.comments">我的回复</button>
					<button type="button" class="${activeTab === 'notifications' ? 'active' : ''}" data-tab-target="notifications" data-i18n="me.notifications">消息通知</button>
					<button type="button" class="${activeTab === 'level' ? 'active' : ''}" data-tab-target="level" data-i18n="me.level">成长中心</button>
				</div>
				<div class="me-tab-body">
					<div class="me-tab-panel compact-list" data-tab-panel="posts" ${activeTab === 'posts' ? '' : 'hidden'}><div class="me-scroll-list">${posts}</div>${tabPager('posts', options.pagination?.posts)}</div>
					<div class="me-tab-panel compact-list" data-tab-panel="replies" ${activeTab === 'replies' ? '' : 'hidden'}><div class="me-scroll-list">${comments}</div>${tabPager('replies', options.pagination?.replies)}</div>
					<div class="me-tab-panel compact-list" data-tab-panel="notifications" ${activeTab === 'notifications' ? '' : 'hidden'}><div class="me-scroll-list">${notifications}</div>${tabPager('notifications', options.pagination?.notifications)}</div>
					<div class="me-tab-panel me-level-tab" data-tab-panel="level" ${activeTab === 'level' ? '' : 'hidden'}><div class="me-level-content">
						<section class="me-level-panel">
							<div><span class="muted" data-i18n="index.side.level">等级</span><strong>${level}</strong></div>
							<div><span class="muted" data-i18n="index.side.points">积分</span><strong>${points}</strong></div>
							<div><span class="muted" data-i18n="index.side.experience">经验</span><strong>${xp}</strong></div>
						</section>
						${levelBar(progress)}
						<div class="muted">${xp} / ${nextXp} XP</div>
						<section class="progress-log">
							<div class="compact-item-head"><h3 data-i18n="me.progressLog">成长记录</h3></div>
							<div class="progress-log-list">${progressLogs}</div>
						</section>
						</div>${tabPager('level', options.pagination?.level)}
						<div class="me-actions"><a class="btn primary" href="/" data-i18n="nav.home">首页</a><a class="btn" href="/settings" data-i18n="nav.profileSettings">个人设置</a></div>
					</div>
				</div>
			</section>
		</div>`,
	});
}

export function renderNewPostPage(options: {
	user: SiteUser;
	env?: Partial<Env> | Record<string, unknown>;
	categories: SiteCategory[];
	tags: SiteTag[];
	post?: SitePost | null;
}): string {
	const post = options.post || null;
	const selectedCategory = String((post as any)?.category_id || '');
	const minViewLevel = Math.max(0, Number(post?.min_view_level || 0));
	const minCommentLevel = Math.max(0, Number(post?.min_comment_level || 0));
	const selectedTags = new Set((post?.tags || []).map((tag) => Number(tag.id)));
	const categoryOptions = [`<option value="" data-i18n="post.uncategorized">无分类</option>`, ...options.categories.map((cat) => `<option value="${cat.id}" ${String(cat.id) === selectedCategory ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`)].join('');
	const tagOptions = options.tags.map((tag) => `<label class="tag-check"><input type="checkbox" name="tag_ids" value="${tag.id}" ${selectedTags.has(Number(tag.id)) ? 'checked' : ''}><span>#${escapeHtml(tag.name)}</span></label>`).join('') || '<span class="muted" data-i18n="compose.noTags">暂无标签</span>';
	const modeTitle = post ? '编辑帖子' : '发布新帖';
	const emailVerified = Number(options.user.verified || 0) === 1;
	const verifyNotice = emailVerified ? '' : '<div class="status-note"><strong data-i18n="settings.emailUnverifiedTitle">邮箱未验证</strong><span data-i18n="settings.emailUnverifiedHint">请先完成邮箱验证，验证后才能发布内容、评论、点赞、签到和上传帖子媒体。</span><button class="btn" type="button" data-resend-verification data-i18n="settings.resendVerification">重新发送验证邮件</button></div>';
	return renderSiteLayout({
		title: modeTitle,
		user: options.user,
		categories: options.categories,
		wide: true,
		fixed: true,
		body: `<form data-action="post" class="form-shell">${post ? `<input type="hidden" name="post_id" value="${post.id}">` : ''}
			<section class="panel compose-sidebar"><h2 data-i18n="compose.info">帖子信息</h2><div class="panel-body"><div class="field"><label data-i18n="compose.title">标题</label><input name="title" maxlength="30" data-i18n-placeholder="compose.titlePlaceholder" placeholder="输入帖子标题..." value="${attr(post?.title || '')}" required></div><div class="field"><label data-i18n="compose.category">分类</label><select name="category_id">${categoryOptions}</select></div><div class="field"><label data-i18n="compose.tags">标签</label><div class="tag-checks">${tagOptions}</div></div><div class="field access-fields"><label data-i18n="compose.accessControl">等级权限</label><div class="level-input-row"><label><span data-i18n="compose.minViewLevel">查看等级</span><input name="min_view_level" type="number" min="0" max="999" value="${minViewLevel}"></label><label><span data-i18n="compose.minCommentLevel">评论等级</span><input name="min_comment_level" type="number" min="0" max="999" value="${minCommentLevel}"></label></div><small class="muted" data-i18n="compose.levelHint">0 表示不限制；作者和管理员不受限制。</small></div>${verifyNotice}<div class="field"><label data-i18n="compose.media">媒体</label><label class="upload-card ${emailVerified ? '' : 'is-disabled'}"><input type="file" accept="image/*,video/*" data-upload data-target="textarea[name=content]" ${emailVerified ? '' : 'disabled'} hidden><span class="upload-icon">${toolbarIcon('upload')}</span><strong data-i18n="compose.uploadMedia">上传媒体</strong><small data-i18n="compose.mediaHint">上传后会自动插入 Markdown，支持图文混排和视频。</small></label></div><div class="message" data-message></div></div></section>
			<section class="panel compose-editor"><h2 data-i18n="compose.content">内容</h2><div class="md-toolbar" aria-label="Markdown toolbar">
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
				${mdTool('code', 'Code', 'code', 'compose.toolbar.code')}
				${mdTool('codeblock', 'Code block', 'codeblock', 'compose.toolbar.codeblock')}
			</div><div class="panel-body"><div class="field"><textarea name="content" maxlength="3000" required data-preview-source="[data-live-preview]" data-i18n-placeholder="compose.contentPlaceholder" placeholder="支持 Markdown，可直接混排文字、图片和视频...">${escapeHtml(post?.content || '')}</textarea></div></div></section>
			<section class="panel compose-preview"><h2 data-i18n="compose.preview">预览</h2><div class="editor-preview" data-live-preview>${post ? renderMarkdown(post.content) : '<span data-i18n="compose.previewEmpty">预览会在发布后按 Markdown 渲染。</span>'}</div><div class="panel-body"><div class="toolbar toolbar-end"><a class="btn" href="${post ? publicPostPath(post.id, options.env) : '/'}" data-i18n="common.cancel">取消</a><button class="btn primary" type="submit" ${emailVerified ? '' : 'disabled'} data-i18n="${post ? 'compose.save' : 'index.newPost'}">${post ? '保存修改' : '发布帖子'}</button></div></div></section>
		</form>`,
	});
}

export function renderAuthPage(kind: 'login' | 'register' | 'forgot' | 'reset', token = '', oauthProviders: Array<{ id: string; label: string }> = []): string {
	const titleMap = { login: '登录', register: '注册', forgot: '找回密码', reset: '重置密码' } as const;
	const keyMap = { login: 'auth.login', register: 'auth.register', forgot: 'auth.forgot', reset: 'auth.reset' } as const;
	const oauthIcon = (id: string, label: string) => {
		if (id === 'google') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.1-2 3.2-4.8 3.2-8.3Z"/><path fill="#34a853" d="M12 23c3.1 0 5.7-1 7.5-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H1.9v2.9A11 11 0 0 0 12 23Z"/><path fill="#fbbc05" d="M5.7 13.8a6.6 6.6 0 0 1 0-3.6V7.3H1.9a11 11 0 0 0 0 9.4l3.8-2.9Z"/><path fill="#ea4335" d="M12 5.5c1.7 0 3.2.6 4.4 1.7l3.2-3.2A10.8 10.8 0 0 0 12 1 11 11 0 0 0 1.9 7.3l3.8 2.9C6.6 7.5 9.1 5.5 12 5.5Z"/></svg>';
		if (id === 'github') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.8a10.2 10.2 0 0 0-3.2 19.9c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.2-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.5.1 2.7.7.8 1 1.7 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7 1 .7 2v2.5c0 .3.2.6.8.5A10.2 10.2 0 0 0 12 1.8Z"/></svg>';
		if (id === 'epic') return '<img src="https://cdn.simpleicons.org/epicgames/ffffff" alt="" loading="lazy">';
		return `<span>${escapeHtml(label.slice(0, 1).toUpperCase())}</span>`;
	};
	const oauthButtons = (kind === 'login' || kind === 'register') && oauthProviders.length
		? `<div class="oauth-auth"><div class="oauth-divider"><span data-i18n="auth.oauthTitle">或使用第三方账号</span></div><div class="oauth-icon-row">${oauthProviders.map((provider) => `<a class="oauth-icon-btn oauth-${attr(provider.id)}" href="/oauth/${attr(provider.id)}/start" title="${attr(provider.label)}" aria-label="${attr(provider.label)}">${oauthIcon(provider.id, provider.label)}</a>`).join('')}</div></div>`
		: '';
	const fields =
		kind === 'login'
			? `<div class="field"><label data-i18n="auth.email">邮箱</label><input name="email" type="email" required></div><div class="field"><label data-i18n="auth.password">密码</label><input name="password" type="password" required></div>`
			: kind === 'register'
				? `<div class="field"><label data-i18n="auth.email">邮箱</label><input name="email" type="email" required></div><div class="field"><label data-i18n="auth.password">密码</label><input name="password" type="password" required></div>`
				: kind === 'forgot'
				? `<div class="field"><label data-i18n="auth.email">邮箱</label><input name="email" type="email" required></div>`
				: `<input type="hidden" name="token" value="${attr(token)}"><div class="field"><label data-i18n="auth.newPassword">新密码</label><input name="password" type="password" required></div>`;
	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(titleMap[kind])} - ForumForge</title>
	${FAVICON_LINKS}
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/css/flag-icons.min.css">
	<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#0f1624;--panel2:#111b2b;--border:#263244;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--danger:#f85149;--font:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}html,body{height:100%;margin:0}body{font-family:var(--font);font-size:14px;color:var(--text);background:radial-gradient(circle at 50% 12%,rgba(88,166,255,.12),transparent 34%),linear-gradient(180deg,#0d1117,#090d14);overflow:hidden}a{color:#9ecbff;text-decoration:none}button,input{font:inherit;color:inherit}.auth-shell{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr);padding:18px}.auth-top{display:flex;align-items:center;gap:10px}.brand{display:flex;align-items:center;gap:9px;font-weight:900}.brand-mark{width:24px;height:24px;border:1px solid rgba(88,166,255,.42);border-radius:7px;display:grid;place-items:center;color:#9ecbff;background:rgba(88,166,255,.09);font-size:12px}.spacer{flex:1}.lang-picker{position:relative}.lang-btn{height:34px;border:1px solid var(--border);border-radius:999px;background:#101827;color:var(--text);padding:0 11px;display:flex;align-items:center;gap:7px;font-weight:800}.lang-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:210px;margin:0;padding:7px;list-style:none;border:1px solid var(--border);border-radius:12px;background:#111827;box-shadow:0 24px 70px rgba(0,0,0,.5);display:none}.lang-menu.open{display:grid;gap:3px}.lang-menu li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:8px;cursor:pointer}.lang-menu li:hover,.lang-menu li.active{background:rgba(88,166,255,.11);color:#9ecbff}.lang-menu small{color:var(--muted)}.auth-main{min-height:0;display:grid;place-items:center}.auth-card{width:min(420px,calc(100vw - 36px));border:1px solid rgba(96,120,150,.28);border-radius:16px;background:linear-gradient(180deg,rgba(17,27,43,.96),rgba(11,17,29,.96));box-shadow:0 24px 80px rgba(0,0,0,.38);padding:28px}.auth-card h1{margin:0 0 22px;font-size:28px}.field{display:grid;gap:7px;margin-bottom:14px}.field label{font-weight:800;color:#d8e2f1}.field input{width:100%;height:42px;border:1px solid var(--border);border-radius:10px;background:#0b111d;padding:0 12px;outline:none}.field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.14)}.turnstile-box{display:flex;justify-content:center;margin:10px 0}.turnstile-box[hidden]{display:none!important}.btn{width:100%;height:44px;border:1px solid var(--accent);border-radius:10px;background:var(--accent);color:#fff;font-weight:900;cursor:pointer}.btn:hover{filter:brightness(1.08)}.oauth-auth{display:grid;gap:10px;margin-top:16px}.oauth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}.oauth-divider:before,.oauth-divider:after{content:"";height:1px;background:var(--border);flex:1}.oauth-icon-row{display:flex;align-items:center;justify-content:center;gap:12px}.oauth-icon-btn{width:48px;height:48px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,#101827,#0b111d);color:#dbe7f7;display:grid;place-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:.15s}.oauth-icon-btn:hover{transform:translateY(-1px);border-color:rgba(88,166,255,.58);background:rgba(88,166,255,.1);box-shadow:0 10px 28px rgba(0,0,0,.28),0 0 0 3px rgba(88,166,255,.1)}.oauth-icon-btn svg,.oauth-icon-btn img{width:22px;height:22px;display:block;object-fit:contain}.oauth-icon-btn span{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(135deg,#182235,#26344d);color:#9ecbff;font-weight:950}.message{min-height:22px;margin-top:12px;color:var(--muted)}.message.ok{color:#3fb950}.message.error{color:var(--danger)}.auth-links{margin:14px 0 0;color:var(--muted);text-align:center}.auth-links a{margin:0 7px}
	</style>
</head>
<body>
	<div class="auth-shell">
		<header class="auth-top">
			<a class="brand" href="/"><span class="brand-mark">F</span><span>ForumForge</span></a>
			<div class="spacer"></div>
			<div class="lang-picker" data-language-picker>
				<button class="lang-btn" type="button" data-language-button><span class="fi fi-cn" data-language-flag></span><span data-language-name>简体中文</span><svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 8L1 3h10z" fill="currentColor"/></svg></button>
				<ul class="lang-menu" data-language-menu></ul>
			</div>
		</header>
		<main class="auth-main">
			<form class="auth-card" data-action="${kind}">
				<h1 data-i18n="${keyMap[kind]}">${titleMap[kind]}</h1>
				${fields}
				${kind === 'login' || kind === 'register' ? '<div class="turnstile-box" data-turnstile hidden></div>' : ''}
				<button class="btn" type="submit" data-i18n="${keyMap[kind]}">${titleMap[kind]}</button>
				${oauthButtons}
				<div class="message" data-message></div>
				<p class="auth-links"><a href="/login" data-i18n="auth.login">登录</a><a href="/register" data-i18n="auth.register">注册</a><a href="/forgot" data-i18n="auth.forgotLink">忘记密码</a></p>
			</form>
		</main>
	</div>
	<script>${appScript()}</script>
</body>
</html>`;
}

export function renderSettingsPageSite(options: { user: SiteUser; categories: SiteCategory[]; levelSettings?: LevelSettings }): string {
	const user = options.user;
	const points = Number(user.points || 0);
	const xp = Number(user.experience || 0);
	const level = Number(user.level || 1);
	const nextXp = nextLevelExperience(level, options.levelSettings || DEFAULT_LEVEL_SETTINGS);
	const progress = Math.max(4, Math.min(100, Math.round((xp / nextXp) * 100)));
	const emailVerified = Number(user.verified || 0) === 1;
	return renderSiteLayout({
		title: '个人设置',
		user,
		categories: options.categories,
		fixed: true,
		body: `<form class="settings-view" data-action="settings">
			<aside class="settings-profile-panel panel">
				<div class="settings-avatar-card">
					${avatar(user, user.username)}
					<label class="btn ghost" for="avatar-upload" data-i18n="settings.replaceAvatar">替换头像</label>
					<input id="avatar-upload" type="file" accept="image/*" data-upload data-type="avatar" data-target="input[name=avatar_url]" hidden>
					<input name="avatar_url" value="${attr(user.avatar_url || '')}" type="hidden">
				</div>
				<div class="settings-profile-title">
					<div class="hero-kicker" data-i18n="settings.account">账号</div>
					<h1>${escapeHtml(user.username)}</h1>
					<p>${escapeHtml(user.email)}</p>
				</div>
				<div class="daily-stats">
					<div class="daily-stat"><strong>${level}</strong><span data-i18n="index.side.level">等级</span></div>
					<div class="daily-stat"><strong>${points}</strong><span data-i18n="index.side.points">积分</span></div>
					<div class="daily-stat"><strong>${xp}</strong><span data-i18n="index.side.experience">经验</span></div>
				</div>
				${levelBar(progress)}
				<section class="settings-status">
					<div><span data-i18n="settings.role">角色</span><strong>${escapeHtml(user.role || 'user')}</strong></div>
					<div><span data-i18n="settings.emailVerified">邮箱验证</span><strong data-i18n="${emailVerified ? 'common.verified' : 'common.unverified'}">${emailVerified ? '已验证' : '未验证'}</strong></div>
					<div><span data-i18n="settings.notifications">通知</span><strong data-i18n="${user.email_notifications === 0 ? 'common.off' : 'common.on'}">${user.email_notifications === 0 ? '关闭' : '开启'}</strong></div>
					${emailVerified ? '' : '<button class="btn" type="button" data-resend-verification data-i18n="settings.resendVerification">重新发送验证邮件</button>'}
				</section>
				<nav class="settings-links">
					<a class="btn" href="/me" data-i18n="me.title">我的内容</a>
					<a class="btn" href="/new-post" data-i18n="index.newPost">发布新帖</a>
					${user.role === 'admin' ? '<a class="btn" href="/admin" data-i18n="nav.adminPanel">管理后台</a>' : ''}
				</nav>
			</aside>
			<main class="settings-main">
				<div class="settings-section-grid">
					<section class="panel settings-section"><h2 data-i18n="settings.publicProfile">公开资料</h2><div class="panel-body">
						<div class="settings-form-grid">
							<div>
								<div class="field setting-field-narrow"><label data-i18n="auth.username">用户名</label><input name="username" value="${attr(user.username)}" required maxlength="20" data-count-target="#settings-username-count"></div>
								<div class="field-foot setting-field-narrow"><span data-i18n="settings.usernameLimit">最多 20 个字符</span><span><span id="settings-username-count">${escapeHtml(String(user.username || '').length)}</span>/20</span></div>
							</div>
						</div>
					</div></section>
					<section class="panel settings-section"><h2 data-i18n="settings.preferences">偏好设置</h2><div class="panel-body">
						<div class="settings-option-list">
							<label class="settings-toggle"><input name="email_notifications" type="checkbox" ${user.email_notifications === 0 ? '' : 'checked'}><span data-i18n="settings.emailNotifications">接收邮件通知</span></label>
							<p class="muted" data-i18n="settings.emailHint">仅用于评论、账号安全和管理员通知。</p>
							<label class="settings-toggle"><input name="show_public_posts" type="checkbox" ${user.show_public_posts === 0 ? '' : 'checked'}><span data-i18n="settings.showPublicPosts">公开展示我的帖子</span></label>
							<p class="muted" data-i18n="settings.showPublicPostsHint">关闭后，其他用户只能看到你的个人介绍和等级信息。</p>
						</div>
					</div></section>
					<section class="panel settings-section email-section"><h2 data-i18n="settings.emailBinding">绑定邮箱</h2><div class="panel-body">
						<div class="settings-form-grid">
							<div class="field setting-field-narrow"><label data-i18n="settings.newEmail">新邮箱</label><input name="new_email" type="email" form="change-email-form" placeholder="name@example.com" maxlength="254"></div>
						</div>
						<p class="muted" data-i18n="settings.emailBindingHint">提交后需要在新邮箱中点击确认链接。</p>
						<div class="settings-actions"><button class="btn" type="submit" form="change-email-form" data-i18n="settings.sendConfirmEmail">发送确认邮件</button></div>
					</div></section>
					<section class="panel settings-section password-section"><h2 data-i18n="settings.localPassword">本地密码</h2><div class="panel-body">
						<div class="settings-form-grid password-grid">
							<div class="field"><label data-i18n="settings.oldPassword">老密码</label><input name="old_password" type="password" form="set-password-form" autocomplete="current-password" maxlength="64"></div>
							<div class="field"><label data-i18n="auth.newPassword">新密码</label><input name="password" type="password" form="set-password-form" autocomplete="new-password" minlength="8" maxlength="64"></div>
							<div class="field"><label data-i18n="settings.confirmNewPassword">再次输入新密码</label><input name="password_confirm" type="password" form="set-password-form" autocomplete="new-password" minlength="8" maxlength="64"></div>
						</div>
						<p class="muted" data-i18n="settings.passwordHint">第三方登录账号也可以设置密码，之后可用邮箱和密码登录。</p>
						<div class="settings-actions"><button class="btn" type="submit" form="set-password-form" data-i18n="settings.savePassword">保存密码</button></div>
					</div></section>
				</div>
			</main>
			<div class="toolbar settings-save"><div class="message" data-message></div><button class="btn primary" type="submit" data-i18n="common.save">保存资料设置</button></div>
		</form><form id="change-email-form" data-action="change-email"></form><form id="set-password-form" data-action="set-password"></form>`,
	});
}






