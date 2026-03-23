# 持续监听并自动提交脚本
# 用途：监听代码变化，每30秒自动提交

$ErrorActionPreference = "Stop"

# 设置 git 路径
$gitPath = "C:\Program Files\Git\bin\git.exe"

# 进入项目目录
$projectDir = "c:\Users\diao\WorkBuddy\20260322134930"
Set-Location $projectDir

echo "=== 持续自动提交监听 ==="
echo "项目目录: $projectDir"
echo "监听间隔: 30秒"
echo "按 Ctrl+C 停止"
echo ""

$lastCommitTime = Get-Date

while ($true) {
    Start-Sleep -Seconds 30

    # 检查是否有修改
    $gitStatus = & $gitPath status --porcelain 2>$null
    if ($gitStatus) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

        echo ""
        echo "[$timestamp] 检测到修改:"

        # 显示修改的文件
        & $gitPath status --short

        # 添加并提交
        $commitMsg = "chore: 自动提交 - $timestamp"

        echo "提交中: $commitMsg"
        & $gitPath add -A
        & $gitPath commit -m $commitMsg 2>$null

        # 推送
        echo "推送到 GitHub..."
        & $gitPath push origin main 2>$null

        $lastCommitTime = Get-Date
    }
}
