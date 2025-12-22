/**
 * CharacterTimeRangeSelector Component
 *
 * Video timeline-style time range selector for character extraction.
 * Supports smooth dragging edges to resize (1-3 seconds) and dragging center to move.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from 'tdesign-react';
import './character-time-selector.scss';

export interface CharacterTimeRangeSelectorProps {
  /** Video URL to preview */
  videoUrl: string;
  /** Video duration in seconds */
  videoDuration: number;
  /** Callback when time range is confirmed */
  onConfirm: (startTime: number, endTime: number) => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

const MIN_DURATION = 1; // Minimum 1 second
const MAX_DURATION = 3; // Maximum 3 seconds

/**
 * CharacterTimeRangeSelector - Video timeline style range selection
 */
export const CharacterTimeRangeSelector: React.FC<CharacterTimeRangeSelectorProps> = ({
  videoUrl,
  videoDuration,
  onConfirm,
  onCancel,
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const frameUpdateRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(videoDuration);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(MAX_DURATION, videoDuration));
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const [frameImage, setFrameImage] = useState<string>('');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [dragType, setDragType] = useState<'left' | 'right' | 'center' | null>(null);

  // Calculate range (use raw values for smooth animation)
  const rangeDuration = endTime - startTime;
  const rangeWidthPercent = duration > 0 ? (rangeDuration / duration) * 100 : 100;
  const rangeLeftPercent = duration > 0 ? (startTime / duration) * 100 : 0;

  // Initialize
  useEffect(() => {
    if (videoUrl) {
      setIsLoading(true);
      setFrameImage('');
      setIsVideoReady(false);
      setDragType(null);
    }

    return () => {
      if (frameUpdateRef.current !== null) {
        cancelAnimationFrame(frameUpdateRef.current);
      }
    };
  }, [videoUrl]);

  // Video metadata loaded
  const handleMetadataLoaded = () => {
    const video = videoRef.current;
    if (video) {
      const actualDuration = video.duration;
      setDuration(actualDuration);
      setIsVideoReady(true);
      setEndTime(Math.min(MAX_DURATION, actualDuration));
    }
  };

  // Generate frame image
  const generateFrameImage = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setFrameImage(imageDataUrl);
      setIsLoading(false);
    } catch (error) {
      console.warn('Failed to generate frame image:', error);
    }
  }, []);

  // Throttled seek - only seek if time changed significantly
  const seekToTime = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !isVideoReady) return;

    // Throttle seeks to prevent too many updates
    const timeDiff = Math.abs(time - lastSeekTimeRef.current);
    if (timeDiff < 0.1) return;

    lastSeekTimeRef.current = time;

    if (video.readyState >= 2) {
      video.currentTime = time;
    }
  }, [isVideoReady]);

  // Handle seeked event
  const handleSeeked = useCallback(() => {
    generateFrameImage();
  }, [generateFrameImage]);

  // Set to start frame when ready
  useEffect(() => {
    if (isVideoReady && duration > 0) {
      setCurrentPreviewTime(startTime);
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        video.currentTime = startTime;
      }
    }
  }, [isVideoReady, duration]);

  // Convert mouse position to time (smooth, no rounding during drag)
  const getTimeFromMouseEvent = useCallback((e: MouseEvent): number => {
    const track = trackRef.current;
    if (!track) return 0;

    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    return percent * duration;
  }, [duration]);

  // Handle left handle drag
  const handleLeftMouseDown = (e: React.MouseEvent) => {
    if (disabled || !isVideoReady) return;
    e.preventDefault();
    e.stopPropagation();
    setDragType('left');

    const currentEndTime = endTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newStart = getTimeFromMouseEvent(moveEvent);
      // Ensure minimum 1s and maximum 3s range
      const maxStart = currentEndTime - MIN_DURATION;
      const minStart = Math.max(0, currentEndTime - MAX_DURATION);
      const clampedStart = Math.max(minStart, Math.min(maxStart, newStart));

      setStartTime(clampedStart);
      setCurrentPreviewTime(clampedStart);
      seekToTime(clampedStart);
    };

    const handleMouseUp = () => {
      setDragType(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Final seek with exact time
      seekToTime(startTime);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle right handle drag
  const handleRightMouseDown = (e: React.MouseEvent) => {
    if (disabled || !isVideoReady) return;
    e.preventDefault();
    e.stopPropagation();
    setDragType('right');

    const currentStartTime = startTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newEnd = getTimeFromMouseEvent(moveEvent);
      // Ensure minimum 1s and maximum 3s range
      const minEnd = currentStartTime + MIN_DURATION;
      const maxEnd = Math.min(duration, currentStartTime + MAX_DURATION);
      const clampedEnd = Math.max(minEnd, Math.min(maxEnd, newEnd));

      setEndTime(clampedEnd);
      setCurrentPreviewTime(clampedEnd);
      seekToTime(clampedEnd);
    };

    const handleMouseUp = () => {
      setDragType(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      seekToTime(endTime);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle center drag (move entire range)
  const handleCenterMouseDown = (e: React.MouseEvent) => {
    if (disabled || !isVideoReady) return;
    e.preventDefault();
    setDragType('center');

    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const startX = e.clientX;
    const startStartTime = startTime;
    const currentDuration = endTime - startTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = (deltaX / rect.width) * duration;

      let newStart = startStartTime + deltaTime;
      // Keep range within bounds
      newStart = Math.max(0, Math.min(duration - currentDuration, newStart));

      setStartTime(newStart);
      setEndTime(newStart + currentDuration);
      setCurrentPreviewTime(newStart);
      seekToTime(newStart);
    };

    const handleMouseUp = () => {
      setDragType(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      seekToTime(startTime);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle track click (move range center to click position with animation)
  const handleTrackClick = (e: React.MouseEvent) => {
    if (disabled || !isVideoReady || dragType) return;

    // Ignore clicks on the range itself
    const target = e.target as HTMLElement;
    if (target.closest('.character-time-selector__range')) return;

    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * duration;

    const currentDuration = endTime - startTime;
    const halfDuration = currentDuration / 2;

    // Center the range at click position
    let newStart = clickTime - halfDuration;
    newStart = Math.max(0, Math.min(duration - currentDuration, newStart));

    setStartTime(newStart);
    setEndTime(newStart + currentDuration);
    setCurrentPreviewTime(newStart);
    seekToTime(newStart);
  };

  // Handle confirm - round to integers for API
  const handleConfirm = () => {
    onConfirm(Math.round(startTime), Math.round(endTime));
  };

  // Format time display
  const formatTime = (time: number): string => {
    return time.toFixed(1) + 's';
  };

  return (
    <div className={`character-time-selector ${dragType ? 'is-dragging' : ''}`}>
      {/* Hidden video element */}
      <video
        ref={videoRef}
        src={videoUrl}
        style={{ display: 'none' }}
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        onLoadedMetadata={handleMetadataLoaded}
        onSeeked={handleSeeked}
      />

      {/* Hidden canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Frame preview */}
      <div className="character-time-selector__preview">
        {isLoading ? (
          <div className="character-time-selector__loading">
            <div className="character-time-selector__spinner" />
            <span>加载中...</span>
          </div>
        ) : frameImage ? (
          <img
            src={frameImage}
            alt="Video frame"
            className="character-time-selector__frame"
          />
        ) : (
          <div className="character-time-selector__placeholder">
            视频帧加载失败
          </div>
        )}
        <div className="character-time-selector__time-badge">
          {formatTime(currentPreviewTime)}
        </div>
      </div>

      {/* Timeline track */}
      <div
        className="character-time-selector__timeline"
        ref={trackRef}
        onClick={handleTrackClick}
      >
        {/* Background track */}
        <div className="character-time-selector__timeline-bg" />

        {/* Time markers */}
        <div className="character-time-selector__markers">
          {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
            <div
              key={i}
              className="character-time-selector__marker"
              style={{ left: `${(i / duration) * 100}%` }}
            >
              <span>{i}s</span>
            </div>
          ))}
        </div>

        {/* Draggable range */}
        <div
          className={`character-time-selector__range ${dragType ? 'dragging' : ''}`}
          style={{
            left: `${rangeLeftPercent}%`,
            width: `${rangeWidthPercent}%`,
          }}
        >
          {/* Left handle - drag to resize */}
          <div
            className="character-time-selector__handle character-time-selector__handle--left"
            onMouseDown={handleLeftMouseDown}
          />
          {/* Center area - drag to move */}
          <div
            className="character-time-selector__range-content"
            onMouseDown={handleCenterMouseDown}
          >
            <span className="character-time-selector__range-label">
              {formatTime(startTime)} - {formatTime(endTime)}
            </span>
          </div>
          {/* Right handle - drag to resize */}
          <div
            className="character-time-selector__handle character-time-selector__handle--right"
            onMouseDown={handleRightMouseDown}
          />
        </div>
      </div>

      {/* Info row */}
      <div className="character-time-selector__info">
        <span>API参数: {Math.round(startTime)}, {Math.round(endTime)}</span>
        <span>时长: {rangeDuration.toFixed(1)}s</span>
      </div>

      {/* Actions */}
      <div className="character-time-selector__actions">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={disabled}
        >
          取消
        </Button>
        <Button
          theme="primary"
          onClick={handleConfirm}
          disabled={disabled || !isVideoReady}
        >
          创建角色
        </Button>
      </div>
    </div>
  );
};

export default CharacterTimeRangeSelector;
