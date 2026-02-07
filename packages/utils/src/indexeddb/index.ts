/**
 * IndexedDB 工具模块
 *
 * 提供通用的 IndexedDB 操作工具函数，减少重复代码
 *
 * @example
 * ```typescript
 * import {
 *   openIndexedDB,
 *   getById,
 *   getAll,
 *   getAllWithCursor,
 *   put,
 *   deleteById,
 * } from '@aitu/utils/indexeddb';
 *
 * // 打开数据库
 * const db = await openIndexedDB('my-database', { logPrefix: 'MyService' });
 *
 * // CRUD 操作
 * const task = await getById<Task>(db, 'tasks', 'task-123');
 * const allTasks = await getAll<Task>(db, 'tasks');
 * await put(db, 'tasks', newTask);
 * await deleteById(db, 'tasks', 'task-123');
 *
 * // 高级查询
 * const recentLogs = await getAllWithCursor<Log>(db, 'logs', {
 *   indexName: 'timestamp',
 *   direction: 'prev',
 *   limit: 10,
 *   filter: (log) => log.level === 'error',
 * });
 * ```
 */

export * from './types';
export * from './operations';
