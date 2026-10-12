$ErrorActionPreference = 'Stop'
$cfg = Get-Content "$env:APPDATA\xdg.config\.wrangler\config\default.toml" -Raw
$t = [regex]::Match($cfg, 'oauth_token = "([^"]+)"').Groups[1].Value
$r = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/accounts/974e77b1692d56d57b27a1cef7fcc08c/pages/projects/jiance' -Headers @{ Authorization = "Bearer $t" } -TimeoutSec 30
$cd = $r.result.canonical_deployment
Write-Output ("deployment id: " + $cd.id)
Write-Output ("d1_databases: " + ($cd.d1_databases | ConvertTo-Json -Depth 5))
Write-Output ("r2_buckets: " + ($cd.r2_buckets | ConvertTo-Json -Depth 5))
$dc = $r.result.deployment_configs
if ($dc) {
  Write-Output ("deployment_configs.production.d1_databases: " + ($dc.production.d1_databases | ConvertTo-Json -Depth 5))
}
