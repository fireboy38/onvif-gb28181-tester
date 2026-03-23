/**
 * 抓包分析模块
 * 实现网络数据包捕获和分析功能
 */

import { EventEmitter } from 'events';
import { Socket, createSocket } from 'dgram';
import { PacketCapture, PacketFilter } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

export class PacketCaptureService extends EventEmitter {
  private isCapturing = false;
  private captures: PacketCapture[] = [];
  private maxCaptures = 10000;
  private sockets: Map<string, Socket> = new Map();
  private filter: PacketFilter = {};

  constructor() {
    super();
  }

  /**
   * 开始抓包
   */
  startCapture(ports: number[] = []): void {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    this.emit('started');

    // 监听常用端口
    const defaultPorts = [80, 554, 5060, 5061, 3702, 8000, 8080];
    const portsToListen = ports.length > 0 ? ports : defaultPorts;

    for (const port of portsToListen) {
      this.createCaptureSocket(port);
    }
  }

  /**
   * 停止抓包
   */
  stopCapture(): void {
    this.isCapturing = false;

    // 关闭所有 socket
    for (const [key, socket] of this.sockets) {
      socket.close();
    }
    this.sockets.clear();

    this.emit('stopped');
  }

  /**
   * 设置过滤器
   */
  setFilter(filter: PacketFilter): void {
    this.filter = filter;
  }

  /**
   * 获取抓包列表
   */
  getCaptures(filter?: PacketFilter): PacketCapture[] {
    let result = [...this.captures];

    const activeFilter = filter || this.filter;

    if (activeFilter.protocols && activeFilter.protocols.length > 0) {
      result = result.filter(c => activeFilter.protocols!.includes(c.protocol));
    }

    if (activeFilter.direction) {
      result = result.filter(c => c.direction === activeFilter.direction);
    }

    if (activeFilter.ip) {
      result = result.filter(c => 
        c.sourceIp.includes(activeFilter.ip!) || c.destIp.includes(activeFilter.ip!)
      );
    }

    if (activeFilter.port) {
      result = result.filter(c => 
        c.sourcePort === activeFilter.port || c.destPort === activeFilter.port
      );
    }

    if (activeFilter.method) {
      result = result.filter(c => c.method?.includes(activeFilter.method!));
    }

    if (activeFilter.searchText) {
      const search = activeFilter.searchText.toLowerCase();
      result = result.filter(c => 
        c.body.toLowerCase().includes(search) ||
        c.sourceIp.includes(search) ||
        c.destIp.includes(search)
      );
    }

    if (activeFilter.startTime) {
      result = result.filter(c => c.timestamp >= activeFilter.startTime!);
    }

    if (activeFilter.endTime) {
      result = result.filter(c => c.timestamp <= activeFilter.endTime!);
    }

    return result;
  }

  /**
   * 清除抓包
   */
  clearCaptures(): void {
    this.captures = [];
    this.emit('cleared');
  }

  /**
   * 添加抓包记录
   */
  addCapture(capture: Omit<PacketCapture, 'id'>): void {
    if (!this.isCapturing) return;

    const fullCapture: PacketCapture = {
      ...capture,
      id: uuidv4(),
    };

    this.captures.push(fullCapture);

    // 限制最大数量
    if (this.captures.length > this.maxCaptures) {
      this.captures = this.captures.slice(-this.maxCaptures);
    }

    this.emit('capture', fullCapture);
  }

  /**
   * 创建抓包 socket
   */
  private createCaptureSocket(port: number): void {
    try {
      const socket = createSocket('udp4');
      
      socket.on('message', (msg, rinfo) => {
        this.handlePacket(msg, rinfo, port, 'received');
      });

      socket.on('error', (err) => {
        this.emit('error', { port, error: err });
      });

      socket.bind(port, () => {
        this.sockets.set(`udp:${port}`, socket);
      });
    } catch (err) {
      this.emit('error', { port, error: err });
    }
  }

  /**
   * 处理数据包
   */
  private handlePacket(msg: Buffer, rinfo: any, localPort: number, direction: 'sent' | 'received'): void {
    const content = msg.toString('utf-8');
    
    // 识别协议
    const protocol = this.identifyProtocol(content, localPort);
    
    // 解析方法
    const method = this.parseMethod(content, protocol);

    const capture: Omit<PacketCapture, 'id'> = {
      timestamp: new Date(),
      protocol,
      direction,
      sourceIp: direction === 'received' ? rinfo.address : 'localhost',
      sourcePort: direction === 'received' ? rinfo.port : localPort,
      destIp: direction === 'received' ? 'localhost' : rinfo.address,
      destPort: direction === 'received' ? localPort : rinfo.port,
      method,
      contentType: this.parseContentType(content),
      body: content.substring(0, 10000), // 限制大小
      bodySize: msg.length,
      parsed: this.tryParse(content, protocol),
      raw: msg,
    };

    this.addCapture(capture);
  }

