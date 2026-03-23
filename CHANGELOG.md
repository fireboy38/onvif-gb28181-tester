# 更新日志

## [1.0.0] - 2026-03-23

### 新增功能
- ONVIF 设备发现与管理（WS-Discovery）
- ONVIF 设备批量导入（CSV 格式）
- ONVIF 媒体配置获取与多流播放列表
- ONVIF PTZ 云台控制
- GB28181 服务端模式（模拟平台，接受设备注册）
- GB28181 客户端模式（模拟设备，向平台注册）
- GB28181 客户端批量导入（CSV 格式）
- GB28181 视频邀请与流播放
- RTSP 视频流地址获取与播放
- 外部播放器支持（VLC 一键播放 RTSP 流）
- 网络抓包分析模块
- 实时日志系统（按模块分类，支持级别过滤）

### 技术特点
- 基于 Electron 28 + React 18 + TypeScript
- Material-UI 5 深色主题界面
- 完整的 IPC 通信架构
- 支持 Windows / macOS / Linux
