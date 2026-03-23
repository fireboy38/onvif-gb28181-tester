/**
 * Electron 预加载脚本
 * 在渲染进程中暴露安全的 API
 */

import { contextBridge, ipcRenderer } from 'electron';
// Preload script - no external imports needed

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback);
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
});

// 为了兼容性，也暴露到 window.require
declare global {
  interface Window {
    electron: {
      ipcRenderer: typeof ipcRenderer;
    };
  }
}