  /**
   * 识别协议
   */
  private identifyProtocol(content: string, port: number): PacketCapture['protocol'] {
    if (content.includes('<?xml') && content.includes('soap')) {
      return 'ONVIF';
    }
    if (content.includes('SIP/2.0') || content.startsWith('REGISTER') || content.startsWith('INVITE')) {
      return 'GB28181';
    }
    if (port === 554 || content.includes('RTSP/1.0')) {
      return 'RTSP';
    }
    if (content.includes('HTTP/1.')) {
      return 'HTTP';
    }
    if (content.includes('RTP')) {
      return 'RTP';
    }
    return 'UDP';
  }

  /**
   * 解析方法
   */
  private parseMethod(content: string, protocol: PacketCapture['protocol']): string | undefined {
    const lines = content.split('\r\n');
    const firstLine = lines[0];

    if (protocol === 'HTTP' || protocol === 'RTSP') {
      const parts = firstLine.split(' ');
      return parts[0]; // GET, POST, etc.
    }

    if (protocol === 'GB28181') {
      if (firstLine.startsWith('SIP/2.0')) {
        return firstLine.split(' ')[1]; // 200, 401, etc.
      }
      return firstLine.split(' ')[0]; // REGISTER, INVITE, etc.
    }

    if (protocol === 'ONVIF') {
      const match = content.match(/<[^>]+:([A-Za-z]+)>/);
      return match ? match[1] : undefined;
    }

    return undefined;
  }

  /**
   * 解析 Content-Type
   */
  private parseContentType(content: string): string | undefined {
    const match = content.match(/Content-Type:\s*([^\r\n]+)/i);
    return match ? match[1].trim() : undefined;
  }

  /**
   * 尝试解析内容
   */
  private tryParse(content: string, protocol: PacketCapture['protocol']): any {
    try {
      if (protocol === 'ONVIF' || content.includes('<?xml')) {
        // 解析 XML
        const parser = new (require('fast-xml-parser').XMLParser)({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        return parser.parse(content);
      }
      
      if (protocol === 'GB28181') {
        // 解析 SIP
        return this.parseSIP(content);
      }

      if (protocol === 'HTTP') {
        // 解析 HTTP
        return this.parseHTTP(content);
      }
    } catch (err) {
      // 解析失败返回 null
    }
    return null;
  }

  /**
   * 解析 SIP 消息
   */
  private parseSIP(content: string): any {
    const lines = content.split('\r\n');
    const result: any = {
      headers: {},
      body: '',
    };

    // 解析起始行
    const firstLine = lines[0];
    if (firstLine.startsWith('SIP/2.0')) {
      const parts = firstLine.split(' ');
      result.version = parts[0];
      result.code = parseInt(parts[1]);
      result.reason = parts.slice(2).join(' ');
    } else {
      const parts = firstLine.split(' ');
      result.method = parts[0];
      result.uri = parts[1];
      result.version = parts[2];
    }

    // 解析头部
    let i = 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') break;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        result.headers[name] = value;
      }
    }

    // 解析 body
    result.body = lines.slice(i + 1).join('\r\n');

    return result;
  }

  /**
   * 解析 HTTP 消息
   */
  private parseHTTP(content: string): any {
    const lines = content.split('\r\n');
    const result: any = {
      headers: {},
      body: '',
    };

    // 解析起始行
    const firstLine = lines[0];
    if (firstLine.startsWith('HTTP/')) {
      const parts = firstLine.split(' ');
      result.version = parts[0];
      result.code = parseInt(parts[1]);
      result.reason = parts.slice(2).join(' ');
    } else {
      const parts = firstLine.split(' ');
      result.method = parts[0];
      result.path = parts[1];
      result.version = parts[2];
    }

    // 解析头部
    let i = 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') break;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        result.headers[name] = value;
      }
    }

    // 解析 body
    result.body = lines.slice(i + 1).join('\r\n');

    return result;
  }

  /**
   * 检查是否正在抓包
   */
  getCapturingState(): boolean {
    return this.isCapturing;
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; byProtocol: { [key: string]: number } } {
    const byProtocol: { [key: string]: number } = {};
    
    for (const capture of this.captures) {
      byProtocol[capture.protocol] = (byProtocol[capture.protocol] || 0) + 1;
    }

    return {
      total: this.captures.length,
      byProtocol,
    };
  }
}