<#
.SYNOPSIS
Runs the script tests, bundles DOMQL, builds the package project, and checks its formatting.

.PARAMETER Clean
Removes every build output first, so the build starts from nothing.

.PARAMETER Browser
Also runs the tests that need a real browser's layout, in headless Chromium, and those of what browser engines decide differently in Chromium, Firefox and WebKit, each installed first if it is not.

.PARAMETER Full
Runs the full gate: the gate, then the npm package, the NuGet package and its symbols packed into artifacts/ as a release ships them, each checked against the files its list names and installed into a consumer outside the repository, by scripts/Test-Packages.ps1. A release's full gate runs with -Browser too.

.NOTES
DOMQL builds against Nexo's npm package, at the release package.json declares and the lock installs. Set NEXO_SOURCE to a Nexo checkout to build against that checkout's working tree instead, linked in the package's place, for a change made in both repositories. The link test reads Nexo's documents at the release's tag from Nexo's checkout: the one NEXO_SOURCE names, or formaui-net.Nexo beside this one, fetching the tag where the checkout lacks it.

.EXAMPLE
./build.ps1 -Clean

.EXAMPLE
./build.ps1 -Browser

.EXAMPLE
./build.ps1 -Browser -Full
#>
[CmdletBinding()]
param(
    [switch] $Clean,
    [switch] $Browser,
    [switch] $Full
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$nuget = Join-Path $root 'nuget'
$solution = 'Forma.DOMQL.slnx'
$tests = Join-Path $root 'tests'
$artifacts = Join-Path $root 'artifacts'
$nodeModules = Join-Path $root 'node_modules'
$nexoInstalled = Join-Path $nodeModules '@formaui-net' 'nexo'
$nexoCheckout = if ($env:NEXO_SOURCE) { (Resolve-Path -LiteralPath $env:NEXO_SOURCE).Path } else { Join-Path (Split-Path $root -Parent) 'formaui-net.Nexo' }

# The Nexo release DOMQL builds against: the version the lock installs, which package.json declares as the lowest it works with.
$nexoRelease = (Get-Content (Join-Path $root 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable).packages['node_modules/@formaui-net/nexo'].version
$nexoTag = "v$nexoRelease"

# Removes node_modules, a link inside it first, so removing it never reaches into the checkout the link leads to.
function Remove-NodeModules {
    $link = Get-Item -LiteralPath $nexoInstalled -Force -ErrorAction SilentlyContinue
    if ($link -and $link.LinkType) {
        $link.Delete()
    }

    Remove-Item -LiteralPath $nodeModules -Recurse -Force
}

if ($Clean) {
    # The package project's bin and obj, its bundle, and the packed artifacts, which dotnet clean alone leaves behind.
    Write-Host 'Cleaning'
    Get-ChildItem $nuget -Directory -Recurse -Include 'bin', 'obj', 'wwwroot' | Remove-Item -Recurse -Force
    if (Test-Path $artifacts) {
        Remove-Item $artifacts -Recurse -Force
    }
}

# Nexo as DOMQL builds against it: the npm package the lock installs, or, with NEXO_SOURCE set, a link in its place to that checkout's working tree. An installation that is neither is made again.
$installed = Get-Item -LiteralPath $nexoInstalled -Force -ErrorAction SilentlyContinue
# A link's target is relative on Linux and macOS and absolute on Windows, so it resolves against the link's own folder.
$linkedToSource = $env:NEXO_SOURCE -and $installed -and $installed.LinkType -and ([System.IO.Path]::GetFullPath($installed.Target, (Split-Path $installed.FullName -Parent)) -eq [System.IO.Path]::GetFullPath($nexoCheckout))
$installedRelease = $installed -and -not $installed.LinkType -and ((Get-Content (Join-Path $nexoInstalled 'package.json') -Raw | ConvertFrom-Json).version -eq $nexoRelease)
if ((Test-Path $nodeModules) -and -not $linkedToSource -and -not $installedRelease) {
    Remove-NodeModules
}

# The tree, or the link to a checkout, a build kept Nexo in before it installed Nexo's package, which a checkout made then may still hold; a link alone is removed.
$extracted = Get-Item -LiteralPath (Join-Path $root '.nexo') -Force -ErrorAction SilentlyContinue
if ($extracted -and $extracted.LinkType) {
    $extracted.Delete()
}
elseif ($extracted) {
    Remove-Item -LiteralPath $extracted.FullName -Recurse -Force
}

foreach ($folder in $root, $tests) {
    if (-not (Test-Path (Join-Path $folder 'node_modules'))) {
        Write-Host "Restoring $(Split-Path $folder -Leaf)"
        npm ci --prefix $folder --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed for $folder."
        }
    }
}

if ($env:NEXO_SOURCE -and -not $linkedToSource) {
    Remove-Item -LiteralPath $nexoInstalled -Recurse -Force
    $linkType = if ($IsWindows) { 'Junction' } else { 'SymbolicLink' }
    New-Item -ItemType $linkType -Path $nexoInstalled -Target $nexoCheckout | Out-Null
    Write-Host "Linking Nexo at $nexoCheckout"
}

# DOMQL's documents link to Nexo's at the release's tag, which the link test reads from Nexo's checkout.
if (-not (Test-Path (Join-Path $nexoCheckout '.git'))) {
    throw "DOMQL's documents link to Nexo's at $nexoTag, which the link test reads from a checkout of Nexo at $nexoCheckout; clone Nexo there, or set NEXO_SOURCE to a checkout."
}

git -C $nexoCheckout cat-file -e "refs/tags/$nexoTag^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) {
    git -C $nexoCheckout fetch origin "refs/tags/${nexoTag}:refs/tags/${nexoTag}"
    if ($LASTEXITCODE -ne 0) {
        throw "Nexo's checkout does not have the tag $nexoTag, and fetching it failed."
    }
}

