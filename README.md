# ONVIF/GB28181 协议测试工具

基于 Electron + React + TypeScript 构建的专业视频监控协议调试工具，支持 ONVIF 和 GB28181 两大主流协议的完整测试流程。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-1.0.0-orange)

---

## 功能概览

### ONVIF 协议支持
- **设备发现**：自动扫描局域网内的 ONVIF 设备（WS-Discovery）
- **设备管理**：添加、编辑、删除设备，支持用户名/密码认证
- **批量导入**：支持 CSV 格式批量导入设备列表
- **能力查询**：获取设备支持的所有功能和参数
- **媒体配置**：获取设备媒体配置（视频编码、分辨率等）
- **视频取流**：获取 RTSP 视频流地址，支持 Profile 切换
- **PTZ 控制**：支持云台的上下左右移动、变焦控制（如设备支持）
- **多流播放**：支持播放列表，可切换多个 Profile 流
- **外部播放器**：一键调用 VLC 播放 RTSP 流

### GB28181 协议支持
- **服务端模式**：模拟 GB28181 平台，接受设备注册
- **客户端模式**：模拟前端设备，向平台注册
- **设备注册管理**：管理接入的 GB28181 设备列表
- **批量导入**：支持 CSV 格式批量导入客户端配置
- **视频邀请**：通过 SIP 信令发起视频流邀请
- **视频播放**：播放 GB28181 设备的视频流
- **外部播放器**：一键调用 VLC 播放视频流

### 抓包分析
- **实时抓包**：捕获网络数据包，支持过滤条件
- **协议解析**：自动解析 ONVIF/RTSP/GB28181 协议内容
- **数据导出**：导出抓包数据到文件

### 日志系统
- **实时日志**：按模块分类显示操作日志
- **日志级别**：支持 DEBUG/INFO/WARN/ERROR 过滤
- **日志导出**：导出日志到文件便于分析

### 视频播放
- **RTSP 流支持**：获取设备 RTSP 流地址
- **外部播放器**：一键调用 VLC 播放 RTSP 流
- **流地址复制**：复制流地址到剪贴板，支持任意播放器

---

## 技术架构

```
├── Electron (主进程)
│   ├── ONVIF 客户端模块 (node-onvif)
│   ├── GB28181 服务端模块 (SIP/SDP)
│   ├── GB28181 客户端模块 (jssip)
│   ├── 抓包模块
│   └── 日志模块
└── React + Material-UI (渲染进程)
    ├── ONVIF 管理面板
    ├── GB28181 管理面板
    ├── 抓包分析面板
    └── 日志查看面板
```

**主要技术栈：**
- Electron 28
- React 18 + TypeScript
- Material-UI 5
- node-onvif（ONVIF 协议）
- jssip（SIP 协议，用于 GB28181）
- Vite（构建工具）

---

## 安装和运行

### 环境要求
- Node.js >= 18
- npm >= 9

### 开发模式
```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 生产构建
```bash
# 构建应用
npm run build

# 打包为安装程序
npm run package:win   # Windows
npm run package:mac   # macOS
npm run package:linux # Linux
```

---

## 视频播放说明

由于浏览器安全限制，无法直接在应用内播放 RTSP 流。推荐使用以下方式：

1. **VLC 播放器**（推荐）：点击"用 VLC 播放"按钮，自动调用 VLC
2. **手动复制**：点击"复制流地址"，在 VLC 或其他播放器中手动打开

> 需要先安装 [VLC 播放器](https://www.videolan.org/vlc/)

---

## CSV 批量导入格式

### ONVIF 设备 CSV 格式
```csv
ip,port,username,password
192.168.1.100,80,admin,password123
192.168.1.101,8080,admin,admin
```

### GB28181 客户端 CSV 格式
```csv
serverIp,serverPort,deviceId,username,password
192.168.1.200,5060,34020000001320000001,admin,admin123
```

---

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── onvif/              # ONVIF 模块
│   ├── gb28181/            # GB28181 模块
│   │   ├── server.ts       # GB28181 服务端
│   │   └── client.ts       # GB28181 客户端
│   ├── packet-capture/     # 抓包模块
│   ├── logger/             # 日志模块
│   ├── main.ts             # 主进程入口
│   └── preload.ts          # 预加载脚本
└── renderer/               # React 渲染进程
    ├── components/
    │   ├── ONVIFPanel.tsx         # ONVIF 管理界面
    │   ├── GB28181Panel.tsx       # GB28181 管理界面
    │   ├── PacketCapturePanel.tsx # 抓包分析界面
    │   └── LogPanel.tsx           # 日志查看界面
    ├── App.tsx
    └── main.tsx
```

---

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

---

## License

MIT License © 2024
