import { ADMIN_PERMISSION_KEYS, defaultRoleRows } from '../admin/permissions';
import type { DBCount } from '../db/types';
import { BUILTIN_LANGUAGES, BUILTIN_TRANSLATIONS } from '../i18n/seed';
import { BUILTIN_PLUGINS } from '../plugins/registry';
import { DEFAULT_PROGRESS_REWARDS, PROGRESS_REWARD_KEYS, type ProgressSource } from '../gamification/progress';
import { readStringEnv } from '../core/env';
import { hashPassword } from '../core/password';
import { FORUMFORGE_ICON_DATA_URL, FORUMFORGE_ICON_FILENAME, FORUMFORGE_ICON_KEY, FORUMFORGE_ICON_SVG } from '../assets/brand';
import { CATEGORY_ICONS } from '../assets/category-icons';

const BOOTSTRAP_VERSION = '2026-06-11.2';

let bootstrapPromise: Promise<void> | null = null;
let bootstrapReady = false;

export async function ensureBootstrap(env: Env, db: D1Database): Promise<void> {
	if (bootstrapReady) return;
	if (!bootstrapPromise) {
		bootstrapPromise = runBootstrap(env, db)
			.then(() => {
				bootstrapReady = true;
			})
			.catch((error) => {
				bootstrapPromise = null;
				throw error;
			});
	}
	await bootstrapPromise;
}

