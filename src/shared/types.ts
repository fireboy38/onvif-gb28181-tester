// ONVIF 协议相关类型定义

export interface ONVIFDevice {
  uuid: string;
  name: string;
  xaddr: string;
  ip: string;
  port: number;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  profiles?: ONVIFProfile[];
  services?: ONVIFService[];
  capabilities?: ONVIFCapabilities;
  status: 'online' | 'offline' | 'error';
  lastSeen: Date;
  username?: string;
  password?: string;
}

export interface ONVIFProfile {
  token: string;
  name: string;
  videoSourceConfiguration?: {
    token: string;
    name: string;
    resolution: { width: number; height: number };
    frameRate: number;
  };
  videoEncoderConfiguration?: {
    token: string;
    name: string;
    encoding: 'H264' | 'H265' | 'JPEG' | 'MPEG4';
    resolution: { width: number; height: number };
    quality: number;
    frameRate: number;
    bitrate: number;
  };
  audioSourceConfiguration?: any;
  audioEncoderConfiguration?: any;
  ptzConfiguration?: any;
  metadataConfiguration?: any;
  streamUri?: string;
  snapshotUri?: string;
}

export interface ONVIFService {
  namespace: string;
  xaddr: string;
  version: { major: number; minor: number };
}

export interface ONVIFCapabilities {
  device?: {
    XAddr: string;
    Network: {
      IPFilter: boolean;
      ZeroConfiguration: boolean;
      IPVersion6: boolean;
      DynDNS: boolean;
    };
    System: {
      DiscoveryResolve: boolean;
      DiscoveryBye: boolean;
      RemoteDiscovery: boolean;
      SystemBackup: boolean;
      SystemLogging: boolean;
      FirmwareUpgrade: boolean;
    };
  };
  media?: {
    XAddr: string;
    StreamingCapabilities: {
      RTPMulticast: boolean;
      RTP_TCP: boolean;
      RTP_RTSP_TCP: boolean;
    };
  };
  ptz?: {
    XAddr: string;
  };
  imaging?: {
    XAddr: string;
  };
  events?: {
    XAddr: string;
    WSSubscriptionPolicySupport: boolean;
    WSPullPointSupport: boolean;
  };
}

// GB28181 协议相关类型定义

export interface GB28181Device {
  id: string;
  deviceId: string;
  name: string;
  manufacturer: string;
  model: string;
  firmware: string;
  channelCount: number;
  status: 'registered' | 'unregistered' | 'offline' | 'error';
  registerTime?: Date;
  lastKeepalive?: Date;
  localSipPort: number;
  serverIp: string;
  serverPort: number;
  serverId: string;
  domain: string;
  password?: string;
  channels: GB28181Channel[];
  streams: GB28181Stream[];
}

export interface GB28181Channel {
  channelId: string;
  name: string;
  status: 'online' | 'offline';
  parentId?: string;
  manufacturer?: string;
  model?: string;
  owner?: string;
  civilCode?: string;
  address?: string;
}

export interface GB28181Stream {
  streamId: string;
  channelId: string;
  status: 'idle' | 'inviting' | 'playing' | 'paused' | 'error';
  ssrc: string;
  localPort: number;
  remoteIp?: string;
  remotePort?: number;
  rtpType: 'UDP' | 'TCP';
  startTime?: Date;
  bytesReceived: number;
  packetsReceived: number;
  packetsLost: number;
}

export interface GB28181ServerConfig {
  enabled: boolean;
  sipId: string;
  sipDomain: string;
  sipPort: number;
  password: string;
  mediaPortMin: number;
  mediaPortMax: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
}

export interface GB28181ClientConfig {
  deviceId: string;
  name: string;
  serverIp: string;
  serverPort: number;
  serverId: string;
  domain: string;
  localPort: number;
  password: string;
  heartbeatInterval: number;
  registerInterval: number;
}

// 抓包分析相关类型

export interface PacketCapture {
  id: string;
  timestamp: Date;
  protocol: 'ONVIF' | 'GB28181' | 'RTP' | 'RTSP' | 'HTTP' | 'TCP' | 'UDP';
  direction: 'sent' | 'received';
  sourceIp: string;
  sourcePort: number;
  destIp: string;
  destPort: number;
  method?: string;
  contentType?: string;
  body: string;
  bodySize: number;
  parsed?: any;
  raw: Buffer;
}

export interface PacketFilter {
  protocols?: string[];
  direction?: 'sent' | 'received';
  ip?: string;
  port?: number;
  method?: string;
  searchText?: string;
  startTime?: Date;
  endTime?: Date;
}

// 日志相关类型

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  details?: any;
  source?: string;
}

export interface LogFilter {
  levels?: LogLevel[];
  categories?: string[];
  searchText?: string;
  startTime?: Date;
  endTime?: Date;
}

// 应用状态类型

export interface AppState {
  onvifDevices: ONVIFDevice[];
  gb28181Devices: GB28181Device[];
  gb28181ServerConfig: GB28181ServerConfig;
  gb28181ClientConfigs: GB28181ClientConfig[];
  packetCaptures: PacketCapture[];
  logs: LogEntry[];
  activeStreams: string[];
  selectedDevice?: string;
  selectedChannel?: string;
}

// IPC 通信类型

export type IPCChannel = 
  | 'onvif:discover'
  | 'onvif:connect'
  | 'onvif:getCapabilities'
  | 'onvif:getProfiles'
  | 'onvif:getStreamUri'
  | 'onvif:ptz'
  | 'onvif:subscribe'
  | 'gb28181:server:start'
  | 'gb28181:server:stop'
  | 'gb28181:server:status'
  | 'gb28181:client:register'
  | 'gb28181:client:unregister'
  | 'gb28181:client:invite'
  | 'gb28181:client:bye'
  | 'gb28181:client:ptz'
  | 'packet:startCapture'
  | 'packet:stopCapture'
  | 'packet:getCaptures'
  | 'packet:clear'
  | 'log:get'
  | 'log:clear'
  | 'app:getState'
  | 'app:saveConfig'
  | 'app:loadConfig';

export interface IPCRequest<T = any> {
  id: string;
  channel: IPCChannel;
  data?: T;
}

export interface IPCResponse<T = any> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}