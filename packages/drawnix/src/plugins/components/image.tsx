import type { ImageProps } from '@plait/common';
import { RectangleClient } from '@plait/core';
import { Loading, MessagePlugin } from 'tdesign-react';
import classNames from 'classnames';
import { useCallback } from 'react';
import { Video } from './video';
import { generateImage } from '../../mcp/tools/image-generation';
import { getImageRegion } from '../../services/ppt';
import {
  insertMediaIntoFrame,
  removePPTImagePlaceholder,
  setFramePPTImageStatus,
  setPPTImagePlaceholderStatus,
} from '../../utils/frame-insertion-utils';
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

  const elementData = props.element as any;
  const pptStatus = elementData?.pptImageStatus as
    | 'placeholder'
    | 'loading'
    | 'generated'
    | undefined;
  const pptPrompt = elementData?.pptImagePrompt as string | undefined;
  const pptFrameId = elementData?.frameId as string | undefined;

  const handlePPTImageGenerate = useCallback(async () => {
    if (!props.board || !pptFrameId || !pptPrompt || pptStatus === 'loading') return;

    setPPTImagePlaceholderStatus(props.board, pptFrameId, 'loading');
    setFramePPTImageStatus(props.board, pptFrameId, 'loading');

    try {
      const result = await generateImage({
        prompt: pptPrompt,
        size: '16x9',
      });

      if (result.success && result.data?.url) {
        removePPTImagePlaceholder(props.board, pptFrameId);

        const frame = props.board.children.find((el: any) => el.id === pptFrameId);
        if (frame) {
          const frameRect = RectangleClient.getRectangleByPoints(frame.points);
          const imgRegion = getImageRegion({
            x: frameRect.x,
            y: frameRect.y,
            width: frameRect.width,
            height: frameRect.height,
          });
          await insertMediaIntoFrame(
            props.board,
            result.data.url,
            'image',
            pptFrameId,
            { width: frameRect.width, height: frameRect.height },
            { width: 800, height: 450 },
            imgRegion
          );
        }
        setFramePPTImageStatus(props.board, pptFrameId, 'generated');
      } else {
        setPPTImagePlaceholderStatus(props.board, pptFrameId, 'placeholder');
        setFramePPTImageStatus(props.board, pptFrameId, 'placeholder');
        MessagePlugin.error(result.error || '图片生成失败');
      }
    } catch (error: any) {
      setPPTImagePlaceholderStatus(props.board, pptFrameId, 'placeholder');
      setFramePPTImageStatus(props.board, pptFrameId, 'placeholder');
      MessagePlugin.error(error?.message || '图片生成失败');
    }
  }, [props.board, pptFrameId, pptPrompt, pptStatus]);

  if (elementData?.pptImagePlaceholder) {
    const isLoading = pptStatus === 'loading';

    return (
      <div
        className="ppt-image-placeholder"
        onClick={isLoading ? undefined : handlePPTImageGenerate}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '8px',
          borderRadius: '8px',
          border: '1px dashed #d9d9d9',
          backgroundColor: 'rgba(245,245,245,0.85)',
          color: '#999',
          fontSize: '13px',
          cursor: isLoading ? 'default' : 'pointer',
          userSelect: 'none',
        }}
      >
        {isLoading ? <Loading size="small" /> : null}
        <span>{isLoading ? '生成配图中…' : '点击生成配图'}</span>
      </div>
    );
  }

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
