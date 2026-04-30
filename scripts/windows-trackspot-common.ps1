Set-StrictMode -Version Latest

$Script:TrackspotRoot = [string] (Resolve-Path (Join-Path $PSScriptRoot '..'))
$Script:EnvPath = Join-Path $Script:TrackspotRoot '.env'

function Get-TrackspotEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [string] $Default = ''
  )

  if (-not (Test-Path -LiteralPath $Script:EnvPath)) {
    return $Default
  }

  $escapedName = [regex]::Escape($Name)
  $line = Get-Content -LiteralPath $Script:EnvPath |
    Where-Object { $_ -match "^\s*$escapedName\s*=" } |
    Select-Object -Last 1

  if (-not $line) {
    return $Default
  }

  $value = $line -replace "^\s*$escapedName\s*=\s*", ''
  $value = $value.Trim()
  $commentIndex = $value.IndexOf('#')
  if ($commentIndex -gt 0) {
    $value = $value.Substring(0, $commentIndex).Trim()
  }

  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  if ($value) {
    return $value
  }
  return $Default
}

function Resolve-TrackspotPath {
  param(
    [Parameter(Mandatory = $true)]
    [string] $PathValue
  )

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return [System.IO.Path]::GetFullPath($PathValue)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $Script:TrackspotRoot $PathValue))
}

function Get-TrackspotPort {
  return Get-TrackspotEnvValue -Name 'PORT' -Default '1060'
}

function Get-TrackspotUrl {
  $port = Get-TrackspotPort
  $hostValue = (Get-TrackspotEnvValue -Name 'HOST' -Default '0.0.0.0').Trim()

  if ($hostValue.Contains('://')) {
    $hostValue = ([uri] $hostValue).Host
  }

  $hostValue = $hostValue.Trim('[', ']')
  if (
    -not $hostValue -or
    $hostValue -eq '0.0.0.0' -or
    $hostValue -eq '::' -or
    $hostValue -eq '*'
  ) {
    $hostValue = 'localhost'
  }

  if ($hostValue.Contains(':') -and -not $hostValue.StartsWith('[')) {
    $hostValue = "[$hostValue]"
  }

  return "http://$hostValue`:$port"
}

function Get-TrackspotDataDir {
  $dataDir = Get-TrackspotEnvValue -Name 'DATA_DIR' -Default './data'
  return Resolve-TrackspotPath -PathValue $dataDir
}

function Get-TrackspotPidFile {
  return Join-Path (Get-TrackspotDataDir) 'trackspot-server.pid.json'
}

function Get-TrackspotLogFile {
  return Join-Path (Get-TrackspotDataDir) 'trackspot-server.log'
}

function Get-TrackspotErrorLogFile {
  return Join-Path (Get-TrackspotDataDir) 'trackspot-server-error.log'
}

function Get-TrackspotBundledNodePath {
  return Join-Path $Script:TrackspotRoot 'runtime\node\node.exe'
}

function Get-TrackspotBundledNpmPath {
  return Join-Path $Script:TrackspotRoot 'runtime\node\npm.cmd'
}

function Get-TrackspotRuntime {
  $bundledNodePath = Get-TrackspotBundledNodePath
  $bundledNpmPath = Get-TrackspotBundledNpmPath

  if (Test-Path -LiteralPath $bundledNodePath) {
    return [pscustomobject] @{
      NodePath = $bundledNodePath
      NpmPath = if (Test-Path -LiteralPath $bundledNpmPath) { $bundledNpmPath } else { $null }
      IsBundled = $true
      Description = 'bundled Node.js runtime'
    }
  }

  try {
    $nodeCommand = Get-Command node -ErrorAction Stop
  } catch {
    return $null
  }

  $npmPath = $null
  try {
    $npmPath = (Get-Command npm -ErrorAction Stop).Source
  } catch {
    $npmPath = $null
  }

  return [pscustomobject] @{
    NodePath = $nodeCommand.Source
    NpmPath = $npmPath
    IsBundled = $false
    Description = 'installed Node.js'
  }
}

function Test-TrackspotServer {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Url
  )

  $client = $null
  $stream = $null

  try {
    $uri = [uri] $Url
    $port = if ($uri.Port -gt 0) { $uri.Port } else { 80 }
    $client = [System.Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect($uri.Host, $port, $null, $null)

    if (-not $connect.AsyncWaitHandle.WaitOne(700, $false)) {
      $client.Close()
      return $false
    }

    $client.EndConnect($connect)
    $client.ReceiveTimeout = 700
    $client.SendTimeout = 700
    $stream = $client.GetStream()

    $request = "GET / HTTP/1.1`r`nHost: $($uri.Authority)`r`nConnection: close`r`n`r`n"
    $requestBytes = [System.Text.Encoding]::ASCII.GetBytes($request)
    $stream.Write($requestBytes, 0, $requestBytes.Length)

    $buffer = New-Object byte[] 8192
    $builder = [System.Text.StringBuilder]::new()

    for ($attempt = 0; $attempt -lt 4; $attempt += 1) {
      $count = $stream.Read($buffer, 0, $buffer.Length)
      if ($count -le 0) {
        break
      }
      $null = $builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $count))
      if ($builder.ToString() -match '<title>\s*Trackspot\s*</title>') {
        return $true
      }
    }

    return $false
  } catch {
    return $false
  } finally {
    if ($stream) {
      $stream.Dispose()
    }
    if ($client) {
      $client.Close()
    }
  }
}

function Open-TrackspotBrowser {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Url
  )

  Start-Process $Url | Out-Null
}

function Get-TrackspotProcessById {
  param(
    [Parameter(Mandatory = $true)]
    [int] $ProcessId
  )

  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  } catch {
    return $null
  }
}

function Test-TrackspotProcess {
  param(
    [Parameter(Mandatory = $true)]
    $ProcessInfo
  )

  if (-not $ProcessInfo) {
    return $false
  }

  $serverPath = Join-Path $Script:TrackspotRoot 'server\index.js'
  $commandLine = [string] $ProcessInfo.CommandLine
  return $commandLine.Contains($serverPath)
}

function Find-TrackspotProcesses {
  $serverPath = Join-Path $Script:TrackspotRoot 'server\index.js'
  try {
    return Get-CimInstance Win32_Process -ErrorAction Stop |
      Where-Object { ([string] $_.CommandLine).Contains($serverPath) }
  } catch {
    return @()
  }
}
