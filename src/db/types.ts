export interface DBUser {
	id: number;
	email: string;
	username: string;
	password: string;
	verified: number;
	role?: string;
	avatar_url?: string;
	totp_secret?: string;
	totp_enabled?: number;
	email_notifications?: number;
	show_public_posts?: number;
	reset_token?: string;
	reset_token_expires?: number;
	pending_email?: string;
	verification_token?: string;
	email_change_token?: string;
	points?: number;
	experience?: number;
	level?: number;
	last_checkin_date?: string | null;
	permissions?: string;
}

export interface PostAuthorInfo {
	title: string;
	author_id: number;
	email: string;
	email_notifications: number;
	username: string;
}

export interface DBUserEmail {
	email: string;
}

export interface DBUserTotp {
	totp_secret: string;
}

export interface DBCount {
	count: number;
}

export interface DBSetting {
	value: string;
}

export interface DBPlugin {
	id: string;
	slug?: string;
	name: string;
	description?: string;
	version?: string;
	enabled?: number;
	config?: string;
	author?: string;
	homepage?: string;
	icon?: string;
	type?: string;
	css?: string;
	html?: string;
	js?: string;
	head_html?: string;
	block_types?: string;
	i18n?: string;
	config_schema?: string;
	permissions?: string;
	tags?: string;
	source_url?: string;
	share_token?: string;
	share_notify?: number;
	created_at?: string;
	updated_at?: string;
}
