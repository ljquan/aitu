/**
 * 预加载图片并优化缓存
 */
export const preloadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // 添加缓存策略
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    
    img.onload = () => {
      resolve(img);
    };
    
    img.onerror = (error) => {
      console.warn('Image preload failed:', url, error);
      reject(error);
    };
    
    // 设置src触发加载
    img.src = url;
  });
};

/**
 * 从视频生成缩略图（第一帧）
 */
export const generateVideoThumbnail = async (videoUrl: string): Promise<string | undefined> => {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      
      video.onloadeddata = () => {
        try {
          // 设置为第一帧（0.1秒处，避免完全黑屏）
          video.currentTime = 0.1;
          
          video.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                resolve(undefined);
                return;
              }
              
              // 设置缩略图尺寸（保持比例）
              const maxWidth = 80;
              const maxHeight = 60;
              const aspectRatio = video.videoWidth / video.videoHeight;
              
              let width = maxWidth;
              let height = maxHeight;
              
              if (aspectRatio > maxWidth / maxHeight) {
                height = maxWidth / aspectRatio;
              } else {
                width = maxHeight * aspectRatio;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              // 绘制视频帧
              ctx.drawImage(video, 0, 0, width, height);
              
              // 转换为 base64
              const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
              resolve(thumbnail);
            } catch (error) {
              console.warn('Failed to generate thumbnail from frame:', error);
              resolve(undefined);
            }
          };
        } catch (error) {
          console.warn('Failed to seek video for thumbnail:', error);
          resolve(undefined);
        }
      };
      
      video.onerror = () => {
        console.warn('Failed to load video for thumbnail generation');
        resolve(undefined);
      };
      
      // 开始加载视频
      video.src = videoUrl;
    } catch (error) {
      console.warn('Failed to create video element for thumbnail:', error);
      resolve(undefined);
    }
  });
};