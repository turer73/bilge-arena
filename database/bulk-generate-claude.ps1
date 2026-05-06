param(
  [int]$DelaySeconds = 18,
  [int]$RateLimitWait = 70,
  [int]$MaxRetry = 3
)

Set-Location F:\projelerim\bilge-arena
$env:ANTHROPIC_API_KEY = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY','User')

# Hedef batch listesi: game, category, difficulty, batchCount (count=10)
$plan = @(
  # sosyoloji eksiği: d1+1, d2+3, d3+3 (toplam +70 nominal -> ~50 net)
  @{ game='sosyal'; cat='sosyoloji'; d=1; n=1 },
  @{ game='sosyal'; cat='sosyoloji'; d=2; n=3 },
  @{ game='sosyal'; cat='sosyoloji'; d=3; n=3 },
  # cografya: d1+2, d2+3, d3+3 = +80 nominal -> ~56 net
  @{ game='sosyal'; cat='cografya'; d=1; n=2 },
  @{ game='sosyal'; cat='cografya'; d=2; n=3 },
  @{ game='sosyal'; cat='cografya'; d=3; n=3 },
  # felsefe: d1+2, d2+4, d3+4 = +100 nominal -> ~70 net
  @{ game='sosyal'; cat='felsefe'; d=1; n=2 },
  @{ game='sosyal'; cat='felsefe'; d=2; n=4 },
  @{ game='sosyal'; cat='felsefe'; d=3; n=4 },
  # tarih: d1+2, d2+4, d3+4 = +100 nominal -> ~70 net
  @{ game='sosyal'; cat='tarih'; d=1; n=2 },
  @{ game='sosyal'; cat='tarih'; d=2; n=4 },
  @{ game='sosyal'; cat='tarih'; d=3; n=4 },
  # paragraf: d1+3, d2+4, d3+4 = +110 nominal -> ~77 net
  @{ game='turkce'; cat='paragraf'; d=1; n=3 },
  @{ game='turkce'; cat='paragraf'; d=2; n=4 },
  @{ game='turkce'; cat='paragraf'; d=3; n=4 }
)

$totalBatches = ($plan | Measure-Object -Property n -Sum).Sum
Write-Host "PLAN: $($plan.Count) bucket, $totalBatches batch toplam"
Write-Host "Delay: ${DelaySeconds}s | Rate-limit wait: ${RateLimitWait}s"

$batchCounter = 0
$failCount = 0
foreach ($p in $plan) {
  for ($b = 1; $b -le $p.n; $b++) {
    $batchCounter++
    $tag = "$($p.cat) d$($p.d) $b/$($p.n) [global $batchCounter/$totalBatches]"
    Write-Host "`n--- $tag ---" -ForegroundColor Cyan
    $success = $false
    for ($retry = 0; $retry -lt $MaxRetry; $retry++) {
      $output = & node database/run-generation-claude.mjs $p.game $p.cat $p.d 10 2>&1
      $output | ForEach-Object { Write-Host $_ }
      if ($LASTEXITCODE -eq 0) { $success = $true; break }
      if ($output -match 'rate_limit_error') {
        Write-Host "Rate limit hit, ${RateLimitWait}s bekleniyor (retry $($retry+1)/$MaxRetry)..." -ForegroundColor Yellow
        Start-Sleep -Seconds $RateLimitWait
      } else {
        Write-Host "Beklenmeyen hata, retry yapma" -ForegroundColor Red
        break
      }
    }
    if (-not $success) {
      $failCount++
      Write-Host "BATCH FAIL: $tag" -ForegroundColor Red
    }
    Start-Sleep -Seconds $DelaySeconds
  }
}
Write-Host "`n=== Bitti: $batchCounter batch denendi, $failCount fail ==="
