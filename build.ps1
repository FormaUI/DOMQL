<#
.SYNOPSIS
Runs the script tests, bundles DOMQL, builds the package project, and checks its formatting.

.PARAMETER Clean
Removes every build output first, so the build starts from nothing.

.PARAMETER Browser
Also runs the tests that need a real browser's layout, in headless Chromium, which is installed first if it is not.

.NOTES
DOMQL builds against Nexo at the commit nexo.commit pins, which it extracts into .nexo from the checkout beside this one, formaui-net.Nexo. Set NEXO_SOURCE to a Nexo checkout to build against that checkout's working tree instead, for a change made in both repositories.

.EXAMPLE
./build.ps1 -Clean

.EXAMPLE
./build.ps1 -Browser
#>
[CmdletBinding()]
param(
    [switch] $Clean,
    [switch] $Browser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$nuget = Join-Path $root 'nuget'
$solution = 'Forma.DOMQL.slnx'
$tests = Join-Path $root 'tests'
$artifacts = Join-Path $root 'artifacts'
$nexo = Join-Path $root '.nexo'
$nexoCheckout = Join-Path (Split-Path $root -Parent) 'formaui-net.Nexo'
$nexoCommit = (Get-Content (Join-Path $root 'nexo.commit') -Raw).Trim()

# Removes .nexo, a link alone where it is one, so the checkout it points to is never touched.
function Remove-Nexo {
    $item = Get-Item -LiteralPath $nexo -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        return
    }

    if ($item.LinkType) {
        $item.Delete()
    }
    else {
        Remove-Item -LiteralPath $nexo -Recurse -Force
    }
}

# Makes .nexo the Nexo DOMQL builds against: a link to NEXO_SOURCE where it is set, and otherwise the tree of the pinned commit.
function Initialize-Nexo {
    $item = Get-Item -LiteralPath $nexo -Force -ErrorAction SilentlyContinue

    if ($env:NEXO_SOURCE) {
        $source = (Resolve-Path -LiteralPath $env:NEXO_SOURCE).Path
        if ($item -and $item.LinkType -and ($item.Target -eq $source)) {
            return
        }

        Remove-Nexo
        $linkType = if ($IsWindows) { 'Junction' } else { 'SymbolicLink' }
        New-Item -ItemType $linkType -Path $nexo -Target $source | Out-Null
        Write-Host "Linking Nexo at $source"
        return
    }

    $stamp = Join-Path $nexo '.commit'
    if ($item -and -not $item.LinkType -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $nexoCommit)) {
        return
    }

    if (-not (Test-Path (Join-Path $nexoCheckout '.git'))) {
        throw "DOMQL builds against Nexo's commit $nexoCommit, taken from a checkout at $nexoCheckout; clone Nexo there, or set NEXO_SOURCE to a checkout."
    }

    git -C $nexoCheckout cat-file -e "$nexoCommit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        git -C $nexoCheckout fetch origin $nexoCommit
        if ($LASTEXITCODE -ne 0) {
            throw "Nexo's checkout does not have the commit $nexoCommit, and fetching it failed."
        }
    }

    Write-Host "Extracting Nexo at $nexoCommit"
    Remove-Nexo
    New-Item -ItemType Directory -Path $nexo | Out-Null
    $archive = Join-Path ([System.IO.Path]::GetTempPath()) "nexo-$nexoCommit.tar"
    try {
        git -C $nexoCheckout archive --format=tar -o $archive $nexoCommit
        if ($LASTEXITCODE -ne 0) {
            throw "Archiving Nexo's commit $nexoCommit failed."
        }

        tar -xf $archive -C $nexo
        if ($LASTEXITCODE -ne 0) {
            throw "Extracting Nexo's commit $nexoCommit failed."
        }
    }
    finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    }

    Set-Content -LiteralPath $stamp -Value $nexoCommit -NoNewline
}

if ($Clean) {
    # The package project's bin and obj, its bundle, and the packed artifacts, which dotnet clean alone leaves behind.
    Write-Host 'Cleaning'
    Get-ChildItem $nuget -Directory -Recurse -Include 'bin', 'obj', 'wwwroot' | Remove-Item -Recurse -Force
    if (Test-Path $artifacts) {
        Remove-Item $artifacts -Recurse -Force
    }
}

Initialize-Nexo

# The root's link to Nexo must lead to .nexo; one made before the pin leads to the checkout itself.
$linked = Get-Item -LiteralPath (Join-Path $root 'node_modules/@formaui-net/nexo') -Force -ErrorAction SilentlyContinue
# npm links with a relative target on Linux and macOS and an absolute one on Windows, so a target resolves against the link's own folder.
$linkedToNexo = $linked -and $linked.LinkType -and ([System.IO.Path]::GetFullPath($linked.Target, (Split-Path $linked.FullName -Parent)) -eq [System.IO.Path]::GetFullPath($nexo))
if (-not $linkedToNexo -and (Test-Path (Join-Path $root 'node_modules'))) {
    # The link alone first, so removing node_modules never reaches into the checkout it leads to.
    if ($linked -and $linked.LinkType) {
        $linked.Delete()
    }

    Remove-Item -LiteralPath (Join-Path $root 'node_modules') -Recurse -Force
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

Write-Host 'Testing the scripts'
npm test --prefix $tests
if ($LASTEXITCODE -ne 0) {
    throw 'The script tests failed.'
}

if ($Browser) {
    Write-Host 'Testing in a browser'
    npx --prefix $tests playwright install chromium
    if ($LASTEXITCODE -ne 0) {
        throw 'Installing the browser failed.'
    }

    npm run test:browser --prefix $tests
    if ($LASTEXITCODE -ne 0) {
        throw 'The browser tests failed.'
    }

    npm run test:scrollbars --prefix $tests
    if ($LASTEXITCODE -ne 0) {
        throw 'The browser tests of scrollbars failed.'
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
