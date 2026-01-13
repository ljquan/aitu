/**
 * 路径解析器
 * 支持点分隔路径和数组索引访问
 */

import type { IPathResolver, PathResolveResult } from './types';

interface PathSegment {
  type: 'property' | 'index';
  value: string | number;
}

export class PathResolver implements IPathResolver {
  private parsePath(path: string): PathSegment[] {
    const segments: PathSegment[] = [];
    const regex = /([^.\[\]]+)|\[(-?\d+)\]|\["([^"]+)"\]|\['([^']+)'\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) {
        segments.push({ type: 'property', value: match[1] });
      } else if (match[2] !== undefined) {
        segments.push({ type: 'index', value: parseInt(match[2], 10) });
      } else if (match[3] !== undefined || match[4] !== undefined) {
        segments.push({ type: 'property', value: match[3] || match[4] });
      }
    }

    return segments;
  }

  resolve(source: unknown, path: string): PathResolveResult {
    if (!path || path === '' || path === '.') {
      return { success: true, value: source, resolvedPath: [] };
    }

    if (path === '$') {
      return { success: true, value: source, resolvedPath: ['$'] };
    }

    const segments = this.parsePath(path);
    if (segments.length === 0) {
      return { success: false, error: `Invalid path: "${path}"` };
    }

    let current: unknown = source;
    const resolvedPath: string[] = [];

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return {
          success: false,
          error: `Cannot access "${segment.value}" of ${current}`,
          resolvedPath,
        };
      }

      if (segment.type === 'index') {
        if (!Array.isArray(current)) {
          return {
            success: false,
            error: `Cannot use index [${segment.value}] on non-array value`,
            resolvedPath,
          };
        }

        const index = segment.value as number;
        const actualIndex = index < 0 ? current.length + index : index;

        if (actualIndex < 0 || actualIndex >= current.length) {
          return {
            success: false,
            error: `Array index ${index} out of bounds (length: ${current.length})`,
            resolvedPath,
          };
        }

        current = current[actualIndex];
        resolvedPath.push(`[${index}]`);
      } else {
        if (typeof current !== 'object') {
          return {
            success: false,
            error: `Cannot access property "${segment.value}" on ${typeof current}`,
            resolvedPath,
          };
        }

        const key = segment.value as string;
        const obj = current as Record<string, unknown>;

        if (!(key in obj)) {
          return {
            success: false,
            error: `Property "${key}" does not exist`,
            resolvedPath,
          };
        }

        current = obj[key];
        resolvedPath.push(key);
      }
    }

    return { success: true, value: current, resolvedPath };
  }

  set(target: Record<string, unknown>, path: string, value: unknown): boolean {
    if (!path || path === '' || path === '.') {
      return false;
    }

    const segments = this.parsePath(path);
    if (segments.length === 0) {
      return false;
    }

    let current: Record<string, unknown> | unknown[] = target;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const nextSegment = segments[i + 1];

      if (segment.type === 'index') {
        if (!Array.isArray(current)) {
          return false;
        }
        const index = segment.value as number;
        const actualIndex = index < 0 ? current.length + index : index;

        if (actualIndex < 0) {
          return false;
        }

        if (current[actualIndex] === undefined) {
          current[actualIndex] = nextSegment.type === 'index' ? [] : {};
        }
        current = current[actualIndex] as Record<string, unknown> | unknown[];
      } else {
        const key = segment.value as string;
        const obj = current as Record<string, unknown>;

        if (obj[key] === undefined) {
          obj[key] = nextSegment.type === 'index' ? [] : {};
        }
        current = obj[key] as Record<string, unknown> | unknown[];
      }
    }

    const lastSegment = segments[segments.length - 1];

    if (lastSegment.type === 'index') {
      if (!Array.isArray(current)) {
        return false;
      }
      const index = lastSegment.value as number;
      const actualIndex = index < 0 ? current.length + index : index;
      if (actualIndex < 0) {
        return false;
      }
      current[actualIndex] = value;
    } else {
      const key = lastSegment.value as string;
      (current as Record<string, unknown>)[key] = value;
    }

    return true;
  }

  exists(source: unknown, path: string): boolean {
    return this.resolve(source, path).success;
  }

  get<T>(source: unknown, path: string, defaultValue: T): T {
    const result = this.resolve(source, path);
    return result.success ? (result.value as T) : defaultValue;
  }
}

export const pathResolver = new PathResolver();
