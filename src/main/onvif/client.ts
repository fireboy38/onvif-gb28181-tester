/**
 * ONVIF 客户端模块
 * 实现 ONVIF 设备连接、能力获取、PTZ 控制等功能
 */

import axios, { AxiosInstance } from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import { ONVIFDevice, ONVIFProfile, ONVIFCapabilities, ONVIFService } from '../../shared/types';

export interface ONVIFClientOptions {
  xaddr: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export class ONVIFClient extends EventEmitter {
  private xaddr: string;
  private username?: string;
  private password?: string;
  private timeout: number;
  private http: AxiosInstance;
  private parser: XMLParser;
  private builder: XMLBuilder;
  private deviceInfo: Partial<ONVIFDevice> = {};
  private capabilities?: ONVIFCapabilities;
  private services: ONVIFService[] = [];
  private profiles: ONVIFProfile[] = [];

  constructor(options: ONVIFClientOptions) {
    super();
    this.xaddr = options.xaddr;
    this.username = options.username;
    this.password = options.password;
    this.timeout = options.timeout || 30000;

    this.http = axios.create({
      timeout: this.timeout,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
  }

  /**
   * 连接设备并获取基本信息
   */
  async connect(): Promise<boolean> {
    try {
      // 获取设备能力
      await this.getCapabilities();
      
      // 获取设备信息
      await this.getDeviceInformation();
      
      // 获取媒体配置
      if (this.capabilities?.media) {
        await this.getProfiles();
      }

      this.emit('connected', this.deviceInfo);
      return true;
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * 获取设备能力
   */
  async getCapabilities(): Promise<ONVIFCapabilities> {
    const soapBody = this.createSoapEnvelope({
      'tds:GetCapabilities': {
        'tds:Category': 'All',
      },
    });

    const response = await this.sendRequest('/onvif/device_service', soapBody);
    const parsed = this.parser.parse(response);
    
    const capabilities = this.extractCapabilities(parsed);
    this.capabilities = capabilities;
    
    this.emit('capabilities', capabilities);
    return capabilities;
  }

  /**
   * 获取设备信息
   */
  async getDeviceInformation(): Promise<Partial<ONVIFDevice>> {
    const soapBody = this.createSoapEnvelope({
      'tds:GetDeviceInformation': {},
    });

    const response = await this.sendRequest('/onvif/device_service', soapBody);
    const parsed = this.parser.parse(response);

    const info = this.extractDeviceInfo(parsed);
    this.deviceInfo = { ...this.deviceInfo, ...info };
    
    return info;
  }

  /**
   * 获取媒体配置文件
   */
  async getProfiles(): Promise<ONVIFProfile[]> {
    if (!this.capabilities?.media?.XAddr) {
      throw new Error('Media service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'trt:GetProfiles': {},
    });

    const response = await this.sendRequest(this.capabilities.media.XAddr, soapBody);
    const parsed = this.parser.parse(response);

    const profiles = this.extractProfiles(parsed);
    this.profiles = profiles;
    
    this.emit('profiles', profiles);
    return profiles;
  }

  /**
   * 获取视频流地址
   */
  async getStreamUri(profileToken: string, protocol: 'UDP' | 'TCP' | 'RTSP' = 'RTSP'): Promise<string> {
    if (!this.capabilities?.media?.XAddr) {
      throw new Error('Media service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'trt:GetStreamUri': {
        'trt:StreamSetup': {
          'tt:Stream': 'RTP-Unicast',
          'tt:Transport': {
            'tt:Protocol': protocol,
          },
        },
        'trt:ProfileToken': profileToken,
      },
    });

    const response = await this.sendRequest(this.capabilities.media.XAddr, soapBody);
    const parsed = this.parser.parse(response);

    const uri = this.extractStreamUri(parsed);
    
    // 添加认证信息
    if (this.username && this.password) {
      const url = new URL(uri);
      url.username = this.username;
      url.password = this.password;
      return url.toString();
    }
    
    return uri;
  }

  /**
   * 获取快照地址
   */
  async getSnapshotUri(profileToken: string): Promise<string> {
    if (!this.capabilities?.media?.XAddr) {
      throw new Error('Media service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'trt:GetSnapshotUri': {
        'trt:ProfileToken': profileToken,
      },
    });

    const response = await this.sendRequest(this.capabilities.media.XAddr, soapBody);
    const parsed = this.parser.parse(response);

    return this.extractSnapshotUri(parsed);
  }

  /**
   * PTZ 控制 - 绝对移动
   */
  async absoluteMove(profileToken: string, position: { x: number; y: number; zoom: number }): Promise<void> {
    if (!this.capabilities?.ptz?.XAddr) {
      throw new Error('PTZ service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'tptz:AbsoluteMove': {
        'tptz:ProfileToken': profileToken,
        'tptz:Position': {
          'tt:PanTilt': {
            '@_x': position.x,
            '@_y': position.y,
            '@_space': 'http://www.onvif.org/ver10/tptz/PanTiltSpaces/PositionGenericSpace',
          },
          'tt:Zoom': {
            '@_x': position.zoom,
            '@_space': 'http://www.onvif.org/ver10/tptz/ZoomSpaces/PositionGenericSpace',
          },
        },
      },
    });

    await this.sendRequest(this.capabilities.ptz.XAddr, soapBody);
  }

  /**
   * PTZ 控制 - 相对移动
   */
  async relativeMove(profileToken: string, translation: { x: number; y: number; zoom: number }): Promise<void> {
    if (!this.capabilities?.ptz?.XAddr) {
      throw new Error('PTZ service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'tptz:RelativeMove': {
        'tptz:ProfileToken': profileToken,
        'tptz:Translation': {
          'tt:PanTilt': {
            '@_x': translation.x,
            '@_y': translation.y,
            '@_space': 'http://www.onvif.org/ver10/tptz/PanTiltSpaces/TranslationGenericSpace',
          },
          'tt:Zoom': {
            '@_x': translation.zoom,
            '@_space': 'http://www.onvif.org/ver10/tptz/ZoomSpaces/TranslationGenericSpace',
          },
        },
      },
    });

    await this.sendRequest(this.capabilities.ptz.XAddr, soapBody);
  }

  /**
   * PTZ 控制 - 连续移动
   */
  async continuousMove(profileToken: string, velocity: { x: number; y: number; zoom: number }): Promise<void> {
    if (!this.capabilities?.ptz?.XAddr) {
      throw new Error('PTZ service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'tptz:ContinuousMove': {
        'tptz:ProfileToken': profileToken,
        'tptz:Velocity': {
          'tt:PanTilt': {
            '@_x': velocity.x,
            '@_y': velocity.y,
            '@_space': 'http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace',
          },
          'tt:Zoom': {
            '@_x': velocity.zoom,
            '@_space': 'http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace',
          },
        },
      },
    });

    await this.sendRequest(this.capabilities.ptz.XAddr, soapBody);
  }

