import { lazy } from 'react';

/**
 * 内部工具组件映射
 * 
 * 将工具定义中的 component 标识映射到实际的 React 组件
 */
export const InternalToolComponents: Record<string, React.ComponentType<any>> = {
  'batch-image': lazy(() => import('../ttd-dialog/batch-image-generation')),
};
