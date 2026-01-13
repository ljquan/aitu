/**
 * 参数映射模块类型定义
 * @module parameter/types
 */

/**
 * 参数类型枚举
 */
export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'any';

/**
 * 回退策略类型
 */
export type FallbackStrategyType =
  | 'useDefault' // 使用预设默认值
  | 'skipParameter' // 跳过该参数
  | 'abortStep' // 中止当前步骤
  | 'useEmpty'; // 使用类型对应的空值

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 映射规则定义
 */
export interface MappingRule {
  /** 源路径，如 "result.items[0].href" */
  source: string;
  /** 目标参数名，如 "content" */
  target: string;
  /** 期望的参数类型 */
  type?: ParameterType;
  /** 默认值 */
  defaultValue?: unknown;
  /** 是否必需 */
  required?: boolean;
  /** 转换函数名（可选，用于内置转换） */
  transform?: string;
}

/**
 * 回退配置
 */
export interface FallbackConfig {
  /** 回退策略 */
  strategy: FallbackStrategyType;
  /** 日志级别 */
  logLevel: LogLevel;
  /** 自定义错误消息 */
  errorMessage?: string;
}

/**
 * 工具映射配置
 * key 格式: "sourceToolId->targetToolId"
 */
export interface ToolMappingConfig {
  [toolPair: string]: MappingRule[];
}

/**
 * 映射后的参数结果
 */
export interface MappedParameters {
  /** 映射后的参数对象 */
  params: Record<string, unknown>;
  /** 映射过程中的警告 */
  warnings: MappingWarning[];
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 映射警告
 */
export interface MappingWarning {
  /** 规则信息 */
  rule: MappingRule;
  /** 警告消息 */
  message: string;
  /** 采取的回退策略 */
  fallbackUsed?: FallbackStrategyType;
}

/**
 * 类型校验结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 实际类型 */
  actualType: string;
  /** 期望类型 */
  expectedType: ParameterType;
  /** 错误消息 */
  error?: string;
}

/**
 * 路径解析结果
 */
export interface PathResolveResult {
  /** 是否成功 */
  success: boolean;
  /** 解析到的值 */
  value?: unknown;
  /** 错误消息 */
  error?: string;
  /** 解析路径（用于调试） */
  resolvedPath?: string[];
}

/**
 * 参数跟踪记录
 */
export interface ParameterTraceRecord {
  /** 时间戳 */
  timestamp: number;
  /** 源工具 ID */
  sourceToolId: string;
  /** 目标工具 ID */
  targetToolId: string;
  /** 应用的映射规则 */
  rules: MappingRule[];
  /** 输入数据摘要 */
  inputSummary: string;
  /** 输出参数摘要 */
  outputSummary: string;
  /** 映射结果 */
  result: MappedParameters;
}

/**
 * 参数映射器接口
 */
export interface IParameterMapper {
  map(
    sourceToolId: string,
    targetToolId: string,
    sourceOutput: unknown,
    existingArgs?: Record<string, unknown>
  ): MappedParameters;

  registerMapping(
    sourceToolId: string,
    targetToolId: string,
    rules: MappingRule[]
  ): void;

  getMapping(sourceToolId: string, targetToolId: string): MappingRule[] | undefined;
}

/**
 * 路径解析器接口
 */
export interface IPathResolver {
  resolve(source: unknown, path: string): PathResolveResult;
  set(target: Record<string, unknown>, path: string, value: unknown): boolean;
}

/**
 * 类型校验器接口
 */
export interface ITypeValidator {
  validate(value: unknown, expectedType: ParameterType): ValidationResult;
  getType(value: unknown): string;
}

/**
 * 默认值处理器接口
 */
export interface IDefaultValueHandler {
  getDefault(rule: MappingRule): unknown;
  getEmptyValue(type: ParameterType): unknown;
}

/**
 * 回退策略接口
 */
export interface IFallbackStrategy {
  execute(
    config: FallbackConfig,
    rule: MappingRule,
    error: string
  ): { value: unknown; shouldSkip: boolean; shouldAbort: boolean };
}

/**
 * 参数跟踪器接口
 */
export interface IParameterTracer {
  startTrace(sourceToolId: string, targetToolId: string): void;
  logStep(step: string, data?: unknown): void;
  endTrace(result: MappedParameters): void;
  setLogLevel(level: LogLevel): void;
}

/**
 * 全局默认回退配置
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  strategy: 'useDefault',
  logLevel: 'warn',
};

/**
 * 类型对应的空值映射
 */
export const EMPTY_VALUES: Record<ParameterType, unknown> = {
  string: '',
  number: 0,
  boolean: false,
  array: [],
  object: {},
  any: undefined,
};
