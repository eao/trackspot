. "$PSScriptRoot\windows-trackspot-common.ps1"

$ErrorActionPreference = 'Stop'

$pidFile = Get-TrackspotPidFile
$processes = @()

Write-Host ''
Write-Host 'Stopping Trackspot...'
Write-Host ''

if (Test-Path -LiteralPath $pidFile) {
  try {
    $pidInfo = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $processInfo = Get-TrackspotProcessById -ProcessId ([int] $pidInfo.pid)
    if (Test-TrackspotProcess -ProcessInfo $processInfo) {
      $processes += $processInfo
    } elseif ([string] $pidInfo.root -eq [string] $TrackspotRoot) {
      $process = Get-Process -Id ([int] $pidInfo.pid) -ErrorAction SilentlyContinue
      if ($process -and $process.ProcessName -eq 'node') {
        $startedAt = [datetime] $pidInfo.startedAt
        if ($process.StartTime -ge $startedAt.AddMinutes(-1)) {
          $processes += [pscustomobject] @{ ProcessId = $process.Id }
        }
      }
    }
  } catch {
    Write-Host 'The saved Trackspot process file could not be read. Looking for a matching server process instead.'
  }
}

if ($processes.Count -eq 0) {
  $processes = @(Find-TrackspotProcesses)
}

if ($processes.Count -eq 0) {
  Write-Host 'No Trackspot server process was found for this folder.'
  if (Test-Path -LiteralPath $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force
  }
  Start-Sleep -Seconds 1
  exit 0
}

foreach ($processInfo in $processes) {
  Stop-Process -Id $processInfo.ProcessId -Force
}

if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force
}

Write-Host 'Trackspot has stopped.'
Start-Sleep -Seconds 1
