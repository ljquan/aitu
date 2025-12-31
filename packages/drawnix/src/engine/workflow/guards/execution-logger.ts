/**
 * 执行日志记录器
 * 记录工作流执行过程
 */

export interface ExecutionLogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
  stepId?: string;
}

export class ExecutionLogger {
  private logs: ExecutionLogEntry[] = [];
  private enabled: boolean = true;
  private minLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';

  private levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMinLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.minLevel = level;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    return this.enabled && this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  debug(message: string, data?: unknown, stepId?: string): void {
    this.log('debug', message, data, stepId);
  }

  info(message: string, data?: unknown, stepId?: string): void {
    this.log('info', message, data, stepId);
  }

  warn(message: string, data?: unknown, stepId?: string): void {
    this.log('warn', message, data, stepId);
  }

  error(message: string, data?: unknown, stepId?: string): void {
    this.log('error', message, data, stepId);
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown,
    stepId?: string
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: ExecutionLogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
      stepId,
    };

    this.logs.push(entry);

    // 同时输出到控制台
    const prefix = stepId ? `[${stepId}]` : '';
    const logMessage = `[Workflow]${prefix} ${message}`;

    switch (level) {
      case 'debug':
        console.debug(logMessage, data ?? '');
        break;
      case 'info':
        console.info(logMessage, data ?? '');
        break;
      case 'warn':
        console.warn(logMessage, data ?? '');
        break;
      case 'error':
        console.error(logMessage, data ?? '');
        break;
    }
  }

  getLogs(): ExecutionLogEntry[] {
    return [...this.logs];
  }

  getLogsByStep(stepId: string): ExecutionLogEntry[] {
    return this.logs.filter((log) => log.stepId === stepId);
  }

  clear(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return this.logs
      .map((log) => {
        const time = new Date(log.timestamp).toISOString();
        const stepPrefix = log.stepId ? `[${log.stepId}]` : '';
        const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
        return `${time} [${log.level.toUpperCase()}]${stepPrefix} ${log.message}${dataStr}`;
      })
      .join('\n');
  }
}

export const executionLogger = new ExecutionLogger();
