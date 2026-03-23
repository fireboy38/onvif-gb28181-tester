# GitHub Actions 自动打包说明

## 工作原理

GitHub Actions 会在以下情况下自动构建 Windows 安装程序：

1. **推送标签**：当你推送格式为 `v*` 的标签时（如 `v1.0.0`）
2. **手动触发**：在 GitHub 仓库页面点击 "Actions" → "Build and Release" → "Run workflow"

## 快速开始

### 1. 提交代码到 GitHub

```powershell
cd c:\Users\diao\WorkBuddy\20260322104930
git add .
git commit -m "chore: 添加 GitHub Actions 自动打包"
git push origin main
```

### 2. 创建版本标签并推送

```powershell
git tag v1.0.0
git push origin v1.0.0
```

### 3. 等待构建完成

- 访问：https://github.com/fireboy38/onvif-gb28181-tester/actions
- 等待工作流运行完成（约 5-10 分钟）

### 4. 下载安装程序

构建完成后，访问 Releases 页面：
https://github.com/fireboy38/onvif-gb28181-tester/releases

下载以下文件：

- **ONVIF-GB28181-Tester Setup 1.0.0.exe** - 标准安装程序
- **ONVIF-GB28181-Tester-1.0.0-portable.exe** - 便携版（无需安装）

## 工作流详情

### 构建环境

- **操作系统**：Windows Server 2022 (最新版)
- **Node.js**：v20
- **Electron**：v28.3.3
- **electron-builder**：v24.9.1

### 构建步骤

1. 检出代码
2. 安装依赖（`npm ci`）
3. 编译 TypeScript（主进程 + 渲染进程）
4. 打包应用（NSIS 安装程序 + Portable 版本）
5. 上传构建产物
6. 创建 GitHub Release

### 产物

每个版本会生成以下文件：

| 文件名 | 说明 |
|--------|------|
| `ONVIF-GB28181-Tester Setup X.Y.Z.exe` | NSIS 安装程序，支持自定义安装路径 |
| `ONVIF-GB28181-Tester-X.Y.Z-portable.exe` | 便携版，直接运行无需安装 |

## 常见问题

### Q: 如何修改打包配置？

编辑 `package.json` 中的 `build` 字段：

```json
"build": {
  "win": {
    "target": ["nsis", "portable"],
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

### Q: 如何取消正在运行的构建？

访问 Actions 页面，点击运行中的工作流，然后点击 "Cancel workflow"。

### Q: 如何查看构建日志？

1. 访问 Actions 页面
2. 点击对应的工作流运行
3. 点击具体的 Job 查看详细日志

### Q: 构建失败怎么办？

1. 查看构建日志中的错误信息
2. 检查代码是否通过本地编译（`npm run build`）
3. 确保依赖安装正确（`npm ci`）
4. 修复后推送新标签重新构建

## 高级用法

### 手动触发构建

1. 访问 https://github.com/fireboy38/onvif-gb28181-tester/actions
2. 点击 "Build and Release" 工作流
3. 点击 "Run workflow" → "Run workflow"

### 本地测试构建配置

在推送之前，可以先在本地测试：

```powershell
npm ci
npm run build
npm run package:win
```

检查 `release` 目录中是否生成正确的安装程序。

### 自动发布到 NPM

如果需要自动发布到 NPM，可以在 `.github/workflows/build.yml` 中添加以下步骤：

```yaml
- name: Publish to NPM
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

然后需要在 GitHub 仓库设置中添加 `NPM_TOKEN` secret。

## 参考资料

- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [electron-builder 文档](https://www.electron.build/)
- [GitHub Release 说明](https://docs.github.com/en/repositories/releasing-projects-on-github)
