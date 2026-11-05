<#
.SYNOPSIS
Verifies DOMQL's package as consumers receive it.

.DESCRIPTION
Checks that the NuGet package and its symbols hold exactly the files their lists in scripts/packages name. Then it installs the package into a web application outside the repository, from a local feed holding the package and nuget.org alone, publishes the application, and has its published domql.js resolve a query.

.PARAMETER Directory
The directory holding the packages, and nothing else.

.PARAMETER Version
The version every package carries.

.EXAMPLE
./scripts/Test-Packages.ps1 -Directory artifacts -Version 1.0.0-preview.1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Directory,
    [Parameter(Mandatory)] [string] $Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$packages = Join-Path $PSScriptRoot 'packages'
$Directory = (Resolve-Path $Directory).Path

# Each package the release holds, by its file name, with the list of the files it holds.
$expected = [ordered]@{
    "formaui-net.DOMQL.$Version.nupkg"  = 'nuget.files'
    "formaui-net.DOMQL.$Version.snupkg" = 'nuget-symbols.files'
}

# The paths a NuGet package holds, as its archive holds them.
function Get-PackageFile {
    param([Parameter(Mandatory)] [string] $Path)

    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)

    try {
        $archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') } | ForEach-Object { [uri]::UnescapeDataString($_.FullName) }
    }
    finally {
        $archive.Dispose()
    }
}

# Runs a command, and fails with what it was doing where the command fails.
function Invoke-Checked {
    param([Parameter(Mandatory)] [string] $Doing, [Parameter(Mandatory)] [scriptblock] $Command)

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Doing failed."
    }
}

Write-Host 'Checking the packages hold the files their lists name'
$present = @(Get-ChildItem -LiteralPath $Directory -File | ForEach-Object Name)
$unexpected = @($present | Where-Object { -not $expected.Contains($_) })
$missing = @($expected.Keys | Where-Object { $present -cnotcontains $_ })
if ($unexpected.Count -gt 0 -or $missing.Count -gt 0) {
    throw "$Directory holds $($present -join ', '), where it should hold $($expected.Keys -join ', ')."
}

foreach ($name in $expected.Keys) {
    $listed = @(Get-Content -LiteralPath (Join-Path $packages $expected[$name]) | Where-Object { $_ -and -not $_.StartsWith('#') })
    $held = @(Get-PackageFile -Path (Join-Path $Directory $name))
    $absent = @($listed | Where-Object { $held -cnotcontains $_ })
    $extra = @($held | Where-Object { $listed -cnotcontains $_ })

    if ($absent.Count -gt 0 -or $extra.Count -gt 0) {
        throw "$name doesn't hold the files scripts/packages/$($expected[$name]) lists. Missing: $($absent -join ', '). Not listed: $($extra -join ', ')."
    }

    Write-Host "  $name holds the $($listed.Count) files its list names"
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) "domql-packages-$([guid]::NewGuid().ToString('N'))"
$previousPackages = $env:NUGET_PACKAGES

try {
    # The NuGet package, restored into a web application from the local feed and nuget.org into packages of its own, so no cached copy of the same version stands in for it. The consumer takes its own files alone, whatever an IDE built beside them.
    Write-Host 'Installing the NuGet package into a consumer'
    $consumer = New-Item -ItemType Directory -Path (Join-Path $work 'nuget')
    Get-ChildItem -LiteralPath (Join-Path $packages 'nuget-consumer') -File | Copy-Item -Destination $consumer
    Copy-Item -LiteralPath (Join-Path $root 'nuget' 'global.json') -Destination $consumer
    $feed = [System.Security.SecurityElement]::Escape($Directory)
    Set-Content -LiteralPath (Join-Path $consumer 'NuGet.config') -Value @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <packageSources>
        <clear />
        <add key="release" value="$feed" />
        <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    </packageSources>
</configuration>
"@
    $env:NUGET_PACKAGES = Join-Path $work 'nuget-packages'

    Push-Location $consumer
    try {
        $published = Join-Path $consumer 'published'
        Invoke-Checked 'Publishing an application with the NuGet package' { dotnet publish Consumer.csproj -c Release -o $published -nologo "-p:DomqlVersion=$Version" }

        $served = Join-Path $published 'wwwroot' '_content' 'domql'
        foreach ($file in 'domql.js', 'domql.d.ts') {
            if (-not (Test-Path -LiteralPath (Join-Path $served $file))) {
                throw "The published application doesn't serve _content/domql/$file."
            }
        }

        Invoke-Checked 'Resolving with the published domql.js' { node resolve.mjs (Join-Path $served 'domql.js') $Version }
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:NUGET_PACKAGES = $previousPackages
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "The packages of $Version are verified as consumers receive them."
