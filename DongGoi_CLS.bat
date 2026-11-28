@echo off
chcp 65001 >nul
set "BAT_FILE=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression (([System.IO.File]::ReadAllText($env:BAT_FILE, [System.Text.Encoding]::UTF8) -split ('###'+'PS'+'###'), 2)[1])"
echo.
pause
exit /b %errorlevel%

###PS###
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = 'Dong goi - Cap nhat phien ban - Tom tat CLS'

$rootDir   = Split-Path -Parent $env:BAT_FILE
$extDir    = Join-Path $rootDir 'cls-auto'
$manifest  = Join-Path $extDir  'manifest.json'
$popupHtml = Join-Path $extDir  'popup.html'
$mainJs    = Join-Path $rootDir 'js\main.js'
$zipFile   = Join-Path $rootDir 'cls-auto.zip'

function Get-SafeTempDir {
  try {
    $fso = New-Object -ComObject Scripting.FileSystemObject
    return $fso.GetFolder($env:TEMP).Path
  } catch {
    return [System.IO.Path]::GetTempPath().TrimEnd('\')
  }
}

if (-not (Test-Path -LiteralPath $manifest)) {
  Write-Host "[LOI] Khong tim thay: $manifest" -ForegroundColor Red
  Write-Host 'Hay dat DongGoi_CLS.bat o thu muc goc chua thu muc cls-auto!'
  exit 1
}

try {
  $raw = [System.IO.File]::ReadAllText($manifest, [System.Text.Encoding]::UTF8)
  $m = $raw | ConvertFrom-Json
  $curVer = [string]$m.version
  $v = [version]$curVer
  $nextBuild = if ($v.Build -lt 0) { 1 } else { $v.Build + 1 }
  $suggestVer = "$($v.Major).$($v.Minor).$nextBuild"
} catch {
  Write-Host "[LOI] Khong doc duoc truong version trong manifest.json: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host '========================================================'
Write-Host '  DONG GOI TIEN ICH TOM TAT CLS (cls-auto.zip)'
Write-Host '========================================================'
Write-Host "  Thu muc goc   : $rootDir"
Write-Host "  Phien ban cu  : v$curVer"
Write-Host "  Goi y ban moi : v$suggestVer"
Write-Host '--------------------------------------------------------'

while ($true) {
  $inputVer = Read-Host "Nhap phien ban moi (Enter = $suggestVer, hoac $curVer de dong goi lai)"
  $newVer = if ([string]::IsNullOrWhiteSpace($inputVer)) { $suggestVer } else { $inputVer.Trim() }

  if ($newVer -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host '[LOI] Dinh dang phien ban phai la X.Y.Z (vi du: 2.0.7). Vui long nhap lai.' -ForegroundColor Yellow
    continue
  }
  if ([version]$newVer -lt [version]$curVer) {
    Write-Host "[CANH BAO] Khong cho phep ha cap nguoc (v$newVer < v$curVer)! Vui long nhap lai." -ForegroundColor Yellow
    continue
  }
  break
}

$tmpZip = Join-Path $rootDir ('.cls-auto_build_' + (Get-Random) + '.zip')

try {
  Write-Host ''
  Write-Host "[1/3] Dong bo phien ban v$newVer..."
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

  $c = [System.IO.File]::ReadAllText($manifest, [System.Text.Encoding]::UTF8)
  $c = [regex]::Replace($c, '"version"\s*:\s*"[^"]+"', ('"version": "' + $newVer + '"'), 1)
  [System.IO.File]::WriteAllText($manifest, $c, $utf8NoBom)
  Write-Host '  + Da cap nhat cls-auto\manifest.json'

  if (Test-Path -LiteralPath $popupHtml) {
    $p = [System.IO.File]::ReadAllText($popupHtml, [System.Text.Encoding]::UTF8)
    $p = [regex]::Replace($p, '(<span\s+id="verText">)v?[^<]+(</span>)', ('${1}v' + $newVer + '${2}'))
    [System.IO.File]::WriteAllText($popupHtml, $p, $utf8NoBom)
    Write-Host '  + Da cap nhat cls-auto\popup.html'
  }

  if (Test-Path -LiteralPath $mainJs) {
    $j = [System.IO.File]::ReadAllText($mainJs, [System.Text.Encoding]::UTF8)
    $j = [regex]::Replace($j, '(let\s+latestVersion\s*=\s*[''"])[^''"]+([''"])', ('${1}' + $newVer + '${2}'))
    [System.IO.File]::WriteAllText($mainJs, $j, $utf8NoBom)
    Write-Host '  + Da cap nhat js\main.js'
  }

  Write-Host ''
  Write-Host '[2/3] Sao luu ban cu va dong goi cls-auto.zip...'
  $safeTemp = Get-SafeTempDir
  $bakZip = Join-Path $safeTemp 'cls-auto_backup_prev.zip'

  if ([System.IO.File]::Exists($tmpZip)) { [System.IO.File]::Delete($tmpZip) }
  if ([System.IO.File]::Exists($zipFile)) {
    try { [System.IO.File]::Copy($zipFile, $bakZip, $true) } catch {}
  }

  $items = @(Get-ChildItem -LiteralPath $extDir -Force | Where-Object {
    $_.Name -notin @('.DS_Store', 'Thumbs.db') -and $_.Extension -notin @('.bak', '.tmp', '.zip')
  })
  if ($items.Count -eq 0) { throw 'Thu muc cls-auto dang trong!' }

  Compress-Archive -LiteralPath @($items | ForEach-Object { $_.FullName }) -DestinationPath $tmpZip -CompressionLevel Optimal -Force
  if ([System.IO.File]::Exists($zipFile)) { [System.IO.File]::Delete($zipFile) }
  [System.IO.File]::Move($tmpZip, $zipFile)

  $kb = [math]::Round((Get-Item -LiteralPath $zipFile).Length / 1KB, 1)
  Write-Host "  + Dong goi thanh cong: cls-auto.zip ($kb KB)" -ForegroundColor Green

  Write-Host ''
  Write-Host '[3/3] Kiem tra day len GitHub...'
  if (-not (Test-Path -LiteralPath (Join-Path $rootDir '.git'))) {
    Write-Host '  - Khong phat hien .git trong thu muc nay, da hoan tat dong goi cuc bo.'
  } else {
    $doPush = Read-Host "Ban co muon git commit va push v$newVer len GitHub ngay khong? (y/N)"
    if ($doPush -match '^[yY]$') {
      Push-Location $rootDir
      try {
        git add -A
        git commit -m "Release CLS v$newVer"
        git push
      } finally {
        Pop-Location
      }
    } else {
      Write-Host '  - Bo qua git push. Ban co the tu day len GitHub sau.'
    }
  }

  Write-Host ''
  Write-Host '========================================================'
  Write-Host "  HOAN TAT! Phien ban hien tai: v$newVer" -ForegroundColor Green
  Write-Host "  File xuat: $zipFile"
  Write-Host '========================================================'
} catch {
  try {
    if ($tmpZip -and [System.IO.File]::Exists($tmpZip)) {
      [System.IO.File]::Delete($tmpZip)
    }
  } catch {}
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}