/**
 * GB28181 服务器模块
 * 实现 SIP 服务器功能，接收设备注册、处理心跳、支持视频流请求
 */

import { createServer, Server, Socket } from 'net';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { GB28181Device, GB28181ServerConfig, GB28181Channel, GB28181Stream } from '../../shared/types';

// SIP 消息解析
interface SIPMessage {
  method: string;
  uri: string;
  version: string;
  headers: { [key: string]: string };
  body: string;
}

export class GB28181Server extends EventEmitter {
  private config: GB28181ServerConfig;
  private server: Server | null = null;
  private devices: Map<string, GB28181Device> = new Map();
  private sockets: Map<string, Socket> = new Map();
  private streams: Map<string, GB28181Stream> = new Map();
  private isRunning = false;
  private cseq = 1;

  constructor(config: GB28181ServerConfig) {
    super();
    this.config = config;
  }

  /**
   * 启动 GB28181 服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.config.sipPort, () => {
        this.isRunning = true;
        this.emit('started', { port: this.config.sipPort });
        resolve();
      });
    });
  }

  /**
   * 停止 GB28181 服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    // 关闭所有连接
    for (const [deviceId, socket] of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * 处理新连接
   */
  private handleConnection(socket: Socket): void {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    
    this.emit('connection', { clientId, address: socket.remoteAddress, port: socket.remotePort });

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // 处理完整的 SIP 消息
      while (true) {
        const messageEnd = buffer.indexOf('\r\n\r\n');
        if (messageEnd === -1) break;

        const contentLength = this.parseContentLength(buffer);
        const totalLength = messageEnd + 4 + contentLength;

        if (buffer.length < totalLength) break;

        const message = buffer.substring(0, totalLength);
        buffer = buffer.substring(totalLength);

        this.handleSIPMessage(socket, message);
      }
    });

    socket.on('close', () => {
      this.emit('disconnection', { clientId });
      // 查找并更新设备状态
      for (const [deviceId, device] of this.devices) {
        if (device.status === 'registered') {
          device.status = 'offline';
          this.emit('deviceOffline', device);
        }
      }
    });

    socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  /**
   * 解析 Content-Length
   */
  private parseContentLength(message: string): number {
    const match = message.match(/Content-Length:\s*(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 处理 SIP 消息
   */
  private handleSIPMessage(socket: Socket, message: string): void {
    try {
      const sip = this.parseSIPMessage(message);
      
      this.emit('sipMessage', { direction: 'received', message: sip, raw: message });

      switch (sip.method) {
        case 'REGISTER':
          this.handleRegister(socket, sip);
          break;
        case 'MESSAGE':
          this.handleMessage(socket, sip);
          break;
        case 'INVITE':
          this.handleInvite(socket, sip);
          break;
        case 'ACK':
          this.handleAck(socket, sip);
          break;
        case 'BYE':
          this.handleBye(socket, sip);
          break;
        default:
          this.sendResponse(socket, sip, 405, 'Method Not Allowed');
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * 解析 SIP 消息
   */
  private parseSIPMessage(message: string): SIPMessage {
    const lines = message.split('\r\n');
    const firstLine = lines[0];
    
    // 解析请求行
    const parts = firstLine.split(' ');
    const method = parts[0];
    const uri = parts[1];
    const version = parts[2];

    // 解析头部
    const headers: { [key: string]: string } = {};
    let i = 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') break;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[name] = value;
      }
    }

    // 解析 body
    const body = lines.slice(i + 1).join('\r\n');

    return { method, uri, version, headers, body };
  }

  /**
   * 处理注册请求
   */
  private handleRegister(socket: Socket, sip: SIPMessage): void {
    const from = sip.headers['From'];
    const to = sip.headers['To'];
    const callId = sip.headers['Call-ID'];
    const expires = parseInt(sip.headers['Expires'] || '3600');
    
    // 提取设备 ID
    const deviceIdMatch = from?.match(/:(\d+)@/);
    const deviceId = deviceIdMatch ? deviceIdMatch[1] : '';

    if (!deviceId) {
      this.sendResponse(socket, sip, 400, 'Bad Request');
      return;
    }

    // 验证密码（简化处理，实际应该进行 MD5 摘要认证）
    const authorization = sip.headers['Authorization'];
    if (this.config.password && !authorization) {
      // 需要认证
      const wwwAuth = `Digest realm="${this.config.sipDomain}", nonce="${this.generateNonce()}", algorithm=MD5`;
      this.sendResponse(socket, sip, 401, 'Unauthorized', { 'WWW-Authenticate': wwwAuth });
      return;
    }

    // 创建设备或更新设备
    let device = this.devices.get(deviceId);
    if (!device) {
      device = {
        id: uuidv4(),
        deviceId,
        name: `Device ${deviceId}`,
        manufacturer: '',
        model: '',
        firmware: '',
        channelCount: 0,
        status: 'registered',
        registerTime: new Date(),
        lastKeepalive: new Date(),
        localSipPort: this.config.sipPort,
        serverIp: sip.headers['Via']?.match(/[\d\.]+/)?.[0] || '',
        serverPort: this.config.sipPort,
        serverId: this.config.sipId,
        domain: this.config.sipDomain,
        channels: [],
        streams: [],
      };
      this.devices.set(deviceId, device);
      this.sockets.set(deviceId, socket);
    }

    device.status = 'registered';
    device.lastKeepalive = new Date();

    // 发送成功响应
    this.sendResponse(socket, sip, 200, 'OK', {
      'Expires': expires.toString(),
      'Date': new Date().toUTCString(),
    });

    this.emit('deviceRegistered', device);
  }

  /**
   * 处理消息请求（心跳、设备信息、目录等）
   */
  private handleMessage(socket: Socket, sip: SIPMessage): void {
    const contentType = sip.headers['Content-Type'];
    
    if (contentType?.includes('MANSCDP+xml')) {
      // 处理设备目录或信息
      this.handleDeviceInfo(socket, sip);
    } else if (contentType?.includes('Keepalive')) {
      // 处理心跳
      this.handleKeepalive(socket, sip);
    }

    this.sendResponse(socket, sip, 200, 'OK');
  }

  /**
   * 处理设备信息
   */
  private handleDeviceInfo(socket: Socket, sip: SIPMessage): void {
    const from = sip.headers['From'];
    const deviceIdMatch = from?.match(/:(\d+)@/);
    const deviceId = deviceIdMatch ? deviceIdMatch[1] : '';

    const device = this.devices.get(deviceId);
    if (!device) return;

    // 解析 XML body 获取设备信息
    const body = sip.body;
    
    // 提取设备信息（简化处理）
    const deviceNameMatch = body.match(/<DeviceName>(.*?)<\/DeviceName>/);
    const manufacturerMatch = body.match(/<Manufacturer>(.*?)<\/Manufacturer>/);
    const modelMatch = body.match(/<Model>(.*?)<\/Model>/);

    if (deviceNameMatch) device.name = deviceNameMatch[1];
    if (manufacturerMatch) device.manufacturer = manufacturerMatch[1];
    if (modelMatch) device.model = modelMatch[1];

    // 提取通道信息
    const channelMatches = body.matchAll(/<Item\s+[^>]*ChannelID="(\d+)"[^>]*>(.*?)<\/Item>/g);
    for (const match of channelMatches) {
      const channelId = match[1];
      const channelName = match[2].match(/<Name>(.*?)<\/Name>/)?.[1] || `Channel ${channelId}`;
      
      const channel: GB28181Channel = {
        channelId,
        name: channelName,
        status: 'online',
      };

      const existingIndex = device.channels.findIndex(c => c.channelId === channelId);
      if (existingIndex >= 0) {
        device.channels[existingIndex] = channel;
      } else {
        device.channels.push(channel);
      }
    }

    device.channelCount = device.channels.length;
    this.emit('deviceInfo', device);
  }

  /**
   * 处理心跳
   */
  private handleKeepalive(socket: Socket, sip: SIPMessage): void {
    const from = sip.headers['From'];
    const deviceIdMatch = from?.match(/:(\d+)@/);
    const deviceId = deviceIdMatch ? deviceIdMatch[1] : '';

    const device = this.devices.get(deviceId);
    if (device) {
      device.lastKeepalive = new Date();
      device.status = 'registered';
      this.emit('deviceKeepalive', device);
    }
  }

  /**
   * 处理 INVITE 请求（上级平台请求视频流）
   */
  private handleInvite(socket: Socket, sip: SIPMessage): void {
    const to = sip.headers['To'];
    const subject = sip.headers['Subject'];
    
    // 提取目标设备 ID 和通道 ID
    const deviceIdMatch = to?.match(/:(\d+)@/);
    const deviceId = deviceIdMatch ? deviceIdMatch[1] : '';

    // 解析 SDP
    const sdp = sip.body;
    const ssrcMatch = sdp.match(/y=(\d+)/);
    const ssrc = ssrcMatch ? ssrcMatch[1] : '';

    // 分配媒体端口
    const mediaPort = this.allocateMediaPort();

    // 创建流
    const stream: GB28181Stream = {
      streamId: uuidv4(),
      channelId: deviceId,
      status: 'inviting',
      ssrc,
      localPort: mediaPort,
      rtpType: 'UDP',
      bytesReceived: 0,
      packetsReceived: 0,
      packetsLost: 0,
    };

    this.streams.set(stream.streamId, stream);

    // 构建响应 SDP
    const responseSdp = `v=0
o=- 0 0 IN IP4 ${this.config.sipDomain}
s=Play
u=${deviceId}:3
c=IN IP4 ${this.config.sipDomain}
t=0 0
m=video ${mediaPort} RTP/AVP 96 97 98
a=rtpmap:96 PS/90000
a=rtpmap:97 MPEG4/90000
a=rtpmap:98 H264/90000
a=recvonly
y=${ssrc}
`;

    this.sendResponse(socket, sip, 200, 'OK', {
      'Content-Type': 'application/sdp',
    }, responseSdp);

    stream.status = 'playing';
    stream.startTime = new Date();
    this.emit('streamStarted', stream);
  }

  /**
   * 处理 ACK
   */
  private handleAck(socket: Socket, sip: SIPMessage): void {
    // ACK 确认，流已建立
    this.emit('ackReceived', sip);
  }

  /**
   * 处理 BYE
   */
  private handleBye(socket: Socket, sip: SIPMessage): void {
    // 结束流
    const callId = sip.headers['Call-ID'];
    
    for (const [streamId, stream] of this.streams) {
      if (stream.status === 'playing') {
        stream.status = 'idle';
        this.emit('streamStopped', stream);
        break;
      }
    }

    this.sendResponse(socket, sip, 200, 'OK');
  }

  /**
   * 发送 SIP 响应
   */
  private sendResponse(
    socket: Socket, 
    request: SIPMessage, 
    code: number, 
    reason: string,
    extraHeaders: { [key: string]: string } = {},
    body: string = ''
  ): void {
    const via = request.headers['Via'];
    const from = request.headers['From'];
    const to = request.headers['To'];
    const callId = request.headers['Call-ID'];
    const cseq = request.headers['CSeq'];

    let response = `SIP/2.0 ${code} ${reason}\r\n`;
    response += `Via: ${via}\r\n`;
    response += `From: ${from}\r\n`;
    response += `To: ${to}\r\n`;
    response += `Call-ID: ${callId}\r\n`;
    response += `CSeq: ${cseq}\r\n`;
    
    for (const [name, value] of Object.entries(extraHeaders)) {
      response += `${name}: ${value}\r\n`;
    }

    if (body) {
      response += `Content-Length: ${Buffer.byteLength(body)}\r\n`;
      response += `\r\n`;
      response += body;
    } else {
      response += `Content-Length: 0\r\n`;
      response += `\r\n`;
    }

    socket.write(response);

    this.emit('sipMessage', { direction: 'sent', message: { code, reason }, raw: response });
  }

  /**
   * 生成 nonce
   */
  private generateNonce(): string {
    return Buffer.from(Math.random().toString()).toString('base64');
  }

  /**
   * 分配媒体端口
   */
  private allocateMediaPort(): number {
    // 简化实现，实际应该检查端口是否被占用
    return this.config.mediaPortMin + Math.floor(Math.random() * 
      (this.config.mediaPortMax - this.config.mediaPortMin));
  }

  /**
   * 获取所有设备
   */
  getDevices(): GB28181Device[] {
    return Array.from(this.devices.values());
  }

  /**
   * 获取设备
   */
  getDevice(deviceId: string): GB28181Device | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * 获取所有流
   */
  getStreams(): GB28181Stream[] {
    return Array.from(this.streams.values());
  }

  /**
   * 检查是否运行中
   */
  getRunningState(): boolean {
    return this.isRunning;
  }
}