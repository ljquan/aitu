import { describe, it, expect } from 'vitest';
import { generateUUID, generateId } from './index';

describe('ID Generation Utilities', () => {
  describe('generateUUID', () => {
    it('should generate a valid UUID v4', () => {
      const uuid = generateUUID();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set(Array.from({ length: 100 }, () => generateUUID()));
      expect(uuids.size).toBe(100);
    });
  });

  describe('generateId', () => {
    it('should generate an ID without prefix', () => {
      const id = generateId();
      // Format: timestamp_random
      expect(id).toMatch(/^\d+_[a-z0-9]+$/);
    });

    it('should generate an ID with prefix', () => {
      const id = generateId('task');
      // Format: prefix_timestamp_random
      expect(id).toMatch(/^task_\d+_[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateId();
      const after = Date.now();
      
      const timestamp = parseInt(id.split('_')[0], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});
