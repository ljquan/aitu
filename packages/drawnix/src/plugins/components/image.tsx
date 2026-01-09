import type { ImageProps } from '@plait/common';
import classNames from 'classnames';
import { Video } from './video';
import { useCallback } from 'react';
import { handleVirtualUrlImageError } from '../../utils/asset-cleanup';

// 检查是否为视频元素（通过URL标识、扩展名或元数据）
const isVideoElement = (imageItem: any): boolean => {
  // 检查是否有视频标识属性
  if (imageItem.isVideo === true || imageItem.videoType) {
    return true;
  }

  const url = imageItem.url || '';

  // 检查 URL hash 标识符（用于 ObjectURL 的视频识别）
  // 格式：blob:http://...#video 或 blob:http://...#merged-video-{timestamp}
  if (url.includes('#video') || url.includes('#merged-video-')) {
    return true;
  }

  // 检查URL扩展名（用于普通 URL 的视频识别）
  const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
};

export const Image: React.FC<ImageProps> = (props: ImageProps) => {
  // 处理图片加载失败
  const handleImageError = useCallback(() => {
    handleVirtualUrlImageError(props.board, props.element, props.imageItem.url);
  }, [props.board, props.element, props.imageItem.url]);

  // 如果是视频元素，使用视频组件渲染
  if (isVideoElement(props.imageItem)) {
    return (
      <Video
        videoItem={{
          url: props.imageItem.url,
          width: props.imageItem.width,
          height: props.imageItem.height,
          videoType: (props.imageItem as any).videoType,
          poster: (props.imageItem as any).poster,
        }}
        isFocus={props.isFocus}
        isSelected={(props as any).isSelected}
        readonly={(props as any).readonly}
      />
    );
  }

  // 否则使用原来的图片渲染
  const imgProps = {
    src: props.imageItem.url,
    draggable: false,
    width: '100%',
  };
  return (
    <div>
      <img
        {...imgProps}
        className={classNames('image-origin', {
          'image-origin--focus': props.isFocus,
        })}
        onError={handleImageError}
      />
    </div>
  );
};
