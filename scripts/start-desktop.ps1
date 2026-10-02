param([switch]$Rebuild, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$appDir = Join-Path $project 'release\win-unpacked'
$appExe = Join-Path $appDir 'TripMap.exe'
$stamp = Join-Path $project 'release\desktop-source.json'
$buildLock = $null
$required = @('TripMap.exe', 'resources\app.asar', 'resources\runtime\node.exe', 'resources\server\server-launcher.cjs', 'resources\server\.next\BUILD_ID')

function Get-SourceFingerprint {
    $files = @()
    foreach ($directory in @('src', 'public', 'desktop\resources')) {
        $target = Join-Path $project $directory
        if (Test-Path -LiteralPath $target) { $files += Get-ChildItem -LiteralPath $target -File -Recurse }
    }
    foreach ($relative in @('package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'desktop\app\main.cjs', 'desktop\app\package.json', 'desktop\app\package-lock.json', 'desktop\electron-builder.cjs', 'desktop\server-launcher.cjs', 'desktop\web-start.cjs', 'scripts\prepare-desktop.cjs')) {
        $target = Join-Path $project $relative
        if (Test-Path -LiteralPath $target) { $files += Get-Item -LiteralPath $target }
    }
    $entries = $files | Sort-Object FullName -Unique | ForEach-Object {
        $_.FullName.Substring($project.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))))).Replace('-', '') }
    finally { $sha.Dispose() }
}

try {
    Set-Location -LiteralPath $project
    $fingerprint = Get-SourceFingerprint
    $saved = $null
    if (Test-Path -LiteralPath $stamp) {
        try { $saved = [IO.File]::ReadAllText($stamp) | ConvertFrom-Json } catch { $saved = $null }
    }
    $complete = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $appDir $_)) }).Count -eq 0
    $buildId = if ($complete) { [IO.File]::ReadAllText((Join-Path $appDir 'resources\server\.next\BUILD_ID')).Trim() } else { '' }
    if ($Rebuild -or -not $complete -or $saved.fingerprint -ne $fingerprint -or $saved.buildId -ne $buildId) {
        [IO.Directory]::CreateDirectory((Join-Path $project 'release')) | Out-Null
        try { $buildLock = [IO.File]::Open((Join-Path $project 'release\desktop-build.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
        catch { throw '桌面版正在由另一个启动窗口更新，请等待该窗口完成。' }
        $running = Get-Process -Name TripMap -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appExe }
        if ($running) { throw '源码有更新，请先保存行程并关闭此项目的 TripMap 桌面窗口，再重新启动。' }
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        $electron = Join-Path $project 'node_modules\electron\dist\electron.exe'
        $builder = Join-Path $project 'node_modules\electron-builder\out\cli\cli.js'
        if (-not $npm -or -not $node -or -not (Test-Path -LiteralPath $electron) -or -not (Test-Path -LiteralPath $builder)) {
            throw '首次启动或源码更新需要构建工具。请安装 Node.js 并在项目目录执行 npm ci；原桌面产物仍保留在 release。'
        }
        Write-Host '正在将最新源码更新到桌面版，首次构建需要一些时间…'
        Write-Host '个人行程与设置仍保留在原用户数据目录。'
        & $npm.Source run desktop:prepare
        if ($LASTEXITCODE -ne 0) { throw '桌面资源构建失败，请查看上方日志。未启动旧版本。' }
        # The packager uses Electron's modern Node; the server retains its own SQLite ABI.
        $previousNodeMode = $env:ELECTRON_RUN_AS_NODE
        try {
            $env:ELECTRON_RUN_AS_NODE = '1'
            & $electron $builder --config desktop/electron-builder.cjs --win --dir --publish never
            if ($LASTEXITCODE -ne 0) { throw '桌面程序打包失败，请查看上方日志。' }
        } finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
        foreach ($relative in $required) {
            if (-not (Test-Path -LiteralPath (Join-Path $appDir $relative))) { throw "桌面资源不完整：$relative" }
        }
        if ((Get-SourceFingerprint) -ne $fingerprint) { throw '构建期间源码发生变化，请再次运行启动脚本以更新到最新版本。' }
        $buildId = [IO.File]::ReadAllText((Join-Path $appDir 'resources\server\.next\BUILD_ID')).Trim()
        @{ fingerprint = $fingerprint; buildId = $buildId; builtAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $stamp -Encoding UTF8
        Write-Host '桌面版已更新。'
    }
    if (-not $NoLaunch) {
        $env:ELECTRON_RUN_AS_NODE = $null
        Start-Process -FilePath $appExe -WorkingDirectory $appDir -WindowStyle Normal
    }
    exit 0
} catch {
    Write-Host ("启动失败：" + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally { if ($buildLock) { $buildLock.Dispose() } }
