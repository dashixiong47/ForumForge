#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = process.cwd();
const envFile = join(root, '.dev.vars');
const target = process.argv.includes('--local') ? 'local' : 'remote';

function parseDotEnv(text) {
	const env = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const index = line.indexOf('=');
		if (index <= 0) continue;
		const key = line.slice(0, index).trim();
		let value = line.slice(index + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}
	return env;
}

function quoteSql(value) {
	return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function addSetting(settings, key, value) {
	if (value === undefined || value === null || String(value).trim() === '') return;
	settings[key] = String(value).trim();
}

if (!existsSync(envFile)) {
	console.log('[sync-settings] .dev.vars not found, skip private settings sync.');
	process.exit(0);
}

const env = parseDotEnv(readFileSync(envFile, 'utf8'));
const settings = {};

addSetting(settings, 'smtp_host', env.SMTP_HOST);
addSetting(settings, 'smtp_port', env.SMTP_PORT);
addSetting(settings, 'smtp_user', env.SMTP_USER);
addSetting(settings, 'smtp_pass', env.SMTP_PASS);
addSetting(settings, 'smtp_from', env.SMTP_FROM);
addSetting(settings, 'smtp_from_name', env.SMTP_FROM_NAME);
addSetting(settings, 'resend_key', env.RESEND_KEY);
addSetting(settings, 'resend_send', env.RESEND_SEND);
addSetting(settings, 'id_codec_secret', env.ID_CODEC_SECRET);

for (const provider of ['google', 'github', 'epic']) {
	const upper = provider.toUpperCase();
	const clientId = env[`${upper}_CLIENT_ID`];
	const clientSecret = env[`${upper}_CLIENT_SECRET`];
	addSetting(settings, `oauth_${provider}_client_id`, clientId);
	addSetting(settings, `oauth_${provider}_client_secret`, clientSecret);
}

const entries = Object.entries(settings);
if (!entries.length) {
	console.log('[sync-settings] No private settings found in .dev.vars.');
	process.exit(0);
}

const sql = entries
	.map(([key, value]) => `INSERT OR REPLACE INTO settings (key, value) VALUES (${quoteSql(key)}, ${quoteSql(value)});`)
	.join('\n');
const tempFile = join(root, `tmp-sync-settings-${randomUUID()}.sql`);
writeFileSync(tempFile, sql, 'utf8');

try {
	const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', `--${target}`, '--file', tempFile], {
		cwd: root,
		stdio: 'inherit',
		shell: process.platform === 'win32',
	});
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
	console.log(`[sync-settings] Synced ${entries.length} private setting(s) from .dev.vars to ${target} D1.`);
} finally {
	try {
		unlinkSync(tempFile);
	} catch {
		// ignored
	}
}
