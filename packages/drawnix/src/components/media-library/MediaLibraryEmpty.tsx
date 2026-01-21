/**
 * Media Library Empty
 * 素材库空状态组件
 */

import { MediaLibraryIcon } from '../icons';

export function MediaLibraryEmpty() {
  return (
    <div className="media-library-empty">
      <div className="media-library-empty__icon-container">
        <MediaLibraryIcon size={48} className="media-library-empty__icon" />
      </div>
      <h3 className="media-library-empty__title">暂无素材</h3>
      <p className="media-library-empty__description">
        开始使用AI生成图片或视频，或者上传本地文件
      </p>
    </div>
  );
}
