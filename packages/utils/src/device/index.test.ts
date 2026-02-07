/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOrCreateDeviceId,
  getDeviceId,
  generateDeviceId,
  getDeviceName,
  getDeviceType,
  getBrowserName,
} from './index';

describe('generateDeviceId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();

    expect(id1).not.toBe(id2);
  });

  it('should match expected format', () => {
    const id = generateDeviceId();

    // Format: {timestamp36}-{random}
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  it('should generate non-empty strings', () => {
    const id = generateDeviceId();

    expect(id.length).toBeGreaterThan(5);
  });
});

describe('getOrCreateDeviceId', () => {
  const storageKey = 'test_device_id';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create new ID if not exists', () => {
    const id = getOrCreateDeviceId({ storageKey });

    expect(id).toBeTruthy();
    expect(localStorage.getItem(storageKey)).toBe(id);
  });

  it('should return existing ID', () => {
    const existingId = 'existing-device-id-123';
    localStorage.setItem(storageKey, existingId);

    const id = getOrCreateDeviceId({ storageKey });

    expect(id).toBe(existingId);
  });

  it('should persist ID across calls', () => {
    const id1 = getOrCreateDeviceId({ storageKey });
    const id2 = getOrCreateDeviceId({ storageKey });

    expect(id1).toBe(id2);
  });
});

describe('getDeviceId', () => {
  const storageKey = 'test_device_id_readonly';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return "unknown" if not exists', () => {
    const id = getDeviceId({ storageKey });

    expect(id).toBe('unknown');
  });

  it('should return existing ID without creating', () => {
    const existingId = 'readonly-test-id';
    localStorage.setItem(storageKey, existingId);

    const id = getDeviceId({ storageKey });

    expect(id).toBe(existingId);
  });

  it('should not create new ID', () => {
    getDeviceId({ storageKey });

    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});

describe('getDeviceName', () => {
  it('should return a non-empty string', () => {
    const name = getDeviceName();

    expect(name).toBeTruthy();
    expect(typeof name).toBe('string');
  });

  it('should return a known device name in browser environment', () => {
    const name = getDeviceName();

    // In jsdom environment, should return something like "Unknown" or platform-based
    expect(name.length).toBeGreaterThan(0);
  });
});

describe('getDeviceType', () => {
  it('should return a valid device type', () => {
    const type = getDeviceType();

    expect(['mobile', 'tablet', 'desktop']).toContain(type);
  });

  it('should default to desktop in jsdom', () => {
    // jsdom doesn't have mobile user agent
    const type = getDeviceType();

    expect(type).toBe('desktop');
  });
});

describe('getBrowserName', () => {
  it('should return a browser name string', () => {
    const name = getBrowserName();

    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('should return one of known browsers or Unknown', () => {
    const name = getBrowserName();
    const knownBrowsers = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera', 'Unknown'];

    expect(knownBrowsers).toContain(name);
  });
});

describe('user agent mocking', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('should detect iOS device', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        platform: 'iPhone',
      },
      writable: true,
    });

    expect(getDeviceName()).toBe('iOS Device');
    expect(getDeviceType()).toBe('mobile');
  });

  it('should detect Android device', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Linux; Android 11) Mobile',
        platform: 'Linux armv7l',
      },
      writable: true,
    });

    expect(getDeviceName()).toBe('Android Device');
    expect(getDeviceType()).toBe('mobile');
  });

  it('should detect macOS', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
      },
      writable: true,
    });

    expect(getDeviceName()).toBe('macOS');
    expect(getDeviceType()).toBe('desktop');
  });

  it('should detect Chrome browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        platform: 'Win32',
      },
      writable: true,
    });

    expect(getBrowserName()).toBe('Chrome');
  });

  it('should detect Firefox browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        platform: 'Win32',
      },
      writable: true,
    });

    expect(getBrowserName()).toBe('Firefox');
  });
});
