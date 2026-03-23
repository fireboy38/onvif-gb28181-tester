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
  Chip,
  Grid,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Code as CodeIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import { LogEntry, LogLevel, LogFilter } from '../../shared/types';

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

export default function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>({});
  const [showFilter, setShowFilter] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [categories] = useState<string[]>([]);
  const [stats] = useState({ total: 0, byLevel: {} as { [key in LogLevel]?: number } });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'txt'>('json');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 浏览器环境下不设置 IPC 监听
    if (!ipcRenderer) return;

    // 监听日志事件
    const handleLog = (event: any, entry: LogEntry) => {
      setLogs(prev => {
        const newLogs = [...prev, entry];
        if (newLogs.length > 5000) {
          return newLogs.slice(-5000);
        }
        return newLogs;
      });
    };

    ipcRenderer.on('log:new', handleLog);

    // 获取初始日志
    refreshLogs();

    return () => {
      ipcRenderer.removeListener('log:new', handleLog);
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  const refreshLogs = async () => {
    if (!ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('log:get', filter);
      if (result.success) {
        setLogs(result.data);
      }
    } catch (err) {
      console.error('Failed to get logs:', err);
    }
  };

  const handleClear = async () => {
    if (!ipcRenderer) {
      setLogs([]);
      setSelectedLog(null);
      return;
    }
    try {
      await ipcRenderer.invoke('log:clear');
      setLogs([]);
      setSelectedLog(null);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const handleFilterChange = (key: keyof LogFilter, value: any) => {
    const newFilter = { ...filter, [key]: value };
    setFilter(newFilter);
  };

  const applyFilter = async () => {
    await refreshLogs();
  };

  const handleExport = async () => {
    // 实际导出功能需要在主进程中实现文件保存
    setExportDialogOpen(false);
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'debug': return 'default';
      case 'info': return 'info';
      case 'warn': return 'warning';
      case 'error': return 'error';
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

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 工具栏 */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
          startIcon={<RefreshIcon />}
          onClick={refreshLogs}
          size="small"
        >
          刷新
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

        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={() => setExportDialogOpen(true)}
          size="small"
        >
          导出
        </Button>

        <Typography variant="body2" color="text.secondary">
          共 {logs.length} 条日志
        </Typography>

        {/* 统计 */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(['debug', 'info', 'warn', 'error'] as LogLevel[]).map(level => {
            const count = logs.filter(l => l.level === level).length;
            if (count === 0) return null;
            return (
              <Chip
                key={level}
                label={`${level}: ${count}`}
                size="small"
                color={getLevelColor(level) as any}
                sx={{ height: 20, fontSize: 10 }}
              />
            );
          })}
        </Box>
      </Box>

      {/* 过滤器 */}
      {showFilter && (
        <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>日志级别</InputLabel>
                <Select
                  multiple
                  value={filter.levels || []}
                  onChange={(e) => handleFilterChange('levels', e.target.value)}
                  renderValue={(selected) => (selected as string[]).join(', ')}
                >
                  {['debug', 'info', 'warn', 'error'].map((level) => (
                    <MenuItem key={level} value={level}>
                      <Checkbox checked={(filter.levels || []).includes(level as LogLevel)} />
                      {level.toUpperCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>分类</InputLabel>
                <Select
                  multiple
                  value={filter.categories || []}
                  onChange={(e) => handleFilterChange('categories', e.target.value)}
                  renderValue={(selected) => (selected as string[]).join(', ')}
                >
                  {['onvif', 'gb28181', 'capture', 'general'].map((cat) => (
                    <MenuItem key={cat} value={cat}>
                      <Checkbox checked={(filter.categories || []).includes(cat)} />
                      {cat}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
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
        {/* 日志列表 */}
        <Grid item xs={12} md={6} sx={{ height: '100%' }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }} ref={listRef}>
              <List dense sx={{ pt: 0 }}>
                {/* 只渲染最新的500条日志，避免性能问题 */}
                {logs.slice(-500).map((log) => (
                  <ListItem
                    key={log.id}
                    disablePadding
                    divider
                    sx={{
                      bgcolor: selectedLog?.id === log.id ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                    }}
                  >
                    <ListItemButton onClick={() => setSelectedLog(log)}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography variant="caption" sx={{ minWidth: 70, fontFamily: 'monospace' }}>
                          {formatTime(log.timestamp)}
                        </Typography>
                        <Chip
                          label={log.level.toUpperCase()}
                          size="small"
                          color={getLevelColor(log.level) as any}
                          sx={{ minWidth: 50, height: 18, fontSize: 9 }}
                        />
                        <Chip
                          label={log.category}
                          size="small"
                          variant="outlined"
                          sx={{ minWidth: 50, height: 18, fontSize: 9 }}
                        />
                        <Typography variant="body2" noWrap sx={{ flex: 1, fontSize: 12 }}>
                          {log.message}
                        </Typography>
                      </Box>
                    </ListItemButton>
                  </ListItem>
                ))}
                {logs.length === 0 && (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                    暂无日志记录
                  </Typography>
                )}
                {logs.length > 500 && (
                  <Typography variant="caption" color="text.secondary" align="center" sx={{ py: 1 }}>
                    ... 还有 {logs.length - 500} 条更早的日志未显示
                  </Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* 详情面板 */}
        <Grid item xs={12} md={6} sx={{ height: '100%' }}>
          <Card sx={{ height: '100%', overflow: 'auto' }}>
            <CardContent>
              {selectedLog ? (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      日志详情
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip label={selectedLog.level.toUpperCase()} color={getLevelColor(selectedLog.level) as any} />
                      <Chip label={selectedLog.category} variant="outlined" />
                    </Box>
                  </Box>

                  {/* 基本信息 */}
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">时间</Typography>
                        <Typography variant="body2">
                          {formatDate(selectedLog.timestamp)} {formatTime(selectedLog.timestamp)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">分类</Typography>
                        <Typography variant="body2">{selectedLog.category}</Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary">消息</Typography>
                        <Typography variant="body1" sx={{ mt: 0.5 }}>
                          {selectedLog.message}
                        </Typography>
                      </Grid>
                      {selectedLog.source && (
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary">来源</Typography>
                          <Typography variant="body2" fontFamily="monospace">
                            {selectedLog.source}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>

                  {/* 详细信息 */}
                  {selectedLog.details && (
                    <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4aa' }}>
                        详细信息
                      </Typography>
                      <Box 
                        className="code-block"
                        component="pre"
                        sx={{ fontSize: 12 }}
                      >
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </Box>
                    </Paper>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="body1" color="text.secondary">
                    选择一条日志查看详情
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 导出对话框 */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>导出日志</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>格式</InputLabel>
            <Select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              label="格式"
            >
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="csv">CSV</MenuItem>
              <MenuItem value="txt">文本</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>取消</Button>
          <Button onClick={handleExport} variant="contained">
            导出
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}