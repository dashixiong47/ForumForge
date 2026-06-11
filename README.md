<div align="center">

<img src="./assets/forumforge-icon.svg" width="120" height="120" alt="ForumForge" />

# ForumForge

**A Cloudflare-native discussion hub for games, plugins, products, support, and media-rich communities.**

🌐 **English** | [简体中文](./README.zh-CN.md)

🚀 **Live demo:** [dsxforge.com](https://dsxforge.com)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![D1](https://img.shields.io/badge/D1-SQLite-2F81F7?style=for-the-badge)
![R2](https://img.shields.io/badge/R2-Media-22C55E?style=for-the-badge)
![SSR](https://img.shields.io/badge/SSR-Worker%20Rendered-3FB950?style=for-the-badge)
![Plugins](https://img.shields.io/badge/Plugins-Built%20In-8B5CF6?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-0EA5E9?style=for-the-badge)

</div>

---

## ✨ What Is ForumForge?

ForumForge is a lightweight forum system designed for creators who need one place for:

- 🎮 Game and plugin discussions
- 🧰 Product support and after-sales Q&A
- 🖼️ Image, video, and mixed Markdown posts
- 🧩 Plugin sharing and extension management
- 🌍 Multilingual community pages
- 🛡️ Moderation, roles, permissions, and audit workflows

It runs as **one Cloudflare Worker** with SSR pages, D1 storage, R2 media uploads, OAuth login, email verification, notifications, and an editable plugin system.

---

## 🌟 Highlights

| Area | What you get |
| --- | --- |
| ⚡ Cloudflare-native | Worker SSR, D1, R2, Cloudflare Email, Turnstile-ready. |
| 📝 Rich posts | Markdown editor, image/video upload, live preview, tags, category pages. |
| 🧵 Real discussions | Nested replies, reply notifications, moderation, jump links. |
| 🔔 Notifications | Approval, rejection, replies, moderation results, unread indicator. |
| 🛂 Moderation | Pending queues, batch actions, reject-reason dialog, resubmission flow. |
| 👥 Roles & permissions | Admin-only backend, role cards, permission matrix, user role assignment. |
| 🏆 Levels | Points, XP, check-in, post/reply/replied rewards, configurable level rules. |
| 🌐 i18n | English and Simplified Chinese included, editable translation keys, localized content fields. |
| 🧩 Plugins | Manifest editor, CSS/HTML/Head HTML/JS/i18n/config/permissions, import and share. |
| 📊 Dashboard | Visit analytics, world map, 7-day trends, device split, recent activity. |

---

## 🚀 Quick Deploy

### 1. Create Cloudflare resources

```bash
npx wrangler d1 create forumforge-db
npx wrangler r2 bucket create forumforge-images
```

Put the generated resource names and IDs into `wrangler.jsonc`:

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

### 2. Install and migrate

```bash
npm install
npx wrangler d1 migrations apply forumforge-db --remote
```

### 3. Prepare private config

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your domain, initial admin account, email sender, OAuth clients, Turnstile keys, and ID codec secret.

`.dev.vars` is ignored by git. Do not commit it.

### 4. Add Worker secrets

Use Cloudflare secrets for values that must stay server-only:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

The initial admin account is only used when the database has no admin user yet. After bootstrap, you can change the account inside the site.

### 5. Deploy

```bash
npm run deploy
```

`npm run deploy` runs:

```text
typecheck -> sync selected .dev.vars values to remote D1 settings -> wrangler deploy
```

On first request, ForumForge bootstraps default settings, languages, categories, tags, built-in plugins, demo content, and the default icon media.

---

## 🧪 Local Development

```powershell
Copy-Item .dev.vars.example .dev.vars
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:8787
```

Ignored local files:

- `.dev.vars`
- `.env`
- `.wrangler/`
- `tmp-*`
- `*.log`

---

## 🔐 Configuration Model

ForumForge keeps the repository clean by separating public bindings from private runtime values.

| File / place | Purpose |
| --- | --- |
| `wrangler.jsonc` | Commit-safe Cloudflare bindings and defaults. |
| `.dev.vars.example` | Safe template for local/private config. |
| `.dev.vars` | Private local/deploy config, ignored by git. |
| Cloudflare Worker secrets | Server-only secrets such as `JWT_SECRET`. |
| D1 `settings` table | Editable site settings used by runtime pages. |

`scripts/sync-settings-from-env.mjs` reads `.dev.vars` before deploy and writes selected keys into remote D1 settings.

Synced setting groups:

- 📧 Email: `SMTP_*`, `RESEND_KEY`, `RESEND_SEND`
- 🔑 OAuth: `GOOGLE_*`, `GITHUB_*`, `EPIC_*`
- 🧱 Turnstile: enabled when both Turnstile keys exist
- 🔗 Public ID codec: `ID_CODEC_SECRET`

Not synced:

- `JWT_SECRET`
- `ADMIN_PASSWORD`
- Other session-critical secrets

---

## 📮 Email Delivery

ForumForge can send verification and notification emails through multiple providers.

Priority order:

```text
Cloudflare Email binding -> Resend -> MailChannels -> SMTP
```

The Cloudflare Email binding is declared in `wrangler.jsonc`:

```jsonc
"send_email": [
  {
    "name": "EMAIL",
    "remote": true
  }
]
```

If you use Cloudflare Email, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` can stay empty. You only need a sender:

```env
SMTP_FROM=noreply@dsxforge.com
SMTP_FROM_NAME=DSXForge
```

Local email/password users must verify email before posting, liking, or replying. OAuth users are treated as verified, and can later bind an email or set a password in profile settings.

---

## 🔑 OAuth Login

Supported providers:

- Google
- GitHub
- Epic

Callback paths:

| Provider | Callback |
| --- | --- |
| Google | `/oauth/google/callback` |
| GitHub | `/oauth/github/callback` |
| Epic | `/oauth/epic/callback` |

Use your public domain as the redirect base, for example:

```text
https://dsxforge.com/oauth/google/callback
```

OAuth can be enabled or disabled from site settings.

---

## 🧩 Plugin System

Plugins are first-class content in ForumForge.

You can:

- 📦 Install a plugin from JSON
- 🌐 Install from a URL
- ✍️ Edit manifest, CSS, HTML, Head HTML, JavaScript, config, permissions, and i18n
- 🔁 Enable, disable, update, delete, and share plugins
- 🌍 Ship plugin-owned translations with the manifest

Minimal manifest:

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

---

## 🏗️ Architecture

```text
Browser
  │
  ▼
Cloudflare Worker
  ├─ SSR pages: forum, auth, profile, admin
  ├─ API routes: posts, comments, media, moderation, settings, plugins
  ├─ D1: users, posts, settings, i18n, plugins, analytics
  ├─ R2: uploaded images and videos
  ├─ Email: Cloudflare Email / Resend / MailChannels / SMTP
  └─ OAuth: Google / GitHub / Epic
```

Design rules:

- 🧭 Public pages are SSR for fast open and shareable URLs.
- ⚙️ Stateful actions use APIs: like, comment, upload, approve, reject, save, check-in.
- 🧊 Outer layout stays fixed; lists, tables, posts, and comments scroll internally.
- 🌍 System UI text belongs to i18n; user content stays user-owned.
- 🔒 Pending/rejected content is not public and requires the right permission.

---

## 📁 Project Structure

```text
.
├── assets/                 # Public brand assets and default icon
├── database/               # Optional seed data
├── locales/                # Built-in translation JSON
├── migrations/             # D1 migrations
├── scripts/                # Deployment helpers
├── src/
│   ├── admin/              # Admin SSR UI and permission helpers
│   ├── api/                # API handlers
│   ├── assets/             # Built-in Worker asset constants
│   ├── auth/               # OAuth providers
│   ├── core/               # Security, locale, password, ID codec, Turnstile
│   ├── db/                 # DB types
│   ├── gamification/       # Points, XP, levels, logs
│   ├── i18n/               # Translation seeds
│   ├── integrations/       # R2/S3 and email integrations
│   ├── pages/              # Site/Admin route composition
│   ├── plugins/            # Built-in plugin registry
│   ├── services/           # Bootstrap and shared initialization
│   ├── site/               # Public SSR and Markdown rendering
│   ├── types/              # Shared TypeScript types
│   ├── utils/              # HTML, JSON, media helpers
│   └── index.ts            # Worker entry
├── wrangler.jsonc          # Commit-safe Cloudflare template config
├── .dev.vars.example       # Private config template
└── package.json
```

---

## 🗃️ Database Map

| Table | Purpose |
| --- | --- |
| `users` | Accounts, roles, avatars, points, XP, levels. |
| `oauth_accounts` | External login bindings. |
| `categories` | Categories, localized homepage copy, icons, enabled state. |
| `tags` / `post_tags` | Tags and post-tag relations. |
| `posts` | Posts, moderation status, pins, gates, metadata. |
| `comments` | Replies, nested comments, moderation status. |
| `likes` | Post likes. |
| `media_assets` | System and post media metadata. |
| `languages` / `translations` | Editable multilingual UI text. |
| `plugins` | Plugin manifest, runtime code, config, i18n. |
| `settings` | Site settings, email, OAuth, moderation, rewards. |
| `role_permissions` | Role permission matrix. |
| `notifications` | User notifications. |
| `user_progress_logs` | Points and XP source logs. |
| `visit_events` | Visit analytics. |
| `sessions` / `nonces` | Sessions and CSRF nonce. |
| `audit_logs` | Admin audit logs. |

---

## 🧰 Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start local Worker dev server. |
| `npm run typecheck` | Run TypeScript checks. |
| `npm run sync:settings` | Sync selected `.dev.vars` values into remote D1 settings. |
| `npm run deploy` | Typecheck, sync settings, and deploy Worker. |
| `npm run cf-typegen` | Generate Cloudflare binding types. |

Useful Cloudflare commands:

```bash
npx wrangler d1 migrations apply forumforge-db --remote
npx wrangler d1 execute forumforge-db --remote --file database/seed-posts.sql
```

---

## 🧼 Repository Hygiene

- ✅ Commit source code, migrations, seed data, public assets, and docs.
- ✅ Keep `wrangler.jsonc` template-friendly.
- ✅ Use `.dev.vars`, Cloudflare secrets, or CI secrets for private runtime values.
- ❌ Do not commit `.dev.vars`, `.env`, `.wrangler/`, `tmp-*`, logs, OAuth secrets, SMTP passwords, or private domains.

---

## 📄 License

MIT
