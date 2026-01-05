/**
 * 回退策略
 * 处理参数映射失败时的优雅降级
 */

import type {
  IFallbackStrategy,
  FallbackConfig,
  MappingRule,
  FallbackStrategyType,
} from './types';
import { EMPTY_VALUES, DEFAULT_FALLBACK_CONFIG } from './types';

export interface FallbackResult {
  value: unknown;
  shouldSkip: boolean;
  shouldAbort: boolean;
  strategyUsed: FallbackStrategyType;
  logMessage: string;
}

export class FallbackStrategy implements IFallbackStrategy {
  private defaultConfig: FallbackConfig = DEFAULT_FALLBACK_CONFIG;

  setDefaultConfig(config: Partial<FallbackConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  execute(
    config: FallbackConfig | undefined,
    rule: MappingRule,
    error: string
  ): FallbackResult {
    const finalConfig = config || this.defaultConfig;
    const { strategy, errorMessage } = finalConfig;

    const logMsg = errorMessage || `Parameter mapping failed for "${rule.target}": ${error}`;

    switch (strategy) {
      case 'useDefault':
        return this.useDefaultStrategy(rule, logMsg);

      case 'skipParameter':
        return this.skipParameterStrategy(rule, logMsg);

      case 'abortStep':
        return this.abortStepStrategy(rule, logMsg);

      case 'useEmpty':
        return this.useEmptyStrategy(rule, logMsg);

      default:
        return this.useDefaultStrategy(rule, logMsg);
    }
  }

  private useDefaultStrategy(rule: MappingRule, logMessage: string): FallbackResult {
    const value = rule.defaultValue !== undefined
      ? rule.defaultValue
      : rule.type
        ? EMPTY_VALUES[rule.type]
        : undefined;

    return {
      value,
      shouldSkip: false,
      shouldAbort: false,
      strategyUsed: 'useDefault',
      logMessage: `${logMessage} → Using default value: ${JSON.stringify(value)}`,
    };
  }

  private skipParameterStrategy(rule: MappingRule, logMessage: string): FallbackResult {
    return {
      value: undefined,
      shouldSkip: true,
      shouldAbort: false,
      strategyUsed: 'skipParameter',
      logMessage: `${logMessage} → Skipping parameter "${rule.target}"`,
    };
  }

  private abortStepStrategy(rule: MappingRule, logMessage: string): FallbackResult {
    return {
      value: undefined,
      shouldSkip: false,
      shouldAbort: true,
      strategyUsed: 'abortStep',
      logMessage: `${logMessage} → Aborting step due to required parameter "${rule.target}"`,
    };
  }

  private useEmptyStrategy(rule: MappingRule, logMessage: string): FallbackResult {
    const type = rule.type || 'any';
    const value = EMPTY_VALUES[type];

    return {
      value,
      shouldSkip: false,
      shouldAbort: false,
      strategyUsed: 'useEmpty',
      logMessage: `${logMessage} → Using empty value for type "${type}": ${JSON.stringify(value)}`,
    };
  }

  executeAuto(rule: MappingRule, error: string): FallbackResult {
    if (rule.required && rule.defaultValue === undefined) {
      return this.execute({ strategy: 'abortStep', logLevel: 'error' }, rule, error);
    }

    if (rule.defaultValue !== undefined) {
      return this.execute({ strategy: 'useDefault', logLevel: 'warn' }, rule, error);
    }

    return this.execute({ strategy: 'useEmpty', logLevel: 'debug' }, rule, error);
  }
}

export const fallbackStrategy = new FallbackStrategy();
