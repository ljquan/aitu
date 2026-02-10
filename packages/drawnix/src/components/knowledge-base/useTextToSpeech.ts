/**
 * useTextToSpeech - 语音朗读 Hook
 *
 * 使用 Web Speech API 将 Markdown 文本转为语音朗读
 * 支持播放、暂停、停止控制
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface TextToSpeechState {
  /** 是否正在朗读 */
  isSpeaking: boolean;
  /** 是否已暂停 */
  isPaused: boolean;
  /** 是否支持语音合成 */
  isSupported: boolean;
}

/**
 * 将 Markdown 文本转换为纯文本（去除语法标记）
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    // 移除代码块
    .replace(/```[\s\S]*?```/g, '')
    // 移除行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 移除图片
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 移除链接，保留文本
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 移除标题标记
    .replace(/^#{1,6}\s+/gm, '')
    // 移除粗体/斜体
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // 移除删除线
    .replace(/~~(.+?)~~/g, '$1')
    // 移除无序列表标记
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // 移除有序列表标记
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // 移除引用标记
    .replace(/^>\s+/gm, '')
    // 移除分隔线
    .replace(/^[-*_]{3,}$/gm, '')
    // 移除 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 压缩多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function useTextToSpeech() {
  const [state, setState] = useState<TextToSpeechState>({
    isSpeaking: false,
    isPaused: false,
    isSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  });

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 清理语音合成
  useEffect(() => {
    return () => {
      if (state.isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [state.isSupported]);

  /** 开始朗读 */
  const speak = useCallback(
    (markdown: string) => {
      if (!state.isSupported) return;

      // 停止当前朗读
      window.speechSynthesis.cancel();

      const plainText = markdownToPlainText(markdown);
      if (!plainText) return;

      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // 尝试选择中文语音
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(
        (v) => v.lang.startsWith('zh') && v.localService
      ) || voices.find((v) => v.lang.startsWith('zh'));
      if (zhVoice) {
        utterance.voice = zhVoice;
      }

      utterance.onend = () => {
        setState((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
        utteranceRef.current = null;
      };

      utterance.onerror = () => {
        setState((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setState((prev) => ({ ...prev, isSpeaking: true, isPaused: false }));
    },
    [state.isSupported]
  );

  /** 暂停朗读 */
  const pause = useCallback(() => {
    if (!state.isSupported) return;
    window.speechSynthesis.pause();
    setState((prev) => ({ ...prev, isPaused: true }));
  }, [state.isSupported]);

  /** 恢复朗读 */
  const resume = useCallback(() => {
    if (!state.isSupported) return;
    window.speechSynthesis.resume();
    setState((prev) => ({ ...prev, isPaused: false }));
  }, [state.isSupported]);

  /** 停止朗读 */
  const stop = useCallback(() => {
    if (!state.isSupported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
  }, [state.isSupported]);

  return {
    ...state,
    speak,
    pause,
    resume,
    stop,
  };
}
