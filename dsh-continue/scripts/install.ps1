# dsh-continue 安装脚本（Windows / PowerShell）
#
# 干三件事：把工程同步进 $DSH_HOME\plugins\dsh-continue → 写 profile manifest →
# 跑 profile 自带的 pnpm 并落地校验。
#
#   pwsh -File scripts/install.ps1
#   pwsh -File scripts/install.ps1 -Profile web
#   pwsh -File scripts/install.ps1 -SkipInstall   # 只同步文件，不动 pnpm
#
# 为什么不用 `dsh plugin add`：`desktop` profile 被 Electron 宿主独占，
# CLI 会直接拒绝。这里做的是和宿主安装时完全一样的事（改 manifest + pnpm install），
# 只是把最后「落地」这一步自己做了 —— pnpm 对 `file:` 目录依赖内容变了
# 照样报 "Already up to date"。
#
# 装完必须重启 DeepSeek Harness 才会加载。

[CmdletBinding()]
param(
    [string]$Source = (Split-Path -Parent $PSScriptRoot),
    [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }),
    [string]$Profile = "desktop",
    [string]$PnpmPath = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$packageName = "dsh-continue"
$rootFiles = @("package.json", "cordis.patch.yml", "README.md", "README.en.md", "INSTALL.md", "USAGE.md", "CHANGELOG.md", "LICENSE")
$dirs = @("lib", "scripts", "test")

$stage = Join-Path $DshHome "plugins\$packageName"
$profileDir = Join-Path $DshHome "profiles\$Profile"
$manifestPath = Join-Path $profileDir "package.json"

if (-not (Test-Path (Join-Path $Source "package.json"))) {
    throw "源目录里没有 package.json：$Source"
}
if (-not (Test-Path $manifestPath)) {
    throw "profile 不存在：$manifestPath（先在应用里创建一次 $Profile profile）"
}

function Copy-Payload {
    param([string]$From, [string]$To)
    if (Test-Path $To) { Remove-Item $To -Recurse -Force }
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    foreach ($item in $rootFiles) {
        $path = Join-Path $From $item
        if (Test-Path $path) { Copy-Item $path $To -Force }
    }
    foreach ($dir in $dirs) {
        $path = Join-Path $From $dir
        if (Test-Path $path) { Copy-Item $path $To -Recurse -Force }
    }
}

Write-Host "[1/3] 同步 $Source -> $stage"
Copy-Payload -From $Source -To $stage

if ($SkipInstall) { Write-Host "跳过安装（-SkipInstall）"; return }

Write-Host "[2/3] 更新 $manifestPath"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if (-not $manifest.dependencies) {
    $manifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
}
# plugins/ 和 profiles/ 是兄弟目录，所以是 ../../plugins
$manifest.dependencies | Add-Member -NotePropertyName $packageName -NotePropertyValue "file:../../plugins/$packageName" -Force
$bundles = @($manifest.dsh.profile.bundles)
if ($bundles -notcontains $packageName) { $bundles += $packageName }
$manifest.dsh.profile.bundles = $bundles
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8

$candidates = @(
    $PnpmPath,
    (Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness\resources\runtime\pnpm\bin\pnpm.cjs"),
    (Join-Path $env:ProgramFiles "DeepSeek Harness\resources\runtime\pnpm\bin\pnpm.cjs")
) | Where-Object { $_ -and (Test-Path $_) }
$pnpm = $candidates | Select-Object -First 1
if (-not $pnpm) {
    throw "找不到 profile 自带的 pnpm；用 -PnpmPath 指一个，或手动在 $profileDir 里跑 pnpm install"
}

Write-Host "[3/3] pnpm install ($pnpm)"
Push-Location $profileDir
try {
    & node $pnpm install --reporter=append-only
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败（exit $LASTEXITCODE）" }
}
finally {
    Pop-Location
}

$dest = Join-Path $profileDir "node_modules\$packageName"
Write-Host "[3b] 落地到 $dest"
Copy-Payload -From $stage -To $dest

$want = (Get-FileHash (Join-Path $Source "lib\index.js") -Algorithm SHA256).Hash
$got = (Get-FileHash (Join-Path $dest "lib\index.js") -Algorithm SHA256).Hash
if ($want -ne $got) { throw "落地校验失败：$dest\lib\index.js 和源码不一致" }
Write-Host "     落地校验通过（lib/index.js sha256 前 16 位 $($got.Substring(0,16))）"

Write-Host ""
Write-Host "装好了。重启 DeepSeek Harness，然后在输入框敲 /continue 1 就能用。" -ForegroundColor Green
Write-Host "核对安装：dsh --profile $Profile --dump-config | grep dsh-continue"
Write-Host "离线核对：node scripts/verify-profile.mjs --profile $Profile"
