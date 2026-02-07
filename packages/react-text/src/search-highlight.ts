import { useSyncExternalStore } from 'react';

let searchQuery = '';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return searchQuery;
}

/** 设置搜索高亮关键词（供搜索组件调用） */
export function setSearchHighlightQuery(query: string) {
  if (searchQuery === query) return;
  searchQuery = query;
  listeners.forEach((listener) => listener());
}

/** 订阅搜索高亮关键词（供 Text 组件内部使用） */
export function useSearchHighlightQuery(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