Write-Host 'Testing the scripts'
npm test --prefix $tests
if ($LASTEXITCODE -ne 0) {
    throw 'The script tests failed.'
}

if ($Browser) {
    Write-Host 'Testing in a browser'
    npx --prefix $tests playwright install chromium firefox webkit
    if ($LASTEXITCODE -ne 0) {
        throw 'Installing the browsers failed.'
    }

    npm run test:browser --prefix $tests
    if ($LASTEXITCODE -ne 0) {
        throw 'The browser tests failed.'
    }

    npm run test:scrollbars --prefix $tests
    if ($LASTEXITCODE -ne 0) {
        throw 'The browser tests of scrollbars failed.'
    }

    Write-Host 'Testing in each browser engine'
    npm run test:engines --prefix $tests
    if ($LASTEXITCODE -ne 0) {
        throw 'The tests in each browser engine failed.'
    }
}

# The bundle, the package and the sources all take their version from src/Versions.mjs.
Write-Host 'Bundling'
npm run bundle --prefix $root
if ($LASTEXITCODE -ne 0) {
    throw 'The bundle failed.'
}

# dotnet finds global.json from the working directory up, so the SDK it pins applies from the package project's folder.
Push-Location $nuget
try {
    Write-Host 'Building'
    dotnet build $solution -nologo
    if ($LASTEXITCODE -ne 0) {
        throw 'dotnet build failed.'
    }

    Write-Host 'Checking formatting'
    dotnet format $solution --verify-no-changes
    if ($LASTEXITCODE -ne 0) {
        throw 'dotnet format found changes to make; run: dotnet format Forma.DOMQL.slnx from nuget/'
    }
}
finally {
    Pop-Location
}

if (-not $Full) {
    return
}

# The packages a release publishes: packed afresh, the NuGet package by a build that records its source as a release's does.
if (Test-Path $artifacts) {
    Remove-Item $artifacts -Recurse -Force
}

Push-Location $nuget
try {
    Write-Host 'Packing the NuGet package'
    dotnet pack Forma.DOMQL.csproj -c Release -nologo -o $artifacts -p:ContinuousIntegrationBuild=true
    if ($LASTEXITCODE -ne 0) {
        throw 'dotnet pack failed.'
    }
}
finally {
    Pop-Location
}

Write-Host 'Packing the npm package'
npm pack $root --pack-destination $artifacts --loglevel=error
if ($LASTEXITCODE -ne 0) {
    throw 'npm pack failed.'
}

$version = [regex]::Match((Get-Content (Join-Path $root 'src' 'Versions.mjs') -Raw), "runtime = '([^']+)'").Groups[1].Value
& (Join-Path $root 'scripts' 'Test-Packages.ps1') -Directory $artifacts -Version $version
