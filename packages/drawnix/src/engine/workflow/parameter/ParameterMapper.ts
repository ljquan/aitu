/**
 * 参数映射器
 * 核心映射引擎，整合所有子模块
 */

import type {
  IParameterMapper,
  MappingRule,
  MappedParameters,
  MappingWarning,
  ToolMappingConfig,
  FallbackConfig,
  LogLevel,
} from './types';
import { PathResolver, pathResolver } from './PathResolver';
import { TypeValidator, typeValidator } from './TypeValidator';
import { DefaultValueHandler, defaultValueHandler } from './DefaultValueHandler';
import { FallbackStrategy, fallbackStrategy } from './FallbackStrategy';
import { ParameterTracer, parameterTracer } from './ParameterTracer';

export interface ParameterMapperConfig {
  enableTracing?: boolean;
  logLevel?: LogLevel;
  defaultFallback?: FallbackConfig;
  enableTypeCoercion?: boolean;
}

export class ParameterMapper implements IParameterMapper {
  private mappings: ToolMappingConfig = {};
  private pathResolver: PathResolver;
  private typeValidator: TypeValidator;
  private defaultValueHandler: DefaultValueHandler;
  private fallbackStrategy: FallbackStrategy;
  private tracer: ParameterTracer;
  private config: ParameterMapperConfig;

  constructor(config: ParameterMapperConfig = {}) {
    this.config = {
      enableTracing: true,
      logLevel: 'info',
      enableTypeCoercion: true,
      ...config,
    };

    this.pathResolver = pathResolver;
    this.typeValidator = typeValidator;
    this.defaultValueHandler = defaultValueHandler;
    this.fallbackStrategy = fallbackStrategy;
    this.tracer = parameterTracer;

    this.tracer.setEnabled(this.config.enableTracing ?? true);
    this.tracer.setLogLevel(this.config.logLevel ?? 'info');

    if (this.config.defaultFallback) {
      this.fallbackStrategy.setDefaultConfig(this.config.defaultFallback);
    }
  }

  private getToolPairKey(sourceToolId: string, targetToolId: string): string {
    return `${sourceToolId}->${targetToolId}`;
  }

  registerMapping(
    sourceToolId: string,
    targetToolId: string,
    rules: MappingRule[]
  ): void {
    const key = this.getToolPairKey(sourceToolId, targetToolId);
    this.mappings[key] = rules;
  }

  registerMappings(config: ToolMappingConfig): void {
    for (const [key, rules] of Object.entries(config)) {
      this.mappings[key] = rules;
    }
  }

  getMapping(sourceToolId: string, targetToolId: string): MappingRule[] | undefined {
    const key = this.getToolPairKey(sourceToolId, targetToolId);
    return this.mappings[key];
  }

  map(
    sourceToolId: string,
    targetToolId: string,
    sourceOutput: unknown,
    existingArgs: Record<string, unknown> = {}
  ): MappedParameters {
    this.tracer.startTrace(sourceToolId, targetToolId);

    const warnings: MappingWarning[] = [];
    const params: Record<string, unknown> = { ...existingArgs };

    const rules = this.getMapping(sourceToolId, targetToolId);

    if (!rules || rules.length === 0) {
      this.tracer.logStep('No mapping rules found, using default behavior');
      
      if (sourceOutput !== undefined && sourceOutput !== null) {
        const outputStr = typeof sourceOutput === 'string'
          ? sourceOutput
          : JSON.stringify(sourceOutput);
        
        if (!params.content) {
          params.content = outputStr;
          this.tracer.logStep('Mapped to default "content" parameter', outputStr);
        }
      }

      const result: MappedParameters = { params, warnings, success: true };
      this.tracer.endTrace(result);
      return result;
    }

    this.tracer.logStep(`Found ${rules.length} mapping rule(s)`);

    let parsedSource = sourceOutput;
    let isPlainString = false;
    if (typeof sourceOutput === 'string') {
      try {
        parsedSource = JSON.parse(sourceOutput);
        this.tracer.logStep('Parsed source output as JSON');
      } catch {
        isPlainString = true;
        this.tracer.logStep('Source output is plain string (not JSON)');
      }
    }

    if (isPlainString && typeof sourceOutput === 'string') {
      if (!params.content) {
        params.content = sourceOutput;
        this.tracer.logStep('Plain string directly mapped to "content" parameter');
      }
      
      const result: MappedParameters = { params, warnings, success: true };
      this.tracer.endTrace(result);
      return result;
    }

    for (const rule of rules) {
      const mappingResult = this.applyRule(rule, parsedSource, params);

      if (mappingResult.warning) {
        warnings.push(mappingResult.warning);
        this.tracer.logWarning(mappingResult.warning.message);
      }

      if (mappingResult.shouldAbort) {
        this.tracer.logError(`Aborting due to required parameter: ${rule.target}`);
        const result: MappedParameters = {
          params,
          warnings,
          success: false,
          error: `Required parameter "${rule.target}" could not be mapped`,
        };
        this.tracer.endTrace(result);
        return result;
      }

      if (!mappingResult.shouldSkip && mappingResult.value !== undefined) {
        params[rule.target] = mappingResult.value;
        this.tracer.logRuleApplication(rule, mappingResult.sourceValue, mappingResult.value);
        break;
      }
    }

    if (params.content === undefined && sourceOutput !== undefined && sourceOutput !== null) {
      const outputStr = typeof sourceOutput === 'string'
        ? sourceOutput
        : JSON.stringify(sourceOutput);
      params.content = outputStr;
      this.tracer.logStep('Fallback: Mapped entire source to "content" parameter', outputStr);
    }

    const result: MappedParameters = { params, warnings, success: true };
    this.tracer.endTrace(result);
    return result;
  }

