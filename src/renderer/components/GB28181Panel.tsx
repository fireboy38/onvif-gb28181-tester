import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Chip,
  Grid,
  Paper,
  Switch,
  FormControlLabel,
  Divider,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
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
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Videocam as VideocamIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  FileUpload as FileUploadIcon,
  FileDownload as FileDownloadIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { GB28181Device, GB28181ServerConfig, GB28181ClientConfig, GB28181Stream } from '../../shared/types';

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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

interface ImportClient {
  id: string;
  deviceId: string;
  name: string;
  serverIp: string;
  serverPort: number;
  serverId: string;
  domain: string;
  localPort: number;
  password: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
  selected: boolean;
}

export default function GB28181Panel() {
  const [tabValue, setTabValue] = useState(0);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverConfig, setServerConfig] = useState<GB28181ServerConfig>({
    enabled: false,
    sipId: '34020000002000000001',
    sipDomain: '3402000000',
    sipPort: 5060,
    password: '123456',
    mediaPortMin: 10000,
    mediaPortMax: 20000,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
  });
  const [devices, setDevices] = useState<GB28181Device[]>([]);
  const [clientConfigs, setClientConfigs] = useState<GB28181ClientConfig[]>([]);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState<Partial<GB28181ClientConfig>>({
    deviceId: '34020000001320000001',
    name: '测试设备',
    serverIp: '127.0.0.1',
    serverPort: 5060,
    serverId: '34020000002000000001',
    domain: '3402000000',
    localPort: 5061,
    password: '123456',
    heartbeatInterval: 30,
    registerInterval: 3600,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [streams, setStreams] = useState<GB28181Stream[]>([]);

  // 批量导入相关状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importClients, setImportClients] = useState<ImportClient[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 视频播放相关
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingStream, setPlayingStream] = useState<{deviceId: string; channelId: string; streamUri: string} | null>(null);

  useEffect(() => {
    // 浏览器环境下不设置 IPC 监听
    if (!ipcRenderer) {
      setError('浏览器模式下无法使用 GB28181 功能，请在 Electron 应用中运行');
      return;
    }

    // 监听设备注册事件
    const handleDeviceRegistered = (event: any, device: GB28181Device) => {
      setDevices(prev => {
        const index = prev.findIndex(d => d.deviceId === device.deviceId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = device;
          return updated;
        }
        return [...prev, device];
      });
      setSuccess(`设备 ${device.deviceId} 已注册`);
    };

    const handleDeviceOffline = (event: any, device: GB28181Device) => {
      setDevices(prev => prev.map(d => d.deviceId === device.deviceId ? { ...d, status: 'offline' } : d));
    };

    ipcRenderer.on('gb28181:deviceRegistered', handleDeviceRegistered);
    ipcRenderer.on('gb28181:deviceOffline', handleDeviceOffline);

    // 获取初始状态
    refreshStatus();

    return () => {
      ipcRenderer.removeListener('gb28181:deviceRegistered', handleDeviceRegistered);
      ipcRenderer.removeListener('gb28181:deviceOffline', handleDeviceOffline);
    };
  }, []);

  const refreshStatus = async () => {
    if (!ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('gb28181:server:status');
      if (result.success) {
        setServerRunning(result.data.running);
        setDevices(result.data.devices);
      }
    } catch (err) {
      console.error('Failed to get server status:', err);
    }
  };

  const handleStartServer = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法启动服务器');
      return;
    }
    try {
      setError('');
      const result = await ipcRenderer.invoke('gb28181:server:start', serverConfig);
      if (result.success) {
        setServerRunning(true);
        setSuccess('GB28181 服务器已启动');
      } else {
        setError(result.error || '启动服务器失败');
      }
    } catch (err: any) {
      setError(err.message || '启动服务器失败');
    }
  };

  const handleStopServer = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法停止服务器');
      return;
    }
    try {
      const result = await ipcRenderer.invoke('gb28181:server:stop');
      if (result.success) {
        setServerRunning(false);
        setSuccess('GB28181 服务器已停止');
      } else {
        setError(result.error || '停止服务器失败');
      }
    } catch (err: any) {
      setError(err.message || '停止服务器失败');
    }
  };

  const handleAddClient = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法注册客户端');
      return;
    }
    try {
      setError('');
      const config = newClient as GB28181ClientConfig;
      const result = await ipcRenderer.invoke('gb28181:client:register', config);
      if (result.success) {
        setClientConfigs(prev => [...prev, config]);
        setClientDialogOpen(false);
        setSuccess('客户端注册成功');
      } else {
        setError(result.error || '注册客户端失败');
      }
    } catch (err: any) {
      setError(err.message || '注册客户端失败');
    }
  };

  const handleRemoveClient = async (deviceId: string) => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法注销客户端');
      return;
    }
    try {
      const result = await ipcRenderer.invoke('gb28181:client:unregister', deviceId);
      if (result.success) {
        setClientConfigs(prev => prev.filter(c => c.deviceId !== deviceId));
        setSuccess('客户端已注销');
      } else {
        setError(result.error || '注销客户端失败');
      }
    } catch (err: any) {
      setError(err.message || '注销客户端失败');
    }
  };

  // 下载导入模板
  const handleDownloadTemplate = () => {
    const template = 'deviceId,name,serverIp,serverPort,serverId,domain,localPort,password\n34020000001320000001,设备1,192.168.1.100,5060,34020000002000000001,3402000000,5061,123456\n34020000001320000002,设备2,192.168.1.100,5060,34020000002000000001,3402000000,5062,123456\n';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gb28181_clients_template.csv';
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
        const requiredColumns = ['deviceId', 'serverIp'];
        const hasRequired = requiredColumns.every(col => 
          headers.some(h => h.toLowerCase() === col.toLowerCase())
        );
        
        if (!hasRequired) {
          setError('CSV 文件缺少必需的列：deviceId, serverIp');
          return;
        }

        // 获取列索引
        const getColumnIndex = (name: string) => 
          headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
        
        const deviceIdIdx = getColumnIndex('deviceId');
        const nameIdx = getColumnIndex('name');
        const serverIpIdx = getColumnIndex('serverIp');
        const serverPortIdx = getColumnIndex('serverPort');
        const serverIdIdx = getColumnIndex('serverId');
        const domainIdx = getColumnIndex('domain');
        const localPortIdx = getColumnIndex('localPort');
        const passwordIdx = getColumnIndex('password');

        const parsedClients: ImportClient[] = rows.map((row, index) => ({
          id: `import-${Date.now()}-${index}`,
          deviceId: row[deviceIdIdx] || '',
          name: nameIdx >= 0 ? row[nameIdx] || '' : '',
          serverIp: row[serverIpIdx] || '',
          serverPort: serverPortIdx >= 0 ? parseInt(row[serverPortIdx]) || 5060 : 5060,
          serverId: serverIdIdx >= 0 ? row[serverIdIdx] || '' : '',
          domain: domainIdx >= 0 ? row[domainIdx] || '' : '',
          localPort: localPortIdx >= 0 ? parseInt(row[localPortIdx]) || 5061 + index : 5061 + index,
          password: passwordIdx >= 0 ? row[passwordIdx] || '' : '',
          status: 'pending',
          selected: true,
        })).filter(c => c.deviceId && c.serverIp); // 过滤掉没有 deviceId 或 serverIp 的行

        setImportClients(parsedClients);
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

  // 批量导入客户端
  const handleBatchImport = async () => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法导入客户端，请使用 Electron 版本');
      return;
    }

    const selectedClients = importClients.filter(c => c.selected);
    if (selectedClients.length === 0) {
      setError('请至少选择一个客户端');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    for (let i = 0; i < selectedClients.length; i++) {
      const importClient = selectedClients[i];
      
      // 更新状态为导入中
      setImportClients(prev => prev.map(c => 
        c.id === importClient.id ? { ...c, status: 'importing' } : c
      ));

      try {
        const config: GB28181ClientConfig = {
          deviceId: importClient.deviceId,
          name: importClient.name || `设备 ${importClient.deviceId}`,
          serverIp: importClient.serverIp,
          serverPort: importClient.serverPort,
          serverId: importClient.serverId || serverConfig.sipId,
          domain: importClient.domain || serverConfig.sipDomain,
          localPort: importClient.localPort,
          password: importClient.password || serverConfig.password,
          heartbeatInterval: 30,
          registerInterval: 3600,
        };
        
        const result = await ipcRenderer.invoke('gb28181:client:register', config);
        
        if (result.success) {
          setClientConfigs(prev => [...prev, config]);
          setImportClients(prev => prev.map(c => 
            c.id === importClient.id ? { ...c, status: 'success' } : c
          ));
        } else {
          setImportClients(prev => prev.map(c => 
            c.id === importClient.id ? { ...c, status: 'error', error: result.error } : c
          ));
        }
      } catch (err: any) {
        setImportClients(prev => prev.map(c => 
          c.id === importClient.id ? { ...c, status: 'error', error: err.message } : c
        ));
      }

      setImportProgress(((i + 1) / selectedClients.length) * 100);
    }

    setIsImporting(false);
  };

  // 切换客户端选择状态
  const toggleClientSelection = (id: string) => {
    setImportClients(prev => prev.map(c => 
      c.id === id ? { ...c, selected: !c.selected } : c
    ));
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const allSelected = importClients.every(c => c.selected);
    setImportClients(prev => prev.map(c => ({ ...c, selected: !allSelected })));
  };

  // 删除导入列表中的客户端
  const removeImportClient = (id: string) => {
    setImportClients(prev => prev.filter(c => c.id !== id));
  };

  // 邀请视频流（播放）
  const handleInviteStream = async (deviceId: string, channelId: string) => {
    if (!ipcRenderer) {
      setError('浏览器模式下无法播放视频');
      return;
    }
    try {
      const result = await ipcRenderer.invoke('gb28181:client:invite', deviceId, channelId);
      if (result.success) {
        setPlayingStream({ deviceId, channelId, streamUri: result.data.streamUri });
        setVideoDialogOpen(true);
        setSuccess('已开始播放视频流');
      } else {
        setError(result.error || '播放失败');
      }
    } catch (err: any) {
      setError(err.message || '播放失败');
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
      {/* 消息提示 */}
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* 标签页 */}
      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
        <Tab label="服务器模式" icon={<StorageIcon />} iconPosition="start" />
        <Tab label="客户端模式" icon={<VideocamIcon />} iconPosition="start" />
      </Tabs>

      {/* 服务器模式 */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={2}>
          {/* 服务器配置 */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  服务器配置
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      label="SIP ID"
                      value={serverConfig.sipId}
                      onChange={(e) => setServerConfig({ ...serverConfig, sipId: e.target.value })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="域"
                      value={serverConfig.sipDomain}
                      onChange={(e) => setServerConfig({ ...serverConfig, sipDomain: e.target.value })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="端口"
                      type="number"
                      value={serverConfig.sipPort}
                      onChange={(e) => setServerConfig({ ...serverConfig, sipPort: parseInt(e.target.value) })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="密码"
                      type="password"
                      value={serverConfig.password}
                      onChange={(e) => setServerConfig({ ...serverConfig, password: e.target.value })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="媒体端口起始"
                      type="number"
                      value={serverConfig.mediaPortMin}
                      onChange={(e) => setServerConfig({ ...serverConfig, mediaPortMin: parseInt(e.target.value) })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="媒体端口结束"
                      type="number"
                      value={serverConfig.mediaPortMax}
                      onChange={(e) => setServerConfig({ ...serverConfig, mediaPortMax: parseInt(e.target.value) })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                </Grid>

                <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                  {!serverRunning ? (
                    <Button
                      variant="contained"
                      startIcon={<PlayIcon />}
                      onClick={handleStartServer}
                      fullWidth
                      sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                    >
                      启动服务器
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={<StopIcon />}
                      onClick={handleStopServer}
                      color="error"
                      fullWidth
                    >
                      停止服务器
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* 已注册设备 */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    已注册设备
                  </Typography>
                  <Chip 
                    label={serverRunning ? '运行中' : '已停止'}
                    color={serverRunning ? 'success' : 'default'}
                    size="small"
                  />
                </Box>
                <List dense>
                  {devices.map((device) => (
                    <ListItem key={device.deviceId}>
                      <ListItemText
                        primary={device.name || device.deviceId}
                        secondary={`${device.deviceId} | 通道: ${device.channelCount}`}
                      />
                      <Chip
                        label={device.status}
                        size="small"
                        color={device.status === 'registered' ? 'success' : 'default'}
                      />
                    </ListItem>
                  ))}
                  {devices.length === 0 && (
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                      暂无设备注册
                    </Typography>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* 客户端模式 */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setClientDialogOpen(true)}
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            添加客户端
          </Button>
        </Box>

        <Grid container spacing={2}>
          {clientConfigs.map((config) => (
            <Grid item xs={12} md={6} key={config.deviceId}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {config.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {config.deviceId}
                      </Typography>
                    </Box>
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleRemoveClient(config.deviceId)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">服务器</Typography>
                      <Typography variant="body2">{config.serverIp}:{config.serverPort}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">域</Typography>
                      <Typography variant="body2">{config.domain}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {clientConfigs.length === 0 && (
            <Grid item xs={12}>
              <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 8 }}>
                点击"添加客户端"按钮注册新的 GB28181 客户端
              </Typography>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* 添加客户端对话框 */}
      <Dialog open={clientDialogOpen} onClose={() => setClientDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加 GB28181 客户端</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="设备名称"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="设备 ID"
                value={newClient.deviceId}
                onChange={(e) => setNewClient({ ...newClient, deviceId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="服务器 IP"
                value={newClient.serverIp}
                onChange={(e) => setNewClient({ ...newClient, serverIp: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="服务器端口"
                type="number"
                value={newClient.serverPort}
                onChange={(e) => setNewClient({ ...newClient, serverPort: parseInt(e.target.value) })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="服务器 ID"
                value={newClient.serverId}
                onChange={(e) => setNewClient({ ...newClient, serverId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="域"
                value={newClient.domain}
                onChange={(e) => setNewClient({ ...newClient, domain: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="本地端口"
                type="number"
                value={newClient.localPort}
                onChange={(e) => setNewClient({ ...newClient, localPort: parseInt(e.target.value) })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="密码"
                type="password"
                value={newClient.password}
                onChange={(e) => setNewClient({ ...newClient, password: e.target.value })}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClientDialogOpen(false)}>取消</Button>
          <Button 
            onClick={handleAddClient}
            variant="contained"
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            注册
          </Button>
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
          批量导入 GB28181 客户端
          <Typography variant="caption" display="block" color="text.secondary">
            支持 CSV 格式，必需列：deviceId, serverIp，可选列：name, serverPort, serverId, domain, localPort, password
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

            {/* 客户端列表 */}
            {importClients.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={importClients.every(c => c.selected)}
                          indeterminate={importClients.some(c => c.selected) && !importClients.every(c => c.selected)}
                          onChange={toggleSelectAll}
                          disabled={isImporting}
                        />
                      </TableCell>
                      <TableCell>设备ID</TableCell>
                      <TableCell>名称</TableCell>
                      <TableCell>服务器</TableCell>
                      <TableCell>本地端口</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={client.selected}
                            onChange={() => toggleClientSelection(client.id)}
                            disabled={isImporting}
                          />
                        </TableCell>
                        <TableCell>{client.deviceId}</TableCell>
                        <TableCell>{client.name || '-'}</TableCell>
                        <TableCell>{client.serverIp}:{client.serverPort}</TableCell>
                        <TableCell>{client.localPort}</TableCell>
                        <TableCell>
                          {client.status === 'pending' && <Chip size="small" label="待导入" />}
                          {client.status === 'importing' && <Chip size="small" label="导入中" color="primary" />}
                          {client.status === 'success' && <Chip size="small" label="成功" color="success" />}
                          {client.status === 'error' && (
                            <Tooltip title={client.error || ''}>
                              <Chip size="small" label="失败" color="error" />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => removeImportClient(client.id)}
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

            {importClients.length === 0 && (
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
            disabled={isImporting || importClients.filter(c => c.selected).length === 0}
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            {isImporting ? '导入中...' : `导入选中客户端 (${importClients.filter(c => c.selected).length})`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 视频播放对话框 */}
      <Dialog 
        open={videoDialogOpen} 
        onClose={() => setVideoDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: { bgcolor: '#000', maxHeight: '90vh' }
        }}
      >
        <DialogTitle sx={{ color: '#fff', bgcolor: '#1a1a2e' }}>
          GB28181 视频播放
          <Typography variant="caption" display="block" sx={{ color: 'text.secondary', mt: 0.5 }}>
            设备: {playingStream?.deviceId} | 通道: {playingStream?.channelId}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#000' }}>
          <Box sx={{ 
            width: '100%', 
            height: '60vh', 
            bgcolor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {playingStream?.streamUri ? (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 浏览器原生视频播放器 */}
                <video
                  src={playingStream.streamUri}
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
                      startIcon={<PlayIcon />}
                      onClick={() => openWithExternalPlayer(playingStream.streamUri)}
                      sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                    >
                      用 VLC 播放
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => navigator.clipboard.writeText(playingStream.streamUri)}
                    >
                      复制流地址
                    </Button>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                    流地址: {playingStream.streamUri}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Typography color="text.secondary">无视频源</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#1a1a2e' }}>
          <Button onClick={() => setVideoDialogOpen(false)} variant="outlined">
            关闭
          </Button>
          <Button 
            onClick={() => {
              if (playingStream?.streamUri) {
                navigator.clipboard.writeText(playingStream.streamUri);
              }
            }} 
            variant="outlined"
          >
            复制流地址
          </Button>
          {playingStream?.streamUri && (
            <Button 
              onClick={() => openWithExternalPlayer(playingStream.streamUri)}
              variant="contained"
              startIcon={<PlayIcon />}
              sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
            >
              用 VLC 播放
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}