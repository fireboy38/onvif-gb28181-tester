@echo off
chcp 65001 >nul
echo ==========================================
echo   NetInspector 仓库初始化脚本
echo ==========================================
echo.

REM 检查 git 是否安装
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 git 命令，请确保 Git 已安装
    echo 下载地址: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/8] 初始化 Git 仓库...
git init

echo.
echo [2/8] 配置 .gitignore...
echo node_modules/ > .gitignore
echo dist/ >> .gitignore
echo release/ >> .gitignore
echo .workbuddy/ >> .gitignore
echo *.log >> .gitignore

echo.
echo [3/8] 添加所有文件到暂存区...
git add -A

echo.
echo [4/8] 创建初始提交...
git commit -m "Initial commit: NetInspector - ONVIF/GB28181 Protocol Tester

Features:
- ONVIF device discovery and connection
- GB28181 server and client mode
- Batch import devices via CSV
- Video streaming with VLC external player support
- Packet capture and logging
- Modern React + Electron architecture"

echo.
echo [5/8] 创建 main 分支...
git branch -M main

echo.
echo ==========================================
echo   本地仓库已创建！
echo ==========================================
echo.
echo 下一步操作：
echo 1. 在 GitHub 创建新仓库（不要初始化 README）
echo 2. 运行以下命令关联远程仓库：
echo.
echo    git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
echo    git push -u origin main
echo.
echo 或者使用 GitHub CLI：
echo    gh repo create REPO_NAME --public --source=. --push
echo.
pause
