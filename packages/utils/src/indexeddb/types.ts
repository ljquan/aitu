/**
 * IndexedDB 工具类型定义
 */

/**
 * 打开数据库的选项
 */
export interface OpenDBOptions {
  /** 数据库版本，默认不指定 */
  version?: number;
  /** 日志前缀 */
  logPrefix?: string;
  /** 升级回调 */
  onUpgradeNeeded?: (db: IDBDatabase, event: IDBVersionChangeEvent) => void;
}

/**
 * Store 配置（用于创建 store）
 */
export interface StoreConfig {
  name: string;
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: IndexConfig[];
}

/**
 * 索引配置
 */
export interface IndexConfig {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
  multiEntry?: boolean;
}

/**
 * 游标遍历选项
 */
export interface CursorOptions<T = unknown> {
  /** 索引名称，不指定则使用 store 主键 */
  indexName?: string;
  /** 游标方向 */
  direction?: IDBCursorDirection;
  /** 过滤函数 */
  filter?: (value: T) => boolean;
  /** 限制返回数量 */
  limit?: number;
  /** 跳过前 N 条记录 */
  offset?: number;
}

/**
 * 事务模式
 */
export type TransactionMode = 'readonly' | 'readwrite';
