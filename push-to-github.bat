@echo off
chcp 65001 >nul
echo ==========================================
echo   NetInspector 自动提交脚本
echo ==========================================
echo.

REM 检查 git 是否安装
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 git 命令，请确保 Git 已安装并添加到 PATH
    pause
    exit /b 1
)

REM 检查是否在 git 仓库中
git rev-parse --git-dir >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 当前目录不是 Git 仓库
    echo 请先运行: git init
    echo 并添加远程仓库: git remote add origin https://github.com/fireboy38/NetInspector.git
    pause
    exit /b 1
)

echo [1/5] 检查远程仓库...
git remote -v

echo.
echo [2/5] 添加所有更改...
git add -A

echo.
echo [3/5] 创建提交...
git commit -m "feat: 添加批量导入和视频播放优化功能

- 新增 ONVIF 设备批量导入功能（CSV 格式）
- 新增 GB28181 客户端批量导入功能
- 优化视频播放对话框，支持播放列表
- 添加外部播放器支持（VLC）
- 改进 RTSP 流播放体验
- 添加 CHANGELOG.md 文档"

echo.
echo [4/5] 推送到 GitHub...
git push origin main

echo.
echo [5/5] 完成！
echo.
echo ==========================================
echo   提交完成！
echo   仓库地址: https://github.com/fireboy38/NetInspector
echo ==========================================
pause
