const TUZI_PROVIDER_SELECTION_KEY = 'opentu.tuzi.provider-groups.v1';

type SelectionStore = Record<string, string[]>;

function normalizeGroup(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStore(): SelectionStore {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(
      window.localStorage.getItem(TUZI_PROVIDER_SELECTION_KEY) || '{}'
    );
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as SelectionStore)
      : {};
  } catch {
    return {};
  }
}

export function getTuziProviderGroupSelection(
  userId: number | string
): string[] | null {
  const value = readStore()[String(userId)];
  return Array.isArray(value)
    ? [...new Set(value.map(normalizeGroup).filter(Boolean))]
    : null;
}

export function saveTuziProviderGroupSelection(
  userId: number | string,
  groups: readonly string[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    store[String(userId)] = [...new Set(groups.map(normalizeGroup))].filter(
      Boolean
    );
    window.localStorage.setItem(
      TUZI_PROVIDER_SELECTION_KEY,
      JSON.stringify(store)
    );
  } catch {
    // localStorage is optional in embedded environments.
  }
}

export function clearTuziProviderGroupSelection(userId: number | string): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    delete store[String(userId)];
    window.localStorage.setItem(
      TUZI_PROVIDER_SELECTION_KEY,
      JSON.stringify(store)
    );
  } catch {
    // localStorage is optional in embedded environments.
  }
}
