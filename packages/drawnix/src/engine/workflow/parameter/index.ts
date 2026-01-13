/**
 * 参数映射模块
 */

export type {
  ParameterType,
  FallbackStrategyType,
  LogLevel,
  MappingRule,
  FallbackConfig,
  ToolMappingConfig,
  MappedParameters,
  MappingWarning,
  ValidationResult,
  PathResolveResult,
  ParameterTraceRecord,
  IParameterMapper,
  IPathResolver,
  ITypeValidator,
  IDefaultValueHandler,
  IFallbackStrategy,
  IParameterTracer,
} from './types';

export { DEFAULT_FALLBACK_CONFIG, EMPTY_VALUES } from './types';

export { PathResolver, pathResolver } from './PathResolver';
export { TypeValidator, typeValidator } from './TypeValidator';
export { DefaultValueHandler, defaultValueHandler } from './DefaultValueHandler';
export { FallbackStrategy, fallbackStrategy } from './FallbackStrategy';
export type { FallbackResult } from './FallbackStrategy';
export { ParameterTracer, parameterTracer } from './ParameterTracer';
export { ParameterMapper, parameterMapper } from './ParameterMapper';
export type { ParameterMapperConfig } from './ParameterMapper';

export {
  DEFAULT_TOOL_MAPPINGS,
  COMMON_MAPPINGS,
  getToolMapping,
  hasToolMapping,
  getRegisteredToolPairs,
  createMappingRule,
  createContentMapping,
  mergeToolMappings,
} from './tool-mappings';
