/**
 * Electron 主进程入口
 * 管理窗口、IPC 通信、协议服务
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { ONVIFDiscovery } from './onvif/discovery';
// @ts-ignore
const NodeOnvif = require('node-onvif');
import { GB28181Server } from './gb28181/server';
import { GB28181Client } from './gb28181/client';
import { PacketCaptureService } from './packet-capture/capture';
import { Logger } from './logger/logger';
import { 
  ONVIFDevice,
  GB28181ServerConfig,
  GB28181ClientConfig,
  PacketFilter,
  LogFilter,
} from '../shared/types';

// 全局服务实例
let mainWindow: BrowserWindow | null = null;
const onvifDiscovery = new ONVIFDiscovery();
const onvifClients = new Map<string, any>();
let gb28181Server: GB28181Server | null = null;
const gb28181Clients = new Map<string, GB28181Client>();
const packetCapture = new PacketCaptureService();
const logger = new Logger({ maxLogs: 10000, consoleOutput: true });

// 创建窗口
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    show: false, // 先不显示，等加载完成后再显示
  });

  // 加载应用
  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    // 开发模式：尝试连接 dev server，如果失败则使用已构建的文件
    try {
      await mainWindow.loadURL('http://localhost:3000');
      console.log('Loaded from dev server');
      mainWindow.webContents.openDevTools();
    } catch (err) {
      console.log('Dev server not available, loading built files');
      // 从 dist/main/main/main.js 到 dist/renderer/index.html
      const builtFile = path.join(__dirname, '../../renderer/index.html');
      console.log('Loading built file:', builtFile);
      await mainWindow.loadFile(builtFile);
    }
  } else {
    // 生产模式：加载已构建的文件
    const builtFile = path.join(__dirname, '../../renderer/index.html');
    console.log('Loading built file:', builtFile);
    await mainWindow.loadFile(builtFile);
  }

  // 加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 如果 3 秒后还没显示，强制显示
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用就绪
app.whenReady().then(async () => {
  await createWindow();
  setupIPC();
  setupEventForwarding();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  // 清理资源
  if (gb28181Server) {
    gb28181Server.stop();
  }
  for (const client of gb28181Clients.values()) {
    client.unregister();
  }
  packetCapture.stopCapture();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 设置 IPC 通信
function setupIPC(): void {
  // ONVIF 发现
  ipcMain.handle('onvif:discover', async (event, timeout: number = 5000) => {
    try {
      logger.info('Starting ONVIF discovery', { timeout }, 'onvif');
      
      await onvifDiscovery.startDiscovery({ timeout });
      const devices = onvifDiscovery.getDiscoveredDevices();
      
      logger.info(`ONVIF discovery completed, found ${devices.length} devices`, {}, 'onvif');
      return { success: true, data: devices };
    } catch (err: any) {
      logger.error('ONVIF discovery failed', err, 'onvif');
      return { success: false, error: err.message };
    }
  });

  // ONVIF 连接
  ipcMain.handle('onvif:connect', async (event, device: ONVIFDevice) => {
    try {
      // 构建 xaddr（如果未提供）
      let xaddr = device.xaddr;
      if (!xaddr && device.ip) {
        const port = device.port || 80;
        xaddr = `http://${device.ip}:${port}/onvif/device_service`;
      }
      
      if (!xaddr) {
        throw new Error('Invalid URL: 缺少设备地址');
      }
      
      logger.info(`Connecting to ONVIF device: ${xaddr}`, { username: device.username }, 'onvif');
      
      // 使用 node-onvif 库
      const client = new NodeOnvif.OnvifDevice({
        xaddr: xaddr,
        user: device.username,
        pass: device.password,
      });

      await client.init();
      
      onvifClients.set(device.uuid, client);
      
      const info = client.getInformation();
      
      // 获取 profiles - node-onvif 使用 getProfileList() 方法
      let profiles: any[] = [];
      try {
        const profileList = client.getProfileList();
        if (profileList && Array.isArray(profileList)) {
          profiles = profileList.map((p: any) => ({
            token: p.token,
            name: p.name || p.token,
            videoSourceConfiguration: p.video?.source,
            videoEncoderConfiguration: p.video?.encoder,
          }));
          logger.info(`Got ${profiles.length} profiles from device`, {}, 'onvif');
        }
      } catch (profileErr) {
        logger.warn('Failed to get profiles', { error: (profileErr as Error).message }, 'onvif');
      }
      
      // 如果 getProfileList 失败，尝试获取当前 profile
      if (profiles.length === 0) {
        try {
          const currentProfile = client.getCurrentProfile();
          if (currentProfile) {
            profiles = [{
              token: currentProfile.token,
              name: currentProfile.name || currentProfile.token,
              videoSourceConfiguration: currentProfile.video?.source,
              videoEncoderConfiguration: currentProfile.video?.encoder,
            }];
            logger.info('Got current profile as fallback', {}, 'onvif');
          }
        } catch (e) {
          logger.warn('Failed to get current profile', { error: (e as Error).message }, 'onvif');
        }
      }
      
      const updatedDevice: ONVIFDevice = {
        ...device,
        xaddr: xaddr,
        name: device.name || `${info.Manufacturer} ${info.Model}`,
        manufacturer: info.Manufacturer,
        model: info.Model,
        firmwareVersion: info.FirmwareVersion,
        serialNumber: info.SerialNumber,
        hardwareId: info.HardwareId,
        status: 'online',
        profiles: profiles,
        capabilities: {
          device: {
            XAddr: xaddr,
            Network: { IPFilter: false, ZeroConfiguration: false, IPVersion6: false, DynDNS: false },
            System: { DiscoveryResolve: false, DiscoveryBye: false, RemoteDiscovery: false, SystemBackup: false, SystemLogging: false, FirmwareUpgrade: false },
          },
          media: {
            XAddr: xaddr.replace('/device_service', '/media_service'),
            StreamingCapabilities: { RTPMulticast: false, RTP_TCP: true, RTP_RTSP_TCP: true },
          },
        },
      };

      logger.info(`Connected to ONVIF device: ${info.Manufacturer} ${info.Model}`, {}, 'onvif');
      return { success: true, data: updatedDevice };
    } catch (err: any) {
      logger.error('ONVIF connection failed', { error: err.message }, 'onvif');
      return { success: false, error: err.message };
    }
  });

  // ONVIF 获取流地址
  ipcMain.handle('onvif:getStreamUri', async (event, deviceId: string, profileToken: string) => {
    try {
      const client = onvifClients.get(deviceId);
      if (!client) {
        throw new Error('Device not connected');
      }

      // 首先尝试从 profile 中获取流地址
      let uri: string | null = null;
      
      // 获取指定 token 的 profile
      const profileList = client.getProfileList();
      const targetProfile = profileList.find((p: any) => p.token === profileToken);
      
      if (targetProfile && targetProfile.stream && targetProfile.stream.rtsp) {
        uri = targetProfile.stream.rtsp;
        logger.info(`Got stream URI from profile: ${uri}`, {}, 'onvif');
      }
      
      // 如果没有从 profile 获取到，使用当前 profile 的流地址
      if (!uri) {
        const currentProfile = client.getCurrentProfile();
        if (currentProfile && currentProfile.stream && currentProfile.stream.rtsp) {
          uri = currentProfile.stream.rtsp;
          logger.info(`Got stream URI from current profile: ${uri}`, {}, 'onvif');
        }
      }
      
      // 如果还是没有，尝试使用 getUdpStreamUrl() 方法
      if (!uri) {
        try {
          uri = client.getUdpStreamUrl();
          logger.info(`Got stream URI from getUdpStreamUrl: ${uri}`, {}, 'onvif');
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 最后尝试通过 services.media.getStreamUri
      if (!uri && client.services && client.services.media) {
        try {
          const streamUriResponse = await client.services.media.getStreamUri({
            ProfileToken: profileToken,
            Protocol: 'RTSP',
          });
          uri = streamUriResponse.Uri || streamUriResponse.uri;
          logger.info(`Got stream URI from media service: ${uri}`, {}, 'onvif');
        } catch (e) {
          logger.warn('Failed to get stream URI from media service', { error: (e as Error).message }, 'onvif');
        }
      }
      
      if (!uri) {
        throw new Error('Could not get stream URI from device');
      }
      
      return { success: true, data: uri };
    } catch (err: any) {
      logger.error('Failed to get stream URI', err, 'onvif');
      return { success: false, error: err.message };
    }
  });

  // ONVIF PTZ 控制
  ipcMain.handle('onvif:ptz', async (event, deviceId: string, profileToken: string, command: string, params: any) => {
    try {
      const client = onvifClients.get(deviceId);
      if (!client) {
        throw new Error('Device not connected');
      }

      const ptz = client.services.ptz;
      if (!ptz) {
        throw new Error('PTZ service not available');
      }

      switch (command) {
        case 'relativeMove':
          await ptz.relativeMove({
            ProfileToken: profileToken,
            Translation: {
              PanTilt: {
                x: params.x || 0,
                y: params.y || 0,
              },
              Zoom: {
                x: params.zoom || 0,
              },
            },
          });
          break;
        case 'stop':
          await ptz.stop({
            ProfileToken: profileToken,
            PanTilt: true,
            Zoom: true,
          });
          break;
        default:
          throw new Error(`Unknown PTZ command: ${command}`);
      }

      logger.info(`PTZ command executed: ${command}`, { deviceId, profileToken }, 'onvif');
      return { success: true };
    } catch (err: any) {
      logger.error('PTZ command failed', err, 'onvif');
      return { success: false, error: err.message };
    }
  });

  // GB28181 服务器启动
  ipcMain.handle('gb28181:server:start', async (event, config: GB28181ServerConfig) => {
    try {
      if (gb28181Server) {
        await gb28181Server.stop();
      }

      logger.info('Starting GB28181 server', config, 'gb28181');
      
      gb28181Server = new GB28181Server(config);
      await gb28181Server.start();

      // 转发事件到渲染进程
      gb28181Server.on('deviceRegistered', (device) => {
        mainWindow?.webContents.send('gb28181:deviceRegistered', device);
      });

      gb28181Server.on('deviceOffline', (device) => {
        mainWindow?.webContents.send('gb28181:deviceOffline', device);
      });

      gb28181Server.on('sipMessage', (msg) => {
        mainWindow?.webContents.send('gb28181:sipMessage', msg);
      });

      logger.info('GB28181 server started', { port: config.sipPort }, 'gb28181');
      return { success: true };
    } catch (err: any) {
      logger.error('Failed to start GB28181 server', err, 'gb28181');
      return { success: false, error: err.message };
    }
  });

  // GB28181 服务器停止
  ipcMain.handle('gb28181:server:stop', async () => {
    try {
      if (gb28181Server) {
        await gb28181Server.stop();
        gb28181Server = null;
      }

      logger.info('GB28181 server stopped', {}, 'gb28181');
      return { success: true };
    } catch (err: any) {
      logger.error('Failed to stop GB28181 server', err, 'gb28181');
      return { success: false, error: err.message };
    }
  });

  // GB28181 服务器状态
  ipcMain.handle('gb28181:server:status', () => {
    return {
      success: true,
      data: {
        running: gb28181Server?.getRunningState() || false,
        devices: gb28181Server?.getDevices() || [],
      },
    };
  });

  // GB28181 客户端注册
  ipcMain.handle('gb28181:client:register', async (event, config: GB28181ClientConfig) => {
    try {
      logger.info('Registering GB28181 client', { deviceId: config.deviceId }, 'gb28181');
      
      const client = new GB28181Client(config);
      await client.register();

      gb28181Clients.set(config.deviceId, client);

      // 转发事件
      client.on('sipMessage', (msg) => {
        mainWindow?.webContents.send('gb28181:client:sipMessage', { deviceId: config.deviceId, ...msg });
      });

      client.on('streamStarted', (stream) => {
        mainWindow?.webContents.send('gb28181:client:streamStarted', { deviceId: config.deviceId, stream });
      });

      logger.info('GB28181 client registered', { deviceId: config.deviceId }, 'gb28181');
      return { success: true };
    } catch (err: any) {
      logger.error('GB28181 client registration failed', err, 'gb28181');
      return { success: false, error: err.message };
    }
  });

  // GB28181 客户端注销
  ipcMain.handle('gb28181:client:unregister', async (event, deviceId: string) => {
    try {
      const client = gb28181Clients.get(deviceId);
      if (client) {
        await client.unregister();
        gb28181Clients.delete(deviceId);
      }

      logger.info('GB28181 client unregistered', { deviceId }, 'gb28181');
      return { success: true };
    } catch (err: any) {
      logger.error('GB28181 client unregistration failed', err, 'gb28181');
      return { success: false, error: err.message };
    }
  });

  // GB28181 客户端请求流
  ipcMain.handle('gb28181:client:invite', async (event, deviceId: string, channelId: string, ssrc: string) => {
    try {
      const client = gb28181Clients.get(deviceId);
      if (!client) {
        throw new Error('Client not registered');
      }

      const stream = await client.inviteStream(channelId, ssrc);
      logger.info('Stream invited', { deviceId, channelId, streamId: stream.streamId }, 'gb28181');
      
      return { success: true, data: stream };
    } catch (err: any) {
      logger.error('Failed to invite stream', err, 'gb28181');
      return { success: false, error: err.message };
    }
  });

  // 抓包开始
  ipcMain.handle('packet:startCapture', (event, ports?: number[]) => {
    try {
      packetCapture.startCapture(ports);
      logger.info('Packet capture started', { ports }, 'capture');
      return { success: true };
    } catch (err: any) {
      logger.error('Failed to start packet capture', err, 'capture');
      return { success: false, error: err.message };
    }
  });

  // 抓包停止
  ipcMain.handle('packet:stopCapture', () => {
    packetCapture.stopCapture();
    logger.info('Packet capture stopped', {}, 'capture');
    return { success: true };
  });

  // 获取抓包
  ipcMain.handle('packet:getCaptures', (event, filter?: PacketFilter) => {
    const captures = packetCapture.getCaptures(filter);
    return { success: true, data: captures };
  });

  // 清除抓包
  ipcMain.handle('packet:clear', () => {
    packetCapture.clearCaptures();
    return { success: true };
  });

  // 获取日志
  ipcMain.handle('log:get', (event, filter?: LogFilter) => {
    const logs = logger.getLogs(filter);
    return { success: true, data: logs };
  });

  // 清除日志
  ipcMain.handle('log:clear', () => {
    logger.clearLogs();
    return { success: true };
  });

  // 获取应用状态
  ipcMain.handle('app:getState', () => {
    return {
      success: true,
      data: {
        onvifDevices: Array.from(onvifClients.entries()).map(([id, client]) => ({
          id,
          ...client.getDevice(),
        })),
        gb28181ServerRunning: gb28181Server?.getRunningState() || false,
        gb28181ServerDevices: gb28181Server?.getDevices() || [],
        gb28181Clients: Array.from(gb28181Clients.keys()),
        packetCapturing: packetCapture.getCapturingState(),
        logStats: logger.getStats(),
      },
    };
  });

  // 使用外部播放器打开视频流
  ipcMain.handle('video:openExternal', async (event, streamUri: string) => {
    try {
      logger.info('Opening stream with external player', { streamUri }, 'video');
      
      // 检查是否是 RTSP 流
      if (streamUri.startsWith('rtsp://')) {
        // 尝试使用 VLC 打开
        // VLC 支持 rtsp:// 协议直接打开
        const vlcUri = `vlc://${streamUri}`;
        
        // 首先尝试直接打开 RTSP 链接
        const result = await shell.openExternal(streamUri).catch(() => false);
        
        if (!result) {
          // 如果直接打开失败，尝试使用 vlc:// 协议
          const vlcResult = await shell.openExternal(vlcUri).catch(() => false);
          
          if (!vlcResult) {
            // 如果 vlc:// 协议也失败，复制到剪贴板并提示用户
            return { 
              success: false, 
              error: '无法自动打开 VLC。流地址已复制到剪贴板，请手动在 VLC 中打开。' 
            };
          }
        }
        
        return { success: true };
      } else {
        // 非 RTSP 流，直接尝试打开
        await shell.openExternal(streamUri);
        return { success: true };
      }
    } catch (err: any) {
      logger.error('Failed to open external player', err, 'video');
      return { success: false, error: err.message };
    }
  });
}

// 设置事件转发
function setupEventForwarding(): void {
  // 抓包事件
  packetCapture.on('capture', (capture) => {
    mainWindow?.webContents.send('packet:capture', capture);
  });

  // 日志事件
  logger.on('log', (entry) => {
    mainWindow?.webContents.send('log:new', entry);
  });

  // ONVIF 发现事件
  onvifDiscovery.on('device', (device) => {
    mainWindow?.webContents.send('onvif:deviceFound', device);
  });
}