/**
 * GB28181 客户端模块
 * 实现 SIP 客户端功能，向平台注册、请求视频流、PTZ 控制
 */

import { createSocket, Socket } from 'dgram';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { GB28181ClientConfig, GB28181Stream } from '../../shared/types';

// SIP 消息解析
interface SIPMessage {
  method?: string;
  uri?: string;
  version?: string;
  code?: number;
  reason?: string;
  headers: { [key: string]: string };
  body: string;
}

export class GB28181Client extends EventEmitter {
  private config: GB28181ClientConfig;
  private socket: Socket | null = null;
  private isRegistered = false;
  private cseq = 1;
  private callId: string = '';
  private registerTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private streams: Map<string, GB28181Stream> = new Map();
  private rtpSockets: Map<string, Socket> = new Map();

  constructor(config: GB28181ClientConfig) {
    super();
    this.config = config;
  }

  /**
   * 注册到平台
   */
  async register(): Promise<boolean> {
    if (this.isRegistered) {
      return true;
    }

    return new Promise((resolve, reject) => {
      // 创建 UDP socket
      this.socket = createSocket('udp4');

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg.toString(), rinfo);
      });

      this.socket.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.socket.bind(this.config.localPort, () => {
        // 发送注册请求
        this.sendRegister();

        // 等待注册响应
        const timeout = setTimeout(() => {
          reject(new Error('Register timeout'));
        }, 30000);

        this.once('registered', () => {
          clearTimeout(timeout);
          this.isRegistered = true;
          this.startKeepalive();
          this.startReRegister();
          resolve(true);
        });

        this.once('registerFailed', (reason: string) => {
          clearTimeout(timeout);
          reject(new Error(reason));
        });
      });
    });
  }

  /**
   * 注销
   */
  async unregister(): Promise<void> {
    this.stopTimers();

    if (this.socket && this.isRegistered) {
      // 发送注销请求
      this.sendRegister(0);
    }

    // 关闭所有流
    for (const [streamId, stream] of this.streams) {
      await this.stopStream(streamId);
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.isRegistered = false;
    this.emit('unregistered');
  }

  /**
   * 请求视频流
   */
  async inviteStream(channelId: string, ssrc: string): Promise<GB28181Stream> {
    if (!this.isRegistered) {
      throw new Error('Not registered');
    }

    const streamId = uuidv4();
    const callId = uuidv4();
    
    // 创建 RTP socket
    const rtpSocket = createSocket('udp4');
    const rtpPort = this.config.localPort + 2;

    rtpSocket.bind(rtpPort, () => {
      this.emit('rtpSocketReady', { streamId, port: rtpPort });
    });

    rtpSocket.on('message', (msg) => {
      this.handleRTPPacket(streamId, msg);
    });

    this.rtpSockets.set(streamId, rtpSocket);

    // 创建流对象
    const stream: GB28181Stream = {
      streamId,
      channelId,
      status: 'inviting',
      ssrc,
      localPort: rtpPort,
      rtpType: 'UDP',
      bytesReceived: 0,
      packetsReceived: 0,
      packetsLost: 0,
    };

    this.streams.set(streamId, stream);

    // 发送 INVITE 请求
    const sdp = `v=0
o=${this.config.deviceId} 0 0 IN IP4 ${this.getLocalIP()}
s=Play
c=IN IP4 ${this.getLocalIP()}
t=0 0
m=video ${rtpPort} RTP/AVP 96 97 98
a=rtpmap:96 PS/90000
a=rtpmap:97 MPEG4/90000
a=rtpmap:98 H264/90000
a=recvonly
y=${ssrc}
`;

    this.sendMessage('INVITE', `sip:${channelId}@${this.config.serverIp}:${this.config.serverPort}`, {
      'Content-Type': 'application/sdp',
      'Subject': `${channelId}:${ssrc},${this.config.deviceId}:0`,
      'Call-ID': callId,
    }, sdp);

    // 等待响应
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('INVITE timeout'));
      }, 30000);

      this.once(`inviteResponse_${callId}`, (success: boolean, response?: any) => {
        clearTimeout(timeout);
        if (success) {
          stream.status = 'playing';
          stream.startTime = new Date();
          stream.remoteIp = response.remoteIp;
          stream.remotePort = response.remotePort;
          this.emit('streamStarted', stream);
          resolve(stream);
        } else {
          stream.status = 'error';
          reject(new Error('INVITE failed'));
        }
      });
    });
  }

  /**
   * 停止视频流
   */
  async stopStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    // 发送 BYE 请求
    this.sendMessage('BYE', `sip:${stream.channelId}@${this.config.serverIp}:${this.config.serverPort}`, {
      'Call-ID': streamId,
    });

    // 关闭 RTP socket
    const rtpSocket = this.rtpSockets.get(streamId);
    if (rtpSocket) {
      rtpSocket.close();
      this.rtpSockets.delete(streamId);
    }

    stream.status = 'idle';
    this.streams.delete(streamId);
    this.emit('streamStopped', stream);
  }

  /**
   * PTZ 控制
   */
  async ptzControl(channelId: string, command: string, param: number): Promise<void> {
    if (!this.isRegistered) {
      throw new Error('Not registered');
    }

    // 构建 PTZ 控制 XML
    const ptzXml = `<?xml version="1.0"?>
<Control>
<CmdType>DeviceControl</CmdType>
<SN>${this.cseq}</SN>
<DeviceID>${channelId}</DeviceID>
<PTZCmd>${this.buildPTZCommand(command, param)}</PTZCmd>
</Control>`;

    this.sendMessage('MESSAGE', `sip:${this.config.serverId}@${this.config.serverIp}:${this.config.serverPort}`, {
      'Content-Type': 'Application/MANSCDP+xml',
    }, ptzXml);
  }

  /**
   * 查询设备目录
   */
  async queryCatalog(): Promise<void> {
    if (!this.isRegistered) {
      throw new Error('Not registered');
    }

    const catalogXml = `<?xml version="1.0"?>
<Query>
<CmdType>Catalog</CmdType>
<SN>${this.cseq}</SN>
<DeviceID>${this.config.deviceId}</DeviceID>
</Query>`;

    this.sendMessage('MESSAGE', `sip:${this.config.serverId}@${this.config.serverIp}:${this.config.serverPort}`, {
      'Content-Type': 'Application/MANSCDP+xml',
    }, catalogXml);
  }

  /**
   * 发送注册请求
   */
  private sendRegister(expires: number = this.config.registerInterval): void {
    const from = `sip:${this.config.deviceId}@${this.config.domain}`;
    const to = `sip:${this.config.deviceId}@${this.config.domain}`;
    
    this.callId = uuidv4();

    this.sendMessage('REGISTER', `sip:${this.config.domain}`, {
      'From': `<${from}>;tag=${uuidv4().substring(0, 8)}`,
      'To': `<${to}>`,
      'Call-ID': this.callId,
      'Expires': expires.toString(),
      'Contact': `<sip:${this.config.deviceId}@${this.getLocalIP()}:${this.config.localPort}>`,
    });
  }

  /**
   * 发送心跳
   */
  private sendKeepalive(): void {
    if (!this.isRegistered) return;

    const keepaliveXml = `<?xml version="1.0"?>
<Notify>
<CmdType>Keepalive</CmdType>
<SN>${this.cseq}</SN>
<DeviceID>${this.config.deviceId}</DeviceID>
<Status>OK</Status>
<Info>
</Info>
</Notify>`;

    this.sendMessage('MESSAGE', `sip:${this.config.serverId}@${this.config.serverIp}:${this.config.serverPort}`, {
      'Content-Type': 'Application/MANSCDP+xml',
    }, keepaliveXml);
  }

  /**
   * 发送 SIP 消息
   */
  private sendMessage(method: string, uri: string, headers: { [key: string]: string } = {}, body: string = ''): void {
    if (!this.socket) return;

    let message = `${method} ${uri} SIP/2.0\r\n`;
    message += `Via: SIP/2.0/UDP ${this.getLocalIP()}:${this.config.localPort};branch=z9hG4bK${uuidv4().substring(0, 8)}\r\n`;
    message += `From: <sip:${this.config.deviceId}@${this.config.domain}>;tag=${uuidv4().substring(0, 8)}\r\n`;
    message += `To: <${uri}>\r\n`;
    message += `Call-ID: ${headers['Call-ID'] || uuidv4()}\r\n`;
    message += `CSeq: ${this.cseq++} ${method}\r\n`;
    message += `Max-Forwards: 70\r\n`;
    message += `User-Agent: GB28181 Client\r\n`;

    for (const [name, value] of Object.entries(headers)) {
      message += `${name}: ${value}\r\n`;
    }

    if (body) {
      message += `Content-Length: ${Buffer.byteLength(body)}\r\n`;
      message += `\r\n`;
      message += body;
    } else {
      message += `Content-Length: 0\r\n`;
      message += `\r\n`;
    }

    this.socket.send(
      Buffer.from(message),
      this.config.serverPort,
      this.config.serverIp,
      (err) => {
        if (err) {
          this.emit('error', err);
        } else {
          this.emit('sipMessage', { direction: 'sent', message: { method, uri }, raw: message });
        }
      }
    );
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: string, rinfo: any): void {
    const sip = this.parseSIPMessage(message);
    
    this.emit('sipMessage', { direction: 'received', message: sip, raw: message });

    if (sip.code) {
      // 响应消息
      this.handleResponse(sip);
    } else if (sip.method) {
      // 请求消息
      this.handleRequest(sip);
    }
  }

  /**
   * 处理响应
   */
  private handleResponse(sip: SIPMessage): void {
    const cseq = sip.headers['CSeq'];
    const method = cseq?.split(' ')[1];

    if (sip.code === 200) {
      if (method === 'REGISTER') {
        this.emit('registered');
      } else if (method === 'INVITE') {
        const callId = sip.headers['Call-ID'];
        
        // 解析 SDP 获取远程地址
        const sdp = sip.body;
        const connectionMatch = sdp.match(/c=IN IP4 ([\d\.]+)/);
        const mediaMatch = sdp.match(/m=video (\d+)/);
        
        this.emit(`inviteResponse_${callId}`, true, {
          remoteIp: connectionMatch?.[1],
          remotePort: mediaMatch ? parseInt(mediaMatch[1]) : undefined,
        });

        // 发送 ACK
        this.sendAck(sip);
      }
    } else if (sip.code === 401) {
      // 需要认证
      if (method === 'REGISTER') {
        this.handleAuthentication(sip);
      } else {
        this.emit('registerFailed', 'Authentication required');
      }
    } else if (sip.code && sip.code >= 400) {
      if (method === 'REGISTER') {
        this.emit('registerFailed', sip.reason || 'Unknown error');
      } else if (method === 'INVITE') {
        const callId = sip.headers['Call-ID'];
        this.emit(`inviteResponse_${callId}`, false);
      }
    }
  }

  /**
   * 处理请求
   */
  private handleRequest(sip: SIPMessage): void {
    switch (sip.method) {
      case 'MESSAGE':
        // 处理平台下发的消息
        this.handlePlatformMessage(sip);
        break;
      case 'BYE':
        // 平台请求结束流
        this.handleBye(sip);
        break;
    }
  }

  /**
   * 处理平台消息
   */
  private handlePlatformMessage(sip: SIPMessage): void {
    const body = sip.body;
    
    // 解析 XML 消息
    if (body.includes('<CmdType>Catalog</CmdType>')) {
      // 目录查询响应
      this.emit('catalogResponse', body);
    }
  }

  /**
   * 处理 BYE
   */
  private handleBye(sip: SIPMessage): void {
    // 发送 200 OK
    this.sendResponse(sip, 200, 'OK');
    
    // 关闭相关流
    for (const [streamId, stream] of this.streams) {
      if (stream.status === 'playing') {
        this.stopStream(streamId);
        break;
      }
    }
  }

  /**
   * 处理认证
   */
  private handleAuthentication(sip: SIPMessage): void {
    const wwwAuth = sip.headers['WWW-Authenticate'];
    if (!wwwAuth) return;

    // 解析认证参数
    const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
    const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);

    if (!realmMatch || !nonceMatch) return;

    const realm = realmMatch[1];
    const nonce = nonceMatch[1];

    // 计算 MD5 摘要（简化实现）
    const ha1 = this.md5(`${this.config.deviceId}:${realm}:${this.config.password}`);
    const ha2 = this.md5(`REGISTER:sip:${this.config.domain}`);
    const response = this.md5(`${ha1}:${nonce}:${ha2}`);

    // 重新发送带认证的注册请求
    const from = `sip:${this.config.deviceId}@${this.config.domain}`;
    const to = `sip:${this.config.deviceId}@${this.config.domain}`;

    this.sendMessage('REGISTER', `sip:${this.config.domain}`, {
      'From': `<${from}>;tag=${uuidv4().substring(0, 8)}`,
      'To': `<${to}>`,
      'Call-ID': this.callId,
      'Expires': this.config.registerInterval.toString(),
      'Contact': `<sip:${this.config.deviceId}@${this.getLocalIP()}:${this.config.localPort}>`,
      'Authorization': `Digest username="${this.config.deviceId}", realm="${realm}", nonce="${nonce}", uri="sip:${this.config.domain}", response="${response}", algorithm=MD5`,
    });
  }

  /**
   * 发送 ACK
   */
  private sendAck(response: SIPMessage): void {
    const to = response.headers['To'];
    const from = response.headers['From'];
    const callId = response.headers['Call-ID'];
    const cseq = response.headers['CSeq'];

    this.sendMessage('ACK', to?.replace(/<|>/g, '').split(';')[0] || '', {
      'To': to,
      'From': from,
      'Call-ID': callId,
      'CSeq': cseq?.replace(/INVITE/, 'ACK'),
    });
  }

  /**
   * 发送响应
   */
  private sendResponse(request: SIPMessage, code: number, reason: string): void {
    if (!this.socket) return;

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
    response += `Content-Length: 0\r\n`;
    response += `\r\n`;

    this.socket.send(
      Buffer.from(response),
      this.config.serverPort,
      this.config.serverIp,
      (err) => {
        if (err) {
          this.emit('error', err);
        }
      }
    );
  }

  /**
   * 解析 SIP 消息
   */
  private parseSIPMessage(message: string): SIPMessage {
    const lines = message.split('\r\n');
    const firstLine = lines[0];
    
    let method: string | undefined;
    let uri: string | undefined;
    let version: string | undefined;
    let code: number | undefined;
    let reason: string | undefined;

    // 判断是请求还是响应
    if (firstLine.startsWith('SIP/2.0')) {
      // 响应
      const parts = firstLine.split(' ');
      version = parts[0];
      code = parseInt(parts[1]);
      reason = parts.slice(2).join(' ');
    } else {
      // 请求
      const parts = firstLine.split(' ');
      method = parts[0];
      uri = parts[1];
      version = parts[2];
    }

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

    return { method, uri, version, code, reason, headers, body };
  }

  /**
   * 处理 RTP 包
   */
  private handleRTPPacket(streamId: string, packet: Buffer): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    stream.bytesReceived += packet.length;
    stream.packetsReceived++;

    this.emit('rtpPacket', { streamId, packet });
  }

  /**
   * 构建 PTZ 命令
   */
  private buildPTZCommand(command: string, param: number): string {
    // GB28181 PTZ 命令格式（简化）
    const cmdMap: { [key: string]: string } = {
      'up': 'A5',
      'down': 'A7',
      'left': 'A9',
      'right': 'AB',
      'zoomIn': 'AD',
      'zoomOut': 'AF',
      'stop': '00',
    };

    const cmd = cmdMap[command] || '00';
    const speed = Math.min(255, Math.max(0, param)).toString(16).padStart(2, '0');
    
    return `A50F01${cmd}${speed}${speed}0000`;
  }

  /**
   * 启动心跳定时器
   */
  private startKeepalive(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendKeepalive();
    }, this.config.heartbeatInterval * 1000);
  }

  /**
   * 启动重新注册定时器
   */
  private startReRegister(): void {
    const interval = Math.max(30, this.config.registerInterval - 60);
    this.registerTimer = setInterval(() => {
      this.sendRegister();
    }, interval * 1000);
  }

  /**
   * 停止定时器
   */
  private stopTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.registerTimer) {
      clearInterval(this.registerTimer);
      this.registerTimer = null;
    }
  }

  /**
   * 获取本地 IP
   */
  private getLocalIP(): string {
    // 简化实现，实际应该获取正确的本地 IP
    return '127.0.0.1';
  }

  /**
   * MD5 计算
   */
  private md5(str: string): string {
    // 简化实现，实际应该使用 crypto 模块
    return str;
  }

  /**
   * 检查是否已注册
   */
  isConnected(): boolean {
    return this.isRegistered;
  }

  /**
   * 获取所有流
   */
  getStreams(): GB28181Stream[] {
    return Array.from(this.streams.values());
  }

  /**
   * 获取流
   */
  getStream(streamId: string): GB28181Stream | undefined {
    return this.streams.get(streamId);
  }
}