  private applyRule(
    rule: MappingRule,
    source: unknown,
    _existingParams: Record<string, unknown>
  ): {
    value: unknown;
    sourceValue: unknown;
    shouldSkip: boolean;
    shouldAbort: boolean;
    warning?: MappingWarning;
  } {
    const resolveResult = this.pathResolver.resolve(source, rule.source);

    if (!resolveResult.success) {
      const fallback = this.fallbackStrategy.executeAuto(rule, resolveResult.error || 'Path not found');

      return {
        value: fallback.value,
        sourceValue: undefined,
        shouldSkip: fallback.shouldSkip,
        shouldAbort: fallback.shouldAbort,
        warning: {
          rule,
          message: fallback.logMessage,
          fallbackUsed: fallback.strategyUsed,
        },
      };
    }

    let value = resolveResult.value;

    if (rule.type) {
      const validationResult = this.typeValidator.validate(value, rule.type);

      if (!validationResult.valid) {
        if (this.config.enableTypeCoercion) {
          const coercedValue = this.typeValidator.coerce(value, rule.type);
          if (coercedValue !== undefined) {
            value = coercedValue;
          } else {
            const fallback = this.fallbackStrategy.executeAuto(
              rule,
              validationResult.error || 'Type validation failed'
            );

            return {
              value: fallback.value,
              sourceValue: resolveResult.value,
              shouldSkip: fallback.shouldSkip,
              shouldAbort: fallback.shouldAbort,
              warning: {
                rule,
                message: fallback.logMessage,
                fallbackUsed: fallback.strategyUsed,
              },
            };
          }
        } else {
          const fallback = this.fallbackStrategy.executeAuto(
            rule,
            validationResult.error || 'Type validation failed'
          );

          return {
            value: fallback.value,
            sourceValue: resolveResult.value,
            shouldSkip: fallback.shouldSkip,
            shouldAbort: fallback.shouldAbort,
            warning: {
              rule,
              message: fallback.logMessage,
              fallbackUsed: fallback.strategyUsed,
            },
          };
        }
      }
    }

    value = this.defaultValueHandler.applyDefault(value, rule);

    if (rule.transform) {
      value = this.applyTransform(value, rule.transform);
    }

    return {
      value,
      sourceValue: resolveResult.value,
      shouldSkip: false,
      shouldAbort: false,
    };
  }

  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case 'toString':
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      case 'toNumber':
        return Number(value);
      case 'toBoolean':
        return Boolean(value);
      case 'toArray':
        return Array.isArray(value) ? value : [value];
      case 'toJSON':
        return typeof value === 'string' ? JSON.parse(value) : value;
      case 'trim':
        return typeof value === 'string' ? value.trim() : value;
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      case 'first':
        return Array.isArray(value) ? value[0] : value;
      case 'last':
        return Array.isArray(value) ? value[value.length - 1] : value;
      case 'length':
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'string') return value.length;
        if (typeof value === 'object' && value !== null) return Object.keys(value).length;
        return 0;
      case 'keys':
        return typeof value === 'object' && value !== null ? Object.keys(value) : [];
      case 'values':
        return typeof value === 'object' && value !== null ? Object.values(value) : [];
      default:
        return value;
    }
  }

  hasMapping(sourceToolId: string, targetToolId: string): boolean {
    const key = this.getToolPairKey(sourceToolId, targetToolId);
    return key in this.mappings;
  }

  clearMappings(): void {
    this.mappings = {};
  }

  getAllMappings(): ToolMappingConfig {
    return { ...this.mappings };
  }

  setLogLevel(level: LogLevel): void {
    this.config.logLevel = level;
    this.tracer.setLogLevel(level);
  }

  setTracingEnabled(enabled: boolean): void {
    this.config.enableTracing = enabled;
    this.tracer.setEnabled(enabled);
  }
}

export const parameterMapper = new ParameterMapper();
