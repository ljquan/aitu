import { 
  AIImageGenerationAdapter, 
  AIVideoGenerationAdapter,
  BatchImageGenerationAdapter,
  KnowledgeBaseAdapter,
} from './tool-adapters';

/**
 * 内部工具组件映射
 * 
 * 将工具定义中的 component 标识映射到实际的 React 组件
 * 
 * 注意：所有内部工具都使用适配器组件包装，
 * 以解决原始组件样式（height: 80vh）在 WinBox 和画布中的兼容性问题
 */
export const InternalToolComponents: Record<string, React.ComponentType<any>> = {
  'batch-image': BatchImageGenerationAdapter,
  'ai-image': AIImageGenerationAdapter,
  'ai-video': AIVideoGenerationAdapter,
  'knowledge-base': KnowledgeBaseAdapter,
};
