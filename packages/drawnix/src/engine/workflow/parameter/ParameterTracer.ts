/**
 * 参数跟踪器
 * 控制台参数流跟踪和日志输出
 */

import type {
  IParameterTracer,
  LogLevel,
  MappingRule,
  MappedParameters,
  ParameterTraceRecord,
} from './types';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class ParameterTracer implements IParameterTracer {
  private logLevel: LogLevel = 'info';
  private currentTrace: Partial<ParameterTraceRecord> | null = null;
  private steps: Array<{ step: string; data?: unknown; timestamp: number }> = [];
  private enabled: boolean = true;

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.logLevel];
  }

  startTrace(sourceToolId: string, targetToolId: string): void {
    if (!this.enabled) return;

    this.currentTrace = {
      timestamp: Date.now(),
      sourceToolId,
      targetToolId,
      rules: [],
    };
    this.steps = [];

    // if (this.shouldLog('debug')) {
    //   console.log(`[ParameterMapper] Starting: ${sourceToolId} → ${targetToolId}`);
    // }
  }

  logStep(step: string, data?: unknown): void {
    if (!this.enabled) return;

    this.steps.push({ step, data, timestamp: Date.now() });

    // if (this.shouldLog('debug')) {
    //   const dataStr = data !== undefined ? `: ${this.formatValue(data)}` : '';
    //   console.log(`  ├─ ${step}${dataStr}`);
    // }
  }

  logRuleApplication(
    rule: MappingRule,
    sourceValue: unknown,
    targetValue: unknown
  ): void {
    if (!this.enabled) return;

    if (this.currentTrace) {
      this.currentTrace.rules = [...(this.currentTrace.rules || []), rule];
    }

    // if (this.shouldLog('debug')) {
    //   console.log(`  ├─ Rule: "${rule.source}" → "${rule.target}"`);
    //   console.log(`  │  Source: ${this.formatValue(sourceValue)}`);
    //   console.log(`  │  Target: ${this.formatValue(targetValue)}`);
    // }
  }

  logWarning(message: string): void {
    if (!this.enabled) return;

    // if (this.shouldLog('warn')) {
    //   console.log(`  ├─ ⚠ Warning: ${message}`);
    // }
  }

  logError(message: string): void {
    if (!this.enabled) return;

    // if (this.shouldLog('error')) {
    //   console.log(`  ├─ ✖ Error: ${message}`);
    // }
  }

  endTrace(result: MappedParameters): void {
    if (!this.enabled || !this.currentTrace) return;

    const duration = Date.now() - (this.currentTrace.timestamp || Date.now());

    // if (this.shouldLog('debug')) {
    //   console.log(`  └─ ${result.success ? '✔ Success' : '✖ Failed'} (${duration}ms)`);
    //   if (result.warnings.length > 0) {
    //     console.log(`     Warnings: ${result.warnings.length}`);
    //   }
    //   console.log(`     Output: ${this.formatValue(result.params)}`);
    // } else if (this.shouldLog('info')) {
    //   const status = result.success ? '✔' : '✖';
    //   console.log(
    //     `[ParameterMapper] ${this.currentTrace.sourceToolId} → ${this.currentTrace.targetToolId}: ${status} (${duration}ms)`
    //   );
    // }

    this.currentTrace = null;
    this.steps = [];
  }

  private formatValue(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';

    if (typeof value === 'string') {
      if (value.length > 50) {
        return `"${value.substring(0, 47)}..."`;
      }
      return `"${value}"`;
    }

    if (typeof value === 'object') {
      const str = JSON.stringify(value);
      if (str.length > 80) {
        return str.substring(0, 77) + '...';
      }
      return str;
    }

    return String(value);
  }

  logSummary(
    sourceToolId: string,
    targetToolId: string,
    params: Record<string, unknown>
  ): void {
    if (!this.enabled || !this.shouldLog('info')) return;

    // const paramKeys = Object.keys(params);
    // console.log(
    //   `[ParameterMapper] ${sourceToolId} → ${targetToolId}: ${paramKeys.length} param(s) mapped [${paramKeys.join(', ')}]`
    // );
  }
}

export const parameterTracer = new ParameterTracer();
