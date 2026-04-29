param(
  [string]$WorkerName = "montana-ecology-summary",
  [string]$AllowedOrigin = "https://camera.montana-tech.info",
  [string]$AnalysisPassword = "agungganteng"
)

$ErrorActionPreference = "Stop"

Write-Host "== Montana Cloudflare Worker Deploy ==" -ForegroundColor Cyan

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  Write-Host "Wrangler belum terpasang. Install dulu:" -ForegroundColor Yellow
  Write-Host "npm i -g wrangler" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path "serverless/cloudflare-worker/wrangler.toml")) {
  Write-Host "File worker tidak ditemukan: serverless/cloudflare-worker/wrangler.toml" -ForegroundColor Red
  exit 1
}

Push-Location "serverless/cloudflare-worker"
try {
  Write-Host "Login Cloudflare (jika belum)..." -ForegroundColor Gray
  wrangler whoami *> $null
  if ($LASTEXITCODE -ne 0) {
    wrangler login
  }

  # Ensure wrangler.toml has expected defaults for this deployment context.
  $tomlPath = "wrangler.toml"
  $toml = Get-Content $tomlPath -Raw
  $toml = [regex]::Replace($toml, 'name\s*=\s*"[^"]+"', "name = \"$WorkerName\"")
  $toml = [regex]::Replace($toml, 'ALLOWED_ORIGIN\s*=\s*"[^"]+"', "ALLOWED_ORIGIN = \"$AllowedOrigin\"")
  Set-Content -Path $tomlPath -Value $toml -Encoding UTF8

  if (-not $env:DEEPSEEK_API_KEY) {
    Write-Host "Env DEEPSEEK_API_KEY belum ada di shell ini." -ForegroundColor Yellow
    Write-Host "Contoh: `$env:DEEPSEEK_API_KEY='sk-xxxx'" -ForegroundColor Yellow
    exit 1
  }

  Write-Host "Set secret DEEPSEEK_API_KEY..." -ForegroundColor Gray
  $env:DEEPSEEK_API_KEY | wrangler secret put DEEPSEEK_API_KEY

  Write-Host "Set secret ANALYSIS_PASSWORD..." -ForegroundColor Gray
  $AnalysisPassword | wrangler secret put ANALYSIS_PASSWORD

  Write-Host "Deploy worker..." -ForegroundColor Gray
  wrangler deploy

  Write-Host "Deploy selesai. Catat URL workers.dev dari output di atas." -ForegroundColor Green
  Write-Host "Lalu set env frontend: VITE_ECOLOGY_SUMMARY_API_URL=https://<worker-url>/api/ecology-summary" -ForegroundColor Green
}
finally {
  Pop-Location
}
