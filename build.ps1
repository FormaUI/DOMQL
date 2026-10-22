<#
.SYNOPSIS
Runs the script tests, bundles DOMQL, builds the package project, and checks its formatting.

.PARAMETER Clean
Removes every build output first, so the build starts from nothing.

.PARAMETER Browser
Also runs the tests that need a real browser's layout, in headless Chromium, which is installed first if it is not.

.NOTES
DOMQL builds against Lexica at the commit lexica.commit pins, which it extracts into .lexica from the checkout beside this one, formaui-net.Lexica. Set LEXICA_SOURCE to a Lexica checkout to build against that checkout's working tree instead, for a change made in both repositories.

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
$lexica = Join-Path $root '.lexica'
$lexicaCheckout = Join-Path (Split-Path $root -Parent) 'formaui-net.Lexica'
$lexicaCommit = (Get-Content (Join-Path $root 'lexica.commit') -Raw).Trim()

# Removes .lexica, a link alone where it is one, so the checkout it points to is never touched.
function Remove-Lexica {
    $item = Get-Item -LiteralPath $lexica -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        return
    }

    if ($item.LinkType) {
        $item.Delete()
    }
    else {
        Remove-Item -LiteralPath $lexica -Recurse -Force
    }
}

# Makes .lexica the Lexica DOMQL builds against: a link to LEXICA_SOURCE where it is set, and otherwise the tree of the pinned commit.
function Initialize-Lexica {
    $item = Get-Item -LiteralPath $lexica -Force -ErrorAction SilentlyContinue

    if ($env:LEXICA_SOURCE) {
        $source = (Resolve-Path -LiteralPath $env:LEXICA_SOURCE).Path
        if ($item -and $item.LinkType -and ($item.Target -eq $source)) {
            return
        }

        Remove-Lexica
        $linkType = if ($IsWindows) { 'Junction' } else { 'SymbolicLink' }
        New-Item -ItemType $linkType -Path $lexica -Target $source | Out-Null
        Write-Host "Linking Lexica at $source"
        return
    }

    $stamp = Join-Path $lexica '.commit'
    if ($item -and -not $item.LinkType -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $lexicaCommit)) {
        return
    }

    if (-not (Test-Path (Join-Path $lexicaCheckout '.git'))) {
        throw "DOMQL builds against Lexica's commit $lexicaCommit, taken from a checkout at $lexicaCheckout; clone Lexica there, or set LEXICA_SOURCE to a checkout."
    }

    git -C $lexicaCheckout cat-file -e "$lexicaCommit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        git -C $lexicaCheckout fetch origin $lexicaCommit
        if ($LASTEXITCODE -ne 0) {
            throw "Lexica's checkout does not have the commit $lexicaCommit, and fetching it failed."
        }
    }

    Write-Host "Extracting Lexica at $lexicaCommit"
    Remove-Lexica
    New-Item -ItemType Directory -Path $lexica | Out-Null
    $archive = Join-Path ([System.IO.Path]::GetTempPath()) "lexica-$lexicaCommit.tar"
    try {
        git -C $lexicaCheckout archive --format=tar -o $archive $lexicaCommit
        if ($LASTEXITCODE -ne 0) {
            throw "Archiving Lexica's commit $lexicaCommit failed."
        }

        tar -xf $archive -C $lexica
        if ($LASTEXITCODE -ne 0) {
            throw "Extracting Lexica's commit $lexicaCommit failed."
        }
    }
    finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    }

    Set-Content -LiteralPath $stamp -Value $lexicaCommit -NoNewline
}

if ($Clean) {
    # The package project's bin and obj, its bundle, and the packed artifacts, which dotnet clean alone leaves behind.
    Write-Host 'Cleaning'
    Get-ChildItem $nuget -Directory -Recurse -Include 'bin', 'obj', 'wwwroot' | Remove-Item -Recurse -Force
    if (Test-Path $artifacts) {
        Remove-Item $artifacts -Recurse -Force
    }
}

Initialize-Lexica

# The root's link to Lexica must lead to .lexica; one made before the pin leads to the checkout itself.
$linked = Get-Item -LiteralPath (Join-Path $root 'node_modules/@formaui/lexica') -Force -ErrorAction SilentlyContinue
# npm links with a relative target on Linux and macOS and an absolute one on Windows, so a target resolves against the link's own folder.
$linkedToLexica = $linked -and $linked.LinkType -and ([System.IO.Path]::GetFullPath($linked.Target, (Split-Path $linked.FullName -Parent)) -eq [System.IO.Path]::GetFullPath($lexica))
if (-not $linkedToLexica -and (Test-Path (Join-Path $root 'node_modules'))) {
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
