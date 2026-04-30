param(
  [string] $NodeRuntimePath = '',
  [string] $NodeZipPath = '',
  [string] $OutputRoot = '',
  [string] $PackageName = 'Trackspot-Windows-x64',
  [switch] $SkipDependencyInstall,
  [switch] $KeepExpandedPackage,
  [switch] $KeepFullNodeRuntime
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $repoRoot 'dist'
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$packageDir = Join-Path $OutputRoot $PackageName
$zipPath = Join-Path $OutputRoot "$PackageName.zip"
$runtimeDir = Join-Path $packageDir 'runtime\node'

function Write-Step {
  param([Parameter(Mandatory = $true)] [string] $Message)
  Write-Host ''
  Write-Host "==> $Message"
}

function Assert-PathInside {
  param(
    [Parameter(Mandatory = $true)] [string] $ChildPath,
    [Parameter(Mandatory = $true)] [string] $ParentPath
  )

  $child = [System.IO.Path]::GetFullPath($ChildPath).TrimEnd('\', '/')
  $parent = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd('\', '/')
  if (-not ($child.Equals($parent, [System.StringComparison]::OrdinalIgnoreCase) -or
      $child.StartsWith("$parent\", [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Refusing to operate on path outside expected directory: $child"
  }
}

function Remove-PathInside {
  param(
    [Parameter(Mandatory = $true)] [string] $PathToRemove,
    [Parameter(Mandatory = $true)] [string] $AllowedParent
  )

  if (Test-Path -LiteralPath $PathToRemove) {
    Assert-PathInside -ChildPath $PathToRemove -ParentPath $AllowedParent
    Remove-Item -LiteralPath $PathToRemove -Recurse -Force
  }
}

function Resolve-NodeRuntimeDirectory {
  if ($NodeRuntimePath) {
    $resolvedRuntimePath = [System.IO.Path]::GetFullPath($NodeRuntimePath)
    if (-not (Test-Path -LiteralPath $resolvedRuntimePath)) {
      throw "Node runtime path not found: $resolvedRuntimePath"
    }

    $item = Get-Item -LiteralPath $resolvedRuntimePath
    if (-not $item.PSIsContainer) {
      $resolvedRuntimePath = Split-Path -Parent $resolvedRuntimePath
    }

    if (-not (Test-Path -LiteralPath (Join-Path $resolvedRuntimePath 'node.exe'))) {
      throw "Node runtime path does not contain node.exe: $resolvedRuntimePath"
    }

    return $resolvedRuntimePath
  }

  $repoRuntimePath = Join-Path $repoRoot 'runtime\node'
  if (Test-Path -LiteralPath (Join-Path $repoRuntimePath 'node.exe')) {
    return $repoRuntimePath
  }

  return $null
}

function Expand-NodeZip {
  param([Parameter(Mandatory = $true)] [string] $ZipPath)

  $resolvedZipPath = [System.IO.Path]::GetFullPath($ZipPath)
  if (-not (Test-Path -LiteralPath $resolvedZipPath)) {
    throw "Node ZIP not found: $resolvedZipPath"
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "trackspot-node-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  Expand-Archive -LiteralPath $resolvedZipPath -DestinationPath $tempRoot -Force

  $nodeExe = Get-ChildItem -LiteralPath $tempRoot -Recurse -Filter 'node.exe' |
    Select-Object -First 1

  if (-not $nodeExe) {
    throw "Could not find node.exe inside $resolvedZipPath"
  }

  return @{
    TempRoot = $tempRoot
    RuntimeDir = $nodeExe.Directory.FullName
  }
}

function Copy-RequiredItem {
  param([Parameter(Mandatory = $true)] [string] $RelativePath)

  $source = Join-Path $repoRoot $RelativePath
  $destination = Join-Path $packageDir $RelativePath

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required package item not found: $RelativePath"
  }

  $parent = Split-Path -Parent $destination
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

function Trim-PackagedNodeRuntime {
  param(
    [Parameter(Mandatory = $true)] [string] $RuntimePath
  )

  $keepNames = @(
    'node.exe',
    'LICENSE',
    'README.md',
    'CHANGELOG.md'
  )

  Get-ChildItem -LiteralPath $RuntimePath -Force | ForEach-Object {
    if ($keepNames -notcontains $_.Name) {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
  }
}

$expandedNode = $null

try {
  Write-Step 'Preparing package folder'
  New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
  Remove-PathInside -PathToRemove $packageDir -AllowedParent $OutputRoot
  if (Test-Path -LiteralPath $zipPath) {
    Assert-PathInside -ChildPath $zipPath -ParentPath $OutputRoot
    Remove-Item -LiteralPath $zipPath -Force
  }
  New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

  Write-Step 'Copying Trackspot app files'
  $requiredItems = @(
    'Windows - Start Trackspot.bat',
    'Windows - Stop Trackspot.bat',
    'package.json',
    'package-lock.json',
    '.env.example',
    'README.md',
    'CONFIG.md',
    'LICENSE.md',
    'ASSET_CREDITS.md',
    'manifest.json',
    'trackspot-spicetify.js',
    'public',
    'readme-files',
    'server',
    'spicetify-extension-files',
    'spicetify-extras',
    'styles'
  )

  foreach ($item in $requiredItems) {
    Copy-RequiredItem -RelativePath $item
  }

  New-Item -ItemType Directory -Force -Path (Join-Path $packageDir 'scripts') | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\windows-trackspot-common.ps1') -Destination (Join-Path $packageDir 'scripts\windows-trackspot-common.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\windows-start-trackspot.ps1') -Destination (Join-Path $packageDir 'scripts\windows-start-trackspot.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\windows-stop-trackspot.ps1') -Destination (Join-Path $packageDir 'scripts\windows-stop-trackspot.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\sync-color-scheme-presets.js') -Destination (Join-Path $packageDir 'scripts\sync-color-scheme-presets.js') -Force

  @'
Trackspot Windows Portable

Double-click "Windows - Start Trackspot.bat" to start Trackspot.
Double-click "Windows - Stop Trackspot.bat" to stop Trackspot.

This package includes a portable Node.js runtime under runtime\node, so
Windows users do not need to install Node.js separately.
'@ | Set-Content -LiteralPath (Join-Path $packageDir 'WINDOWS-PORTABLE-README.txt') -Encoding UTF8

  Write-Step 'Copying portable Node.js runtime'
  if ($NodeZipPath) {
    $expandedNode = Expand-NodeZip -ZipPath $NodeZipPath
    $nodeSourceDir = $expandedNode.RuntimeDir
  } else {
    $nodeSourceDir = Resolve-NodeRuntimeDirectory
  }

  if (-not $nodeSourceDir) {
    throw @'
No portable Node.js runtime was found.

Provide one of:
  -NodeRuntimePath "C:\path\to\node-v24.x-win-x64"
  -NodeZipPath "C:\path\to\node-v24.x-win-x64.zip"

You can also place Node at runtime\node before running this script.
'@
  }

  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  Get-ChildItem -LiteralPath $nodeSourceDir -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $runtimeDir -Recurse -Force
  }

  $nodeExe = Join-Path $runtimeDir 'node.exe'
  $npmCmd = Join-Path $runtimeDir 'npm.cmd'
  if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw "Packaged runtime is missing node.exe: $nodeExe"
  }
  if (-not (Test-Path -LiteralPath $npmCmd)) {
    throw "Packaged runtime is missing npm.cmd: $npmCmd"
  }

  Write-Step 'Syncing generated style data'
  & $nodeExe (Join-Path $packageDir 'scripts\sync-color-scheme-presets.js')
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  if ($SkipDependencyInstall) {
    Write-Step 'Skipping dependency install'
  } else {
    Write-Step 'Installing production dependencies'
    Push-Location $packageDir
    try {
      $previousPath = $env:Path
      $env:Path = "$runtimeDir;$env:Path"
      & $npmCmd ci --omit=dev
      if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
      }
    } finally {
      $env:Path = $previousPath
      Pop-Location
    }
  }

  if ($KeepFullNodeRuntime) {
    Write-Step 'Keeping full portable Node.js runtime'
  } else {
    Write-Step 'Trimming portable Node.js runtime for release'
    Trim-PackagedNodeRuntime -RuntimePath $runtimeDir
  }

  Write-Step 'Creating ZIP archive'
  Compress-Archive -LiteralPath $packageDir -DestinationPath $zipPath -Force

  if (-not $KeepExpandedPackage) {
    Remove-PathInside -PathToRemove $packageDir -AllowedParent $OutputRoot
  }

  Write-Host ''
  Write-Host "Created $zipPath"
} finally {
  if ($expandedNode -and $expandedNode.TempRoot) {
    Remove-PathInside -PathToRemove $expandedNode.TempRoot -AllowedParent ([System.IO.Path]::GetTempPath())
  }
}
