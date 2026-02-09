/**
 * 自定义图片/视频渲染插件
 * 解析 title 中的尺寸和对齐信息，应用到图片样式
 * 支持 inline 标记实现一行多图展示
 * 支持 alt="video" 时渲染为视频播放器
 * 
 * 图片 title 格式: "width=300 height=200 align=center inline"
 * 视频格式: ![video](视频URL "poster=封面图URL")
 */

import { $view } from '@milkdown/kit/utils';
import { imageSchema } from '@milkdown/kit/preset/commonmark';

/**
 * 检测 URL 是否是视频文件
 */
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
  const lowerUrl = url.toLowerCase().split('?')[0]; // 移除查询参数
  return videoExtensions.some(ext => lowerUrl.endsWith(ext)) || 
         lowerUrl.includes('/video/') ||
         lowerUrl.includes('vd.bdstatic.com') ||
         lowerUrl.includes('.mp4');
}

/**
 * 解析 title 中的样式信息
 * @param title 图片的 title 属性，格式如 "width=300 height=200 align=center inline"
 */
function parseImageStyle(title: string | null): {
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
  inline?: boolean;
  poster?: string;
} {
  if (!title) return {};
  
  const result: {
    width?: number;
    height?: number;
    align?: 'left' | 'center' | 'right';
    inline?: boolean;
    poster?: string;
  } = {};
  
  // 解析 width=xxx
  const widthMatch = title.match(/width=(\d+)/);
  if (widthMatch) {
    result.width = parseInt(widthMatch[1], 10);
  }
  
  // 解析 height=xxx
  const heightMatch = title.match(/height=(\d+)/);
  if (heightMatch) {
    result.height = parseInt(heightMatch[1], 10);
  }
  
  // 解析 align=xxx
  const alignMatch = title.match(/align=(left|center|right)/);
  if (alignMatch) {
    result.align = alignMatch[1] as 'left' | 'center' | 'right';
  }
  
  // 解析 inline 标记
  if (/\binline\b/.test(title)) {
    result.inline = true;
  }
  
  // 解析 poster=xxx（视频封面图）
  const posterMatch = title.match(/poster=([^\s"]+)/);
  if (posterMatch) {
    result.poster = posterMatch[1];
  }
  
  return result;
}

/**
 * 应用样式到图片容器
 */
function applyImageStyle(
  container: HTMLElement,
  img: HTMLImageElement,
  style: ReturnType<typeof parseImageStyle>
) {
  // 重置样式
  container.style.cssText = '';
  img.style.cssText = '';
  
  // 根据是否为 inline 图片设置不同的布局
  if (style.inline) {
    // inline 图片使用 inline-block 布局
    container.style.display = 'inline-block';
    container.style.verticalAlign = 'middle';
    container.style.margin = '4px';
    container.classList.add('milkdown-image-inline');
  } else {
    // 普通图片使用 block 布局（margin 由 CSS 规则控制）
    container.style.display = 'block';
    container.style.margin = '0';
    container.classList.remove('milkdown-image-inline');
  }
  
  // 应用宽度
  if (style.width) {
    img.style.width = `${style.width}px`;
    img.style.maxWidth = '100%';
  } else {
    img.style.maxWidth = style.inline ? 'calc(50% - 16px)' : '100%';
  }
  
  // 应用高度（使用 max-height 而非固定 height，允许图片自适应缩小）
  if (style.height) {
    img.style.maxHeight = `${style.height}px`;
    img.style.height = 'auto';
  } else {
    img.style.height = 'auto';
  }
  
  // 应用对齐（仅对非 inline 图片生效）
  if (!style.inline) {
    if (style.align) {
      // 有对齐设置时，使用 inline-block 以便 text-align 生效
      switch (style.align) {
        case 'center':
          container.style.textAlign = 'center';
          img.style.display = 'inline-block';
          break;
        case 'right':
          container.style.textAlign = 'right';
          img.style.display = 'inline-block';
          break;
        case 'left':
          container.style.textAlign = 'left';
          img.style.display = 'inline-block';
          break;
      }
    } else {
      // 没有对齐设置时，使用 block 避免 inline 空白问题
      img.style.display = 'block';
    }
  } else {
    // inline 图片使用 inline-block
    img.style.display = 'inline-block';
  }
  
  // 通用图片样式
  img.style.borderRadius = '6px';
  img.style.objectFit = 'contain';
}

/**
 * 创建视频播放器元素
 */
function createVideoElement(src: string, poster: string): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'milkdown-video-container';
  
  const video = document.createElement('video');
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;
  video.src = src;
  if (poster) {
    video.poster = poster;
  }
  container.appendChild(video);
  
  // 添加加载错误处理
  video.onerror = () => {
    container.classList.add('milkdown-video-error');
    if (poster) {
      const fallbackImg = document.createElement('img');
      fallbackImg.src = poster;
      fallbackImg.alt = '视频封面';
      fallbackImg.className = 'milkdown-video-fallback';
      container.innerHTML = '';
      container.appendChild(fallbackImg);
      
      const playOverlay = document.createElement('div');
      playOverlay.className = 'milkdown-video-play-overlay';
      playOverlay.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      playOverlay.onclick = () => {
        window.open(src, '_blank');
      };
      container.appendChild(playOverlay);
    }
  };
  
  return container;
}

/**
 * 创建自定义图片/视频 NodeView
 */
function createImageView(node: { type: { name: string }; attrs: { src?: string; alt?: string; title?: string } }) {
  const { src, alt, title } = node.attrs;
  const style = parseImageStyle(title || null);
  
  // 检测是否应该渲染为视频
  const isVideo = alt === 'video' || (src && isVideoUrl(src));
  
  if (isVideo && src) {
    // 渲染为视频播放器
    const container = createVideoElement(src, style.poster || '');
    
    return {
      dom: container,
      contentDOM: null,
      update: (updatedNode: { type: { name: string }; attrs: { src?: string; alt?: string; title?: string } }) => {
        if (updatedNode.type.name !== 'image') {
          return false;
        }
        
        const { src: newSrc, title: newTitle } = updatedNode.attrs;
        const newStyle = parseImageStyle(newTitle || null);
        
        const videoEl = container.querySelector('video');
        if (videoEl && newSrc) {
          videoEl.src = newSrc;
          if (newStyle.poster) {
            videoEl.poster = newStyle.poster;
          }
        }
        
        return true;
      },
      destroy: () => {
        const videoEl = container.querySelector('video');
        if (videoEl) {
          videoEl.pause();
          videoEl.src = '';
        }
      },
    };
  }
  
  // 渲染为普通图片
  const container = document.createElement('div');
  container.className = 'milkdown-image-container';
  
  const img = document.createElement('img');
  container.appendChild(img);
  
  img.src = src || '';
  img.alt = alt || '';
  
  applyImageStyle(container, img, style);
  
  if (title && !title.match(/width=|height=|align=|inline|poster=/)) {
    img.title = title;
  }
  
  return {
    dom: container,
    contentDOM: null,
    update: (updatedNode: { type: { name: string }; attrs: { src?: string; alt?: string; title?: string } }) => {
      if (updatedNode.type.name !== 'image') {
        return false;
      }
      
      const { src, alt, title } = updatedNode.attrs;
      
      img.src = src || '';
      img.alt = alt || '';
      
      const newStyle = parseImageStyle(title || null);
      applyImageStyle(container, img, newStyle);
      
      if (title && !title.match(/width=|height=|align=|inline|poster=/)) {
        img.title = title;
      }
      
      return true;
    },
    destroy: () => {
      // 清理
    },
  };
}

/**
 * 自定义图片/视频视图插件
 * 使用方式: Editor.make().use(commonmark).use(imageViewPlugin)
 */
export const imageViewPlugin = $view(imageSchema.node, () => createImageView);

export default imageViewPlugin;
