import type { ImageProps } from '@plait/common';
import classNames from 'classnames';
import { Video } from './video';

// 检查是否为视频元素（通过URL扩展名或者元数据）
const isVideoElement = (imageItem: any): boolean => {
  // 检查是否有视频标识
  if (imageItem.isVideo === true || imageItem.videoType) {
    return true;
  }
  
  // 检查URL扩展名
  const url = imageItem.url || '';
  const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
};

export const Image: React.FC<ImageProps> = (props: ImageProps) => {
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
      />
    </div>
  );
};
