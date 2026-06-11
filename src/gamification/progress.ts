export type LevelSettings = {
	maxLevel: number;
	baseExperience: number;
	growth: number;
};

export const DEFAULT_LEVEL_SETTINGS: LevelSettings = {
	maxLevel: 20,
	baseExperience: 100,
	growth: 1.6,
};

export const LEVEL_SETTING_KEYS = {
	maxLevel: 'level_max',
	baseExperience: 'level_base_experience',
	growth: 'level_growth_multiplier',
} as const;

export function normalizeLevelSettings(input?: Partial<LevelSettings> | null): LevelSettings {
	const maxLevel = Math.max(1, Math.min(999, Math.floor(Number(input?.maxLevel ?? DEFAULT_LEVEL_SETTINGS.maxLevel) || DEFAULT_LEVEL_SETTINGS.maxLevel)));
	const baseExperience = Math.max(1, Math.floor(Number(input?.baseExperience ?? DEFAULT_LEVEL_SETTINGS.baseExperience) || DEFAULT_LEVEL_SETTINGS.baseExperience));
	const growth = Math.max(1, Math.min(10, Number(input?.growth ?? DEFAULT_LEVEL_SETTINGS.growth) || DEFAULT_LEVEL_SETTINGS.growth));
	return { maxLevel, baseExperience, growth };
}

export function nextLevelExperience(level: unknown, settings?: Partial<LevelSettings> | null): number {
	const config = normalizeLevelSettings(settings);
	const current = Math.max(1, Math.floor(Number(level || 1)));
	if (current >= config.maxLevel) return cumulativeExperienceForLevel(config.maxLevel, config);
	return cumulativeExperienceForLevel(current + 1, config);
}

export function levelFromExperience(value: unknown, settings?: Partial<LevelSettings> | null): number {
	const config = normalizeLevelSettings(settings);
	const xp = Math.max(0, Number(value || 0));
	let level = 1;
	for (let target = 2; target <= config.maxLevel; target += 1) {
		if (xp < cumulativeExperienceForLevel(target, config)) break;
		level = target;
	}
	return Math.max(1, Math.min(config.maxLevel, level));
}

function cumulativeExperienceForLevel(level: number, settings: LevelSettings): number {
	const target = Math.max(1, Math.floor(level));
	if (target <= 1) return 0;
	let total = 0;
	for (let step = 2; step <= target; step += 1) {
		total += Math.round(settings.baseExperience * Math.pow(settings.growth, step - 2));
	}
	return total;
}

export const PROGRESS_REWARD_KEYS = {
	checkin: { points: 'reward_checkin_points', experience: 'reward_checkin_experience' },
	create_post: { points: 'reward_post_points', experience: 'reward_post_experience' },
	reply_post: { points: 'reward_reply_points', experience: 'reward_reply_experience' },
	post_replied: { points: 'reward_post_replied_points', experience: 'reward_post_replied_experience' },
} as const;

export type ProgressSource = keyof typeof PROGRESS_REWARD_KEYS;

export const DEFAULT_PROGRESS_REWARDS: Record<ProgressSource, { points: number; experience: number }> = {
	checkin: { points: 10, experience: 20 },
	create_post: { points: 5, experience: 20 },
	reply_post: { points: 1, experience: 5 },
	post_replied: { points: 1, experience: 3 },
};
