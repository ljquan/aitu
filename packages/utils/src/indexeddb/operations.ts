/**
 * IndexedDB 操作工具函数
 *
 * 提供通用的 IndexedDB CRUD 操作，减少重复代码
 */

import type { OpenDBOptions, CursorOptions } from './types';

/**
 * 打开 IndexedDB 数据库
 *
 * @param dbName 数据库名称
 * @param options 打开选项
 * @returns Promise<IDBDatabase>
 *
 * @example
 * ```typescript
 * const db = await openIndexedDB('my-database');
 * const db = await openIndexedDB('my-database', { version: 2, logPrefix: 'MyService' });
 * ```
 */
export function openIndexedDB(
  dbName: string,
  options: OpenDBOptions = {}
): Promise<IDBDatabase> {
  const { version, logPrefix = 'IndexedDB', onUpgradeNeeded } = options;

  return new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(dbName, version) : indexedDB.open(dbName);

    request.onerror = () => {
      reject(new Error(`[${logPrefix}] Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      if (onUpgradeNeeded) {
        onUpgradeNeeded(request.result, event);
      }
    };
  });
}

/**
 * 通过 ID 获取单条记录
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @param id 记录 ID
 * @returns Promise<T | null>
 *
 * @example
 * ```typescript
 * const task = await getById<Task>(db, 'tasks', 'task-123');
 * ```
 */
export function getById<T>(
  db: IDBDatabase,
  storeName: string,
  id: string | number
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve((request.result as T) || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取 store 中的所有记录
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @returns Promise<T[]>
 *
 * @example
 * ```typescript
 * const tasks = await getAll<Task>(db, 'tasks');
 * ```
 */
export function getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve((request.result as T[]) || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 使用游标遍历记录（支持索引、方向、过滤和分页）
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @param options 游标选项
 * @returns Promise<T[]>
 *
 * @example
 * ```typescript
 * // 按时间倒序获取最近 10 条记录
 * const logs = await getAllWithCursor<Log>(db, 'logs', {
 *   indexName: 'timestamp',
 *   direction: 'prev',
 *   limit: 10,
 * });
 *
 * // 过滤特定状态的记录
 * const pendingTasks = await getAllWithCursor<Task>(db, 'tasks', {
 *   filter: (task) => task.status === 'pending',
 * });
 * ```
 */
export function getAllWithCursor<T>(
  db: IDBDatabase,
  storeName: string,
  options: CursorOptions<T> = {}
): Promise<T[]> {
  const { indexName, direction = 'next', filter, limit, offset = 0 } = options;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const source = indexName ? store.index(indexName) : store;
    const request = source.openCursor(null, direction);

    const results: T[] = [];
    let skipped = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const value = cursor.value as T;

        // 应用过滤器
        const shouldInclude = !filter || filter(value);

        if (shouldInclude) {
          // 处理 offset
          if (skipped < offset) {
            skipped++;
          } else {
            results.push(value);
          }
        }

        // 检查是否达到 limit
        if (limit && results.length >= limit) {
          resolve(results);
          return;
        }

        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 插入或更新记录
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @param value 要保存的值
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await put(db, 'tasks', { id: 'task-123', name: 'My Task' });
 * ```
 */
export function put<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 批量插入或更新记录
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @param values 要保存的值数组
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await putMany(db, 'tasks', [task1, task2, task3]);
 * ```
 */
export function putMany<T>(db: IDBDatabase, storeName: string, values: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };

    for (const value of values) {
      store.put(value);
    }
  });
}

/**
 * 删除单条记录
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @param id 记录 ID
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await deleteById(db, 'tasks', 'task-123');
 * ```
 */
export function deleteById(
  db: IDBDatabase,
  storeName: string,
  id: string | number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 批量删除记录
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @param ids 记录 ID 数组
 * @returns Promise<number> 删除的记录数
 *
 * @example
 * ```typescript
 * const deletedCount = await deleteMany(db, 'tasks', ['task-1', 'task-2']);
 * ```
 */
export function deleteMany(
  db: IDBDatabase,
  storeName: string,
  ids: (string | number)[]
): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    let deletedCount = 0;

    transaction.oncomplete = () => {
      resolve(deletedCount);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };

    for (const id of ids) {
      const request = store.delete(id);
      request.onsuccess = () => {
        deletedCount++;
      };
    }
  });
}

/**
 * 清空整个 store
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await clearStore(db, 'tasks');
 * ```
 */
export function clearStore(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取记录数量
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @returns Promise<number>
 *
 * @example
 * ```typescript
 * const count = await count(db, 'tasks');
 * ```
 */
export function countRecords(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 检查 store 是否存在
 *
 * @param db 数据库连接
 * @param storeName store 名称
 * @returns boolean
 *
 * @example
 * ```typescript
 * if (hasStore(db, 'tasks')) {
 *   // store exists
 * }
 * ```
 */
export function hasStore(db: IDBDatabase, storeName: string): boolean {
  return db.objectStoreNames.contains(storeName);
}