async function runBootstrap(env: Env, db: D1Database): Promise<void> {		const ensureBootstrapAdmin = async () => {
			const row = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first<DBCount>();
			if ((row?.count || 0) > 0) return;

			const email = readStringEnv(env, 'ADMIN_EMAIL').toLowerCase();
			const username = readStringEnv(env, 'ADMIN_USERNAME') || 'Admin';
			const password = readStringEnv(env, 'ADMIN_PASSWORD');

			if (!email || !password) {
				throw new Error('No admin account exists. Configure ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap the first administrator.');
			}
			if (password.length < 8) {
				throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
			}

			const passwordHash = await hashPassword(password);
			const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();

			if (existing?.id) {
				await db.prepare(
					'UPDATE users SET username = ?, password = ?, role = "admin", permissions = ?, verified = 1, nickname = ? WHERE id = ?'
				).bind(username, passwordHash, JSON.stringify(ADMIN_PERMISSION_KEYS), username, existing.id).run();
				return;
			}

			await db.prepare(
				'INSERT INTO users (email, username, password, role, permissions, verified, nickname) VALUES (?, ?, ?, "admin", ?, 1, ?)'
			).bind(email, username, passwordHash, JSON.stringify(ADMIN_PERMISSION_KEYS), username).run();
		};

		const ensureDemoContent = async () => {
			const demoImage = (title: string, accent: string, sub = 'ForumForge', base64 = false) => {
				const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset=".52" stop-color="#111827"/><stop offset="1" stop-color="${accent}"/></linearGradient><linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#58a6ff"/><stop offset="1" stop-color="#3fb950"/></linearGradient></defs><rect width="1200" height="720" fill="url(#bg)"/><circle cx="1010" cy="120" r="210" fill="#ffffff" opacity=".06"/><circle cx="130" cy="610" r="260" fill="#58a6ff" opacity=".08"/><rect x="76" y="72" width="1048" height="576" rx="34" fill="#020817" opacity=".56" stroke="#8b949e" stroke-opacity=".32"/><rect x="126" y="132" width="360" height="26" rx="13" fill="url(#line)" opacity=".9"/><rect x="126" y="196" width="760" height="28" rx="14" fill="#e6edf3" opacity=".92"/><rect x="126" y="248" width="640" height="20" rx="10" fill="#8b949e" opacity=".72"/><rect x="126" y="304" width="920" height="170" rx="22" fill="#111827" stroke="#30363d"/><path d="M178 410c70-92 118-92 188 0s118 92 188 0 118-92 188 0 118 92 188 0" fill="none" stroke="#58a6ff" stroke-width="12" stroke-linecap="round" opacity=".9"/><rect x="126" y="522" width="210" height="42" rx="21" fill="#58a6ff" opacity=".9"/><rect x="360" y="522" width="150" height="42" rx="21" fill="#1f2937"/><text x="126" y="612" fill="#8b949e" font-family="Inter,Segoe UI,Arial" font-size="24" font-weight="700">${sub}</text><text x="126" y="188" fill="#f8fafc" font-family="Inter,Segoe UI,Arial" font-size="44" font-weight="800">${title}</text></svg>`;
				return base64 ? `data:image/svg+xml;base64,${btoa(svg)}` : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
			};
			const oldDemoImages = {
				feed: demoImage('Hybrid Feed', '#12313a'),
				plugins: demoImage('Plugin Studio', '#2b244f'),
				media: demoImage('Media Library', '#123329'),
				editor: demoImage('Editor Flow', '#2b2a12'),
				theme: demoImage('Theme Layers', '#301d2a'),
			};
			const demoImages = {
				feed: demoImage('Hybrid Feed', '#12313a', 'ForumForge', true),
				plugins: demoImage('Plugin Studio', '#2b244f', 'ForumForge', true),
				media: demoImage('Media Library', '#123329', 'ForumForge', true),
				editor: demoImage('Editor Flow', '#2b2a12', 'ForumForge', true),
				theme: demoImage('Theme Layers', '#301d2a', 'ForumForge', true),
			};
			const categoryIconMedia = Object.values(CATEGORY_ICONS).map((icon) =>
				db.prepare(
					`INSERT OR IGNORE INTO media_assets (scope, key, url, filename, mime_type, size_bytes, media_type, source, updated_at)
					 VALUES ('system', ?, ?, ?, 'image/svg+xml', ?, 'image', 'builtin', CURRENT_TIMESTAMP)`
				).bind(icon.key, icon.path, icon.filename, icon.svg.length)
			);
			await db.batch([
				db.prepare(
					`INSERT OR IGNORE INTO media_assets (scope, key, url, filename, mime_type, size_bytes, media_type, source, updated_at)
					 VALUES ('system', ?, ?, ?, 'image/svg+xml', ?, 'image', 'builtin', CURRENT_TIMESTAMP)`
				).bind(FORUMFORGE_ICON_KEY, FORUMFORGE_ICON_DATA_URL, FORUMFORGE_ICON_FILENAME, FORUMFORGE_ICON_SVG.length),
				...categoryIconMedia,
				db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('site_name', 'ForumForge')"),
				db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('site_tagline', 'Media-first discussion hub')"),
				db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('site_icon_url', ?)").bind(FORUMFORGE_ICON_DATA_URL),
				db.prepare("UPDATE settings SET value = ? WHERE key = 'site_icon_url' AND (value IS NULL OR value = '')").bind(FORUMFORGE_ICON_DATA_URL),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (1, 'Announcements', 'Official updates and release notes.', 'Announcements', 'Official updates, releases, and site news.')"),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (2, 'Build Logs', 'Progress notes for projects and plugins.', 'Build Logs', 'Track implementation notes and release progress.')"),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (3, 'Showcase', 'Share media-rich examples and demos.', 'Showcase', 'Media-rich posts, previews, and demos.')"),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (4, 'Ideas', 'Discuss proposals and product decisions.', 'Ideas', 'Short proposals and design discussions.')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (1, 'Release')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (2, 'Design')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (3, 'Media')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (4, 'Plugin')"),
				db.prepare("UPDATE categories SET description = COALESCE(NULLIF(description, ''), 'Official updates and release notes.'), hero_title = COALESCE(NULLIF(hero_title, ''), 'Announcements'), hero_description = COALESCE(NULLIF(hero_description, ''), 'Official updates, releases, and site news.') WHERE id = 1"),
				db.prepare("UPDATE categories SET description = COALESCE(NULLIF(description, ''), 'Progress notes for projects and plugins.'), hero_title = COALESCE(NULLIF(hero_title, ''), 'Build Logs'), hero_description = COALESCE(NULLIF(hero_description, ''), 'Track implementation notes and release progress.') WHERE id = 2"),
				db.prepare("UPDATE categories SET description = COALESCE(NULLIF(description, ''), 'Media-rich examples and demos.'), hero_title = COALESCE(NULLIF(hero_title, ''), 'Showcase'), hero_description = COALESCE(NULLIF(hero_description, ''), 'Media-rich posts, previews, and demos.') WHERE id = 3"),
				db.prepare("UPDATE categories SET description = COALESCE(NULLIF(description, ''), 'Proposals and product decisions.'), hero_title = COALESCE(NULLIF(hero_title, ''), 'Ideas'), hero_description = COALESCE(NULLIF(hero_description, ''), 'Short proposals and design discussions.') WHERE id = 4"),
				db.prepare("UPDATE categories SET icon_url = ? WHERE name = 'Announcements' AND (icon_url IS NULL OR icon_url = '')").bind(CATEGORY_ICONS.announcements.path),
				db.prepare("UPDATE categories SET icon_url = ? WHERE name = 'WebUIX' AND (icon_url IS NULL OR icon_url = '')").bind(CATEGORY_ICONS.webuix.path),
				db.prepare("UPDATE categories SET icon_url = ? WHERE name = 'Help' AND (icon_url IS NULL OR icon_url = '')").bind(CATEGORY_ICONS.help.path),
				db.prepare("UPDATE categories SET icon_url = ? WHERE name = 'Showcase' AND (icon_url IS NULL OR icon_url = '')").bind(CATEGORY_ICONS.showcase.path),
				db.prepare("UPDATE categories SET icon_url = ? WHERE name = 'General' AND (icon_url IS NULL OR icon_url = '')").bind(CATEGORY_ICONS.general.path),
				db.prepare('UPDATE categories SET sort_order = id * 10 WHERE sort_order IS NULL OR sort_order = 0'),
			]);
			const ensurePendingModerationSamples = async () => {
				const pendingPosts = [
					{
						id: 2001,
						title: '待审核：Cloudflare Workers 部署后的缓存排查记录',
						category: 'Build Logs',
						views: 96,
						tags: ['Release', 'Design'],
						content: `# Cloudflare Workers 部署后的缓存排查记录

这是一篇准备提交到构建日志分类的复盘。昨晚部署后，首页样式已经更新，但部分用户仍然看到旧的按钮和旧的列表间距。排查时我把浏览器缓存、Cloudflare 边缘缓存、Worker 运行时缓存和 D1 数据初始化分开检查，最后发现问题集中在两处：一是静态资源 URL 没有跟随构建产物变化，二是部分页面依赖旧的本地存储状态。

## 排查过程

- 先使用无痕窗口确认不是浏览器扩展污染。
- 再访问 Worker 直接域名，排除 Pages 历史部署。
- 对比线上 HTML 里的资源版本，确认脚本已经替换。
- 清理本地视图偏好后，列表密度和滚动行为才恢复正常。

![部署排查示意](${demoImages.plugins})

建议后续发布时把资源版本号、插件 manifest 版本和数据库迁移版本一起记录到后台仪表盘，这样出现 UI 不一致时能更快判断用户看到的是哪一版。`
					},
					{
						id: 2002,
						title: '待审核：审核策略默认通过还是人工确认',
						category: 'Ideas',
						views: 84,
						tags: ['Design'],
						content: `# 审核策略默认通过还是人工确认

社区早期内容量不大，默认通过能让发帖路径更顺畅；但一旦开放注册，图片、视频和外链内容都可能带来风险。我的建议是把审核策略拆成帖子和评论两部分，管理员可以分别设置默认通过或进入待审队列。

## 推荐方案

- 新用户前 3 条帖子默认待审，老用户默认通过。
- 带多个外链或大体积媒体的内容进入待审。
- 评论默认通过，但被举报后进入复核。
- 后台审核页需要能直接预览正文、媒体和回复关系。

这个策略不应该写死在代码里，最好放在站点设置里，并把奖励积分延迟到审核通过后再发放。`
					},
					{
						id: 2003,
						title: '待审核：媒体库系统资源和帖子资源的边界',
						category: 'Showcase',
						views: 72,
						tags: ['Media'],
						content: `# 媒体库系统资源和帖子资源的边界

站点图标、主题封面、插件示例图属于系统资源；用户发帖上传的图片和视频属于帖子资源。两类资源混在一起时，管理员选择站点图标会看到大量无关图片，效率很低。

![媒体库示例](${demoImages.media})

## 建议

- 媒体选择器默认只显示系统资源。
- 需要排查用户上传内容时，再打开“包含帖子媒体”。
- 每页固定数量，缩略图卡片尺寸一致。
- 上传卡片放在列表第一项，点击或拖拽都能上传。

这条内容主要用于测试待审核帖子里包含图片时，审核列表和详情页是否还能保持滚动稳定。`
					},
					{
						id: 2004,
						title: '待审核：个人中心等级、积分和经验的展示方式',
						category: 'Ideas',
						views: 61,
						tags: ['Design'],
						content: `# 个人中心等级、积分和经验的展示方式

论坛里的等级系统不能只显示三个数字，否则用户不知道自己为什么升级，也不知道下一步该做什么。个人中心应该提供清晰的来源记录，例如签到、发帖、回复帖子、被别人回复帖子。

## 交互建议

- 顶部展示当前等级和下一等级进度。
- “我的内容”使用 Tab：帖子、回复、等级记录。
- 等级记录里显示来源、积分变化、经验变化和关联帖子。
- 签到按钮放大并占满卡片宽度，避免像一个零散的小按钮。

这些数据需要和后台奖励配置对应，管理员调整每个渠道奖励后，前台日志里的来源文案仍然应该能看懂。`
					},
					{
						id: 2005,
						title: '待审核：插件编辑器需要真正接入运行时代码',
						category: 'Build Logs',
						views: 58,
						tags: ['Plugin'],
						content: `# 插件编辑器需要真正接入运行时代码

插件系统不应该只是一个列表开关。管理员需要能编辑 CSS、HTML、Head HTML、JavaScript、Block Types、i18n、Config Schema、Permissions、Tags 和 Config，并且保存后前台能看到效果。

![插件编辑器示意](${demoImages.editor})

## 验收点

- 每个插件维护自己的多语言文案。
- 分享出去的 manifest 包含运行时代码和翻译。
- 插件管理可以导入 JSON、网络安装、检查更新和分享。
- 编辑器的 Tab 不应该占用过高空间，按钮样式必须统一。

如果插件自带 i18n，安装到其他站点后不应该只剩英文或中文。`
					},
					{
						id: 2006,
						title: '待审核：发帖编辑器里图文混排和视频支持',
						category: 'Showcase',
						views: 53,
						tags: ['Media', 'Release'],
						content: `# 发帖编辑器里图文混排和视频支持

发布器需要支持文字、图片、视频和 Markdown 混排。用户点击图片按钮后应该直接上传并插入 Markdown，不需要单独理解媒体 URL。视频也应该走同一套媒体管理，只是在渲染时使用 video 标签。

## 工作流

1. 输入标题、分类和标签。
2. 在正文中编辑 Markdown。
3. 点击工具栏图片按钮上传，自动插入光标位置。
4. 右侧预览立即显示图片或视频。
5. 提交后如果需要审核，跳转回列表并显示待审核提示。

![发布器工作流](${demoImages.feed})

这条帖子内容比较长，用来测试编辑器、预览区和审核详情的滚动。`
					},
					{
						id: 2007,
						title: '待审核：首页混合列表的信息密度调整',
						category: 'Ideas',
						views: 49,
						tags: ['Design'],
						content: `# 首页混合列表的信息密度调整

纯卡片很容易让论坛首页出现大面积空白，纯表格又不适合图文内容。更好的方式是混合列表：重要内容可以有更强封面，普通帖子保持紧凑，右侧缩略图稳定尺寸。

## 当前观察

- 标题、作者、分类、时间和统计信息应该一眼扫到。
- 图片只是辅助预览，不应该把卡片撑到半屏高。
- 没有图片时不要放巨大占位。
- 列表区域可以滚动，页面外层不应该滚动。

如果分类页有自定义标题和短文案，首页顶部的介绍也可以跟着分类变化。`
					},
					{
						id: 2008,
						title: '待审核：后台表格统一控件后的回归清单',
						category: 'Build Logs',
						views: 44,
						tags: ['Release'],
						content: `# 后台表格统一控件后的回归清单

后台之前存在按钮尺寸不一致、下拉框宽度过大、搜索和重置不在一行、输入框默认直接铺在表格里的问题。统一控件后，需要做一次完整回归。

## 检查项

- 帖子管理、评论管理、用户管理都使用同一套按钮尺寸。
- 用户编辑通过弹窗完成，不在表格中直接塞 input。
- 分类管理点击编辑弹窗，页面默认显示真实内容。
- 媒体管理工具栏能在一行内完成搜索、筛选、上传和开关。
- 审核管理可以按类型和状态筛选。

这条用于测试待审核帖子在后台表格中的标题截断和操作按钮排列。`
					},
					{
						id: 2009,
						title: '待审核：长评论区滚动和多层回复压力测试',
						category: 'Showcase',
						views: 38,
						tags: ['Media'],
						content: `# 长评论区滚动和多层回复压力测试

详情页的正文和评论是两个独立工作区。正文很长时，评论输入框不能被推到页面底部；评论很多时，右侧评论列表应该自己滚动，并且回复按钮始终靠近对应评论。

## 预期表现

- 外层页面不出现滚动条。
- 正文区域内部滚动。
- 评论区域内部滚动。
- 多层回复缩进清晰，但不把内容挤到很窄。
- 管理员能在评论列表里删除或审核。

这条帖子会附带多条待审核评论，方便观察审核管理的滚动和分页。`
					},
					{
						id: 2010,
						title: '待审核：多语言切换器和后台文案覆盖范围',
						category: 'Announcements',
						views: 35,
						tags: ['Release', 'Plugin'],
						content: `# 多语言切换器和后台文案覆盖范围

前台和后台右上角都应该有同一套语言切换器，样式和交互要一致。除了用户自定义内容，系统按钮、表格列名、空状态、提示文案和弹窗标题都应该进入翻译体系。

## 注意点

- 用户写的帖子标题和正文不自动翻译。
- 系统固定文案必须用翻译 key。
- 插件自己的文案由插件 manifest 自带 i18n 管理。
- 语言选择弹窗层级不能被顶部栏或内容区遮挡。

这条可以用来测试切换英文时后台审核入口、站点设置和个人中心是否还残留中文。`
					}
				];

				for (const post of pendingPosts) {
					await db.prepare(
						`INSERT OR IGNORE INTO posts (id, author_id, title, content, category_id, is_pinned, status, view_count, created_at)
						 VALUES (?, COALESCE((SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1), 1), ?, ?, (SELECT id FROM categories WHERE name = ? LIMIT 1), 0, 'pending', ?, datetime('now', ?))`
					).bind(post.id, post.title, post.content, post.category, post.views, `-${post.id - 1980} minutes`).run();
					for (const tag of post.tags) {
						await db.prepare(
							`INSERT OR IGNORE INTO post_tags (post_id, tag_id)
							 SELECT ?, id FROM tags WHERE name = ? LIMIT 1`
						).bind(post.id, tag).run();
					}
				}

				const pendingComments = [
					{ id: 12001, postId: 2001, parentId: null, content: '这条排查记录写得比较完整，建议审核时重点看外链和图片是否都来自可信来源。缓存问题如果只写结论，后面复盘很难定位。' },
					{ id: 12002, postId: 2001, parentId: 12001, content: '同意，最好把 Worker 版本、资源版本和数据库迁移版本都列出来。这样管理员看到异常截图时能直接判断是不是旧版本。' },
					{ id: 12003, postId: 2001, parentId: 12002, content: '也可以在后台仪表盘加一个只读构建信息块，显示当前 commit、部署时间和最近一次迁移状态。' },
					{ id: 12004, postId: 2002, parentId: null, content: '默认通过和人工审核应该可以按用户等级区分。新用户严格一点，长期活跃用户可以减少阻力。' },
					{ id: 12005, postId: 2002, parentId: 12004, content: '这里还要考虑积分奖励，如果发帖后立即给经验，但帖子最后被拒绝，用户等级会出现不一致。审核通过后发奖励更稳。' },
					{ id: 12006, postId: 2003, parentId: null, content: '媒体库分系统资源和帖子资源很必要。否则站点图标选择器里出现用户上传截图，后台使用体验会很混乱。' },
					{ id: 12007, postId: 2003, parentId: 12006, content: '分页也要保留，不然资源多了以后弹窗会很卡。第一项作为上传卡片这个设计比较直观。' },
					{ id: 12008, postId: 2004, parentId: null, content: '等级页里只显示等级、积分、经验三个数字不够。需要让用户看到每一笔来源，否则不知道为什么涨了。' },
					{ id: 12009, postId: 2004, parentId: 12008, content: '可以把签到、发帖、回复、被回复都拆成不同来源，并在后台设置每个来源的积分和经验值。' },
					{ id: 12010, postId: 2005, parentId: null, content: '插件编辑器如果能保存 CSS 和 JS，就要注意权限提示。安装别人分享的插件前，管理员应该能看到权限列表。' },
					{ id: 12011, postId: 2005, parentId: 12010, content: '分享 manifest 时也应该带上 i18n，否则插件装到新站点后文案会丢。这个点很容易遗漏。' },
					{ id: 12012, postId: 2006, parentId: null, content: '图片按钮上传后自动插入 Markdown 是对的，独立上传区域反而会让用户不确定图片插到了哪里。视频也应该复用这个流程。' },
					{ id: 12013, postId: 2006, parentId: 12012, content: '建议预览区对图片和视频都限制最大高度，避免单个媒体把整屏撑满。' },
					{ id: 12014, postId: 2007, parentId: null, content: '首页用混合列表比卡片网格更适合论坛。普通帖子应该紧凑，只有精选内容才需要更大的视觉权重。' },
					{ id: 12015, postId: 2007, parentId: 12014, content: '没有图片的帖子不要显示大占位，这个之前导致列表里空白特别明显。' },
					{ id: 12016, postId: 2008, parentId: null, content: '后台表格里直接放 input 会让行高不可控，编辑弹窗会更干净。这个修改应该应用到用户、分类、标签和评论管理。' },
					{ id: 12017, postId: 2008, parentId: 12016, content: '按钮尺寸也要统一，尤其搜索、重置、保存、删除这些操作在不同页面不能忽大忽小。' },
					{ id: 12018, postId: 2009, parentId: null, content: '这条用于测试评论审核滚动：第一层评论内容稍长一点，看看管理页行高和内容截断是否自然。' },
					{ id: 12019, postId: 2009, parentId: 12018, content: '回复 1：多层嵌套时，审核管理里最好显示父评论 ID 或短摘要，否则管理员不知道上下文。' },
					{ id: 12020, postId: 2009, parentId: 12019, content: '回复 2：如果父评论已经被删除，子回复也要一起清理，避免留下孤立回复。' },
					{ id: 12021, postId: 2009, parentId: null, content: '第二条顶层评论，用来增加滚动高度。内容不需要特别长，但要能看出不同评论之间的间距。' },
					{ id: 12022, postId: 2009, parentId: null, content: '第三条顶层评论：审核按钮应该靠右，批准、拒绝和删除的危险程度要通过颜色区分。' },
					{ id: 12023, postId: 2010, parentId: null, content: '多语言覆盖需要做一次扫描，除了用户自定义内容，其他固定文案都应该进翻译 key。' },
					{ id: 12024, postId: 2010, parentId: 12023, content: '后台尤其容易漏，比如表格列名、空状态、弹窗按钮和设置项说明。建议把这些都补进翻译管理。' }
				];
				await db.batch(pendingComments.map((comment) =>
					db.prepare(
						`INSERT OR IGNORE INTO comments (id, post_id, parent_id, author_id, content, status, created_at)
						 VALUES (?, ?, ?, COALESCE((SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1), 1), ?, 'pending', datetime('now', ?))`
					).bind(comment.id, comment.postId, comment.parentId, comment.content, `-${comment.id - 11980} minutes`)
				));
			};
			await ensurePendingModerationSamples();

			const ensureDemoVisits = async () => {
				if (readStringEnv(env, 'DEMO_ANALYTICS') !== '1') return;
				const existing = await db.prepare('SELECT COUNT(*) AS count FROM visit_events').first<DBCount>().catch(() => null);
				if ((existing?.count || 0) > 0) return;
				const hasDemo = await db.prepare('SELECT COUNT(*) AS count FROM posts WHERE id IN (1001, 1002, 1003, 2001)').first<DBCount>().catch(() => null);
				if ((hasDemo?.count || 0) === 0) return;
				const countries = ['US', 'CN', 'HK', 'JP', 'SG', 'DE', 'GB', 'CA', 'AU', 'FR', 'KR', 'BR'];
				const paths = ['/', '/posts/1001', '/posts/1002', '/posts/1003', '/posts/1005', '/posts/1007', '/settings', '/new-post'];
				const agents = [
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
					'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
					'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
				];
				const batch = [];
				for (let day = 0; day < 30; day++) {
					const base = 4 + ((29 - day) % 5) + (day < 7 ? 8 : 0);
					for (let i = 0; i < base; i++) {
						const country = countries[(day * 3 + i) % countries.length];
						const path = paths[(day + i * 2) % paths.length];
						const agent = agents[(day + i) % agents.length];
						batch.push(db.prepare(
							`INSERT INTO visit_events (path, country, ip, user_agent, referer, user_id, date_bucket, created_at)
							 VALUES (?, ?, ?, ?, ?, ?, date('now', ?), datetime('now', ?, ?))`
						).bind(
							path,
							country,
							`203.0.${day % 255}.${(i * 17 + 23) % 255}`,
							agent,
							i % 3 === 0 ? 'https://example.com/ref' : '',
							i % 4 === 0 ? 1 : null,
							`-${day} days`,
							`-${day} days`,
							`-${(i * 11) % 720} minutes`
						));
					}
				}
				if (batch.length) await db.batch(batch);
			};
			await ensureDemoVisits();

			const count = await db.prepare('SELECT COUNT(*) as count FROM posts').first<DBCount>();
			if ((count?.count || 0) > 0) {
				await db.prepare("UPDATE posts SET content = replace(content, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80', ?)").bind(demoImages.feed).run();
				await db.prepare("UPDATE posts SET content = replace(content, 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1400&q=80', ?)").bind(demoImages.plugins).run();
				await db.prepare("UPDATE posts SET content = replace(content, 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80', ?)").bind(demoImages.media).run();
				await db.prepare("UPDATE posts SET content = replace(content, 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1400&q=80', ?)").bind(demoImages.feed).run();
				await db.prepare("UPDATE posts SET content = replace(content, 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1400&q=80', ?)").bind(demoImages.editor).run();
				await db.prepare("UPDATE posts SET content = replace(content, 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1400&q=80', ?)").bind(demoImages.theme).run();
				for (const key of Object.keys(demoImages) as Array<keyof typeof demoImages>) {
					await db.prepare('UPDATE posts SET content = replace(content, ?, ?)').bind(oldDemoImages[key], demoImages[key]).run();
				}
				return;
			}

			await db.batch([
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (1, 'Announcements', 'Official updates and release notes.', 'Announcements', 'Official updates, releases, and site news.')"),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (2, 'Build Logs', 'Progress notes for projects and plugins.', 'Build Logs', 'Track implementation notes and release progress.')"),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (3, 'Showcase', 'Share media-rich examples and demos.', 'Showcase', 'Media-rich posts, previews, and demos.')"),
				db.prepare("INSERT OR IGNORE INTO categories (id, name, description, hero_title, hero_description) VALUES (4, 'Ideas', 'Discuss proposals and product decisions.', 'Ideas', 'Short proposals and design discussions.')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (1, 'Release')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (2, 'Design')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (3, 'Media')"),
				db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (4, 'Plugin')"),
				db.prepare('UPDATE categories SET sort_order = id * 10 WHERE sort_order IS NULL OR sort_order = 0'),
			]);

			const demoPosts = [
				{
					id: 1001,
					title: 'ForumForge 设计更新：新的图文讨论流',
					category: 1,
					pinned: 1,
					views: 1280,
					content: `# ForumForge 设计更新：新的图文讨论流

这次我们把首页从传统空列表改成更适合现代社区的混合信息流。它保留论坛的高密度阅读能力，同时让图文内容、视频内容和长讨论更容易被发现。

## 这次重点

- 首条内容会以更强的视觉层级展示。
- 普通帖子保持紧凑，不再出现大片空白。
- 图片和视频统一作为右侧预览，不挤压标题和摘要。
- 详情页继续保留正文与评论分区滚动。

![代码编辑器与设计稿](${demoImages.feed})

如果你正在做主题或插件，这条帖子可以作为首页、详情页和评论区的主要验收样例。`
				},
				{
					id: 1002,
					title: '插件市场草案：安装、编辑、分享应该怎么组织',
					category: 2,
					pinned: 0,
					views: 842,
					content: `插件系统的目标不是只做一个开关列表，而是让站点管理员可以直接编辑 manifest、运行时代码、多语言字符串和配置 schema。

## 当前想法

- 系统插件和用户插件分开管理。
- 插件可以导入 JSON，也可以通过 URL 安装。
- 分享链接应该携带 manifest 地址。
- 插件自己的 i18n 需要随 manifest 一起导出。

![插件工作台](${demoImages.plugins})`
				},
				{
					id: 1003,
					title: '媒体管理：系统资源和帖子资源为什么要分开',
					category: 3,
					pinned: 0,
					views: 733,
					content: `系统媒体通常用于站点图标、插件资源、主题封面和后台选择器。帖子媒体则来自用户上传，数量会更多，也更需要分页。

一个清晰的媒体管理界面应该默认只展示系统资源，管理员需要时再打开“包含帖子媒体”。

![媒体资源库](${demoImages.media})
![工作空间](${demoImages.feed})`
				},
				{
					id: 1004,
					title: '列表还是卡片：社区首页的信息密度怎么取舍',
					category: 4,
					pinned: 0,
					views: 690,
					content: `纯卡片适合图片优先的内容平台，但论坛首页通常需要快速扫标题、作者、分类、回复数和更新时间。

因此更适合的方案是混合信息流：

- 置顶或最新重点内容可以更大。
- 普通讨论保持列表密度。
- 如果帖子有图，放稳定尺寸的缩略图。
- 没有图时不要强行留巨大封面位。`
				},
				{
					id: 1005,
					title: '发布器体验：图片、视频和 Markdown 混排',
					category: 2,
					pinned: 0,
					views: 512,
					content: `发布器应该让编辑、上传和预览在同一条工作流里完成。图片按钮点击后上传，完成后自动插入 Markdown，这样用户不需要理解存储路径。

![发布器工作流](${demoImages.editor})`
				},
				{
					id: 1006,
					title: '多语言管理：系统文案和插件文案应该各自维护',
					category: 1,
					pinned: 0,
					views: 471,
					content: `系统翻译负责站点内置界面，插件翻译负责插件自己的文案。插件被分享出去后，插件内置 i18n 也应该跟着 manifest 一起走。

这能避免插件安装到其他站点后只有英文或只有中文。`
				},
				{
					id: 1007,
					title: '评论区布局压力测试：多层回复和右侧滚动',
					category: 3,
					pinned: 0,
					views: 389,
					content: `详情页里，正文和评论是两个不同工作区。长文应该能独立滚动，评论列表也应该独立滚动，输入框不能被挤到很远的位置。

这条帖子带有多条演示评论，可以用来检查滚动条、缩进和回复按钮位置。`
				},
				{
					id: 1008,
					title: '主题方向：深色界面也需要层次和温度',
					category: 4,
					pinned: 0,
					views: 344,
					content: `深色界面最常见的问题是全屏只有一种黑色，所有边框和按钮都粘在一起。更好的做法是用轻微的色温、边框透明度和局部高亮建立层次。

![主题层次](${demoImages.theme})`
				}
			];

			for (const post of demoPosts) {
				await db.prepare(
					`INSERT OR IGNORE INTO posts (id, author_id, title, content, category_id, is_pinned, view_count, created_at)
					 VALUES (?, 1, ?, ?, ?, ?, ?, datetime('now', ?))`
				).bind(post.id, post.title, post.content, post.category, post.pinned, post.views, `-${post.id - 1000} hours`).run();
			}

			const postTags = [
				[1001, 1], [1001, 2], [1002, 4], [1002, 2], [1003, 3], [1004, 2],
				[1005, 3], [1006, 1], [1007, 3], [1008, 2]
			];
			await db.batch(postTags.map(([postId, tagId]) =>
				db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagId)
			));

			const comments = [
				[9001, 1001, null, '这个首页方向比纯卡片更适合论坛，标题和摘要一眼能扫到。'],
				[9002, 1001, 9001, '同意，图片作为预览就够了，不应该把每条帖子都撑很高。'],
				[9003, 1001, 9002, '多层回复这里也能顺便检查缩进。'],
				[9004, 1002, null, '插件编辑器还需要把保存、格式化和 manifest 操作收敛得更清楚。'],
				[9005, 1003, null, '媒体选择器最好默认显示系统资源，帖子资源按需打开。'],
				[9006, 1007, null, '这条用于评论滚动测试。'],
				[9007, 1007, 9006, '回复层级一多，间距和边框就很关键。'],
				[9008, 1007, 9007, '三级回复也要保持可读。']
			];
			await db.batch(comments.map(([id, postId, parentId, content]) =>
				db.prepare(
					`INSERT OR IGNORE INTO comments (id, post_id, parent_id, author_id, content, created_at)
					 VALUES (?, ?, ?, 1, ?, datetime('now', ?))`
				).bind(id, postId, parentId, content, `-${Number(id) - 8990} minutes`)
			));
		};

		const ensureSchema = async () => {
			const tableColumns = async (table: string): Promise<Set<string>> => {
				try {
					const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
					return new Set(((rows.results || []) as any[]).map((row) => String(row.name)));
				} catch {
					return new Set();
				}
			};
			const pluginColumns = await tableColumns('plugins');
			const userColumns = await tableColumns('users');
			const categoryColumns = await tableColumns('categories');
			const postColumns = await tableColumns('posts');
			const commentColumns = await tableColumns('comments');
			const profileAlterStmts = [
				...[
					{ name: 'points', stmt: 'ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0' },
					{ name: 'experience', stmt: 'ALTER TABLE users ADD COLUMN experience INTEGER DEFAULT 0' },
					{ name: 'level', stmt: 'ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1' },
					{ name: 'last_checkin_date', stmt: 'ALTER TABLE users ADD COLUMN last_checkin_date TEXT' },
					{ name: 'permissions', stmt: "ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'" },
					{ name: 'show_public_posts', stmt: 'ALTER TABLE users ADD COLUMN show_public_posts INTEGER DEFAULT 1' }
				].filter((item) => userColumns.size && !userColumns.has(item.name)).map((item) => item.stmt),
				...[
					{ name: 'description', stmt: "ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ''" },
					{ name: 'hero_title', stmt: "ALTER TABLE categories ADD COLUMN hero_title TEXT DEFAULT ''" },
					{ name: 'hero_description', stmt: "ALTER TABLE categories ADD COLUMN hero_description TEXT DEFAULT ''" },
					{ name: 'icon_url', stmt: "ALTER TABLE categories ADD COLUMN icon_url TEXT DEFAULT ''" },
					{ name: 'enabled', stmt: 'ALTER TABLE categories ADD COLUMN enabled INTEGER DEFAULT 1' },
					{ name: 'admin_only', stmt: 'ALTER TABLE categories ADD COLUMN admin_only INTEGER DEFAULT 0' },
					{ name: 'sort_order', stmt: 'ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0' },
					{ name: 'updated_at', stmt: 'ALTER TABLE categories ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
				].filter((item) => categoryColumns.size && !categoryColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'status', stmt: "ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'approved'" }]
					.filter((item) => postColumns.size && !postColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'rejection_reason', stmt: "ALTER TABLE posts ADD COLUMN rejection_reason TEXT DEFAULT ''" }]
					.filter((item) => postColumns.size && !postColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'is_category_pinned', stmt: 'ALTER TABLE posts ADD COLUMN is_category_pinned INTEGER DEFAULT 0' }]
					.filter((item) => postColumns.size && !postColumns.has(item.name)).map((item) => item.stmt),
				...[
					{ name: 'min_view_level', stmt: 'ALTER TABLE posts ADD COLUMN min_view_level INTEGER DEFAULT 0' },
					{ name: 'min_comment_level', stmt: 'ALTER TABLE posts ADD COLUMN min_comment_level INTEGER DEFAULT 0' }
				].filter((item) => postColumns.size && !postColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'status', stmt: "ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'approved'" }]
					.filter((item) => commentColumns.size && !commentColumns.has(item.name)).map((item) => item.stmt),
				...[{ name: 'rejection_reason', stmt: "ALTER TABLE comments ADD COLUMN rejection_reason TEXT DEFAULT ''" }]
					.filter((item) => commentColumns.size && !commentColumns.has(item.name)).map((item) => item.stmt)
			];
			const pluginAlterStmts = pluginColumns.size ? [
				{ name: 'slug', stmt: "ALTER TABLE plugins ADD COLUMN slug TEXT DEFAULT ''" },
				{ name: 'author', stmt: "ALTER TABLE plugins ADD COLUMN author TEXT DEFAULT ''" },
				{ name: 'homepage', stmt: "ALTER TABLE plugins ADD COLUMN homepage TEXT DEFAULT ''" },
				{ name: 'icon', stmt: "ALTER TABLE plugins ADD COLUMN icon TEXT DEFAULT 'Puzzle'" },
				{ name: 'type', stmt: "ALTER TABLE plugins ADD COLUMN type TEXT DEFAULT 'system'" },
				{ name: 'css', stmt: "ALTER TABLE plugins ADD COLUMN css TEXT DEFAULT ''" },
				{ name: 'html', stmt: "ALTER TABLE plugins ADD COLUMN html TEXT DEFAULT ''" },
				{ name: 'js', stmt: "ALTER TABLE plugins ADD COLUMN js TEXT DEFAULT ''" },
				{ name: 'head_html', stmt: "ALTER TABLE plugins ADD COLUMN head_html TEXT DEFAULT ''" },
				{ name: 'block_types', stmt: "ALTER TABLE plugins ADD COLUMN block_types TEXT DEFAULT '[]'" },
				{ name: 'i18n', stmt: "ALTER TABLE plugins ADD COLUMN i18n TEXT DEFAULT '{}'" },
				{ name: 'config_schema', stmt: "ALTER TABLE plugins ADD COLUMN config_schema TEXT DEFAULT '{}'" },
				{ name: 'permissions', stmt: "ALTER TABLE plugins ADD COLUMN permissions TEXT DEFAULT '[]'" },
				{ name: 'tags', stmt: "ALTER TABLE plugins ADD COLUMN tags TEXT DEFAULT '[]'" },
				{ name: 'source_url', stmt: "ALTER TABLE plugins ADD COLUMN source_url TEXT DEFAULT ''" },
				{ name: 'share_token', stmt: "ALTER TABLE plugins ADD COLUMN share_token TEXT DEFAULT ''" },
				{ name: 'share_notify', stmt: "ALTER TABLE plugins ADD COLUMN share_notify INTEGER DEFAULT 1" }
			].filter((item) => !pluginColumns.has(item.name)).map((item) => item.stmt) : [];
			const i18nSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  native_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'system',
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope, key, locale),
  FOREIGN KEY (locale) REFERENCES languages(code)
);`,
				`CREATE INDEX IF NOT EXISTS idx_translations_scope_locale ON translations(scope, locale);`,
				`CREATE INDEX IF NOT EXISTS idx_translations_key ON translations(key);`,
				...BUILTIN_LANGUAGES.map((language) =>
					`INSERT OR IGNORE INTO languages (code, name, native_name, enabled, sort_order) VALUES (` +
					`'${language.code}', '${language.name.replace(/'/g, "''")}', '${language.native_name.replace(/'/g, "''")}', ${language.enabled}, ${language.sort_order});`
				),
				...BUILTIN_TRANSLATIONS.flatMap((entry) => [
					`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('system', '${entry.key.replace(/'/g, "''")}', 'zh-CN', '${entry.zh.replace(/'/g, "''")}');`,
					`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('system', '${entry.key.replace(/'/g, "''")}', 'en-US', '${entry.en.replace(/'/g, "''")}');`
				]),
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_name', 'zh-CN', 'ForumForge');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_name', 'en-US', 'ForumForge');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_tagline', 'zh-CN', '高密度图文讨论流');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('settings', 'site_tagline', 'en-US', 'Dense media discussion feed');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'name', 'zh-CN', '全部');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'name', 'en-US', 'All');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'description', 'zh-CN', '全部论坛帖子。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'description', 'en-US', 'All forum posts.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_title', 'zh-CN', '高密度图文讨论流');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_title', 'en-US', 'Media-first forum feed');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_description', 'zh-CN', '快速扫读图文、视频和长文讨论。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:all', 'hero_description', 'en-US', 'Scan posts fast. Media stays clear.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'name', 'zh-CN', '公告');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'name', 'en-US', 'Announcements');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'description', 'zh-CN', '官方更新和发布说明。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'description', 'en-US', 'Official updates and release notes.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_title', 'zh-CN', '公告');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_title', 'en-US', 'Announcements');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_description', 'zh-CN', '官方更新、发布说明和站点新闻。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:1', 'hero_description', 'en-US', 'Official updates, releases, and site news.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'name', 'zh-CN', '构建日志');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'name', 'en-US', 'Build Logs');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'description', 'zh-CN', '项目和插件的进度记录。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'description', 'en-US', 'Progress notes for projects and plugins.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_title', 'zh-CN', '构建日志');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_title', 'en-US', 'Build Logs');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_description', 'zh-CN', '跟踪实现记录和发布进度。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:2', 'hero_description', 'en-US', 'Track implementation notes and release progress.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'name', 'zh-CN', '展示');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'name', 'en-US', 'Showcase');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'description', 'zh-CN', '富媒体示例和演示。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'description', 'en-US', 'Media-rich examples and demos.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_title', 'zh-CN', '展示');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_title', 'en-US', 'Showcase');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_description', 'zh-CN', '图文帖子、预览和演示内容。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:3', 'hero_description', 'en-US', 'Media-rich posts, previews, and demos.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'name', 'zh-CN', '想法');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'name', 'en-US', 'Ideas');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'description', 'zh-CN', '提案和产品决策讨论。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'description', 'en-US', 'Proposals and product decisions.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_title', 'zh-CN', '想法');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_title', 'en-US', 'Ideas');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_description', 'zh-CN', '简短提案和设计讨论。');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('category:4', 'hero_description', 'en-US', 'Short proposals and design discussions.');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:1', 'name', 'zh-CN', '设计');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:1', 'name', 'en-US', 'Design');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:2', 'name', 'zh-CN', '媒体');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:2', 'name', 'en-US', 'Media');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:3', 'name', 'zh-CN', '插件');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:3', 'name', 'en-US', 'Plugin');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:4', 'name', 'zh-CN', '发布');`,
				`INSERT OR IGNORE INTO translations (scope, key, locale, value) VALUES ('tag:4', 'name', 'en-US', 'Release');`,
				`UPDATE translations SET value = '翻译管理' WHERE scope = 'system' AND key = 'admin.i18n.title' AND locale = 'zh-CN' AND value IN ('语言与翻译', '语言和翻译');`,
				`UPDATE translations SET value = '版块' WHERE scope = 'system' AND key = 'index.hero.categories' AND locale = 'zh-CN' AND value IN ('分类');`,
				`UPDATE translations SET value = 'Boards' WHERE scope = 'system' AND key = 'index.hero.categories' AND locale = 'en-US' AND value IN ('Categories');`,
				`UPDATE translations SET value = '回复' WHERE scope = 'system' AND key = 'index.hero.pageComments' AND locale = 'zh-CN' AND value IN ('本页评论');`,
				`UPDATE translations SET value = 'Replies' WHERE scope = 'system' AND key = 'index.hero.pageComments' AND locale = 'en-US' AND value IN ('Comments on page');`
			];
			const tagSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);`
			];
			const pluginSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  slug TEXT DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  author TEXT DEFAULT '',
  homepage TEXT DEFAULT '',
  icon TEXT DEFAULT 'Puzzle',
  type TEXT DEFAULT 'system',
  css TEXT DEFAULT '',
  html TEXT DEFAULT '',
  js TEXT DEFAULT '',
  head_html TEXT DEFAULT '',
  block_types TEXT DEFAULT '[]',
  i18n TEXT DEFAULT '{}',
  config_schema TEXT DEFAULT '{}',
  permissions TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  source_url TEXT DEFAULT '',
  share_token TEXT DEFAULT '',
  share_notify INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS plugin_share_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  plugin_slug TEXT NOT NULL,
  token TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'install',
  source_url TEXT NOT NULL DEFAULT '',
  installer_origin TEXT NOT NULL DEFAULT '',
  installer_user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_share_events_token ON plugin_share_events(token, created_at);`,
				`CREATE INDEX IF NOT EXISTS idx_plugin_share_events_plugin ON plugin_share_events(plugin_id, created_at);`,
				...pluginAlterStmts,
				`UPDATE plugins SET slug = id WHERE slug IS NULL OR slug = '';`,
				...BUILTIN_PLUGINS.map((plugin) =>
					`INSERT INTO plugins (id, slug, name, description, version, enabled, config, type, css, html, js, i18n) VALUES (` +
					`'${plugin.id}', '${plugin.id}', '${plugin.name}', '${plugin.description.replace(/'/g, "''")}', '${plugin.version}', ${plugin.enabled}, ` +
					`'${plugin.config.replace(/'/g, "''")}', 'system', '${plugin.css.replace(/'/g, "''")}', '${plugin.html.replace(/'/g, "''")}', '${plugin.js.replace(/'/g, "''")}', '${JSON.stringify(plugin.i18n).replace(/'/g, "''")}') ` +
					`ON CONFLICT(id) DO UPDATE SET ` +
					`css = CASE WHEN plugins.css IS NULL OR plugins.css = '' THEN excluded.css ELSE plugins.css END, ` +
					`html = CASE WHEN plugins.html IS NULL OR plugins.html = '' THEN excluded.html ELSE plugins.html END, ` +
					`js = CASE WHEN plugins.js IS NULL OR plugins.js = '' THEN excluded.js ELSE plugins.js END, ` +
					`i18n = CASE WHEN plugins.i18n IS NULL OR plugins.i18n = '{}' OR plugins.i18n = '' THEN excluded.i18n ELSE plugins.i18n END, ` +
					`config = CASE WHEN plugins.config IS NULL OR plugins.config = '{}' OR plugins.config = '' THEN excluded.config ELSE plugins.config END;`
				)
			];
			const mediaSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'post',
  owner_id INTEGER,
  post_id INTEGER,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  media_type TEXT NOT NULL DEFAULT 'image',
  source TEXT NOT NULL DEFAULT 'upload',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE INDEX IF NOT EXISTS idx_media_assets_scope_created ON media_assets(scope, created_at);`,
				`CREATE INDEX IF NOT EXISTS idx_media_assets_post ON media_assets(post_id);`,
				`CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);`
			];
			const progressSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS user_progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  points_delta INTEGER NOT NULL DEFAULT 0,
  experience_delta INTEGER NOT NULL DEFAULT 0,
  post_id INTEGER,
  comment_id INTEGER,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_user_progress_logs_user_created ON user_progress_logs(user_id, created_at);`,
				...Object.entries(PROGRESS_REWARD_KEYS).flatMap(([source, keys]) => [
					`INSERT OR IGNORE INTO settings (key, value) VALUES ('${keys.points}', '${DEFAULT_PROGRESS_REWARDS[source as ProgressSource].points}');`,
					`INSERT OR IGNORE INTO settings (key, value) VALUES ('${keys.experience}', '${DEFAULT_PROGRESS_REWARDS[source as ProgressSource].experience}');`
				])
			];
			const notificationSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  post_id INTEGER,
  comment_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at);`
			];
			const visitSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS visit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'XX',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  date_bucket TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_date ON visit_events(date_bucket);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_country_date ON visit_events(country, date_bucket);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_path_date ON visit_events(path, date_bucket);`,
				`CREATE INDEX IF NOT EXISTS idx_visit_events_created ON visit_events(created_at);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('id_codec_secret', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('visit_log_retention_days', '90');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('visit_log_max_rows', '100000');`
			];
			const rolePermissionSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT PRIMARY KEY,
  permissions TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				...defaultRoleRows().map((item) =>
					`INSERT OR IGNORE INTO role_permissions (role, permissions) VALUES ('${item.role}', '${JSON.stringify(item.permissions).replace(/'/g, "''")}');`
				)
			];
			const oauthSchemaStmts = [
				`CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT DEFAULT '',
  profile_json TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				`CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_google_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_google_client_id', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_google_client_secret', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_github_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_github_client_id', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_github_client_secret', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_epic_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_epic_client_id', '');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('oauth_epic_client_secret', '');`
			];
			let baseSchemaMissing = false;
			try {
				await db.prepare('SELECT 1 FROM posts LIMIT 1').first();
			} catch (err: any) {
				baseSchemaMissing = true;
				console.warn('Database schema missing, initializing', err);
			}

			if (!baseSchemaMissing) {
				try {
					const marker = await db.prepare("SELECT value FROM settings WHERE key = 'bootstrap_version'").first<{ value: string }>();
					if (marker?.value === BOOTSTRAP_VERSION) {
						await ensureBootstrapAdmin();
						return;
					}
				} catch {
					// Old databases may not have settings yet; fall through to the normal bootstrap path.
				}
				for (const stmt of [...profileAlterStmts, ...tagSchemaStmts, ...pluginSchemaStmts, ...i18nSchemaStmts, ...mediaSchemaStmts, ...progressSchemaStmts, ...notificationSchemaStmts, ...visitSchemaStmts, ...rolePermissionSchemaStmts, ...oauthSchemaStmts]) {
					try {
						await db.prepare(stmt).run();
					} catch (e) {
						console.error('Error running extension schema statement', e, stmt);
					}
				}
				await ensureBootstrapAdmin();
				await ensureDemoContent();
				await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_version', ?)").bind(BOOTSTRAP_VERSION).run();
				return;
			}

			// using prepare().run() instead of exec ensures each statement is committed
			const stmts = [
				`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  verified INTEGER DEFAULT 0,
  verification_token TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  reset_token TEXT,
  reset_token_expires INTEGER,
  pending_email TEXT,
  email_change_token TEXT,
  avatar_url TEXT,
  nickname TEXT,
  email_notifications INTEGER DEFAULT 1,
  show_public_posts INTEGER DEFAULT 1,
  points INTEGER DEFAULT 0,
  experience INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  last_checkin_date TEXT,
  permissions TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  hero_title TEXT DEFAULT '',
  hero_description TEXT DEFAULT '',
  icon_url TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  admin_only INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id INTEGER,
  is_pinned INTEGER DEFAULT 0,
  is_category_pinned INTEGER DEFAULT 0,
  min_view_level INTEGER DEFAULT 0,
  min_comment_level INTEGER DEFAULT 0,
  status TEXT DEFAULT 'approved',
  rejection_reason TEXT DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);`,
				`CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  parent_id INTEGER,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'approved',
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);`,
				`CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				...tagSchemaStmts,
				`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);`,
				...pluginSchemaStmts,
				...i18nSchemaStmts,
				...mediaSchemaStmts,
				...progressSchemaStmts,
				...notificationSchemaStmts,
				...visitSchemaStmts,
				...rolePermissionSchemaStmts,
				...oauthSchemaStmts,
				`CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);`,
				`CREATE TABLE IF NOT EXISTS sessions (
  jti TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
				`CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('turnstile_enabled', '0');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_posts_default', 'approved');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_comments_default', 'approved');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_default_reject_reason', '内容不符合社区规则，请修改后重新提交。');`,
				`INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_reject_reasons', '内容不符合社区规则，请修改后重新提交。\n标题或正文信息不足，请补充更多上下文。\n图片、视频或链接无法正常访问，请修正后重新提交。');`
			];
			for (const stmt of stmts) {
				try {
					await db.prepare(stmt).run();
				} catch (e) {
					console.error('Error running schema statement', e, stmt);
				}
			}
			await ensureBootstrapAdmin();
			await ensureDemoContent();
			await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_version', ?)").bind(BOOTSTRAP_VERSION).run();
			// verify posts table exists now
			try {
				await db.prepare('SELECT 1 FROM posts LIMIT 1').first();
			} catch (e) {
				console.error('Failed to verify posts table after init', e);
			}
		};

	await ensureSchema();
}

