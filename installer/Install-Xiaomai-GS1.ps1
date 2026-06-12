$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptSource = Join-Path $packageRoot "小麦GS1条码生成.jsx"
$vendorSource = Join-Path $packageRoot "vendor"

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-IllustratorScriptFolders {
    $adobeRoot = "C:\Program Files\Adobe"
    $folders = New-Object System.Collections.Generic.List[string]

    if (-not (Test-Path -LiteralPath $adobeRoot)) {
        return $folders
    }

    Get-ChildItem -LiteralPath $adobeRoot -Directory -Filter "Adobe Illustrator*" | ForEach-Object {
        $presets = Join-Path $_.FullName "Presets"
        if (Test-Path -LiteralPath $presets) {
            Get-ChildItem -LiteralPath $presets -Directory -Recurse | Where-Object {
                $_.Name -eq "脚本" -or $_.Name -eq "Scripts"
            } | ForEach-Object {
                $folders.Add($_.FullName)
            }
        }
    }

    return $folders
}

if (-not (Test-Path -LiteralPath $scriptSource)) {
    throw "安装包缺少文件：小麦GS1条码生成.jsx"
}

if (-not (Test-Path -LiteralPath $vendorSource)) {
    throw "安装包缺少 vendor 文件夹，DataMatrix 二维码将无法生成。"
}

$targets = Find-IllustratorScriptFolders
if ($targets.Count -eq 0) {
    Write-Host "未找到 Adobe Illustrator 脚本目录。" -ForegroundColor Yellow
    Write-Host "请手动把 小麦GS1条码生成.jsx 和 vendor 文件夹复制到 Illustrator 的 Presets\\语言\\脚本 或 Presets\\语言\\Scripts 目录。"
    exit 1
}

if (-not (Test-IsAdmin)) {
    Write-Host "提示：安装到 Program Files 通常需要管理员权限。" -ForegroundColor Yellow
    Write-Host "如果安装失败，请右键 一键安装.cmd，选择“以管理员身份运行”。"
}

foreach ($target in $targets) {
    Write-Host "安装到：$target"
    Copy-Item -LiteralPath $scriptSource -Destination (Join-Path $target "小麦GS1条码生成.jsx") -Force
    Copy-Item -LiteralPath $vendorSource -Destination $target -Recurse -Force
}

Write-Host ""
Write-Host "安装完成。" -ForegroundColor Green
Write-Host "请重启 Adobe Illustrator，然后从 文件 > 脚本 > 小麦GS1条码生成 打开。"
