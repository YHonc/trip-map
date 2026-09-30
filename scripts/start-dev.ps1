$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$browserJob = $null
$result = 1

try {
    Set-Location -LiteralPath $project
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        throw '未找到 Node.js / npm。请安装 Node.js 22.12+，再重新打开此脚本。'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules\next\dist\bin\next'))) {
        throw '项目依赖未安装。请在项目目录执行 npm ci，然后重新启动。'
    }

    $port = 3000
    if ($env:TRIP_MAP_DEV_PORT) { $port = [int]$env:TRIP_MAP_DEV_PORT }
    if ($port -lt 1024 -or $port -gt 65535) { throw 'TRIP_MAP_DEV_PORT 应为 1024–65535。' }
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try { $probe.Start() }
    catch { throw "本机端口 $port 不可用。请先关闭占用端口的服务，或设置 TRIP_MAP_DEV_PORT。" }
    finally { $probe.Stop() }

    $origin = "http://127.0.0.1:$port"
    $env:TRIP_MAP_INSTANCE = [guid]::NewGuid().ToString()
    $env:NODE_ENV = 'development'
    Write-Host "项目：$project"
    Write-Host "调试地址：$origin"
    Write-Host '修改源码后自动更新；浏览器按 F12 查看前端日志。'
    Write-Host '保持此窗口开启，按 Ctrl+C 停止服务。'
    Write-Host '默认沿用本机行程数据；TRIP_MAP_DATA_DIR 可指定独立调试目录。'
    Write-Host ''

    # A separate job waits while npm retains the interactive console and its Ctrl+C handling.
    if ($env:TRIP_MAP_NO_BROWSER -ne '1') {
        $browserJob = Start-Job -ArgumentList $origin, $env:TRIP_MAP_INSTANCE -ScriptBlock {
            param($origin, $instance)
            $deadline = [DateTime]::UtcNow.AddMinutes(3)
            while ([DateTime]::UtcNow -lt $deadline) {
                try {
                    $health = Invoke-RestMethod "$origin/api/health" -TimeoutSec 2
                    if ($health.app -eq 'trip-map' -and $health.instance -eq $instance) {
                        Start-Process $origin
                        return
                    }
                } catch {}
                Start-Sleep -Milliseconds 500
            }
        }
    }

    & $npm.Source run dev -- --port $port
    $result = $LASTEXITCODE
} catch {
    Write-Host ("启动失败：" + $_.Exception.Message) -ForegroundColor Red
} finally {
    if ($browserJob) {
        Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
}
exit $result
