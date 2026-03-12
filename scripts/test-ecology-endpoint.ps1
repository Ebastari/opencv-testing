param(
  [Parameter(Mandatory=$true)]
  [string]$Endpoint,
  [string]$Password = "agungganteng"
)

$ErrorActionPreference = "Stop"

$goodBody = @{
  password = $Password
  metrics = @{
    total = 120
    sehat = 88
    merana = 22
    mati = 10
    persenSehat = 73.3
    rataTinggi = 126.4
    jenisTop = @(
      @{ name = "Sengon"; count = 70 },
      @{ name = "Mahoni"; count = 30 },
      @{ name = "Nangka"; count = 20 }
    )
  }
} | ConvertTo-Json -Depth 6

$badBody = @{
  password = "wrong-password"
  metrics = @{
    total = 120
    sehat = 88
    merana = 22
    mati = 10
    persenSehat = 73.3
    rataTinggi = 126.4
    jenisTop = @(
      @{ name = "Sengon"; count = 70 }
    )
  }
} | ConvertTo-Json -Depth 6

function Invoke-Test {
  param(
    [string]$Label,
    [string]$Body
  )

  try {
    $resp = Invoke-WebRequest -Uri $Endpoint -Method POST -ContentType "application/json" -Body $Body -UseBasicParsing -TimeoutSec 25
    Write-Host "[$Label] STATUS: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "[$Label] BODY: $($resp.Content)"
  }
  catch {
    if ($_.Exception.Response) {
      $res = $_.Exception.Response
      $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
      $content = $reader.ReadToEnd()
      Write-Host "[$Label] STATUS: $([int]$res.StatusCode)" -ForegroundColor Yellow
      Write-Host "[$Label] BODY: $content"
    }
    else {
      Write-Host "[$Label] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host "Testing endpoint: $Endpoint" -ForegroundColor Cyan
Invoke-Test -Label "GOOD_PASSWORD" -Body $goodBody
Invoke-Test -Label "BAD_PASSWORD" -Body $badBody

Write-Host "Selesai. Endpoint dianggap sehat jika GOOD=200 dan BAD=401." -ForegroundColor Cyan
