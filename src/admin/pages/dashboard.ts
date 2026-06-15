import type { UserPayload } from "../../core/security";
import { publicPostPath } from "../../core/id-codec";
import { escapeHtml, jsonScript } from "../../utils/html";
import { adminButton, adminField, adminInput, adminPasswordInput, adminMetricCard, adminMiniTable, adminPager, adminPanel, adminSelect, adminSwitch, adminTableShell, adminTextarea, adminToolbar, icon, tr } from "../ui";
import { contentLanguageSelector, languageCode, localeCatalog, localizedValue, normalizeContentLanguages, type AdminLanguage, type LocalizedValueMap } from "../localization";
import { renderAdminLayout, adminHtmlResponse, renderAdminLoginRedirect, parseJson, adminPermissionOptions, navItems, ACE, ACE_THEMES, DEFAULT_THEME, FAVICON_LINKS, AI_TRANSLATE_CONTROLS, AI_TRANSLATE_MODAL, formatBytes, isVideoMedia, compactLogDetails, type AdminNavKey, type AdminLayoutOptions, type AdminLogRow } from "./_shared";

export function renderAdminDashboard(user: UserPayload, data: any): string {
	const analytics = data.analytics || {};
	const latestVisits = (analytics.latest_visits || []).map((row: any) => `
		<li><span>${escapeHtml(row.country || 'XX')}</span><strong title="${escapeHtml(row.raw_path || row.path || '/')}">${escapeHtml(row.page_title || row.path || '/')}</strong><small>${escapeHtml(row.created_at || '')}</small></li>
	`).join('') || `<li class="empty" data-i18n="admin.dashboard.noVisits">暂无访问记录</li>`;
	const topPaths = (analytics.top_paths_30d || []).map((row: any) => `
		<li><strong title="${escapeHtml(row.raw_path || row.path || '/')}">${escapeHtml(row.page_title || row.path || '/')}</strong><span>${Number(row.visits || 0)}</span></li>
	`).join('') || `<li class="empty" data-i18n="admin.dashboard.noVisits">暂无访问记录</li>`;
	const visits30 = analytics.visits_30d || {};
	const visits7Count = (analytics.visits_7d || []).reduce((sum: number, row: any) => sum + Number(row.visits || 0), 0);
	const visitors7Count = (analytics.visits_7d || []).reduce((sum: number, row: any) => sum + Number(row.visitors || 0), 0);
	const country7Count = (analytics.countries_7d || []).filter((row: any) => row.country && row.country !== 'XX').length;
	const countryName = (code: string) => String(code || 'Unknown').toUpperCase();
	const countryCoord = (code: string): [number, number] => {
		const coords: Record<string, [number, number]> = {
			US: [-98, 38], CN: [104, 35], HK: [114, 22], TW: [121, 24], JP: [138, 37], KR: [128, 36],
			SG: [104, 1], GB: [-2, 54], DE: [10, 51], FR: [2, 46], CA: [-106, 57], AU: [134, -25],
			IN: [78, 22], RU: [90, 61], BR: [-51, -10], NL: [5, 52], VN: [108, 16], TH: [101, 15],
			ID: [118, -2], MY: [102, 4], PH: [122, 13], ES: [-4, 40], IT: [12, 43], PL: [19, 52],
			TR: [35, 39], AE: [54, 24], SA: [45, 24], MX: [-102, 23], AR: [-64, -34], ZA: [24, -29]
		};
		return coords[String(code || '').toUpperCase()] || [0, 0];
	};
	const chartData = {
		days: Array.from({ length: 7 }, (_, index) => {
			const d = new Date();
			d.setUTCDate(d.getUTCDate() - (6 - index));
			return d.toISOString().slice(0, 10);
		}),
		visits7: analytics.visits_7d || [],
		countries7: (analytics.countries_7d || []).map((row: any) => ({
			code: String(row.country || 'XX').toUpperCase(),
			name: countryName(row.country),
			value: Number(row.visits || 0),
			coord: countryCoord(row.country),
		})),
		device30: analytics.device_30d || [],
		topPaths30: analytics.top_paths_30d || [],
	};
	return renderAdminLayout({
		title: '管理后台',
		titleKey: 'admin.page.title',
		subtitle: '实时监控访问、内容增长和社区活跃度。',
		subtitleKey: 'admin.dashboard.subtitle',
		active: 'dashboard',
		user,
		head: `<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script><style>
.content-body:has(.dashboard-shell){overflow:hidden}.dashboard-shell{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) 178px;gap:12px;overflow:hidden}.dash-hero{position:relative;overflow:hidden;border:1px solid rgba(88,166,255,.28);border-radius:16px;background:radial-gradient(circle at 18% 0,rgba(88,166,255,.18),transparent 30%),radial-gradient(circle at 80% 0,rgba(63,185,80,.11),transparent 32%),linear-gradient(135deg,#101a28,#0d1117 64%);padding:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px}.dash-hero:before{content:"";position:absolute;inset:auto -10% -55% 38%;height:220px;background:linear-gradient(90deg,rgba(88,166,255,.16),rgba(63,185,80,.08));filter:blur(38px);transform:rotate(-8deg)}.dash-copy,.dash-metrics{position:relative}.dash-kicker{color:#79c0ff;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.dash-copy h2{margin:6px 0 6px;font-size:27px;line-height:1}.dash-copy p{margin:0;color:#a8bed6;max-width:760px;line-height:1.6}.dash-metrics{display:grid;grid-template-columns:repeat(4,132px);gap:10px}.dash-stat{border:1px solid rgba(96,120,150,.34);border-radius:14px;background:rgba(9,14,22,.58);padding:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}.dash-stat strong{display:block;font-size:24px;line-height:1;color:#fff}.dash-stat span{display:block;margin-top:7px;color:#9fb4cc;font-size:12px;font-weight:800}.dash-grid{min-height:0;display:grid;grid-template-columns:minmax(520px,1.36fr) minmax(390px,.64fr);grid-template-rows:minmax(260px,.95fr) minmax(210px,.72fr);gap:12px;overflow:hidden}.dash-panel{min-height:0;border:1px solid rgba(96,120,150,.3);border-radius:16px;background:linear-gradient(180deg,rgba(17,25,38,.96),rgba(13,17,23,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.025);overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}.dash-panel-hd{padding:13px 15px;border-bottom:1px solid rgba(96,120,150,.2);display:flex;align-items:center;justify-content:space-between;gap:12px}.dash-panel-hd h3{margin:0;font-size:15px}.dash-panel-hd p{margin:3px 0 0;color:var(--muted);font-size:12px}.dash-chart{min-height:0;width:100%;height:100%}.map-panel{grid-row:span 2}.dash-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-height:0}.dash-list{margin:0;padding:10px 12px 12px;list-style:none;overflow:auto;display:grid;align-content:start;gap:8px}.dash-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid rgba(96,120,150,.18);border-radius:10px;background:rgba(13,19,32,.6);padding:9px 10px}.dash-list li span:first-child{min-width:34px;text-align:center;border-radius:999px;background:rgba(88,166,255,.12);color:#9ed0ff;font-size:11px;font-weight:900;padding:3px 6px}.dash-list li strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dash-list li small,.dash-list li span:last-child{color:var(--muted);font-size:12px}.dash-list li.empty{display:block;color:var(--muted)}.spark-row{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;padding:12px;min-height:0}.device-chart{min-height:180px}.top-paths{min-height:0}
@media(max-width:1280px){.dash-hero{grid-template-columns:1fr}.dash-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.dash-grid{grid-template-columns:1fr;grid-template-rows:360px 280px 280px}.map-panel{grid-row:auto}.spark-row{grid-template-columns:1fr}}
</style>`,
		content: `
<div class="dashboard-shell">
	<section class="dash-hero">
		<div class="dash-copy">
			<div class="dash-kicker">ForumForge Monitor</div>
			<h2 data-i18n="admin.dashboard.monitorTitle">全球访问与社区健康监控</h2>
			<p data-i18n="admin.dashboard.monitorDesc">查看最近 7 天访问明细、30 天总览、访客来源和内容趋势，快速判断站点活跃度。</p>
		</div>
		<div class="dash-metrics">
			<div class="dash-stat"><strong>${Number(visits7Count || 0)}</strong><span data-i18n="admin.dashboard.visits7d">7 天访问</span></div>
			<div class="dash-stat"><strong>${Number(visitors7Count || 0)}</strong><span data-i18n="admin.dashboard.visitors7d">7 天访客</span></div>
			<div class="dash-stat"><strong>${Number(visits30.visits || 0)}</strong><span data-i18n="admin.dashboard.visits30d">30 天访问</span></div>
			<div class="dash-stat"><strong>${Number(country7Count || visits30.countries || 0)}</strong><span data-i18n="admin.dashboard.countries">访问国家</span></div>
		</div>
	</section>
	<section class="dash-grid">
		<div class="dash-panel map-panel">
			<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.worldMap">全球访问热力</h3><p data-i18n="admin.dashboard.worldMapDesc">按最近 7 天国家访问量聚合。</p></div><span class="badge">${Number(data.user_count || 0)} <span data-i18n="admin.stats.users">用户</span></span></div>
			<div id="world-map" class="dash-chart"></div>
		</div>
		<div class="dash-panel">
			<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.weekTrend">7 天访问趋势</h3><p data-i18n="admin.dashboard.weekTrendDesc">访问量与独立访客。</p></div><span class="badge">${Number(data.post_count || 0)} <span data-i18n="admin.stats.posts">帖子</span></span></div>
			<div id="week-trend" class="dash-chart"></div>
		</div>
		<div class="dash-split">
			<div class="dash-panel">
				<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.monthOverview">30 天设备概览</h3><p data-i18n="admin.dashboard.monthOverviewDesc">Desktop / Mobile / Bot。</p></div></div>
				<div id="device-chart" class="dash-chart device-chart"></div>
			</div>
			<div class="dash-panel">
				<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.topPaths">热门路径</h3><p data-i18n="admin.dashboard.topPathsDesc">最近 30 天访问最多的页面。</p></div></div>
				<ul class="dash-list top-paths">${topPaths}</ul>
			</div>
		</div>
	</section>
	<section class="dash-panel">
		<div class="dash-panel-hd"><div><h3 data-i18n="admin.dashboard.latestVisits">最近访问</h3><p data-i18n="admin.dashboard.latestVisitsDesc">最新 10 条访问事件。</p></div><span class="badge">${Number(data.comment_count || 0)} <span data-i18n="admin.stats.comments">评论</span></span></div>
		<ul class="dash-list">${latestVisits}</ul>
	</section>
</div>`
		,
		script: `
var dashboardData=${jsonScript(chartData)};
function dashChart(id){var el=document.getElementById(id);return el&&window.echarts?echarts.init(el,null,{renderer:'canvas'}):null;}
function cssVar(name,fallback){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback;}
function makeGradient(top,bottom){return new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:top},{offset:1,color:bottom}]);}
function buildSeriesByDay(rows,key){var byDay={};(rows||[]).forEach(function(row){byDay[row.day]=Number(row[key]||0);});return (dashboardData.days||[]).map(function(day){return byDay[day]||0;});}
function renderMapFallback(map,text,muted){
	map.setOption({
		backgroundColor:'transparent',
		graphic:{type:'text',left:'center',top:'middle',style:{text:t('admin.dashboard.mapLoadFailed','地图数据加载失败'),fill:muted,fontSize:14,fontWeight:700}},
		xAxis:{show:false},yAxis:{show:false},series:[]
	});
}
function bindMapControls(chart,el){
	if(!chart||!el)return;
	el.addEventListener('contextmenu',function(e){e.preventDefault();});
	var down=false,lastX=0,lastY=0;
	el.addEventListener('mousedown',function(e){
		if(e.button!==2)return;
		e.preventDefault();down=true;lastX=e.clientX;lastY=e.clientY;el.style.cursor='grabbing';
	});
	document.addEventListener('mousemove',function(e){
		if(!down)return;
		e.preventDefault();
		var dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
		chart.dispatchAction({type:'geoRoam',componentType:'geo',dx:dx,dy:dy});
	});
	document.addEventListener('mouseup',function(e){
		if(e.button===2&&down){down=false;el.style.cursor='';}
	});
	document.addEventListener('keydown',function(e){
		if((e.key||'').toLowerCase()==='f'&&!/input|textarea|select/i.test((document.activeElement&&document.activeElement.tagName)||'')){
			chart.dispatchAction({type:'restore'});
		}
	});
}
async function renderWorldMap(map,countryData,text,muted,green){
	try{
		if(!echarts.getMap || !echarts.getMap('world')){
			var res=await fetch('/assets/maps/world.json',{cache:'force-cache'});
			if(!res.ok)throw new Error('world map '+res.status);
			echarts.registerMap('world',await res.json());
		}
		var maxCountry=Math.max.apply(null,[1].concat(countryData.map(function(i){return i.value||0;})));
		var regionNames=null,regionLocale=String(window.ADMIN_LOCALE||document.documentElement.lang||'zh-CN');
		try{if(typeof Intl!=='undefined'&&Intl.DisplayNames)regionNames=new Intl.DisplayNames([regionLocale],{type:'region'});}catch(e){}
		function displayCountry(d,p){
			var code=String(d&&d.code||'').toUpperCase();
			if(!/^[A-Z]{2}$/.test(code)||code==='XX')return p.name||d.name||code||'Unknown';
			try{if(regionNames)return regionNames.of(code)||p.name||d.name||code;}catch(e){}
			return p.name||d.name||code;
		}
		function visitValue(d){
			if(Array.isArray(d&&d.value))return Number(d.value[2]||0);
			return Number(d&&d.value||0);
		}
		map.setOption({
			backgroundColor:'transparent',
			tooltip:{trigger:'item',backgroundColor:'#0d141d',borderColor:'rgba(88,166,255,.35)',textStyle:{color:text},formatter:function(p){var d=p.data||{};return (d.code?d.code+' · ':'')+displayCountry(d,p)+'<br/>'+visitValue(d)+' '+t('admin.dashboard.chartVisits','访问量');}},
			visualMap:{min:0,max:maxCountry,left:18,bottom:18,text:[t('admin.dashboard.mapHigh','高'),t('admin.dashboard.mapLow','低')],textStyle:{color:muted},inRange:{color:['#102033','#1f6feb','#3fb950']},calculable:true,itemWidth:12,itemHeight:96},
			toolbox:{show:false,feature:{restore:{}}},
			geo:{map:'world',roam:true,zoom:1.05,left:18,right:18,top:18,bottom:18,label:{show:false},emphasis:{label:{show:false},itemStyle:{areaColor:'#1f6feb'}},itemStyle:{areaColor:'#141f2d',borderColor:'rgba(120,145,175,.32)',borderWidth:.6}},
			series:[
				{type:'map',map:'world',geoIndex:0,data:countryData},
				{type:'effectScatter',coordinateSystem:'geo',rippleEffect:{brushType:'stroke',scale:3},symbolSize:function(v){return 7+Math.min(24,(Number(v[2]||0)/maxCountry)*24);},itemStyle:{color:green,shadowBlur:18,shadowColor:'rgba(63,185,80,.55)'},data:countryData.map(function(i){return {name:i.name,code:i.code,value:[i.coord&&i.coord[0]||0,i.coord&&i.coord[1]||0,Number(i.value||0)]};})}
			]
		});
	}catch(e){
		console.warn('world map failed',e);
		renderMapFallback(map,text,muted);
	}
}
function initDashboard(){
	if(!window.echarts)return;
	var text='#c9d7e8',muted='#8b949e',grid='rgba(96,120,150,.22)',blue='#58a6ff',green='#3fb950',purple='#a371f7';
	var countryData=dashboardData.countries7||[];
	var map=dashChart('world-map');
	if(map){
		bindMapControls(map,document.getElementById('world-map'));
		map.showLoading('default',{text:t('admin.dashboard.loadingMap','加载地图中...'),color:green,textColor:muted,maskColor:'rgba(13,17,23,.15)'});
		renderWorldMap(map,countryData,text,muted,green).finally(function(){map.hideLoading();});
	}
	var week=dashChart('week-trend');
	if(week){
		var visits=buildSeriesByDay(dashboardData.visits7,'visits'),visitors=buildSeriesByDay(dashboardData.visits7,'visitors');
		week.setOption({
			backgroundColor:'transparent',
			tooltip:{trigger:'axis',backgroundColor:'#0d141d',borderColor:'rgba(88,166,255,.35)',textStyle:{color:text}},
			legend:{top:8,right:12,textStyle:{color:muted},data:[t('admin.dashboard.chartVisits','访问量'),t('admin.dashboard.chartVisitors','独立访客')]},
			grid:{left:42,right:26,top:48,bottom:34,containLabel:true},
			xAxis:{type:'category',data:(dashboardData.days||[]).map(function(day){return day.slice(5);}),axisLine:{lineStyle:{color:grid}},axisLabel:{color:muted}},
			yAxis:{type:'value',splitLine:{lineStyle:{color:grid}},axisLabel:{color:muted}},
			series:[
				{name:t('admin.dashboard.chartVisits','访问量'),type:'line',smooth:true,symbolSize:8,lineStyle:{width:3,color:blue},areaStyle:{color:makeGradient('rgba(88,166,255,.28)','rgba(88,166,255,0)')},data:visits},
				{name:t('admin.dashboard.chartVisitors','独立访客'),type:'bar',barWidth:18,itemStyle:{borderRadius:[5,5,0,0],color:makeGradient('rgba(63,185,80,.78)','rgba(63,185,80,.22)')},data:visitors}
			]
		});
	}
	var device=dashChart('device-chart');
	if(device){
		var deviceRows=(dashboardData.device30||[]).filter(function(row){return Number(row.visits||0)>0;});
		device.setOption({
			backgroundColor:'transparent',
			tooltip:{trigger:'item',backgroundColor:'#0d141d',borderColor:'rgba(88,166,255,.35)',textStyle:{color:text}},
			legend:{bottom:4,left:'center',textStyle:{color:muted}},
			color:[blue,green,purple,'#d29922'],
			series:[{type:'pie',radius:['42%','64%'],center:['50%','45%'],avoidLabelOverlap:true,label:{show:false},labelLine:{show:false},itemStyle:{borderRadius:8,borderColor:'#0d1117',borderWidth:3},data:(deviceRows.length?deviceRows:[{device:'No data',visits:1}]).map(function(row){return {name:row.device,value:Number(row.visits||0)};})}]
		});
	}
	window.addEventListener('resize',function(){[map,week,device].forEach(function(chart){chart&&chart.resize();});});
}
initDashboard();
`
	});
}
