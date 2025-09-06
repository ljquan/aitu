import React, { useState, useRef, useEffect } from 'react';
import { Dialog } from 'tdesign-react';
import { useI18n } from '../../i18n';
import './video-frame-selector.scss';

export interface VideoFrameSelectorProps {
  visible: boolean;
  videoUrl: string;
  onClose: () => void;
  onConfirm: (frameImageDataUrl: string, timestamp: number) => void;
}

export const VideoFrameSelector: React.FC<VideoFrameSelectorProps> = ({
  visible,
  videoUrl,
  onClose,
  onConfirm
}) => {
  const { language } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [frameImage, setFrameImage] = useState<string>('');
  
  // 初始化时设置为最后一帧
  useEffect(() => {
    if (visible && videoUrl) {
      setIsLoading(true);
      setFrameImage('');
    }
  }, [visible, videoUrl]);
  
  // 视频加载完成后设置到最后一帧
  const handleVideoLoaded = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      // 设置到最后一帧（稍微提前一点避免加载问题）
      const lastFrameTime = Math.max(0, video.duration - 0.1);
      setCurrentTime(lastFrameTime);
      video.currentTime = lastFrameTime;
    }
  };
  
  // 视频时间更新时生成帧图片
  const handleTimeUpdate = () => {
    generateFrameImage();
    setIsLoading(false);
  };
  
  // 生成当前帧的图片
  const generateFrameImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置画布尺寸匹配视频
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // 绘制当前帧
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 转换为 data URL
    const imageDataUrl = canvas.toDataURL('image/png');
    setFrameImage(imageDataUrl);
  };
  
  // 拖拽进度条
  const handleSliderChange = (value: number) => {
    const video = videoRef.current;
    if (video && duration > 0) {
      const newTime = (value / 100) * duration;
      setCurrentTime(newTime);
      video.currentTime = newTime;
    }
  };
  
  // 输入时间
  const handleTimeInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || duration === 0) return;
    
    const inputValue = parseFloat(event.target.value);
    if (isNaN(inputValue)) return;
    
    const newTime = Math.max(0, Math.min(duration, inputValue));
    setCurrentTime(newTime);
    video.currentTime = newTime;
  };
  
  // 确认选择
  const handleConfirm = () => {
    if (frameImage) {
      onConfirm(frameImage, currentTime);
      onClose();
    }
  };
  
  // 格式化时间显示
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(1);
    return `${minutes}:${seconds.padStart(4, '0')}`;
  };
  
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      header={language === 'zh' ? '选择视频帧' : 'Select Video Frame'}
      width={600}
      destroyOnClose
      style={{ 
        backgroundColor: '#ffffff',
        color: '#333333'
      } as React.CSSProperties}
    >
      <div className="video-frame-selector">
        {/* 隐藏的视频元素用于帧提取 */}
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ display: 'none' }}
          muted
          playsInline
          onLoadedData={handleVideoLoaded}
          onSeeked={handleTimeUpdate}
          onTimeUpdate={handleTimeUpdate}
        />
        
        {/* 隐藏的画布用于生成帧图片 */}
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
        
        {/* 帧预览区域 */}
        <div className="frame-preview">
          {isLoading ? (
            <div className="loading-placeholder">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {language === 'zh' ? '加载视频中...' : 'Loading video...'}
              </div>
            </div>
          ) : (
            <div className="frame-image-container">
              <img 
                src={frameImage} 
                alt="Video frame" 
                className="frame-image"
              />
            </div>
          )}
        </div>
        
        {/* 时间控制区域 */}
        <div className="time-controls">
          <div className="time-display">
            <span className="current-time">{formatTime(currentTime)}</span>
            <span className="separator">/</span>
            <span className="total-time">{formatTime(duration)}</span>
          </div>
          
          {/* 进度条 */}
          <div className="progress-container">
            <input
              type="range"
              min={0}
              max={100}
              value={duration > 0 ? (currentTime / duration) * 100 : 0}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="progress-slider"
              disabled={isLoading}
            />
          </div>
          
          {/* 精确时间输入 */}
          <div className="time-input-container">
            <label className="time-input-label">
              {language === 'zh' ? '精确时间 (秒):' : 'Precise time (seconds):'}
            </label>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime.toFixed(1)}
              onChange={handleTimeInputChange}
              className="time-input"
              disabled={isLoading}
            />
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="actions">
          <button
            className="action-button secondary"
            onClick={onClose}
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            className="action-button primary"
            onClick={handleConfirm}
            disabled={isLoading || !frameImage}
          >
            {language === 'zh' ? '确认插入' : 'Confirm Insert'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};