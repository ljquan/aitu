/**
 * Audio Player Component
 *
 * 自定义音频播放器组件
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { formatAudioTime } from '../../types/audio.types';
import './audio.scss';

interface AudioPlayerProps {
  /** 音频 URL */
  url: string;
  /** 音频标题 */
  title: string;
  /** 初始音量 */
  initialVolume?: number;
  /** 是否只读 */
  readonly?: boolean;
  /** 播放状态变化回调 */
  onPlayStateChange?: (isPlaying: boolean) => void;
  /** 时长获取回调 */
  onDurationChange?: (duration: number) => void;
}

/**
 * 音频播放器组件
 */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  url,
  title,
  initialVolume = 0.8,
  readonly = false,
  onPlayStateChange,
  onDurationChange,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载音频元数据
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      onDurationChange?.(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onPlayStateChange?.(false);
    };

    const handleError = () => {
      setError('无法加载音频');
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [onDurationChange, onPlayStateChange]);

  // 播放/暂停切换
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (readonly || error) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      onPlayStateChange?.(false);
    } else {
      audio.play().catch((err) => {
        console.error('Audio play failed:', err);
        setError('播放失败');
      });
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  }, [isPlaying, readonly, error, onPlayStateChange]);

  // 静音切换
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (readonly) return;

    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted, readonly]);

  // 进度条点击
  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (readonly || !progressRef.current || !duration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration, readonly]);

  // 计算进度百分比
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player-container">
      {/* 隐藏的 audio 元素 */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        volume={volume}
      />

      {/* 标题栏 */}
      <div className="audio-player-header">
        <div className="audio-player-icon">🎵</div>
        <div className="audio-player-title" title={title}>
          {title}
        </div>
      </div>

      {/* 控制栏 */}
      <div className="audio-player-controls">
        {/* 播放/暂停按钮 */}
        <button
          className="audio-player-btn audio-player-play-btn"
          onClick={togglePlay}
          disabled={isLoading || !!error}
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* 进度条 */}
        <div
          ref={progressRef}
          className="audio-player-progress"
          onClick={handleProgressClick}
        >
          <div
            className="audio-player-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="audio-player-progress-thumb"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* 时间显示 */}
        <div className="audio-player-time">
          {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
        </div>

        {/* 音量按钮 */}
        <button
          className="audio-player-btn audio-player-volume-btn"
          onClick={toggleMute}
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* 加载/错误状态 */}
      {isLoading && (
        <div className="audio-player-overlay">
          <span>加载中...</span>
        </div>
      )}
      {error && (
        <div className="audio-player-overlay audio-player-error">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default AudioPlayer;
