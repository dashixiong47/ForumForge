export interface SiteUser {
	id: number;
	email: string;
	username: string;
	role: string;
	verified?: number;
	avatar_url?: string;
	email_notifications?: number;
	show_public_posts?: number;
	unread_count?: number;
	points?: number;
	experience?: number;
	level?: number;
	last_checkin_date?: string | null;
	created_at?: string;
}

export interface SitePost {
	id: number;
	author_id?: number;
	title: string;
	content: string;
	created_at?: string;
	is_pinned?: number;
	is_category_pinned?: number;
	min_view_level?: number;
	min_comment_level?: number;
	view_count?: number;
	like_count?: number;
	liked?: boolean;
	comment_count?: number;
	category_name?: string;
	author_name?: string;
	author_avatar?: string;
	author_role?: string;
	author_points?: number;
	author_experience?: number;
	author_level?: number;
	status?: string;
	rejection_reason?: string;
	tags?: Array<{ id: number; name: string }>;
}

export interface SiteCategory {
	id: number;
	name: string;
	post_count?: number;
	description?: string | null;
	hero_title?: string | null;
	hero_description?: string | null;
	icon_url?: string | null;
	enabled?: number;
	admin_only?: number;
	sort_order?: number;
}

export interface SiteTag {
	id: number;
	name: string;
	post_count?: number;
}

export interface SiteComment {
	id: number;
	post_id?: number;
	author_id?: number;
	post_title?: string;
	parent_id?: number | null;
	content: string;
	created_at?: string;
	username?: string;
	avatar_url?: string;
	role?: string;
	points?: number;
	experience?: number;
	level?: number;
	status?: string;
	rejection_reason?: string;
}

export interface SiteProgressLog {
	id: number;
	source: string;
	points_delta?: number;
	experience_delta?: number;
	post_id?: number | null;
	comment_id?: number | null;
	post_title?: string | null;
	created_at?: string;
}

export interface SiteNotification {
	id: number;
	type: string;
	title: string;
	body?: string;
	post_id?: number | null;
	comment_id?: number | null;
	is_read?: number;
	created_at?: string;
	url?: string;
}

export type PageState = {
	page: number;
	pageSize: number;
	total: number;
};