  /**
   * PTZ 控制 - 停止
   */
  async stop(profileToken: string, panTilt: boolean = true, zoom: boolean = true): Promise<void> {
    if (!this.capabilities?.ptz?.XAddr) {
      throw new Error('PTZ service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'tptz:Stop': {
        'tptz:ProfileToken': profileToken,
        'tptz:PanTilt': panTilt,
        'tptz:Zoom': zoom,
      },
    });

    await this.sendRequest(this.capabilities.ptz.XAddr, soapBody);
  }

  /**
   * 获取 PTZ 状态
   */
  async getStatus(profileToken: string): Promise<any> {
    if (!this.capabilities?.ptz?.XAddr) {
      throw new Error('PTZ service not available');
    }

    const soapBody = this.createSoapEnvelope({
      'tptz:GetStatus': {
        'tptz:ProfileToken': profileToken,
      },
    });

    const response = await this.sendRequest(this.capabilities.ptz.XAddr, soapBody);
    return this.parser.parse(response);
  }

  /**
   * 发送 SOAP 请求
   */
  private async sendRequest(url: string, soapBody: string): Promise<string> {
    try {
      this.emit('request', { url, body: soapBody });

      // 构建完整 URL
      let fullUrl = url;
      if (url.startsWith('/')) {
        // 相对路径，使用 xaddr 作为基础
        fullUrl = `${this.xaddr}${url}`;
      } else if (!url.startsWith('http')) {
        // 没有协议，添加 http://
        fullUrl = `http://${url}`;
      }

      console.log('[ONVIF] Request URL:', fullUrl);
      console.log('[ONVIF] Request Body:', soapBody);

      const response = await this.http.post(fullUrl, soapBody, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '""',
        },
      });

      console.log('[ONVIF] Response:', response.data);
      this.emit('response', { url: fullUrl, body: response.data });
      return response.data;
    } catch (err: any) {
      console.error('[ONVIF] Request failed:', err.message);
      if (err.response) {
        console.error('[ONVIF] Response status:', err.response.status);
        console.error('[ONVIF] Response data:', err.response.data);
      }
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * 创建 WS-Security UsernameToken
   */
  private createSecurityHeader(): any {
    if (!this.username) {
      return undefined;
    }

    const nonce = randomBytes(16).toString('base64');
    const created = new Date().toISOString();
    
    // 创建密码摘要: Base64(SHA1(Nonce + Created + Password))
    const passwordDigest = createHash('sha1')
      .update(Buffer.from(nonce, 'base64').toString('latin1') + created + (this.password || ''))
      .digest('base64');

    return {
      'wsse:Security': {
        '@_xmlns:wsse': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
        '@_xmlns:wsu': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
        'wsse:UsernameToken': {
          'wsse:Username': this.username,
          'wsse:Password': {
            '@_Type': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest',
            '#text': passwordDigest,
          },
          'wsse:Nonce': {
            '@_EncodingType': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary',
            '#text': nonce,
          },
          'wsu:Created': created,
        },
      },
    };
  }

  /**
   * 创建 SOAP 信封 (SOAP 1.1)
   */
  private createSoapEnvelope(body: any): string {
    const security = this.createSecurityHeader();
    
    const envelope: any = {
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:tds': 'http://www.onvif.org/ver10/device/wsdl',
        '@_xmlns:trt': 'http://www.onvif.org/ver10/media/wsdl',
        '@_xmlns:tptz': 'http://www.onvif.org/ver20/ptz/wsdl',
        '@_xmlns:tt': 'http://www.onvif.org/ver10/schema',
      },
    };

    if (security) {
      envelope['soap:Envelope']['@_xmlns:wsse'] = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
      envelope['soap:Envelope']['@_xmlns:wsu'] = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
      envelope['soap:Envelope']['soap:Header'] = security;
    }

    envelope['soap:Envelope']['soap:Body'] = body;

    const soap = this.builder.build(envelope);
    this.emit('soap', soap);
    return soap;
  }

  /**
   * 提取能力信息
   */
  private extractCapabilities(parsed: any): ONVIFCapabilities {
    const caps = parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['tds:GetCapabilitiesResponse']?.['tds:Capabilities'] || {};
    
    return {
      device: caps['tt:Device'] ? {
        XAddr: caps['tt:Device']['tt:XAddr'],
        Network: {
          IPFilter: caps['tt:Device']['tt:Network']?.['tt:IPFilter'] === 'true',
          ZeroConfiguration: caps['tt:Device']['tt:Network']?.['tt:ZeroConfiguration'] === 'true',
          IPVersion6: caps['tt:Device']['tt:Network']?.['tt:IPVersion6'] === 'true',
          DynDNS: caps['tt:Device']['tt:Network']?.['tt:DynDNS'] === 'true',
        },
        System: {
          DiscoveryResolve: caps['tt:Device']['tt:System']?.['tt:DiscoveryResolve'] === 'true',
          DiscoveryBye: caps['tt:Device']['tt:System']?.['tt:DiscoveryBye'] === 'true',
          RemoteDiscovery: caps['tt:Device']['tt:System']?.['tt:RemoteDiscovery'] === 'true',
          SystemBackup: caps['tt:Device']['tt:System']?.['tt:SystemBackup'] === 'true',
          SystemLogging: caps['tt:Device']['tt:System']?.['tt:SystemLogging'] === 'true',
          FirmwareUpgrade: caps['tt:Device']['tt:System']?.['tt:FirmwareUpgrade'] === 'true',
        },
      } : undefined,
      media: caps['tt:Media'] ? {
        XAddr: caps['tt:Media']['tt:XAddr'],
        StreamingCapabilities: {
          RTPMulticast: caps['tt:Media']['tt:StreamingCapabilities']?.['tt:RTPMulticast'] === 'true',
          RTP_TCP: caps['tt:Media']['tt:StreamingCapabilities']?.['tt:RTP_TCP'] === 'true',
          RTP_RTSP_TCP: caps['tt:Media']['tt:StreamingCapabilities']?.['tt:RTP_RTSP_TCP'] === 'true',
        },
      } : undefined,
      ptz: caps['tt:PTZ'] ? {
        XAddr: caps['tt:PTZ']['tt:XAddr'],
      } : undefined,
      imaging: caps['tt:Imaging'] ? {
        XAddr: caps['tt:Imaging']['tt:XAddr'],
      } : undefined,
      events: caps['tt:Events'] ? {
        XAddr: caps['tt:Events']['tt:XAddr'],
        WSSubscriptionPolicySupport: caps['tt:Events']['tt:WSSubscriptionPolicySupport'] === 'true',
        WSPullPointSupport: caps['tt:Events']['tt:WSPullPointSupport'] === 'true',
      } : undefined,
    };
  }

  /**
   * 提取设备信息
   */
  private extractDeviceInfo(parsed: any): Partial<ONVIFDevice> {
    const info = parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['tds:GetDeviceInformationResponse'] || {};
    
    return {
      manufacturer: info['tds:Manufacturer'],
      model: info['tds:Model'],
      firmwareVersion: info['tds:FirmwareVersion'],
      serialNumber: info['tds:SerialNumber'],
      hardwareId: info['tds:HardwareId'],
    };
  }

  /**
   * 提取配置文件
   */
  private extractProfiles(parsed: any): ONVIFProfile[] {
    const profiles = parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['trt:GetProfilesResponse']?.['trt:Profiles'] || [];
    const profileArray = Array.isArray(profiles) ? profiles : [profiles];

    return profileArray.map((p: any) => ({
      token: p['@_token'],
      name: p['tt:Name'],
      videoSourceConfiguration: p['tt:VideoSourceConfiguration'] ? {
        token: p['tt:VideoSourceConfiguration']['@_token'],
        name: p['tt:VideoSourceConfiguration']['tt:Name'],
        resolution: {
          width: parseInt(p['tt:VideoSourceConfiguration']['tt:Bounds']?.['@_width']),
          height: parseInt(p['tt:VideoSourceConfiguration']['tt:Bounds']?.['@_height']),
        },
        frameRate: parseInt(p['tt:VideoSourceConfiguration']['tt:FrameRate']),
      } : undefined,
      videoEncoderConfiguration: p['tt:VideoEncoderConfiguration'] ? {
        token: p['tt:VideoEncoderConfiguration']['@_token'],
        name: p['tt:VideoEncoderConfiguration']['tt:Name'],
        encoding: p['tt:VideoEncoderConfiguration']['tt:Encoding'],
        resolution: {
          width: parseInt(p['tt:VideoEncoderConfiguration']['tt:Resolution']?.['tt:Width']),
          height: parseInt(p['tt:VideoEncoderConfiguration']['tt:Resolution']?.['tt:Height']),
        },
        quality: parseInt(p['tt:VideoEncoderConfiguration']['tt:Quality']),
        frameRate: parseInt(p['tt:VideoEncoderConfiguration']['tt:RateControl']?.['tt:FrameRateLimit']),
        bitrate: parseInt(p['tt:VideoEncoderConfiguration']['tt:RateControl']?.['tt:BitrateLimit']),
      } : undefined,
    }));
  }

  /**
   * 提取流地址
   */
  private extractStreamUri(parsed: any): string {
    return parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['trt:GetStreamUriResponse']?.['trt:MediaUri']?.['tt:Uri'] || '';
  }

  /**
   * 提取快照地址
   */
  private extractSnapshotUri(parsed: any): string {
    return parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['trt:GetSnapshotUriResponse']?.['trt:MediaUri']?.['tt:Uri'] || '';
  }

  /**
   * 获取设备信息
   */
  getDevice(): Partial<ONVIFDevice> {
    return this.deviceInfo;
  }

  /**
   * 获取能力
   */
  getCapabilitiesInfo(): ONVIFCapabilities | undefined {
    return this.capabilities;
  }

  /**
   * 获取配置文件
   */
  getProfilesInfo(): ONVIFProfile[] {
    return this.profiles;
  }
}