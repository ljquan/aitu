/**
 * Media Library Empty
 * 素材库空状态组件
 */

import { FolderOpen } from 'lucide-react';

export function MediaLibraryEmpty() {
  return (
    <div className="media-library-empty">
      <FolderOpen size={64} className="media-library-empty__icon" />
      <h3 className="media-library-empty__title">暂无素材</h3>
      <p className="media-library-empty__description">
        开始使用AI生成图片或视频，或者上传本地文件
      </p>
    </div>
  );
}
