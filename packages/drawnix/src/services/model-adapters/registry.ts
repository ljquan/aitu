import type { ModelAdapter, ModelKind } from './types';

const adapterRegistry = new Map<string, ModelAdapter>();

export function registerModelAdapter(adapter: ModelAdapter): void {
  adapterRegistry.set(adapter.id, adapter);
}

export function getModelAdapter(adapterId: string): ModelAdapter | undefined {
  return adapterRegistry.get(adapterId);
}

export function hasModelAdapter(adapterId: string): boolean {
  return adapterRegistry.has(adapterId);
}

export function listModelAdapters(kind?: ModelKind): ModelAdapter[] {
  const adapters = Array.from(adapterRegistry.values());
  return kind ? adapters.filter((adapter) => adapter.kind === kind) : adapters;
}

export function resolveAdapterForModel(
  modelId: string,
  kind: ModelKind
): ModelAdapter | undefined {
  const adapters = listModelAdapters(kind);
  return adapters.find((adapter) => {
    if (adapter.id === modelId) {
      return true;
    }
    if (!adapter.supportedModels || adapter.supportedModels.length === 0) {
      return false;
    }
    return adapter.supportedModels.includes(modelId);
  });
}
