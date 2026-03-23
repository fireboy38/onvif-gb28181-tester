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
  ListItemText,
  Chip,
  Grid,
  Paper,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Divider,
  Tooltip,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Code as CodeIcon,
  RawOn as RawIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { PacketCapture, PacketFilter } from '../../shared/types';

// 获取 ipcRenderer，浏览器环境下为 null
const ipcRenderer = (() => {
  try {
    return (window as any).electron?.ipcRenderer || null;
  } catch {
    return null;
  }
})();

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

// 语法高亮函数
function highlightXML(xml: string): string {
  return xml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(&lt;\/?)([\w:]+)/g, '<span class="xml-tag">$1$2</span>')
    .replace(/(\s)([\w:]+)=/g, '$1<span class="xml-attr">$2</span>=')
    .replace(/"([^"]*)"/g, '"<span class="xml-value">$1</span>"');
}

function highlightJSON(json: string): string {
  return json
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
    .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/: null/g, ': <span class="json-null">null</span>');
}

export default function PacketCapturePanel() {
  const [captures, setCaptures] = useState<PacketCapture[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedCapture, setSelectedCapture] = useState<PacketCapture | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [filter, setFilter] = useState<PacketFilter>({});
  const [showFilter, setShowFilter] = useState(false);
  const [stats] = useState({ total: 0, byProtocol: {} as { [key: string]: number } });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 浏览器环境下不设置 IPC 监听
    if (!ipcRenderer) return;

    // 监听抓包事件
    const handleCapture = (event: any, capture: PacketCapture) => {
      setCaptures(prev => {
        const newCaptures = [...prev, capture];
        // 限制数量
        if (newCaptures.length > 1000) {
          return newCaptures.slice(-1000);
        }
        return newCaptures;
      });
    };

    ipcRenderer.on('packet:capture', handleCapture);

    // 获取初始状态
    refreshCaptures();

    return () => {
      ipcRenderer.removeListener('packet:capture', handleCapture);
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current && isCapturing) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [captures, isCapturing]);

  const refreshCaptures = async () => {
    if (!ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('packet:getCaptures', filter);
      if (result.success) {
        setCaptures(result.data);
      }
    } catch (err) {
      console.error('Failed to get captures:', err);
    }
  };

  const handleStartCapture = async () => {
    if (!ipcRenderer) {
      console.warn('浏览器模式下无法抓包');
      return;
    }
    try {
      const result = await ipcRenderer.invoke('packet:startCapture');
      if (result.success) {
        setIsCapturing(true);
      }
    } catch (err) {
      console.error('Failed to start capture:', err);
    }
  };

  const handleStopCapture = async () => {
    if (!ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('packet:stopCapture');
      if (result.success) {
        setIsCapturing(false);
      }
    } catch (err) {
      console.error('Failed to stop capture:', err);
    }
  };

  const handleClear = async () => {
    if (!ipcRenderer) {
      setCaptures([]);
      setSelectedCapture(null);
      return;
    }
    try {
      await ipcRenderer.invoke('packet:clear');
      setCaptures([]);
      setSelectedCapture(null);
    } catch (err) {
      console.error('Failed to clear captures:', err);
    }
  };

  const handleFilterChange = (key: keyof PacketFilter, value: any) => {
    const newFilter = { ...filter, [key]: value };
    setFilter(newFilter);
  };

  const applyFilter = async () => {
    await refreshCaptures();
  };

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'ONVIF': return 'success';
      case 'GB28181': return 'primary';
      case 'RTP': return 'warning';
      case 'HTTP': return 'info';
      case 'RTSP': return 'secondary';
      default: return 'default';
    }
  };

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('zh-CN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 工具栏 */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {!isCapturing ? (
          <Button
            variant="contained"
            startIcon={<PlayIcon />}
            onClick={handleStartCapture}
            sx={{ bgcolor: '#00d4aa', '&:hover': { bgcolor: '#00a080' } }}
          >
            开始抓包
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={<StopIcon />}
            onClick={handleStopCapture}
            color="error"
          >
            停止抓包
          </Button>
        )}
        
        <Button
          variant="outlined"
          startIcon={<DeleteIcon />}
          onClick={handleClear}
          size="small"
        >
          清除
        </Button>

        <Button
          variant="outlined"
          startIcon={<FilterIcon />}
          onClick={() => setShowFilter(!showFilter)}
          size="small"
          color={showFilter ? 'primary' : 'inherit'}
        >
          过滤
        </Button>

        <Typography variant="body2" color="text.secondary">
          共 {captures.length} 个包
        </Typography>

        {isCapturing && (
          <Chip 
            label="抓包中..." 
            color="success" 
            size="small"
            sx={{ animation: 'pulse 2s infinite' }}
          />
        )}
      </Box>

      {/* 过滤器 */}
      {showFilter && (
        <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>协议</InputLabel>
                <Select
                  multiple
                  value={filter.protocols || []}
                  onChange={(e) => handleFilterChange('protocols', e.target.value)}
                  renderValue={(selected) => (selected as string[]).join(', ')}
                >
                  {['ONVIF', 'GB28181', 'RTP', 'RTSP', 'HTTP', 'TCP', 'UDP'].map((p) => (
                    <MenuItem key={p} value={p}>
                      <Checkbox checked={(filter.protocols || []).includes(p)} />
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="IP 地址"
                size="small"
                fullWidth
                value={filter.ip || ''}
                onChange={(e) => handleFilterChange('ip', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="端口"
                type="number"
                size="small"
                fullWidth
                value={filter.port || ''}
                onChange={(e) => handleFilterChange('port', e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="搜索文本"
                size="small"
                fullWidth
                value={filter.searchText || ''}
                onChange={(e) => handleFilterChange('searchText', e.target.value)}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" size="small" onClick={applyFilter}>
              应用过滤
            </Button>
          </Box>
        </Paper>
      )}

      <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        {/* 抓包列表 */}
        <Grid item xs={12} md={5} sx={{ height: '100%' }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }} ref={listRef}>
              <List dense sx={{ pt: 0 }}>
                {captures.map((capture, index) => (
                  <ListItem
                    key={capture.id}
                    disablePadding
                    divider
                    sx={{
                      bgcolor: selectedCapture?.id === capture.id ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                    }}
                  >
                    <ListItemButton onClick={() => setSelectedCapture(capture)}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography variant="caption" sx={{ minWidth: 70, fontFamily: 'monospace' }}>
                          {formatTime(capture.timestamp)}
                        </Typography>
                        <Chip
                          label={capture.protocol}
                          size="small"
                          color={getProtocolColor(capture.protocol) as any}
                          sx={{ minWidth: 60, height: 18, fontSize: 10 }}
                        />
                        <Chip
                          label={capture.direction === 'sent' ? '发送' : '接收'}
                          size="small"
                          variant="outlined"
                          color={capture.direction === 'sent' ? 'success' : 'info'}
                          sx={{ minWidth: 40, height: 18, fontSize: 10 }}
                        />
                        <Typography variant="body2" noWrap sx={{ flex: 1, fontSize: 12 }}>
                          {capture.method || `${capture.sourceIp}:${capture.sourcePort} → ${capture.destIp}:${capture.destPort}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {capture.bodySize} B
                        </Typography>
                      </Box>
                    </ListItemButton>
                  </ListItem>
                ))}
                {captures.length === 0 && (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                    点击"开始抓包"捕获网络数据包
                  </Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* 详情面板 */}
        <Grid item xs={12} md={7} sx={{ height: '100%' }}>
          <Card sx={{ height: '100%', overflow: 'auto' }}>
            <CardContent>
              {selectedCapture ? (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      数据包详情
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip label={selectedCapture.protocol} color={getProtocolColor(selectedCapture.protocol) as any} />
                      <Chip 
                        label={selectedCapture.direction === 'sent' ? '发送' : '接收'} 
                        color={selectedCapture.direction === 'sent' ? 'success' : 'info'}
                        variant="outlined"
                      />
                    </Box>
                  </Box>

                  {/* 基本信息 */}
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">源地址</Typography>
                        <Typography variant="body2" fontFamily="monospace">
                          {selectedCapture.sourceIp}:{selectedCapture.sourcePort}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">目标地址</Typography>
                        <Typography variant="body2" fontFamily="monospace">
                          {selectedCapture.destIp}:{selectedCapture.destPort}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">时间</Typography>
                        <Typography variant="body2">
                          {new Date(selectedCapture.timestamp).toLocaleString('zh-CN')}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">大小</Typography>
                        <Typography variant="body2">{selectedCapture.bodySize} bytes</Typography>
                      </Grid>
                    </Grid>
                  </Paper>

                  {/* 内容标签页 */}
                  <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} size="small">
                    <Tab label="解析" icon={<CodeIcon fontSize="small" />} iconPosition="start" />
                    <Tab label="原始数据" icon={<RawIcon fontSize="small" />} iconPosition="start" />
                  </Tabs>

                  <TabPanel value={tabValue} index={0}>
                    <Box 
                      className="code-block"
                      dangerouslySetInnerHTML={{
                        __html: selectedCapture.protocol === 'ONVIF' || selectedCapture.body.includes('<?xml')
                          ? highlightXML(selectedCapture.body)
                          : selectedCapture.body.startsWith('{')
                          ? highlightJSON(selectedCapture.body)
                          : selectedCapture.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')
                      }}
                    />
                  </TabPanel>

                  <TabPanel value={tabValue} index={1}>
                    <Box className="code-block" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {selectedCapture.raw.toString('hex').match(/.{1,2}/g)?.join(' ')}
                    </Box>
                  </TabPanel>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="body1" color="text.secondary">
                    选择一个数据包查看详情
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}