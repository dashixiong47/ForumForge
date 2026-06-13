import type { DBSetting } from '../db/types';
import type { UserPayload } from '../core/security';

export type JsonResponse = (data: any, status?: number, extraHeaders?: HeadersInit) => Response;

export type ApiContext = {
	request: Request;
	url: URL;
	method: string;
	env: Env;
	db: D1Database;
	jsonResponse: JsonResponse;
	handleError: (e: any) => Response;
	authenticate?: (request: Request) => Promise<UserPayload | null>;
	requestLocale: () => string;
	normalizeLocale: (value: unknown) => string;
	getEnabledLanguages: () => Promise<any[]>;
	getSystemTranslations: (locale: string) => Promise<Record<string, string>>;
	loadLocalizedMaps: (scopes: string[]) => Promise<Map<string, Record<string, Record<string, string>>>>;
};

export type ConfigSettingRow = DBSetting | null;
