import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
} from '@mui/material';
import {
  Videocam as VideocamIcon,
  Settings as SettingsIcon,
  Assessment as AssessmentIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { ONVIFPanel, GB28181Panel, PacketCapturePanel, LogPanel } from './components';
import './App.css';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      style={{ 
        height: 'calc(100vh - 64px)', 
        overflow: 'auto',
        display: value === index ? 'block' : 'none',
      }}
      {...other}
    >
      <Box sx={{ p: 3, height: '100%' }}>{children}</Box>
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [appStatus, setAppStatus] = useState<any>(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // 检测是否在 Electron 环境中
    const electronAvailable = !!(window as any).electron?.ipcRenderer;
    setIsElectron(electronAvailable);
    console.log('Electron available:', electronAvailable);

    // 获取应用状态
    const getStatus = async () => {
      try {
        if (electronAvailable) {
          const result = await (window as any).electron.ipcRenderer.invoke('app:getState');
          if (result?.success) {
            setAppStatus(result.data);
          }
        }
      } catch (err) {
        console.error('Failed to get app status:', err);
      }
    };

    getStatus();
    // 更频繁地更新状态，确保日志数量实时显示
    const interval = setInterval(getStatus, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#0a0a0f' }}>
      {/* 顶部标题栏 */}
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          bgcolor: 'rgba(18, 18, 26, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <Toolbar variant="dense">
          <VideocamIcon sx={{ mr: 2, color: '#00d4aa' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            ONVIF/GB28181 协议测试工具
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!isElectron && (
              <Typography variant="caption" color="warning.main" sx={{ mr: 2 }}>
                [浏览器模式 - 部分功能不可用]
              </Typography>
            )}
            {appStatus && (
              <Typography variant="caption" color="text.secondary">
                ONVIF: {appStatus.onvifDevices?.length || 0} | 
                GB28181: {appStatus.gb28181ServerDevices?.length || 0} | 
                日志: {appStatus.logStats?.total || 0}
              </Typography>
            )}
            <IconButton size="small" sx={{ color: 'text.secondary' }}>
              <SettingsIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* 标签页 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(18, 18, 26, 0.8)' }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          textColor="primary"
          indicatorColor="primary"
          sx={{
            '& .MuiTabs-flexContainer': {
              px: 2,
            },
          }}
        >
          <Tab 
            icon={<VideocamIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start"
            label="ONVIF 测试" 
            sx={{ textTransform: 'none', minHeight: 48 }}
          />
          <Tab 
            icon={<StorageIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start"
            label="GB28181 测试" 
            sx={{ textTransform: 'none', minHeight: 48 }}
          />
          <Tab 
            icon={<AssessmentIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start"
            label="抓包分析" 
            sx={{ textTransform: 'none', minHeight: 48 }}
          />
          <Tab 
            icon={<SettingsIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start"
            label="调试日志" 
            sx={{ textTransform: 'none', minHeight: 48 }}
          />
        </Tabs>
      </Box>

      {/* 内容面板 */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <TabPanel value={tabValue} index={0}>
          <ONVIFPanel />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <GB28181Panel />
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          <PacketCapturePanel />
        </TabPanel>
        <TabPanel value={tabValue} index={3}>
          <LogPanel />
        </TabPanel>
      </Box>
    </Box>
  );
}

export default App;