/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  openIndexedDB,
  getById,
  getAll,
  getAllWithCursor,
  put,
  putMany,
  deleteById,
  deleteMany,
  clearStore,
  countRecords,
  hasStore,
} from './operations';

// Test data type
interface TestRecord {
  id: string;
  name: string;
  value: number;
  timestamp?: number;
}

describe('IndexedDB Operations', () => {
  const DB_NAME = 'test-db';
  const STORE_NAME = 'test-store';
  let db: IDBDatabase;

  // Helper to create a test database with store
  async function createTestDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  beforeEach(async () => {
    // Reset fake-indexeddb
    indexedDB.deleteDatabase(DB_NAME);
    db = await createTestDB();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    indexedDB.deleteDatabase(DB_NAME);
  });

  describe('openIndexedDB', () => {
    it('should open an existing database', async () => {
      const openedDb = await openIndexedDB(DB_NAME);

      expect(openedDb).toBeInstanceOf(IDBDatabase);
      expect(openedDb.name).toBe(DB_NAME);

      openedDb.close();
    });

    it('should call onUpgradeNeeded when provided', async () => {
      const newDbName = 'new-test-db';
      let upgradeCalled = false;

      const openedDb = await openIndexedDB(newDbName, {
        version: 1,
        onUpgradeNeeded: (database) => {
          upgradeCalled = true;
          database.createObjectStore('new-store', { keyPath: 'id' });
        },
      });

      expect(upgradeCalled).toBe(true);
      expect(openedDb.objectStoreNames.contains('new-store')).toBe(true);

      openedDb.close();
      indexedDB.deleteDatabase(newDbName);
    });
  });

  describe('put and getById', () => {
    it('should store and retrieve a record', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test', value: 42 };

      await put(db, STORE_NAME, record);
      const retrieved = await getById<TestRecord>(db, STORE_NAME, 'test-1');

      expect(retrieved).toEqual(record);
    });

    it('should return null for non-existent record', async () => {
      const result = await getById<TestRecord>(db, STORE_NAME, 'non-existent');

      expect(result).toBeNull();
    });

    it('should update existing record', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Original', value: 1 };
      await put(db, STORE_NAME, record);

      const updated: TestRecord = { id: 'test-1', name: 'Updated', value: 2 };
      await put(db, STORE_NAME, updated);

      const retrieved = await getById<TestRecord>(db, STORE_NAME, 'test-1');
      expect(retrieved?.name).toBe('Updated');
      expect(retrieved?.value).toBe(2);
    });
  });

  describe('getAll', () => {
    it('should retrieve all records', async () => {
      const records: TestRecord[] = [
        { id: '1', name: 'First', value: 1 },
        { id: '2', name: 'Second', value: 2 },
        { id: '3', name: 'Third', value: 3 },
      ];

      for (const record of records) {
        await put(db, STORE_NAME, record);
      }

      const all = await getAll<TestRecord>(db, STORE_NAME);

      expect(all).toHaveLength(3);
      expect(all.map((r) => r.id).sort()).toEqual(['1', '2', '3']);
    });

    it('should return empty array for empty store', async () => {
      const all = await getAll<TestRecord>(db, STORE_NAME);

      expect(all).toEqual([]);
    });
  });

  describe('getAllWithCursor', () => {
    beforeEach(async () => {
      const records: TestRecord[] = [
        { id: '1', name: 'First', value: 10, timestamp: 100 },
        { id: '2', name: 'Second', value: 20, timestamp: 200 },
        { id: '3', name: 'Third', value: 30, timestamp: 300 },
        { id: '4', name: 'Fourth', value: 40, timestamp: 400 },
        { id: '5', name: 'Fifth', value: 50, timestamp: 500 },
      ];

      for (const record of records) {
        await put(db, STORE_NAME, record);
      }
    });

    it('should retrieve all records with cursor', async () => {
      const all = await getAllWithCursor<TestRecord>(db, STORE_NAME);

      expect(all).toHaveLength(5);
    });

    it('should limit results', async () => {
      const limited = await getAllWithCursor<TestRecord>(db, STORE_NAME, {
        limit: 3,
      });

      expect(limited).toHaveLength(3);
    });

    it('should skip with offset', async () => {
      const skipped = await getAllWithCursor<TestRecord>(db, STORE_NAME, {
        offset: 2,
      });

      expect(skipped).toHaveLength(3);
    });

    it('should combine limit and offset', async () => {
      const paged = await getAllWithCursor<TestRecord>(db, STORE_NAME, {
        offset: 1,
        limit: 2,
      });

      expect(paged).toHaveLength(2);
    });

    it('should filter records', async () => {
      const filtered = await getAllWithCursor<TestRecord>(db, STORE_NAME, {
        filter: (r) => r.value > 25,
      });

      expect(filtered).toHaveLength(3);
      expect(filtered.every((r) => r.value > 25)).toBe(true);
    });

    it('should use index for sorting', async () => {
      const sorted = await getAllWithCursor<TestRecord>(db, STORE_NAME, {
        indexName: 'timestamp',
        direction: 'prev', // Descending
        limit: 3,
      });

      expect(sorted).toHaveLength(3);
      expect(sorted[0].timestamp).toBe(500);
      expect(sorted[1].timestamp).toBe(400);
      expect(sorted[2].timestamp).toBe(300);
    });
  });

  describe('putMany', () => {
    it('should insert multiple records', async () => {
      const records: TestRecord[] = [
        { id: '1', name: 'First', value: 1 },
        { id: '2', name: 'Second', value: 2 },
        { id: '3', name: 'Third', value: 3 },
      ];

      await putMany(db, STORE_NAME, records);

      const all = await getAll<TestRecord>(db, STORE_NAME);
      expect(all).toHaveLength(3);
    });

    it('should handle empty array', async () => {
      await putMany(db, STORE_NAME, []);

      const all = await getAll<TestRecord>(db, STORE_NAME);
      expect(all).toHaveLength(0);
    });
  });

  describe('deleteById', () => {
    it('should delete a record', async () => {
      await put(db, STORE_NAME, { id: 'to-delete', name: 'Delete Me', value: 0 });

      await deleteById(db, STORE_NAME, 'to-delete');

      const result = await getById<TestRecord>(db, STORE_NAME, 'to-delete');
      expect(result).toBeNull();
    });

    it('should not throw for non-existent record', async () => {
      await expect(deleteById(db, STORE_NAME, 'non-existent')).resolves.not.toThrow();
    });
  });

  describe('deleteMany', () => {
    beforeEach(async () => {
      const records: TestRecord[] = [
        { id: '1', name: 'First', value: 1 },
        { id: '2', name: 'Second', value: 2 },
        { id: '3', name: 'Third', value: 3 },
      ];

      for (const record of records) {
        await put(db, STORE_NAME, record);
      }
    });

    it('should delete multiple records', async () => {
      const count = await deleteMany(db, STORE_NAME, ['1', '2']);

      expect(count).toBe(2);

      const remaining = await getAll<TestRecord>(db, STORE_NAME);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('3');
    });

    it('should handle empty array', async () => {
      const count = await deleteMany(db, STORE_NAME, []);

      expect(count).toBe(0);
    });
  });

  describe('clearStore', () => {
    it('should remove all records', async () => {
      const records: TestRecord[] = [
        { id: '1', name: 'First', value: 1 },
        { id: '2', name: 'Second', value: 2 },
      ];

      for (const record of records) {
        await put(db, STORE_NAME, record);
      }

      await clearStore(db, STORE_NAME);

      const all = await getAll<TestRecord>(db, STORE_NAME);
      expect(all).toHaveLength(0);
    });

    it('should work on empty store', async () => {
      await expect(clearStore(db, STORE_NAME)).resolves.not.toThrow();
    });
  });

  describe('countRecords', () => {
    it('should count records', async () => {
      const records: TestRecord[] = [
        { id: '1', name: 'First', value: 1 },
        { id: '2', name: 'Second', value: 2 },
        { id: '3', name: 'Third', value: 3 },
      ];

      for (const record of records) {
        await put(db, STORE_NAME, record);
      }

      const count = await countRecords(db, STORE_NAME);

      expect(count).toBe(3);
    });

    it('should return 0 for empty store', async () => {
      const count = await countRecords(db, STORE_NAME);

      expect(count).toBe(0);
    });
  });

  describe('hasStore', () => {
    it('should return true for existing store', () => {
      expect(hasStore(db, STORE_NAME)).toBe(true);
    });

    it('should return false for non-existent store', () => {
      expect(hasStore(db, 'non-existent-store')).toBe(false);
    });
  });
});
