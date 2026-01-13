/**
 * 类型校验器
 * 支持基础类型和复杂结构校验
 */

import type { ITypeValidator, ParameterType, ValidationResult } from './types';

export class TypeValidator implements ITypeValidator {
  getType(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  validate(value: unknown, expectedType: ParameterType): ValidationResult {
    const actualType = this.getType(value);

    if (expectedType === 'any') {
      return { valid: true, actualType, expectedType };
    }

    if (value === null || value === undefined) {
      return {
        valid: false,
        actualType,
        expectedType,
        error: `Expected ${expectedType}, got ${actualType}`,
      };
    }

    let isValid = false;

    switch (expectedType) {
      case 'string':
        isValid = typeof value === 'string';
        break;
      case 'number':
        isValid = typeof value === 'number' && !isNaN(value);
        break;
      case 'boolean':
        isValid = typeof value === 'boolean';
        break;
      case 'array':
        isValid = Array.isArray(value);
        break;
      case 'object':
        isValid = typeof value === 'object' && !Array.isArray(value);
        break;
      default:
        isValid = false;
    }

    return {
      valid: isValid,
      actualType,
      expectedType,
      error: isValid ? undefined : `Expected ${expectedType}, got ${actualType}`,
    };
  }

  coerce(value: unknown, targetType: ParameterType): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (this.validate(value, targetType).valid) {
      return value;
    }

    switch (targetType) {
      case 'string':
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);

      case 'number':
        if (typeof value === 'string') {
          const num = Number(value);
          return isNaN(num) ? undefined : num;
        }
        if (typeof value === 'boolean') {
          return value ? 1 : 0;
        }
        return undefined;

      case 'boolean':
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes') return true;
          if (lower === 'false' || lower === '0' || lower === 'no') return false;
          return undefined;
        }
        if (typeof value === 'number') {
          return value !== 0;
        }
        return undefined;

      case 'array':
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        }
        return [value];

      case 'object':
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        }
        return undefined;

      case 'any':
        return value;

      default:
        return undefined;
    }
  }

  isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  validateAll(
    values: Array<{ value: unknown; type: ParameterType; name: string }>
  ): Array<ValidationResult & { name: string }> {
    return values.map(({ value, type, name }) => ({
      ...this.validate(value, type),
      name,
    }));
  }
}

export const typeValidator = new TypeValidator();
