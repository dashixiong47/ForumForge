export type EmailLocale = 'zh' | 'en';

function esc(s: string): string {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c));
}

function layout(opts: {
	siteName: string;
	siteUrl: string;
	title: string;
	intro: string;
	ctaText: string;
	ctaUrl: string;
	fallbackLabel: string;
	ignoreNote: string;
	extraNote?: string;
}): string {
	const { siteName, siteUrl, title, intro, ctaText, ctaUrl, fallbackLabel, ignoreNote, extraNote } = opts;
	const year = new Date().getFullYear();
	return `<!DOCTYPE html>
<html lang="und">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(siteName)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f2f5;">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">
      <tr>
        <td style="background:#0d1117;border-radius:12px 12px 0 0;padding:24px 32px;text-align:left;">
          <a href="${esc(siteUrl)}" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;vertical-align:middle;">
            <span style="display:inline-block;width:26px;height:26px;background:rgba(88,166,255,.1);border:1.5px solid rgba(88,166,255,.45);border-radius:7px;text-align:center;line-height:24px;font-size:13px;color:#8cc8ff;">⬡</span>
            <span style="color:#e6edf3;font-size:17px;font-weight:700;letter-spacing:0.01em;vertical-align:middle;">${esc(siteName)}</span>
          </a>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:36px 40px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${title}</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.65;">${intro}</p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
            <tr>
              <td style="background:#1a73e8;border-radius:8px;box-shadow:0 2px 8px rgba(26,115,232,.35);">
                <a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.01em;">${esc(ctaText)}</a>
              </td>
            </tr>
          </table>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin:0 0 20px;">
            <p style="margin:0 0 6px;font-size:12px;color:#6b7280;font-weight:600;">${esc(fallbackLabel)}</p>
            <p style="margin:0;word-break:break-all;font-size:12px;color:#1a73e8;font-family:'Cascadia Code',Consolas,'Courier New',monospace;">${esc(ctaUrl)}</p>
          </div>
          ${extraNote ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${esc(extraNote)}</p>` : ''}
          <p style="margin:0;font-size:13px;color:#9ca3af;">${esc(ignoreNote)}</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:18px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">© ${year} <a href="${esc(siteUrl)}" style="color:#6b7280;text-decoration:none;">${esc(siteName)}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function otpLayout(opts: {
	siteName: string;
	siteUrl: string;
	title: string;
	intro: string;
	code: string;
	expireNote: string;
	ignoreNote: string;
}): string {
	const { siteName, siteUrl, title, intro, code, expireNote, ignoreNote } = opts;
	const year = new Date().getFullYear();
	return `<!DOCTYPE html>
<html lang="und">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(siteName)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f2f5;">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">
      <tr>
        <td style="background:#0d1117;border-radius:12px 12px 0 0;padding:24px 32px;text-align:left;">
          <a href="${esc(siteUrl)}" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;vertical-align:middle;">
            <span style="display:inline-block;width:26px;height:26px;background:rgba(88,166,255,.1);border:1.5px solid rgba(88,166,255,.45);border-radius:7px;text-align:center;line-height:24px;font-size:13px;color:#8cc8ff;">⬡</span>
            <span style="color:#e6edf3;font-size:17px;font-weight:700;letter-spacing:0.01em;vertical-align:middle;">${esc(siteName)}</span>
          </a>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:36px 40px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${title}</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.65;">${intro}</p>
          <div style="margin:0 0 28px;text-align:center;">
            <div style="display:inline-block;background:#0d1117;border:1px solid rgba(88,166,255,.35);border-radius:12px;padding:20px 40px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8b949e;">${esc(expireNote)}</p>
              <p style="margin:0;font-size:40px;font-weight:900;letter-spacing:.22em;color:#58a6ff;font-family:'Cascadia Code',Consolas,'Courier New',monospace;line-height:1.1;">${esc(code)}</p>
            </div>
          </div>
          <p style="margin:0;font-size:13px;color:#9ca3af;">${esc(ignoreNote)}</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:18px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} <a href="${esc(siteUrl)}" style="color:#6b7280;text-decoration:none;">${esc(siteName)}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const strings = {
	zh: {
		verify: {
			subject: (name: string) => `欢迎加入 ${name}，请验证您的邮箱`,
			title: (username: string) => `欢迎加入，${username}！`,
			intro: '请点击下方按钮验证您的邮箱地址。验证后才能发帖、评论、点赞、签到和上传媒体。',
			cta: '验证邮箱',
			fallback: '按钮无法点击？请复制以下链接到浏览器打开：',
			ignore: '如果您未请求此操作，请忽略此邮件。',
		},
		reset: {
			subject: '密码重置请求',
			title: '重置您的密码',
			intro: '我们收到了重置您账户密码的请求，请点击下方按钮设置新密码。',
			cta: '重置密码',
			fallback: '按钮无法点击？请复制以下链接到浏览器打开：',
			ignore: '如果您未请求此操作，请忽略此邮件。',
			extra: '此链接 1 小时后失效。',
		},
		emailOtp: {
			subject: (code: string, name: string) => `${code} 是您在 ${name} 的邮箱验证码`,
			title: '邮箱验证码',
			intro: (target: string) => `您正在绑定邮箱 ${target}，以下是您的验证码：`,
			expire: '10 分钟内有效',
			ignore: '如果您未请求此操作，请忽略此邮件。',
		},
		registerOtp: {
			subject: (code: string, name: string) => `${code} 是您在 ${name} 的注册验证码`,
			title: '注册验证码',
			intro: (target: string) => `您正在使用 ${target} 注册账号，输入以下验证码后才能完成注册：`,
			expire: '10 分钟内有效',
			ignore: '如果您未请求此操作，请忽略此邮件。',
		},
	},
	en: {
		verify: {
			subject: (name: string) => `Welcome to ${name} — please verify your email`,
			title: (username: string) => `Welcome, ${username}!`,
			intro: 'Click the button below to verify your email address. After verification you can post, comment, like, check in, and upload media.',
			cta: 'Verify Email',
			fallback: "Button not working? Copy and open this link in your browser:",
			ignore: "If you didn't request this, please ignore this email.",
		},
		reset: {
			subject: 'Password Reset Request',
			title: 'Reset your password',
			intro: "We received a request to reset your account's password. Click the button below to set a new password.",
			cta: 'Reset Password',
			fallback: "Button not working? Copy and open this link in your browser:",
			ignore: "If you didn't request this, please ignore this email.",
			extra: 'This link expires in 1 hour.',
		},
		emailOtp: {
			subject: (code: string, name: string) => `${code} is your ${name} email verification code`,
			title: 'Email Verification Code',
			intro: (target: string) => `You are binding ${target} as your email. Here is your verification code:`,
			expire: 'Valid for 10 minutes',
			ignore: "If you didn't request this, please ignore this email.",
		},
		registerOtp: {
			subject: (code: string, name: string) => `${code} is your ${name} registration code`,
			title: 'Registration Code',
			intro: (target: string) => `You are registering an account with ${target}. Enter this code to complete registration:`,
			expire: 'Valid for 10 minutes',
			ignore: "If you didn't request this, please ignore this email.",
		},
	},
} as const;

export function buildVerificationEmail(opts: {
	locale: EmailLocale;
	username: string;
	verifyLink: string;
	siteName: string;
	siteUrl: string;
}): { subject: string; html: string } {
	const s = strings[opts.locale].verify;
	return {
		subject: s.subject(opts.siteName),
		html: layout({
			siteName: opts.siteName,
			siteUrl: opts.siteUrl,
			title: s.title(opts.username),
			intro: s.intro,
			ctaText: s.cta,
			ctaUrl: opts.verifyLink,
			fallbackLabel: s.fallback,
			ignoreNote: s.ignore,
		}),
	};
}

export function buildResetPasswordEmail(opts: {
	locale: EmailLocale;
	resetLink: string;
	siteName: string;
	siteUrl: string;
}): { subject: string; html: string } {
	const s = strings[opts.locale].reset;
	return {
		subject: s.subject,
		html: layout({
			siteName: opts.siteName,
			siteUrl: opts.siteUrl,
			title: s.title,
			intro: s.intro,
			ctaText: s.cta,
			ctaUrl: opts.resetLink,
			fallbackLabel: s.fallback,
			ignoreNote: s.ignore,
			extraNote: s.extra,
		}),
	};
}

export function buildEmailOtpEmail(opts: {
	locale: EmailLocale;
	code: string;
	targetEmail: string;
	siteName: string;
	siteUrl: string;
}): { subject: string; html: string } {
	const s = strings[opts.locale].emailOtp;
	return {
		subject: s.subject(opts.code, opts.siteName),
		html: otpLayout({
			siteName: opts.siteName,
			siteUrl: opts.siteUrl,
			title: s.title,
			intro: s.intro(opts.targetEmail),
			code: opts.code,
			expireNote: s.expire,
			ignoreNote: s.ignore,
		}),
	};
}

export function buildRegistrationOtpEmail(opts: {
	locale: EmailLocale;
	code: string;
	targetEmail: string;
	siteName: string;
	siteUrl: string;
}): { subject: string; html: string } {
	const s = strings[opts.locale].registerOtp;
	return {
		subject: s.subject(opts.code, opts.siteName),
		html: otpLayout({
			siteName: opts.siteName,
			siteUrl: opts.siteUrl,
			title: s.title,
			intro: s.intro(opts.targetEmail),
			code: opts.code,
			expireNote: s.expire,
			ignoreNote: s.ignore,
		}),
	};
}

export function normalizeLocale(raw?: string): EmailLocale {
	const s = String(raw || '').toLowerCase();
	if (s.startsWith('zh')) return 'zh';
	return 'en';
}
