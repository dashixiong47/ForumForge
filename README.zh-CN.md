<div align="center">

<img src="./assets/forumforge-icon.svg" width="120" height="120" alt="ForumForge" />

# ForumForge

**基于 Cloudflare 的现代论坛系统，适合游戏、插件、产品售后、图文讨论和社区运营。**

[English](./README.md) | 🌐 **简体中文**

🚀 **在线演示：** [dsxforge.com](https://dsxforge.com)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![D1](https://img.shields.io/badge/D1-SQLite-2F81F7?style=for-the-badge)
![R2](https://img.shields.io/badge/R2-Media-22C55E?style=for-the-badge)
![SSR](https://img.shields.io/badge/SSR-Worker%20Rendered-3FB950?style=for-the-badge)
![Plugins](https://img.shields.io/badge/Plugins-Built%20In-8B5CF6?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-0EA5E9?style=for-the-badge)

</div>

---

## ✨ ForumForge 是什么？

ForumForge 是一个轻量、可部署、可扩展的论坛系统，适合个人开发者或小团队用来承载：

- 🎮 游戏和插件讨论
- 🧰 产品售后和问题反馈
- 🖼️ 图片、视频、Markdown 混排帖子
- 🧩 插件分发、插件管理和插件分享
- 🌍 多语言社区页面
- 🛡️ 审核、角色、权限和后台审计流程

它以 **单个 Cloudflare Worker** 运行，内置 SSR 页面、D1 数据库、R2 媒体上传、OAuth 登录、邮箱验证、消息通知、积分等级和可编辑插件系统。

---

## 🌟 核心能力

| 模块 | 能力 |
| --- | --- |
| ⚡ Cloudflare 原生 | Worker SSR、D1、R2、Cloudflare Email、Turnstile。 |
| 📝 图文帖子 | Markdown 编辑器、图片/视频上传、实时预览、标签、分类首页。 |
| 🧵 评论讨论 | 多层回复、回复通知、审核、跳转定位。 |
| 🔔 消息通知 | 通过、拒绝、被回复、审核结果、未读提醒。 |
| 🛂 审核流程 | 待审队列、批量操作、拒绝理由弹窗、重新编辑提交。 |
| 👥 角色权限 | 仅管理员可进后台，角色卡片、权限矩阵、用户角色分配。 |
| 🏆 等级系统 | 积分、经验、签到、发帖、回复、被回复奖励，可在后台配置。 |
| 🎖️ 勋章系统 | 插件发放图片勋章、勋章定义、用户勋章编辑、启用/禁用和撤销流程。 |
| 🌐 多语言 | 内置英文和简体中文，支持编辑翻译 Key，分类/标签/站点文案可本地化。 |
| 🧩 插件系统 | Manifest 编辑、配置 Schema、客户端 UI Hooks、服务端能力接口、导入和分享。 |
| 📊 仪表盘 | 访问统计、世界地图、7 天趋势、设备分布、最近访问记录。 |

---

## 🚀 快速部署

### 1. 创建 Cloudflare 资源

```bash
npx wrangler d1 create forumforge-db
npx wrangler r2 bucket create forumforge-images
```

把生成的 D1 数据库 ID 和 R2 桶名填入 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "forumforge-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "remote": true,
    "migrations_dir": "migrations"
  }
],
"r2_buckets": [
  {
    "binding": "BUCKET",
    "bucket_name": "forumforge-images"
  }
]
```

### 2. 安装依赖并迁移数据库

```bash
npm install
npx wrangler d1 migrations apply forumforge-db --remote
```

### 3. 准备私有配置

```powershell
Copy-Item .dev.vars.example .dev.vars
```

在 `.dev.vars` 里填写你的域名、初始管理员账号、邮件发送地址、OAuth 客户端、Turnstile Key 和 ID 编码密钥。

`.dev.vars` 已被 git 忽略，不要提交到仓库。

### 4. 写入 Worker Secrets

服务器只读的敏感值建议使用 Cloudflare Worker secrets：

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

初始管理员账号只会在数据库里还没有管理员时使用。创建完成后，可以在站点里自行修改。

### 5. 部署

```bash
npm run deploy
```

`npm run deploy` 会依次执行：

```text
typecheck -> 将 .dev.vars 中的站点配置同步到远程 D1 -> wrangler deploy
```

首次访问时，ForumForge 会自动初始化默认设置、语言、分类、标签、内置插件、示例内容和默认站点图标媒体。

---

## 🧪 本地开发

```powershell
Copy-Item .dev.vars.example .dev.vars
npm install
npm run dev
```

默认本地地址：

```text
http://127.0.0.1:8787
```

以下本地文件不会进入 git：

- `.dev.vars`
- `.env`
- `.wrangler/`
- `tmp-*`
- `*.log`

---

## 🔐 配置模型

ForumForge 把可提交配置和私有运行配置拆开，避免仓库里出现密钥。

| 位置 | 用途 |
| --- | --- |
| `wrangler.jsonc` | 可提交的 Cloudflare 绑定和默认配置。 |
| `.dev.vars.example` | 安全的私有配置模板。 |
| `.dev.vars` | 本地和部署用的私有配置，已忽略。 |
| Cloudflare Worker secrets | `JWT_SECRET` 等服务器敏感值。 |
| D1 `settings` 表 | 运行时可编辑的站点配置。 |

`scripts/sync-settings-from-env.mjs` 会在部署前读取 `.dev.vars`，把允许同步的值写入远程 D1 `settings` 表。

会同步的配置：

- 📧 邮件：`SMTP_*`、`RESEND_KEY`、`RESEND_SEND`
- 🔑 OAuth：`GOOGLE_*`、`GITHUB_*`、`EPIC_*`
- 🧱 Turnstile：同时存在 Site Key 和 Secret Key 时自动启用
- 🔗 公开 ID 编码：`ID_CODEC_SECRET`

不会同步的配置：

- `JWT_SECRET`
- `ADMIN_PASSWORD`
- 其他会影响登录和会话安全的敏感值

---

## 📮 邮件发送

ForumForge 支持发送注册验证邮件和通知邮件。

发送优先级：

```text
Cloudflare Email binding -> Resend -> MailChannels -> SMTP
```

`wrangler.jsonc` 中已经声明 Cloudflare Email 绑定：

```jsonc
"send_email": [
  {
    "name": "EMAIL",
    "remote": true
  }
]
```

如果使用 Cloudflare Email，`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 可以留空，只需要设置发件人：

```env
SMTP_FROM=noreply@dsxforge.com
SMTP_FROM_NAME=DSXForge
```

邮箱注册用户必须验证邮箱后才能发帖、点赞或回复。第三方登录用户默认视为已验证，也可以在个人设置里绑定邮箱或设置密码。

---

## 🔑 第三方登录

支持的登录方式：

- Google
- GitHub
- Epic

回调地址：

| 平台 | Callback |
| --- | --- |
| Google | `/oauth/google/callback` |
| GitHub | `/oauth/github/callback` |
| Epic | `/oauth/epic/callback` |

例如：

```text
https://dsxforge.com/oauth/google/callback
```

第三方登录可以在站点设置里启用或关闭。

---

## 🧩 插件系统

插件是 ForumForge 的一等能力。

你可以：

- 📦 通过 JSON 安装插件
- 🌐 通过 URL 安装插件
- ✍️ 编辑 Manifest、CSS、HTML、Head HTML、JavaScript、配置 Schema、权限和 i18n
- 🔁 启用、停用、更新、删除和分享插件
- 🌍 让插件自带自己的多语言文案
- 🧰 使用平台开放的后台 UI 辅助接口，而不是硬编码项目内部实现
- 🎖️ 通过插件能力接口发放、撤销和定义勋章

推荐插件流程：

1. 创建 Manifest，包含 `id`、`name`、`version`、`description`，以及可选资源、配置 Schema、权限、标签和插件自己的 i18n key。
2. 通过 `configSchema` 定义可编辑配置；配置值由平台保存，并可在服务端插件能力调用中注入，避免把敏感值暴露给浏览器代码。
3. 插件 JavaScript 只通过平台开放接口调用能力，例如 `window.ForumForgePluginUI` 和 `/api/plugin/:pluginId/capability/*`。
4. 后台扩展通过插件代码注册 UI 区域，不直接写项目内硬编码 Tab 或路由。
5. 用户可见状态，例如勋章，必须走插件能力接口写入，这样插件停用时可以统一过滤显示，同时保留历史数据。

最小 Manifest 结构：

```json
{
  "id": "markdown-editor",
  "name": "Markdown Editor",
  "version": "1.0.0",
  "description": "Adds editor toolbar, preview, and media insertion workflow.",
  "css": "",
  "html": "",
  "headHtml": "",
  "js": "",
  "i18n": {
    "en-US": {},
    "zh-CN": {}
  },
  "configSchema": {},
  "permissions": [],
  "tags": []
}
```

### 插件 UI 接口

后台页面会向插件暴露 `window.ForumForgePluginUI`：

| API | 用途 |
| --- | --- |
| `t(key, fallback)` | 读取当前后台语言下的翻译文本。 |
| `getLocale()` | 获取当前语言。 |
| `showToast(message, type)` | 显示后台成功/错误提示。 |
| `runButton(button, label, task)` | 执行异步按钮操作，并自动处理禁用和加载状态。 |
| `openModal(id)` / `closeModal(id)` | 使用平台统一弹窗行为。 |
| `openMediaPicker(options)` | 打开共享媒体选择器并返回选中的媒体。 |
| `bindMediaInput(input, options)` | 将媒体选择结果写入指定 input。 |
| `registerBadgeTab(id, label, init)` | 向勋章管理注册插件自己的 Tab。 |

共享媒体选择器支持系统媒体上传和已有媒体选择。插件需要选择图片或文件时，应使用该接口，不要自己实现文件浏览器。

### 插件能力接口

启用状态的插件可以调用服务端能力接口：

```text
/api/plugin/:pluginId/capability
```

可用能力：

| Endpoint | Method | 用途 |
| --- | --- | --- |
| `/me` | `GET` | 返回当前登录用户概要。 |
| `/fetch` | `POST` | 服务端 HTTP 请求，带 SSRF 防护，并支持注入插件配置中的密钥。 |
| `/db` | `POST` | 插件键值存储和勋章操作。 |

`/capability/db` 支持：

| Operation | 用途 |
| --- | --- |
| `get` / `set` / `delete` / `list` | 读写插件自己的 `plugin_store` 数据。 |
| `grant_badge` | 向用户发放勋章，并在需要时创建可复用勋章定义。 |
| `revoke_badge` | 撤销用户勋章并通知用户。 |

存储作用域：

| Scope | 含义 |
| --- | --- |
| `user` | 数据属于当前用户。 |
| `shared` | 插件全局共享数据。写入共享数据需要管理员权限。 |

勋章定义和用户勋章会跟随插件启用状态过滤。停用插件会隐藏对应后台扩展和前台可见勋章，但不会删除历史数据。

---

## 🏗️ 架构

```text
Browser
  │
  ▼
Cloudflare Worker
  ├─ SSR pages: forum, auth, profile, admin
  ├─ API routes: posts, comments, media, moderation, settings, plugins, plugin capabilities
  ├─ D1: users, posts, settings, i18n, plugins, plugin store, badges, analytics
  ├─ R2: uploaded images and videos
  ├─ Email: Cloudflare Email / Resend / MailChannels / SMTP
  └─ OAuth: Google / GitHub / Epic
```

设计原则：

- 🧭 用户直接打开的页面使用 SSR，首屏更快，也方便分享链接。
- ⚙️ 点赞、评论、上传、审核、保存、签到等状态变化走 API。
- 🧊 外层布局固定，列表、表格、正文和评论区在内部滚动。
- 🌍 系统 UI 文案进入 i18n，用户内容保持原样。
- 🔒 待审和被拒内容不公开展示，必须有对应权限才能访问。

---

## 📁 项目结构

```text
.
├── assets/                 # 公开品牌资源和默认图标
├── database/               # 可选种子数据
├── locales/                # 内置翻译 JSON
├── migrations/             # D1 迁移
├── scripts/                # 部署辅助脚本
├── src/
│   ├── admin/              # 后台 SSR UI 和权限辅助
│   ├── api/                # API handlers
│   ├── assets/             # Worker 内置资源常量
│   ├── auth/               # OAuth providers
│   ├── core/               # 安全、语言、密码、ID 编码、Turnstile
│   ├── db/                 # DB 类型
│   ├── gamification/       # 积分、经验、等级、记录
│   ├── i18n/               # 翻译种子
│   ├── integrations/       # R2/S3 和邮件集成
│   ├── pages/              # 前台/后台路由组合
│   ├── plugins/            # 内置插件注册
│   ├── services/           # Bootstrap 和共享初始化
│   ├── site/               # 前台 SSR 和 Markdown 渲染
│   ├── types/              # 共享 TypeScript 类型
│   ├── utils/              # HTML、JSON、媒体工具
│   └── index.ts            # Worker 入口
├── wrangler.jsonc          # 可提交的 Cloudflare 模板配置
├── .dev.vars.example       # 私有配置模板
└── package.json
```

---

## 🗃️ 数据库概览

| 表 | 用途 |
| --- | --- |
| `users` | 账号、角色、头像、积分、经验、等级。 |
| `oauth_accounts` | 第三方登录绑定。 |
| `categories` | 分类、本地化首页文案、图标、启用状态。 |
| `tags` / `post_tags` | 标签和帖子标签关系。 |
| `posts` | 帖子、审核状态、置顶、访问门槛、元数据。 |
| `comments` | 回复、多层评论、审核状态。 |
| `likes` | 帖子点赞。 |
| `media_assets` | 系统媒体和帖子媒体元数据。 |
| `languages` / `translations` | 可编辑的多语言 UI 文案。 |
| `plugins` | 插件 Manifest、运行时代码、配置和 i18n。 |
| `plugin_store` | 插件自己的分作用域键值数据。 |
| `plugin_resources` | 插件资源内容和资源元数据。 |
| `badge_definitions` | 由插件创建或后台编辑的可复用勋章定义。 |
| `user_badges` | 已发放用户勋章、用户级启用状态和撤销管理数据。 |
| `settings` | 站点设置、邮件、OAuth、审核、奖励配置。 |
| `role_permissions` | 角色权限矩阵。 |
| `notifications` | 用户消息通知。 |
| `user_progress_logs` | 积分和经验来源记录。 |
| `visit_events` | 访问统计。 |
| `sessions` / `nonces` | 会话和 CSRF nonce。 |
| `audit_logs` | 后台审计日志。 |

---

## 🧰 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地 Worker 开发服务器。 |
| `npm run typecheck` | 执行 TypeScript 检查。 |
| `npm run sync:settings` | 将 `.dev.vars` 中允许同步的值写入远程 D1 设置。 |
| `npm run deploy` | 类型检查、同步设置并部署 Worker。 |
| `npm run cf-typegen` | 生成 Cloudflare binding 类型。 |

常用 Cloudflare 命令：

```bash
npx wrangler d1 migrations apply forumforge-db --remote
npx wrangler d1 execute forumforge-db --remote --file database/seed-posts.sql
```

---

## 🧼 仓库清洁规则

- ✅ 提交源码、迁移、种子数据、公开资源和文档。
- ✅ 让 `wrangler.jsonc` 保持模板化，不写私人域名和密钥。
- ✅ 私有运行值使用 `.dev.vars`、Cloudflare secrets 或 CI secrets。
- ❌ 不提交 `.dev.vars`、`.env`、`.wrangler/`、`tmp-*`、日志、OAuth 密钥、SMTP 密码或私人域名。

---

## 📄 License

MIT
