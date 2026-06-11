-- Keep existing installations aligned with the new admin label.
UPDATE translations
SET value = '翻译管理'
WHERE scope = 'system' AND key = 'admin.i18n.title' AND locale = 'zh-CN';

UPDATE translations
SET value = 'Translation management'
WHERE scope = 'system' AND key = 'admin.i18n.title' AND locale = 'en-US';
