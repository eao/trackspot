param(
  [switch] $NoBrowser
)

. "$PSScriptRoot\windows-trackspot-common.ps1"

$ErrorActionPreference = 'Stop'

function Exit-WithError {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Message
  )

  Write-Host $Message
  exit 1
}

$url = Get-TrackspotUrl
$dataDir = Get-TrackspotDataDir
$pidFile = Get-TrackspotPidFile
$logFile = Get-TrackspotLogFile
$errorLogFile = Get-TrackspotErrorLogFile

Write-Host ''
Write-Host 'Starting Trackspot...'
Write-Host ''

if (Test-TrackspotServer -Url $url) {
  Write-Host "Trackspot is already running at $url"
  if (-not $NoBrowser) {
    Open-TrackspotBrowser -Url $url
  }
  exit 0
}

$packageJsonPath = Join-Path $TrackspotRoot 'package.json'
if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  Exit-WithError 'package.json was not found. Make sure this file is still inside the extracted Trackspot folder.'
}

$runtime = Get-TrackspotRuntime
if (-not $runtime) {
  Exit-WithError @'
Node.js was not found.

Use the Trackspot Windows portable ZIP, or install the Windows Installer from:
https://nodejs.org/en/download

After installing Node.js, double-click this file again.
'@
}

$nodeVersion = & $runtime.NodePath -p "process.versions.node"
$parts = $nodeVersion.Split('.') | ForEach-Object { [int] $_ }
$isSupportedNode = (($parts[0] -gt 20) -or ($parts[0] -eq 20 -and $parts[1] -ge 19)) -and $parts[0] -lt 26

if (-not $isSupportedNode) {
  $runtimeLabel = if ($runtime.IsBundled) { 'bundled Node.js runtime' } else { 'installed Node.js' }
  Exit-WithError @"
Trackspot needs Node.js version 20.19 or newer, but below 26.
The $runtimeLabel is version $nodeVersion.

Use a Trackspot release with a supported runtime, or install the current LTS version from:
https://nodejs.org/en/download
"@
}

if (-not (Test-Path -LiteralPath (Join-Path $TrackspotRoot 'node_modules'))) {
  if (-not $runtime.NpmPath) {
    $installHint = if ($runtime.IsBundled) {
      'This bundled Node.js runtime does not include npm.cmd.'
    } else {
      'npm was not found. npm normally installs with Node.js.'
    }

    Exit-WithError @"
Trackspot dependencies are not installed.

$installHint

Use the Trackspot Windows portable ZIP, or install Node.js with npm and double-click this file again.
"@
  }

  Write-Host 'Installing Trackspot dependencies. This may take a few minutes the first time.'
  Write-Host "Using $($runtime.Description)."
  Write-Host ''
  Push-Location $TrackspotRoot
  try {
    & $runtime.NpmPath install
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$serverPath = Join-Path $TrackspotRoot 'server\index.js'
$process = Start-Process `
  -FilePath $runtime.NodePath `
  -ArgumentList @($serverPath) `
  -WorkingDirectory $TrackspotRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errorLogFile `
  -PassThru

@{
  pid = $process.Id
  root = [string] $TrackspotRoot
  url = $url
  nodePath = $runtime.NodePath
  bundledRuntime = $runtime.IsBundled
  startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

$started = $false
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  if (Test-TrackspotServer -Url $url) {
    $started = $true
    break
  }
  if ($process.HasExited) {
    break
  }
}

if (-not $started) {
  Write-Host 'Trackspot was started, but it did not respond in time.'
  Write-Host "Log: $logFile"
  Write-Host "Error log: $errorLogFile"
  exit 1
}

Write-Host "Trackspot is running at $url"
Write-Host "Using $($runtime.Description)."
Write-Host 'Use "Windows - Stop Trackspot.bat" when you want to stop the server.'
if (-not $NoBrowser) {
  Open-TrackspotBrowser -Url $url
}
Start-Sleep -Seconds 1
