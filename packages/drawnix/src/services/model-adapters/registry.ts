import type { ModelAdapter, ModelKind } from './types';
import { getModelConfig } from '../../constants/model-config';

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
  const modelConfig = getModelConfig(modelId);

  return adapters.find((adapter) => {
    // 1) 适配器 ID 与模型 ID 完全一致
    if (adapter.id === modelId) return true;

    if (!modelConfig) {
      // 没有模型配置时，仅允许 supportedModels 精确匹配
      return adapter.supportedModels?.includes(modelId) ?? false;
    }

    const tags = (modelConfig.tags || []).map((t) => t.toLowerCase());
    const vendor = modelConfig.vendor;

    // 2) 精确匹配列表
    if (adapter.matchModels?.includes(modelId)) return true;

    // 3) 自定义匹配函数
    if (adapter.matchPredicate && adapter.matchPredicate(modelConfig)) return true;

    // 4) 标签匹配
    if (
      adapter.matchTags &&
      adapter.matchTags.some((tag) => tags.includes(tag.toLowerCase()))
    ) {
      return true;
    }

    // 5) 厂商匹配
    if (adapter.matchVendors?.includes(vendor)) return true;

    // 6) 兼容旧逻辑：supportedModels 列表
    if (adapter.supportedModels?.includes(modelId)) return true;

    return false;
  });
}
