// Electron 渲染进程类型声明

declare global {
  interface Window {
    require: NodeRequire;
    electron?: {
      ipcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>;
        on(channel: string, listener: (event: any, ...args: any[]) => void): void;
        removeListener(channel: string, listener: (event: any, ...args: any[]) => void): void;
      };
    };
  }
}

export {};