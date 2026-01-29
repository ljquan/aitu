import { describe, it, expect } from 'vitest';
import {
  sanitizeObject,
  sanitizeRequestBody,
  sanitizeUrl,
  getSafeErrorMessage,
} from './index';

describe('Security Utilities', () => {
  describe('sanitizeObject', () => {
    it('should redact sensitive keys', () => {
      const data = {
        apiKey: 'secret123',
        password: 'pass123',
        name: 'test',
      };
      const result = sanitizeObject(data);
      expect(result).toEqual({
        apiKey: '[REDACTED]',
        password: '[REDACTED]',
        name: 'test',
      });
    });

    it('should redact Bearer tokens in strings', () => {
      expect(sanitizeObject('Bearer abc123xyz')).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const data = {
        config: {
          apiKey: 'secret',
          endpoint: 'https://api.example.com',
        },
      };
      const result = sanitizeObject(data) as any;
      expect(result.config.apiKey).toBe('[REDACTED]');
      expect(result.config.endpoint).toBe('https://api.example.com');
    });

    it('should handle arrays', () => {
      const data = [
        { apiKey: 'secret1' },
        { apiKey: 'secret2' },
      ];
      const result = sanitizeObject(data) as any[];
      expect(result[0].apiKey).toBe('[REDACTED]');
      expect(result[1].apiKey).toBe('[REDACTED]');
    });

    it('should return null/undefined as-is', () => {
      expect(sanitizeObject(null)).toBeNull();
      expect(sanitizeObject(undefined)).toBeUndefined();
    });
  });

  describe('sanitizeRequestBody', () => {
    it('should sanitize JSON request body', () => {
      const body = JSON.stringify({ apiKey: 'secret', data: 'test' });
      const result = JSON.parse(sanitizeRequestBody(body));
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.data).toBe('test');
    });

    it('should sanitize Bearer tokens in non-JSON', () => {
      const body = 'Authorization: Bearer abc123';
      const result = sanitizeRequestBody(body);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('sanitizeUrl', () => {
    it('should remove sensitive query parameters', () => {
      const url = 'https://api.example.com/endpoint?apiKey=secret&name=test';
      const result = sanitizeUrl(url);
      expect(result).not.toContain('secret');
      expect(result).toContain('name=test');
    });

    it('should handle URLs without sensitive params', () => {
      const url = 'https://api.example.com/endpoint?name=test';
      const result = sanitizeUrl(url);
      expect(result).toBe(url);
    });
  });

  describe('getSafeErrorMessage', () => {
    it('should return error name for Error objects', () => {
      expect(getSafeErrorMessage(new TypeError('message'))).toBe('TypeError');
      expect(getSafeErrorMessage(new RangeError('message'))).toBe('RangeError');
    });

    it('should return "Unknown error" for non-Error objects', () => {
      expect(getSafeErrorMessage('string error')).toBe('Unknown error');
      expect(getSafeErrorMessage(123)).toBe('Unknown error');
    });
  });
});
