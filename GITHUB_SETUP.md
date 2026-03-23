# GitHub 仓库设置指南

## 方案一：使用 GitHub CLI（推荐）

### 1. 安装 GitHub CLI
下载地址：https://cli.github.com/

### 2. 登录 GitHub
```bash
gh auth login
```

### 3. 创建并推送仓库
```bash
# 在项目目录中执行
gh repo create NetInspector --public --source=. --push
```

## 方案二：手动创建仓库

### 1. 在 GitHub 创建新仓库
- 访问 https://github.com/new
- 仓库名称：`NetInspector`
- 描述：`ONVIF/GB28181 协议测试工具 - 专业的视频监控协议调试软件`
- **不要**勾选 "Initialize this repository with a README"
- 点击 "Create repository"

### 2. 初始化本地仓库
在项目目录中打开命令提示符，执行：

```bash
# 初始化 git 仓库
git init

# 添加所有文件
git add -A

# 创建提交
git commit -m "Initial commit: NetInspector - ONVIF/GB28181 Protocol Tester

Features:
- ONVIF device discovery and connection
- GB28181 server and client mode
- Batch import devices via CSV
- Video streaming with VLC external player support
- Packet capture and logging
- Modern React + Electron architecture"

# 创建 main 分支
git branch -M main

# 关联远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/NetInspector.git

# 推送到 GitHub
git push -u origin main
```

## 方案三：使用提供的脚本

### 1. 运行初始化脚本
```bash
init-repo.bat
```

### 2. 按照脚本提示完成后续操作

## 验证提交

推送完成后，访问：
```
https://github.com/YOUR_USERNAME/NetInspector
```

确认以下文件已上传：
- src/ - 源代码目录
- assets/ - 资源文件
- package.json - 项目配置
- README.md - 项目说明
- CHANGELOG.md - 更新日志
- tsconfig.json - TypeScript 配置
- vite.config.ts - Vite 配置

## 后续更新

以后修改代码后，使用以下命令提交更新：

```bash
# 查看更改
git status

# 添加更改
git add -A

# 创建提交
git commit -m "描述你的更改"

# 推送到 GitHub
git push origin main
```

或者运行提供的脚本：
```bash
push-to-github.bat
```

## 常见问题

### 1. 提示 "fatal: not a git repository"
需要先运行 `git init` 初始化仓库

### 2. 提示 "Permission denied"
检查 GitHub 凭据是否正确，或者使用 SSH 方式：
```bash
git remote set-url origin git@github.com:YOUR_USERNAME/NetInspector.git
```

### 3. 提示 "rejected: non-fast-forward"
先拉取远程更改：
```bash
git pull origin main --rebase
```

## 仓库信息

- **项目名称**: NetInspector
- **项目描述**: ONVIF/GB28181 协议测试工具
- **主要功能**: 视频监控协议调试、设备批量管理、视频流播放
- **技术栈**: Electron + React + TypeScript

