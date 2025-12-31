/**
 * 默认值处理器
 * 管理和应用参数默认值
 */

import type { IDefaultValueHandler, MappingRule, ParameterType } from './types';
import { EMPTY_VALUES } from './types';

export class DefaultValueHandler implements IDefaultValueHandler {
  getDefault(rule: MappingRule): unknown {
    if (rule.defaultValue !== undefined) {
      return this.cloneValue(rule.defaultValue);
    }

    if (rule.type) {
      return this.getEmptyValue(rule.type);
    }

    return undefined;
  }

  getEmptyValue(type: ParameterType): unknown {
    const emptyValue = EMPTY_VALUES[type];
    return this.cloneValue(emptyValue);
  }

  private cloneValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.cloneValue(item));
    }

    const cloned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      cloned[key] = this.cloneValue(val);
    }
    return cloned;
  }

  needsDefault(value: unknown, rule: MappingRule): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === 'string' && value.trim() === '' && rule.defaultValue !== undefined) {
      return true;
    }

    return false;
  }

  applyDefault(value: unknown, rule: MappingRule): unknown {
    if (this.needsDefault(value, rule)) {
      return this.getDefault(rule);
    }
    return value;
  }

  applyDefaults(
    values: Record<string, unknown>,
    rules: MappingRule[]
  ): Record<string, unknown> {
    const result = { ...values };

    for (const rule of rules) {
      const currentValue = result[rule.target];
      result[rule.target] = this.applyDefault(currentValue, rule);
    }

    return result;
  }
}

export const defaultValueHandler = new DefaultValueHandler();
