# Generate SQL from fab-verify.plugin.json and import it into local D1.
# Usage: pwsh .\import-fab-verify.ps1
# Optional --remote imports into the remote D1: pwsh .\import-fab-verify.ps1 --remote

$remote = $args -contains '--remote'

$j = Get-Content "$PSScriptRoot\fab-verify.plugin.json" -Raw | ConvertFrom-Json

function EscSql($s) { return [string]$s -replace "'", "''" }
function PluginText($key, $locale, $fallback) {
    $entry = $j.i18n.PSObject.Properties[$key]
    if ($entry -and $entry.Value) {
        $value = $entry.Value.PSObject.Properties[$locale]
        if ($value -and $value.Value) { return [string]$value.Value }
    }
    return $fallback
}

$id          = 'fab-verify'
$name        = EscSql $j.name
$desc        = EscSql $j.description
$ver         = EscSql $j.version
$enabled     = [int]$j.enabled
$config      = EscSql ($j.config      | ConvertTo-Json -Compress -Depth 10)
$type        = EscSql $j.type
$css         = EscSql $j.css
$js          = EscSql $j.js
$schema      = EscSql ($j.configSchema | ConvertTo-Json -Compress -Depth 10)
$i18n        = EscSql ($j.i18n         | ConvertTo-Json -Compress -Depth 10)
$badgeSuffix = EscSql (" " + (PluginText 'badge.verifiedBuyer' 'zh-CN' '认证买家'))
$badgeDesc   = EscSql (PluginText 'badge.defaultDescription' 'zh-CN' 'FAB Marketplace 购买认证')

$sql = @"
INSERT INTO plugins (id, slug, name, description, version, enabled, config, type, css, html, js, config_schema, i18n, updated_at)
VALUES ('$id', '$id', '$name', '$desc', '$ver', $enabled, '$config', '$type', '$css', '', '$js', '$schema', '$i18n', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  name         = excluded.name,
  description  = excluded.description,
  version      = excluded.version,
  css          = excluded.css,
  js           = excluded.js,
  config_schema= excluded.config_schema,
  i18n         = excluded.i18n,
  config       = CASE
                   WHEN plugins.config IS NULL OR plugins.config = '{}' OR plugins.config = '' THEN excluded.config
                   ELSE json_set(
                     plugins.config,
                     '$.purchase_url',
                     COALESCE(NULLIF(json_extract(plugins.config, '$.purchase_url'), ''), json_extract(excluded.config, '$.purchase_url'))
                   )
                 END,
  updated_at   = CURRENT_TIMESTAMP;
"@

$sql += @"

DELETE FROM badge_definitions
 WHERE plugin_id = '$id'
   AND badge_key NOT IN (
     SELECT 'fab-' || trim(lower(replace(replace(replace(json_extract(value, '$.key'), ' ', '-'), '_', '-'), '.', '-')), '-')
       FROM plugins, json_each(json_extract(plugins.config, '$.products'))
      WHERE plugins.id = '$id'
   );

INSERT INTO badge_definitions (plugin_id, badge_key, label, description, icon, color, enabled)
SELECT '$id',
       'fab-' || trim(lower(replace(replace(replace(json_extract(value, '$.key'), ' ', '-'), '_', '-'), '.', '-')), '-'),
       COALESCE(NULLIF(json_extract(value, '$.name'), ''), json_extract(value, '$.key')) || '$badgeSuffix',
       COALESCE(NULLIF(json_extract(value, '$.description'), ''), '$badgeDesc'),
       COALESCE(NULLIF(json_extract(value, '$.icon'), ''), '/assets/category-icons/general.svg'),
       COALESCE(NULLIF(json_extract(value, '$.color'), ''), '#3fb950'),
       1
  FROM plugins, json_each(json_extract(plugins.config, '$.products'))
 WHERE plugins.id = '$id'
   AND COALESCE(NULLIF(json_extract(value, '$.key'), ''), '') != ''
ON CONFLICT(plugin_id, badge_key) DO UPDATE SET
  label = excluded.label,
  description = excluded.description,
  icon = excluded.icon,
  color = excluded.color,
  enabled = 1;
"@

$sqlFile = Join-Path $PSScriptRoot 'fab-verify-tmp.sql'
$sql | Out-File -FilePath $sqlFile -Encoding utf8NoBOM

Write-Host "Importing fab-verify plugin into D1..."

if ($remote) {
    npx wrangler d1 execute forumforge-db --remote --yes --file=$sqlFile
} else {
    npx wrangler d1 execute forumforge-db --local --yes --file=$sqlFile
}

Remove-Item $sqlFile -ErrorAction SilentlyContinue
Write-Host "Done. Visit /admin/plugins/fab-verify/editor to see the source code."
