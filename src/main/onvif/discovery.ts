/**
 * ONVIF 设备发现模块
 * 实现 WS-Discovery 协议用于发现网络中的 ONVIF 设备
 */

import { createSocket, Socket } from 'dgram';
import { EventEmitter } from 'events';
// XML parsing is done inline to avoid dependency issues
import { ONVIFDevice } from '../../shared/types';

const WS_DISCOVERY_MULTICAST = '239.255.255.250';
const WS_DISCOVERY_PORT = 3702;

// WS-Discovery Probe 消息模板
const PROBE_MESSAGE = `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:tns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <Header>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:{{messageId}}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </Header>
  <Body>
    <tns:Probe>
      <tns:Types>dn:NetworkVideoTransmitter tds:Device</tns:Types>
    </tns:Probe>
  </Body>
</Envelope>`;

export interface DiscoveryOptions {
  timeout?: number;
  networkInterface?: string;
}

export class ONVIFDiscovery extends EventEmitter {
  private socket: Socket | null = null;
  private isRunning = false;
  private discoveredDevices: Map<string, ONVIFDevice> = new Map();

  constructor() {
    super();
  }

  /**
   * 开始设备发现
   */
  async startDiscovery(options: DiscoveryOptions = {}): Promise<void> {
    const { timeout = 5000 } = options;

    if (this.isRunning) {
      throw new Error('Discovery is already running');
    }

    this.isRunning = true;
    this.discoveredDevices.clear();

    return new Promise((resolve, reject) => {
      // 创建 UDP socket
      this.socket = createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('message', async (msg, rinfo) => {
        try {
          const device = await this.parseProbeResponse(msg, rinfo);
          if (device && !this.discoveredDevices.has(device.uuid)) {
            this.discoveredDevices.set(device.uuid, device);
            this.emit('device', device);
          }
        } catch (err) {
          this.emit('error', err);
        }
      });

      this.socket.bind(() => {
        if (!this.socket) return;

        // 加入多播组
        this.socket.addMembership(WS_DISCOVERY_MULTICAST);

        // 发送 Probe 消息
        const messageId = this.generateUUID();
        const probeMessage = PROBE_MESSAGE.replace('{{messageId}}', messageId);

        this.socket.send(
          probeMessage,
          WS_DISCOVERY_PORT,
          WS_DISCOVERY_MULTICAST,
          (err) => {
            if (err) {
              this.emit('error', err);
              reject(err);
              return;
            }
            this.emit('probeSent', { messageId, address: WS_DISCOVERY_MULTICAST });
          }
        );

        // 设置超时
        setTimeout(() => {
          this.stopDiscovery();
          resolve();
        }, timeout);
      });
    });
  }

  /**
   * 停止设备发现
   */
  stopDiscovery(): void {
    if (this.socket) {
      try {
        this.socket.dropMembership(WS_DISCOVERY_MULTICAST);
        this.socket.close();
      } catch (err) {
        // 忽略关闭错误
      }
      this.socket = null;
    }
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * 获取已发现的设备列表
   */
  getDiscoveredDevices(): ONVIFDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * 解析 Probe 响应
   */
  private async parseProbeResponse(msg: Buffer, rinfo: any): Promise<ONVIFDevice | null> {
    try {
      const xml = msg.toString('utf-8');
      // Simple XML parsing for WS-Discovery response
      const result = this.parseXML(xml);

      const envelope = result['SOAP-ENV:Envelope'] || result['s:Envelope'] || result.Envelope;
      if (!envelope) return null;

      const body = envelope['SOAP-ENV:Body'] || envelope['s:Body'] || envelope.Body;
      if (!body) return null;

      const probeMatch = body['d:ProbeMatches']?.['d:ProbeMatch'] || 
                        body.ProbeMatches?.ProbeMatch;
      if (!probeMatch) return null;

      // 提取 XAddrs
      const xaddrs = result.XAddrs || '';
      const xaddrList = xaddrs.split(' ').filter((x: string) => x.startsWith('http'));
      if (xaddrList.length === 0) return null;

      const xaddr = xaddrList[0];
      const url = new URL(xaddr);

      // 提取 Endpoint Reference
      const address = result.Address || '';
      const uuid = address.replace('urn:uuid:', '');

      // 提取 Scopes
      const scopes = result.Scopes || '';
      const scopeList = scopes.split(' ');

      // 解析 scope 信息
      let manufacturer = '';
      let hardwareId = '';

      for (const scope of scopeList) {
        if (scope.includes('onvif://www.onvif.org/name/')) {
          manufacturer = decodeURIComponent(scope.replace('onvif://www.onvif.org/name/', ''));
        }
        if (scope.includes('onvif://www.onvif.org/hardware/')) {
          hardwareId = decodeURIComponent(scope.replace('onvif://www.onvif.org/hardware/', ''));
        }
      }

      const device: ONVIFDevice = {
        uuid,
        name: manufacturer || 'Unknown Device',
        xaddr,
        ip: url.hostname,
        port: parseInt(url.port) || 80,
        manufacturer,
        model: '',
        hardwareId,
        status: 'online',
        lastSeen: new Date(),
      };

      return device;
    } catch (err) {
      this.emit('error', err);
      return null;
    }
  }

  /**
   * 生成 UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 简单 XML 解析
   */
  private parseXML(xml: string): any {
    const result: any = {};
    
    // Extract XAddrs
    const xaddrsMatch = xml.match(/<(?:d:)?XAddrs>([^<]+)<\/(?:d:)?XAddrs>/);
    if (xaddrsMatch) {
      result.XAddrs = xaddrsMatch[1];
    }
    
    // Extract Address
    const addressMatch = xml.match(/<(?:d:)?Address>([^<]+)<\/(?:d:)?Address>/);
    if (addressMatch) {
      result.Address = addressMatch[1];
    }
    
    // Extract Scopes
    const scopesMatch = xml.match(/<(?:d:)?Scopes>([^<]+)<\/(?:d:)?Scopes>/);
    if (scopesMatch) {
      result.Scopes = scopesMatch[1];
    }
    
    return result;
  }

  /**
   * 检查是否正在运行
   */
  isDiscovering(): boolean {
    return this.isRunning;
  }
}