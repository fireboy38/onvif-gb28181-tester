import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Chip,
  Divider,
  Grid,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  CircularProgress,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Settings as SettingsIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  PanTool as PanToolIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  ArrowBack as ArrowLeftIcon,
  ArrowForward as ArrowRightIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  FileUpload as FileUploadIcon,
  FileDownload as FileDownloadIcon,
  Delete as DeleteIcon,
  VideoLibrary as VideoLibraryIcon,
} from '@mui/icons-material';
import { ONVIFDevice, ONVIFProfile } from '../../shared/types';

// 获取 ipcRenderer，浏览器环境下为 null
const ipcRenderer = (() => {
  try {
    return (window as any).electron?.ipcRenderer || null;
  } catch {
    return null;
  }
})();

// CSV 解析函数
const parseCSV = (content: string): { headers: string[]; rows: string[][] } => {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
  return { headers, rows };
};

interface ImportDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  username: string;
  password: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
  selected: boolean;
}

export default function ONVIFPanel() {
  const [devices, setDevices] = useState<ONVIFDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<ONVIFDevice | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamUri, setStreamUri] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ptzProfile, setPtzProfile] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({
    name: '',
    ip: '',
    port: 80,
    username: '',
    password: '',
  });
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingStream, setPlayingStream] = useState<{uri: string, profileName: string} | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 批量导入相关状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDevices, setImportDevices] = useState<ImportDevice[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 批量播放相关
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [playlist, setPlaylist] = useState<{device: ONVIFDevice; profile: ONVIFProfile; streamUri: string}[]>([]);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0);

  // 发现设备
  const handleDiscover = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法发现设备，请使用 Electron 版本');
      return;
    }
    setIsDiscovering(true);
    setError('');
    try {
      const result = await ipcRenderer.invoke('onvif:discover', 5000);
      if (result.success) {
        setDevices(result.data);
      } else {
        setError(result.error || '发现设备失败');
      }
    } catch (err: any) {
      setError(err.message || '发现设备失败');
    }
    setIsDiscovering(false);
  };

  // 连接设备
  const handleConnect = async (device: ONVIFDevice) => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法连接设备，请使用 Electron 版本');
      return;
    }
    setSelectedDevice(device);
    setIsConnecting(true);
    setError('');
    
    // 使用设备自带的凭据，如果没有则使用认证对话框中的凭据
    const deviceUsername = device.username || username;
    const devicePassword = device.password || password;
    
    try {
      const result = await ipcRenderer.invoke('onvif:connect', {
        ...device,
        username: deviceUsername,
        password: devicePassword,
      });
      if (result.success) {
        setSelectedDevice(result.data);
        // 更新设备列表，保留凭据信息
        setDevices(prev => prev.map(d => d.uuid === result.data.uuid ? 
          { ...result.data, username: deviceUsername, password: devicePassword } : d));
      } else {
        setError(result.error || '连接设备失败');
        if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
          setAuthDialogOpen(true);
        }
      }
    } catch (err: any) {
      setError(err.message || '连接设备失败');
    }
    setIsConnecting(false);
  };

  // 获取流地址
  const handleGetStream = async (profileToken: string, profileName?: string) => {
    if (!selectedDevice || !ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('onvif:getStreamUri', selectedDevice.uuid, profileToken);
      if (result.success) {
        setStreamUri(result.data);
        // 自动播放视频
        setPlayingStream({ uri: result.data, profileName: profileName || profileToken });
        setVideoDialogOpen(true);
      } else {
        setError(result.error || '获取流地址失败');
      }
    } catch (err: any) {
      setError(err.message || '获取流地址失败');
    }
  };

  // PTZ 控制
  const handlePTZ = async (command: string, params?: any) => {
    if (!selectedDevice || !ptzProfile || !ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('onvif:ptz', selectedDevice.uuid, ptzProfile, command, params);
      if (!result.success) {
        setError(result.error || 'PTZ 控制失败');
      }
    } catch (err: any) {
      setError(err.message || 'PTZ 控制失败');
    }
  };

  // 添加自定义设备
  const handleAddDevice = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法添加设备，请使用 Electron 版本');
      return;
    }
    if (!newDevice.ip) {
      setError('请输入设备 IP 地址');
      return;
    }
    setError('');
    try {
      const device: ONVIFDevice = {
        uuid: `manual-${Date.now()}`,
        name: newDevice.name || `设备 ${newDevice.ip}`,
        ip: newDevice.ip,
        port: newDevice.port || 80,
        username: newDevice.username,
        password: newDevice.password,
        status: 'offline',
      };
      const result = await ipcRenderer.invoke('onvif:connect', device);
      if (result.success) {
        setDevices(prev => [...prev, result.data]);
        setSelectedDevice(result.data);
        setAddDialogOpen(false);
        setNewDevice({ name: '', ip: '', port: 80, username: '', password: '' });
      } else {
        setError(result.error || '连接设备失败');
      }
    } catch (err: any) {
      setError(err.message || '连接设备失败');
    }
  };

  // 下载导入模板
  const handleDownloadTemplate = () => {
    const template = 'name,ip,port,username,password\n设备1,192.168.1.100,80,admin,12345\n设备2,192.168.1.101,80,admin,12345\n';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'onvif_devices_template.csv';
    link.click();
  };

  // 处理文件上传
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const { headers, rows } = parseCSV(content);
        
        // 验证必需列
        const requiredColumns = ['ip'];
        const hasRequired = requiredColumns.every(col => 
          headers.some(h => h.toLowerCase() === col.toLowerCase())
        );
        
        if (!hasRequired) {
          setError('CSV 文件缺少必需的列：ip');
          return;
        }

        // 获取列索引
        const getColumnIndex = (name: string) => 
          headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
        
        const nameIdx = getColumnIndex('name');
        const ipIdx = getColumnIndex('ip');
        const portIdx = getColumnIndex('port');
        const usernameIdx = getColumnIndex('username');
        const passwordIdx = getColumnIndex('password');

        const parsedDevices: ImportDevice[] = rows.map((row, index) => ({
          id: `import-${Date.now()}-${index}`,
          name: nameIdx >= 0 ? row[nameIdx] || '' : '',
          ip: row[ipIdx] || '',
          port: portIdx >= 0 ? parseInt(row[portIdx]) || 80 : 80,
          username: usernameIdx >= 0 ? row[usernameIdx] || '' : '',
          password: passwordIdx >= 0 ? row[passwordIdx] || '' : '',
          status: 'pending',
          selected: true,
        })).filter(d => d.ip); // 过滤掉没有 IP 的行

        setImportDevices(parsedDevices);
        setError('');
      } catch (err) {
        setError('解析 CSV 文件失败，请检查文件格式');
      }
    };
    reader.readAsText(file);
    
    // 重置文件输入
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 批量导入设备
  const handleBatchImport = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法导入设备，请使用 Electron 版本');
      return;
    }

    const selectedDevices = importDevices.filter(d => d.selected);
    if (selectedDevices.length === 0) {
      setError('请至少选择一个设备');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    for (let i = 0; i < selectedDevices.length; i++) {
      const importDevice = selectedDevices[i];
      
      // 更新状态为导入中
      setImportDevices(prev => prev.map(d => 
        d.id === importDevice.id ? { ...d, status: 'importing' } : d
      ));

      try {
        const device: ONVIFDevice = {
          uuid: `manual-${Date.now()}-${i}`,
          name: importDevice.name || `设备 ${importDevice.ip}`,
          ip: importDevice.ip,
          port: importDevice.port,
          username: importDevice.username,
          password: importDevice.password,
          status: 'offline',
        };
        
        const result = await ipcRenderer.invoke('onvif:connect', device);
        
        if (result.success) {
          setDevices(prev => [...prev, result.data]);
          setImportDevices(prev => prev.map(d => 
            d.id === importDevice.id ? { ...d, status: 'success' } : d
          ));
        } else {
          setImportDevices(prev => prev.map(d => 
            d.id === importDevice.id ? { ...d, status: 'error', error: result.error } : d
          ));
        }
      } catch (err: any) {
        setImportDevices(prev => prev.map(d => 
          d.id === importDevice.id ? { ...d, status: 'error', error: err.message } : d
        ));
      }

      setImportProgress(((i + 1) / selectedDevices.length) * 100);
    }

    setIsImporting(false);
  };

  // 切换设备选择状态
  const toggleDeviceSelection = (id: string) => {
    setImportDevices(prev => prev.map(d => 
      d.id === id ? { ...d, selected: !d.selected } : d
    ));
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const allSelected = importDevices.every(d => d.selected);
    setImportDevices(prev => prev.map(d => ({ ...d, selected: !allSelected })));
  };

  // 删除导入列表中的设备
  const removeImportDevice = (id: string) => {
    setImportDevices(prev => prev.filter(d => d.id !== id));
  };

  // 批量取流并播放
  const handleBatchGetStream = async () => {
    if (!selectedDevice || !selectedDevice.profiles || !ipcRenderer) return;
    
    const streams: {device: ONVIFDevice; profile: ONVIFProfile; streamUri: string}[] = [];
    
    for (const profile of selectedDevice.profiles) {
      try {
        const result = await ipcRenderer.invoke('onvif:getStreamUri', selectedDevice.uuid, profile.token);
        if (result.success) {
          streams.push({ device: selectedDevice, profile, streamUri: result.data });
        }
      } catch (err) {
        console.error('Failed to get stream for profile:', profile.token, err);
      }
    }
    
    if (streams.length > 0) {
      setPlaylist(streams);
      setCurrentPlaylistIndex(0);
      setPlayingStream({ uri: streams[0].streamUri, profileName: streams[0].profile.name });
      setVideoDialogOpen(true);
    } else {
      setError('没有可用的视频流');
    }
  };

  // 播放列表中的下一个
  const playNext = () => {
    if (currentPlaylistIndex < playlist.length - 1) {
      const nextIndex = currentPlaylistIndex + 1;
      setCurrentPlaylistIndex(nextIndex);
      setPlayingStream({ 
        uri: playlist[nextIndex].streamUri, 
        profileName: playlist[nextIndex].profile.name 
      });
    }
  };

  // 播放列表中的上一个
  const playPrev = () => {
    if (currentPlaylistIndex > 0) {
      const prevIndex = currentPlaylistIndex - 1;
      setCurrentPlaylistIndex(prevIndex);
      setPlayingStream({ 
        uri: playlist[prevIndex].streamUri, 
        profileName: playlist[prevIndex].profile.name 
      });
    }
  };

  // 使用外部播放器打开
  const openWithExternalPlayer = async (streamUri: string) => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法调用外部播放器');
      return;
    }
    try {
      const result = await ipcRenderer.invoke('video:openExternal', streamUri);
      if (!result.success) {
        setError(result.error || '打开外部播放器失败');
      }
    } catch (err: any) {
      setError(err.message || '打开外部播放器失败');
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 工具栏 */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={isDiscovering ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
          onClick={handleDiscover}
          disabled={isDiscovering}
          sx={{
            bgcolor: '#00d4aa',
            '&:hover': { bgcolor: '#00a080' },
          }}
        >
          {isDiscovering ? '发现中...' : '发现设备'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setAddDialogOpen(true)}
        >
          添加设备
        </Button>
        <Button
          variant="outlined"
          startIcon={<FileUploadIcon />}
          onClick={() => setImportDialogOpen(true)}
        >
          批量导入
        </Button>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleDownloadTemplate}
        >
          下载模板
        </Button>
        <Typography variant="body2" color="text.secondary">
          已发现 {devices.length} 个设备
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        {/* 设备列表 */}
        <Grid item xs={12} md={4} sx={{ height: '100%' }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                设备列表
              </Typography>
              <List dense>
                {devices.map((device) => (
                  <ListItem key={device.uuid} disablePadding>
                    <ListItemButton
                      selected={selectedDevice?.uuid === device.uuid}
                      onClick={() => handleConnect(device)}
                      sx={{
                        borderRadius: 1,
                        mb: 0.5,
                        '&.Mui-selected': {
                          bgcolor: 'rgba(0, 212, 170, 0.1)',
                        },
                      }}
                    >
                      <ListItemIcon>
                        <VideocamIcon sx={{ color: device.status === 'online' ? '#00d4aa' : '#ef4444' }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={device.name || device.ip}
                        secondary={`${device.ip}:${device.port}`}
                        primaryTypographyProps={{ fontWeight: 500 }}
                        secondaryTypographyProps={{ fontSize: 12 }}
                      />
                      {device.status === 'online' && (
                        <Chip 
                          size="small" 
                          label="在线" 
                          color="success" 
                          sx={{ height: 20, fontSize: 10 }}
                        />
                      )}
                    </ListItemButton>
                  </ListItem>
                ))}
                {devices.length === 0 && (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                    点击"发现设备"搜索网络中的 ONVIF 设备
                  </Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* 设备详情 */}
        <Grid item xs={12} md={8} sx={{ height: '100%' }}>
          <Card sx={{ height: '100%', overflow: 'auto' }}>
            <CardContent>
              {selectedDevice ? (
                <Box>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    {selectedDevice.name || '未知设备'}
                  </Typography>
                  
                  {/* 设备信息 */}
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4aa' }}>
                      设备信息
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">制造商</Typography>
                        <Typography variant="body1">{selectedDevice.manufacturer || '-'}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">型号</Typography>
                        <Typography variant="body1">{selectedDevice.model || '-'}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">固件版本</Typography>
                        <Typography variant="body1">{selectedDevice.firmwareVersion || '-'}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">序列号</Typography>
                        <Typography variant="body1">{selectedDevice.serialNumber || '-'}</Typography>
                      </Grid>
                    </Grid>
                  </Paper>

                  {/* 媒体配置 */}
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ color: '#00d4aa' }}>
                        媒体配置
                        {selectedDevice.profiles && selectedDevice.profiles.length > 0 && (
                          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                            ({selectedDevice.profiles.length} 个配置)
                          </Typography>
                        )}
                      </Typography>
                      {selectedDevice.profiles && selectedDevice.profiles.length > 1 && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VideoLibraryIcon />}
                          onClick={handleBatchGetStream}
                          sx={{ color: '#00d4aa', borderColor: '#00d4aa' }}
                        >
                          批量播放全部
                        </Button>
                      )}
                    </Box>
                    {selectedDevice.profiles && selectedDevice.profiles.length > 0 ? (
                      <List dense>
                        {selectedDevice.profiles.map((profile) => (
                          <ListItem
                            key={profile.token}
                            secondaryAction={
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  size="small"
                                  startIcon={<PlayArrowIcon />}
                                  onClick={() => handleGetStream(profile.token, profile.name)}
                                  sx={{ color: '#00d4aa' }}
                                >
                                  取流并播放
                                </Button>
                              </Box>
                            }
                          >
                            <ListItemText
                              primary={profile.name || profile.token}
                              secondary={profile.videoEncoderConfiguration?.resolution ? 
                                `${profile.videoEncoderConfiguration.resolution.width}x${profile.videoEncoderConfiguration.resolution.height} @ ${profile.videoEncoderConfiguration.frameRate}fps` : 
                                '无视频编码信息'}
                            />
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      <Box sx={{ py: 2 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          未获取到媒体配置信息
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          设备可能不支持标准 ONVIF Profile 查询，或需要特定配置
                        </Typography>
                      </Box>
                    )}
                  </Paper>

                  {/* PTZ 控制 */}
                  {selectedDevice.capabilities?.ptz && (
                    <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4aa' }}>
                        PTZ 控制
                      </Typography>
                      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>选择配置</InputLabel>
                        <Select
                          value={ptzProfile}
                          onChange={(e) => setPtzProfile(e.target.value)}
                          label="选择配置"
                        >
                          {selectedDevice.profiles?.map((profile) => (
                            <MenuItem key={profile.token} value={profile.token}>
                              {profile.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <IconButton onClick={() => handlePTZ('relativeMove', { x: 0, y: 0.1, zoom: 0 })}>
                          <ArrowUpIcon />
                        </IconButton>
                        <IconButton onClick={() => handlePTZ('relativeMove', { x: 0, y: -0.1, zoom: 0 })}>
                          <ArrowDownIcon />
                        </IconButton>
                        <IconButton onClick={() => handlePTZ('relativeMove', { x: -0.1, y: 0, zoom: 0 })}>
                          <ArrowLeftIcon />
                        </IconButton>
                        <IconButton onClick={() => handlePTZ('relativeMove', { x: 0.1, y: 0, zoom: 0 })}>
                          <ArrowRightIcon />
                        </IconButton>
                        <Divider orientation="vertical" flexItem />
                        <IconButton onClick={() => handlePTZ('relativeMove', { x: 0, y: 0, zoom: 0.1 })}>
                          <ZoomInIcon />
                        </IconButton>
                        <IconButton onClick={() => handlePTZ('relativeMove', { x: 0, y: 0, zoom: -0.1 })}>
                          <ZoomOutIcon />
                        </IconButton>
                        <IconButton onClick={() => handlePTZ('stop')} color="error">
                          <StopIcon />
                        </IconButton>
                      </Box>
                    </Paper>
                  )}

                  {/* 流地址 */}
                  {streamUri && (
                    <Paper sx={{ p: 2, bgcolor: 'rgba(0, 212, 170, 0.05)' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ color: '#00d4aa' }}>
                          流地址
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            startIcon={<VisibilityIcon />}
                            onClick={() => {
                              setPlayingStream({ uri: streamUri, profileName: '当前流' });
                              setVideoDialogOpen(true);
                            }}
                            sx={{ color: '#00d4aa' }}
                          >
                            播放
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              navigator.clipboard.writeText(streamUri);
                            }}
                          >
                            复制
                          </Button>
                        </Box>
                      </Box>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace', 
                          wordBreak: 'break-all',
                          bgcolor: 'rgba(0,0,0,0.3)',
                          p: 1,
                          borderRadius: 1,
                        }}
                      >
                        {streamUri}
                      </Typography>
                    </Paper>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="body1" color="text.secondary">
                    选择一个设备进行连接
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 认证对话框 */}
      <Dialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>设备认证</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
            />
            <TextField
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAuthDialogOpen(false)}>取消</Button>
          <Button
            onClick={() => {
              setAuthDialogOpen(false);
              if (selectedDevice) {
                handleConnect(selectedDevice);
              }
            }}
            variant="contained"
            sx={{ bgcolor: '#00d4aa', '&:hover': { bgcolor: '#00a080' } }}
          >
            连接
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加设备对话框 */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加 ONVIF 设备</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="设备名称（可选）"
              value={newDevice.name}
              onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
              fullWidth
              placeholder="例如：办公室摄像头"
            />
            <TextField
              label="IP 地址"
              value={newDevice.ip}
              onChange={(e) => setNewDevice({ ...newDevice, ip: e.target.value })}
              fullWidth
              placeholder="例如：192.168.1.100"
              required
            />
            <TextField
              label="端口"
              type="number"
              value={newDevice.port}
              onChange={(e) => setNewDevice({ ...newDevice, port: parseInt(e.target.value) || 80 })}
              fullWidth
              placeholder="80"
            />
            <TextField
              label="用户名"
              value={newDevice.username}
              onChange={(e) => setNewDevice({ ...newDevice, username: e.target.value })}
              fullWidth
              placeholder="admin"
            />
            <TextField
              label="密码"
              type="password"
              value={newDevice.password}
              onChange={(e) => setNewDevice({ ...newDevice, password: e.target.value })}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleAddDevice}
            variant="contained"
            sx={{ bgcolor: '#00d4aa', '&:hover': { bgcolor: '#00a080' } }}
          >
            添加并连接
          </Button>
        </DialogActions>
      </Dialog>

      {/* 视频播放对话框 */}
      <Dialog 
        open={videoDialogOpen} 
        onClose={() => {
          setVideoDialogOpen(false);
          setPlaylist([]);
          setCurrentPlaylistIndex(0);
        }} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: { bgcolor: '#000', maxHeight: '95vh' }
        }}
      >
        <DialogTitle sx={{ color: '#fff', bgcolor: '#1a1a2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">
              视频播放 - {playingStream?.profileName}
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {playingStream?.uri}
            </Typography>
          </Box>
          {playlist.length > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {currentPlaylistIndex + 1} / {playlist.length}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={playPrev}
                  disabled={currentPlaylistIndex === 0}
                >
                  上一个
                </Button>
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={playNext}
                  disabled={currentPlaylistIndex === playlist.length - 1}
                >
                  下一个
                </Button>
              </Box>
            </Box>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#000' }}>
          <Box sx={{ 
            width: '100%', 
            height: '65vh', 
            bgcolor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {playingStream?.uri ? (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 浏览器原生视频播放器 */}
                <video
                  ref={videoRef}
                  src={playingStream.uri}
                  controls
                  autoPlay
                  muted
                  playsInline
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '50%',
                    width: 'auto',
                    height: 'auto',
                    margin: '0 auto',
                  }}
                  onError={(e) => {
                    console.error('Video playback error:', e);
                    // 不显示错误，而是显示备选方案
                  }}
                />
                
                {/* 播放失败提示和备选方案 */}
                <Box sx={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  p: 3,
                  bgcolor: 'rgba(0,0,0,0.8)',
                }}>
                  <Alert severity="warning" sx={{ mb: 2, maxWidth: 600 }}>
                    <Typography variant="body2">
                      浏览器无法直接播放 RTSP 流。请使用以下方式观看：
                    </Typography>
                  </Alert>
                  
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => openWithExternalPlayer(playingStream.uri)}
                      sx={{ bgcolor: '#00d4aa', '&:hover': { bgcolor: '#00a080' } }}
                    >
                      用 VLC 播放
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => navigator.clipboard.writeText(playingStream.uri)}
                    >
                      复制流地址
                    </Button>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                    流地址: {playingStream.uri}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Typography color="text.secondary">无视频源</Typography>
            )}
          </Box>
          
          {/* 播放列表 */}
          {playlist.length > 0 && (
            <Box sx={{ bgcolor: '#1a1a2e', p: 2, maxHeight: '150px', overflow: 'auto' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4aa' }}>
                播放列表
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {playlist.map((item, index) => (
                  <Chip
                    key={index}
                    label={item.profile.name || `配置 ${index + 1}`}
                    onClick={() => {
                      setCurrentPlaylistIndex(index);
                      setPlayingStream({ uri: item.streamUri, profileName: item.profile.name });
                    }}
                    color={index === currentPlaylistIndex ? 'success' : 'default'}
                    variant={index === currentPlaylistIndex ? 'filled' : 'outlined'}
                    size="small"
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(0, 212, 170, 0.2)' }
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
          
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#1a1a2e' }}>
          <Button 
            onClick={() => {
              setVideoDialogOpen(false);
              setPlaylist([]);
              setCurrentPlaylistIndex(0);
            }} 
            variant="outlined"
          >
            关闭
          </Button>
          <Button 
            onClick={() => {
              if (playingStream?.uri) {
                navigator.clipboard.writeText(playingStream.uri);
              }
            }} 
            variant="outlined"
          >
            复制流地址
          </Button>
          {playingStream?.uri && (
            <Button 
              onClick={() => openWithExternalPlayer(playingStream.uri)}
              variant="contained"
              startIcon={<PlayArrowIcon />}
              sx={{ bgcolor: '#00d4aa', '&:hover': { bgcolor: '#00a080' } }}
            >
              用 VLC 播放
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* 批量导入对话框 */}
      <Dialog 
        open={importDialogOpen} 
        onClose={() => !isImporting && setImportDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          批量导入 ONVIF 设备
          <Typography variant="caption" display="block" color="text.secondary">
            支持 CSV 格式，必需列：ip，可选列：name, port, username, password
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {/* 文件上传 */}
            <Box sx={{ mb: 3 }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                ref={fileInputRef}
              />
              <Button
                variant="outlined"
                startIcon={<FileUploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                sx={{ mr: 2 }}
              >
                选择 CSV 文件
              </Button>
              <Button
                variant="text"
                startIcon={<FileDownloadIcon />}
                onClick={handleDownloadTemplate}
                disabled={isImporting}
              >
                下载模板
              </Button>
            </Box>

            {/* 导入进度 */}
            {isImporting && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={importProgress} sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  导入进度: {Math.round(importProgress)}%
                </Typography>
              </Box>
            )}

            {/* 设备列表 */}
            {importDevices.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={importDevices.every(d => d.selected)}
                          indeterminate={importDevices.some(d => d.selected) && !importDevices.every(d => d.selected)}
                          onChange={toggleSelectAll}
                          disabled={isImporting}
                        />
                      </TableCell>
                      <TableCell>名称</TableCell>
                      <TableCell>IP 地址</TableCell>
                      <TableCell>端口</TableCell>
                      <TableCell>用户名</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importDevices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={device.selected}
                            onChange={() => toggleDeviceSelection(device.id)}
                            disabled={isImporting}
                          />
                        </TableCell>
                        <TableCell>{device.name || '-'}</TableCell>
                        <TableCell>{device.ip}</TableCell>
                        <TableCell>{device.port}</TableCell>
                        <TableCell>{device.username || '-'}</TableCell>
                        <TableCell>
                          {device.status === 'pending' && <Chip size="small" label="待导入" />}
                          {device.status === 'importing' && <Chip size="small" label="导入中" color="primary" />}
                          {device.status === 'success' && <Chip size="small" label="成功" color="success" />}
                          {device.status === 'error' && (
                            <Tooltip title={device.error || ''}>
                              <Chip size="small" label="失败" color="error" />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => removeImportDevice(device.id)}
                            disabled={isImporting}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {importDevices.length === 0 && (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  请选择 CSV 文件或下载模板编辑后导入
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)} disabled={isImporting}>
            取消
          </Button>
          <Button
            onClick={handleBatchImport}
            variant="contained"
            disabled={isImporting || importDevices.filter(d => d.selected).length === 0}
            sx={{ bgcolor: '#00d4aa', '&:hover': { bgcolor: '#00a080' } }}
          >
            {isImporting ? '导入中...' : `导入选中设备 (${importDevices.filter(d => d.selected).length})`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}