/**
 * Video Frame Extractor Utility
 *
 * Extracts frames from video URLs for use in long video generation.
 * Provides the ability to extract specific frames (first, last, or at timestamp).
 */

export interface ExtractedFrame {
  /** Data URL of the extracted frame (PNG format) */
  dataUrl: string;
  /** Timestamp in seconds where the frame was extracted */
  timestamp: number;
  /** Video width */
  width: number;
  /** Video height */
  height: number;
}

export interface ExtractFrameOptions {
  /** Target timestamp in seconds. If 'last', extracts the last frame. Default: 'last' */
  timestamp?: number | 'last' | 'first';
  /** Image format for output. Default: 'image/png' */
  format?: 'image/png' | 'image/jpeg';
  /** Quality for JPEG format (0-1). Default: 0.92 */
  quality?: number;
  /** Timeout in milliseconds. Default: 30000 */
  timeout?: number;
}

/**
 * Extract a frame from a video URL
 *
 * @param videoUrl - URL of the video (can be remote URL or blob URL)
 * @param options - Extraction options
 * @returns Promise resolving to the extracted frame data
 */
export async function extractVideoFrame(
  videoUrl: string,
  options: ExtractFrameOptions = {}
): Promise<ExtractedFrame> {
  const {
    timestamp = 'last',
    format = 'image/png',
    quality = 0.92,
    timeout = 30000,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    let timeoutId: number | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      video.removeEventListener('loadedmetadata', handleMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.load();
    };

    const resolveWithFrame = () => {
      if (isResolved) return;
      isResolved = true;

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL(format, quality);

        cleanup();
        resolve({
          dataUrl,
          timestamp: video.currentTime,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to extract frame: ${error}`));
      }
    };

    const handleMetadata = () => {
      const duration = video.duration;

      let targetTime: number;
      if (timestamp === 'last') {
        targetTime = Math.max(0, duration - 0.1);
      } else if (timestamp === 'first') {
        targetTime = 0.1;
      } else {
        targetTime = Math.min(Math.max(0, timestamp), duration);
      }

      video.currentTime = targetTime;
    };

    const handleSeeked = () => {
      resolveWithFrame();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${video.error?.message || 'Unknown error'}`));
    };

    timeoutId = window.setTimeout(() => {
      if (!isResolved) {
        cleanup();
        reject(new Error(`Video frame extraction timed out after ${timeout}ms`));
      }
    }, timeout);

    video.addEventListener('loadedmetadata', handleMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;
  });
}

/**
 * Extract the last frame from a video URL
 * Convenience wrapper for extractVideoFrame with timestamp='last'
 */
export async function extractLastFrame(videoUrl: string): Promise<ExtractedFrame> {
  return extractVideoFrame(videoUrl, { timestamp: 'last' });
}

/**
 * Extract the first frame from a video URL
 * Convenience wrapper for extractVideoFrame with timestamp='first'
 */
export async function extractFirstFrame(videoUrl: string): Promise<ExtractedFrame> {
  return extractVideoFrame(videoUrl, { timestamp: 'first' });
}
