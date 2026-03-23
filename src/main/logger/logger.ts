/**
 * 日志模块
 * 实现详细的日志记录和过滤功能
 */

import { EventEmitter } from 'events';
import { LogEntry, LogLevel, LogFilter } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

export interface LoggerOptions {
  maxLogs?: number;
  consoleOutput?: boolean;
  fileOutput?: boolean;
  logFilePath?: string;
}

export class Logger extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private consoleOutput: boolean;
  private categories: Set<string> = new Set();

  constructor(options: LoggerOptions = {}) {
    super();
    this.maxLogs = options.maxLogs || 10000;
    this.consoleOutput = options.consoleOutput !== false;
  }

  /**
   * 记录调试日志
   */
  debug(message: string, details?: any, category: string = 'general', source?: string): void {
    this.addLog('debug', message, details, category, source);
  }

  /**
   * 记录信息日志
   */
  info(message: string, details?: any, category: string = 'general', source?: string): void {
    this.addLog('info', message, details, category, source);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, details?: any, category: string = 'general', source?: string): void {
    this.addLog('warn', message, details, category, source);
  }

  /**
   * 记录错误日志
   */
  error(message: string, details?: any, category: string = 'general', source?: string): void {
    this.addLog('error', message, details, category, source);
  }

  /**
   * 添加日志
   */
  private addLog(
    level: LogLevel,
    message: string,
    details?: any,
    category: string = 'general',
    source?: string
  ): void {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level,
      category,
      message,
      details,
      source,
    };

    this.logs.push(entry);
    this.categories.add(category);

    // 限制最大数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 控制台输出
    if (this.consoleOutput) {
      this.outputToConsole(entry);
    }

    this.emit('log', entry);
  }

  /**
   * 输出到控制台
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    
    switch (entry.level) {
      case 'debug':
        console.debug(prefix, entry.message, entry.details || '');
        break;
      case 'info':
        console.info(prefix, entry.message, entry.details || '');
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.details || '');
        break;
      case 'error':
        console.error(prefix, entry.message, entry.details || '');
        break;
    }
  }

  /**
   * 获取日志列表
   */
  getLogs(filter?: LogFilter): LogEntry[] {
    let result = [...this.logs];

    if (filter) {
      if (filter.levels && filter.levels.length > 0) {
        result = result.filter(l => filter.levels!.includes(l.level));
      }

      if (filter.categories && filter.categories.length > 0) {
        result = result.filter(l => filter.categories!.includes(l.category));
      }

      if (filter.searchText) {
        const search = filter.searchText.toLowerCase();
        result = result.filter(l => 
          l.message.toLowerCase().includes(search) ||
          l.category.toLowerCase().includes(search) ||
          (l.source && l.source.toLowerCase().includes(search))
        );
      }

      if (filter.startTime) {
        result = result.filter(l => l.timestamp >= filter.startTime!);
      }

      if (filter.endTime) {
        result = result.filter(l => l.timestamp <= filter.endTime!);
      }
    }

    return result;
  }

  /**
   * 清除日志
   */
  clearLogs(): void {
    this.logs = [];
    this.emit('cleared');
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    return Array.from(this.categories);
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; byLevel: { [key in LogLevel]?: number } } {
    const byLevel: { [key in LogLevel]?: number } = {};
    
    for (const log of this.logs) {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    }

    return {
      total: this.logs.length,
      byLevel,
    };
  }

  /**
   * 导出日志
   */
  exportLogs(format: 'json' | 'csv' | 'txt' = 'json'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.logs, null, 2);
      
      case 'csv':
        const headers = 'timestamp,level,category,message,source\n';
        const rows = this.logs.map(l => 
          `"${l.timestamp.toISOString()}","${l.level}","${l.category}","${l.message.replace(/"/g, '""')}","${l.source || ''}"`
        ).join('\n');
        return headers + rows;
      
      case 'txt':
        return this.logs.map(l => {
          const details = l.details ? `\nDetails: ${JSON.stringify(l.details, null, 2)}` : '';
          return `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}${details}`;
        }).join('\n\n');
      
      default:
        return '';
    }
  }

  /**
   * 创建分类日志器
   */
  createCategoryLogger(category: string, source?: string) {
    return {
      debug: (message: string, details?: any) => this.debug(message, details, category, source),
      info: (message: string, details?: any) => this.info(message, details, category, source),
      warn: (message: string, details?: any) => this.warn(message, details, category, source),
      error: (message: string, details?: any) => this.error(message, details, category, source),
    };
  }
}