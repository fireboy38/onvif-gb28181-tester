# 自动提交脚本 - ONVIF/GB28181 测试工具
# 用途：每次代码修改后自动提交到 GitHub

$ErrorActionPreference = "Stop"

# 设置 git 路径
$gitPath = "C:\Program Files\Git\bin\git.exe"

# 进入项目目录
$projectDir = "c:\Users\diao\WorkBuddy\20260322134930"
Set-Location $projectDir

echo "=== Git 自动提交脚本 ==="
echo "项目目录: $projectDir"
echo "仓库: https://github.com/fireboy38/onvif-gb28181-tester.git"
echo ""

# 检查是否有修改
$gitStatus = & $gitPath status --porcelain
if (-not $gitStatus) {
    echo "没有待提交的修改，退出。"
    exit 0
}

echo "检测到以下修改："
& $gitPath status --short
echo ""

# 获取当前时间作为提交信息的一部分
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# 默认提交信息
$defaultCommitMsg = "chore: 自动提交 - $timestamp"

# 显示当前状态
& $gitPath diff --stat

echo ""
$commitMsg = Read-Host -Prompt "请输入提交信息 (默认: $defaultCommitMsg)"
if (-not $commitMsg) {
    $commitMsg = $defaultCommitMsg
}

# 添加所有修改
echo ""
echo "添加文件到暂存区..."
& $gitPath add -A

# 提交
echo "提交中..."
& $gitPath commit -m $commitMsg

# 推送
echo ""
echo "推送到 GitHub..."
& $gitPath push origin main

echo ""
echo "=== 提交完成 ==="
echo "查看仓库: https://github.com/fireboy38/onvif-gb28181-tester"
