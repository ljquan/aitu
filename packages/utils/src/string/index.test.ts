import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  truncate,
  capitalize,
  toKebabCase,
  toCamelCase,
} from './index';

describe('sanitizeFilename', () => {
  it('should remove special characters', () => {
    expect(sanitizeFilename('file@#$%name.txt')).toBe('filename.txt');
    expect(sanitizeFilename('hello!world?.png')).toBe('helloworld.png');
  });

  it('should keep Chinese characters', () => {
    expect(sanitizeFilename('文件名-test')).toBe('文件名-test');
    expect(sanitizeFilename('你好世界 Hello')).toBe('你好世界-Hello');
  });

  it('should replace spaces with dashes', () => {
    expect(sanitizeFilename('hello world')).toBe('hello-world');
    expect(sanitizeFilename('multiple   spaces')).toBe('multiple-spaces');
  });

  it('should truncate to max length', () => {
    expect(sanitizeFilename('a'.repeat(100), 10)).toBe('a'.repeat(10));
    expect(sanitizeFilename('Hello World Test', 10)).toBe('Hello-Worl');
  });

  it('should keep dots for file extensions', () => {
    expect(sanitizeFilename('file.name.txt')).toBe('file.name.txt');
  });
});

describe('truncate', () => {
  it('should truncate string when longer than max length', () => {
    expect(truncate('Hello World', 5)).toBe('He...');
    expect(truncate('Long text here', 8)).toBe('Long ...');
  });

  it('should not truncate when shorter than max length', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
    expect(truncate('Short', 20)).toBe('Short');
  });

  it('should use custom ellipsis', () => {
    expect(truncate('Hello World', 8, '…')).toBe('Hello W…');
    expect(truncate('Test', 3, '---')).toBe('---');
  });
});

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('world')).toBe('World');
  });

  it('should not affect rest of string', () => {
    expect(capitalize('hELLO')).toBe('HELLO');
    expect(capitalize('tEsT')).toBe('TEsT');
  });

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('should handle single character', () => {
    expect(capitalize('a')).toBe('A');
  });
});

describe('toKebabCase', () => {
  it('should convert PascalCase to kebab-case', () => {
    expect(toKebabCase('HelloWorld')).toBe('hello-world');
    expect(toKebabCase('MyComponent')).toBe('my-component');
  });

  it('should convert camelCase to kebab-case', () => {
    expect(toKebabCase('helloWorld')).toBe('hello-world');
    expect(toKebabCase('myVariable')).toBe('my-variable');
  });

  it('should convert snake_case to kebab-case', () => {
    expect(toKebabCase('hello_world')).toBe('hello-world');
    expect(toKebabCase('my_variable')).toBe('my-variable');
  });

  it('should convert spaces to dashes', () => {
    expect(toKebabCase('Hello World')).toBe('hello-world');
    expect(toKebabCase('My Test String')).toBe('my-test-string');
  });

  it('should handle already kebab-cased strings', () => {
    expect(toKebabCase('already-kebab')).toBe('already-kebab');
  });
});

describe('toCamelCase', () => {
  it('should convert kebab-case to camelCase', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld');
    expect(toCamelCase('my-component')).toBe('myComponent');
  });

  it('should convert snake_case to camelCase', () => {
    expect(toCamelCase('hello_world')).toBe('helloWorld');
    expect(toCamelCase('my_variable')).toBe('myVariable');
  });

  it('should convert spaces to camelCase', () => {
    expect(toCamelCase('Hello World')).toBe('helloWorld');
    expect(toCamelCase('My Test String')).toBe('myTestString');
  });

  it('should handle already camelCased strings', () => {
    expect(toCamelCase('alreadyCamel')).toBe('alreadyCamel');
  });

  it('should handle PascalCase', () => {
    expect(toCamelCase('HelloWorld')).toBe('helloWorld');
  });
});
