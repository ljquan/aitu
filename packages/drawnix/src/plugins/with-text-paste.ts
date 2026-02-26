/**
 * With Text Paste Plugin
 *
 * 处理文本粘贴到画布：
 * - 包含 Markdown 特征的文本 → 解析为 Card 标签贴插入
 * - 普通文本 → 自动控制文本宽度避免过长
 */

import {
  ClipboardData,
  PlaitBoard,
  Point,
  WritableClipboardOperationType,
} from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { parseMarkdownToCards } from '../utils/markdown-to-cards';
import { insertCardsToCanvas } from '../utils/insert-cards';

/**
 * 文本宽度配置
 */
const TEXT_CONFIG = {
  /** 最大字符数（超过则换行） */
  MAX_CHARS_PER_LINE: 50,
  /** 默认文本框宽度（像素） */
  DEFAULT_WIDTH: 400,
  /** 最大文本框宽度（像素） */
  MAX_WIDTH: 600,
  /** 估算字符宽度（像素） */
  CHAR_WIDTH: 8,
};

/**
 * 处理长文本，自动换行
 */
function wrapLongText(text: string): string {
  const lines = text.split('\n');
  const wrappedLines: string[] = [];

  for (const line of lines) {
    if (line.length <= TEXT_CONFIG.MAX_CHARS_PER_LINE) {
      wrappedLines.push(line);
    } else {
      // 按最大字符数分割长行
      let remaining = line;
      while (remaining.length > 0) {
        // 尝试在空格处断行
        let breakPoint = TEXT_CONFIG.MAX_CHARS_PER_LINE;
        if (remaining.length > TEXT_CONFIG.MAX_CHARS_PER_LINE) {
          const lastSpace = remaining.lastIndexOf(' ', TEXT_CONFIG.MAX_CHARS_PER_LINE);
          if (lastSpace > TEXT_CONFIG.MAX_CHARS_PER_LINE * 0.7) {
            // 如果空格位置在合理范围内（70%以上），在空格处断行
            breakPoint = lastSpace;
          }
        }

        wrappedLines.push(remaining.substring(0, breakPoint).trim());
        remaining = remaining.substring(breakPoint).trim();
      }
    }
  }

  return wrappedLines.join('\n');
}

/**
 * 检查剪贴板数据是否包含纯文本
 */
function hasPlainText(clipboardData: ClipboardData | null): boolean {
  if (!clipboardData) {
    return false;
  }

  // 检查是否有文本数据
  // ClipboardData 可能包含 text 属性或 data 属性
  const hasText = !!(clipboardData as any).text || !!(clipboardData as any).data?.text;

  // 排除已经是 Plait 元素的情况（避免干扰正常的复制粘贴）
  const hasElements = !!(clipboardData as any).elements || !!(clipboardData as any).data?.elements;

  return hasText && !hasElements;
}

/**
 * 从剪贴板数据中提取文本
 */
function extractText(clipboardData: ClipboardData): string | null {
  // 尝试多种方式获取文本
  const data = clipboardData as any;

  if (data.text) {
    return data.text;
  }

  if (data.data?.text) {
    return data.data.text;
  }

  // 尝试从 getData 方法获取
  if (typeof data.getData === 'function') {
    const text = data.getData('text/plain');
    if (text) {
      return text;
    }
  }

  return null;
}

/**
 * 文本粘贴插件
 */
export const withTextPastePlugin = (board: PlaitBoard) => {
  const { insertFragment } = board;

  board.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    // 检查是否是纯文本粘贴
    if (hasPlainText(clipboardData)) {
      const text = extractText(clipboardData!);

      if (text && text.trim()) {
        const trimmedText = text.trim();

        // 尝试解析为 Markdown Card 块
        const cardBlocks = parseMarkdownToCards(trimmedText);
        if (cardBlocks && cardBlocks.length > 0) {
          // 有 Markdown 特征 → 插入为 Card 标签贴（宽度与知识库插入保持一致：50% 屏幕宽度）
          const cardWidth = Math.round(window.innerWidth * 0.5);
          insertCardsToCanvas(board, cardBlocks, targetPoint, cardWidth);
          return;
        }

        // 普通文本 → 自动换行后插入
        const wrappedText = wrapLongText(trimmedText);
        DrawTransforms.insertText(board, targetPoint, wrappedText);
        return;
      }
    }

    // 不是纯文本或提取失败，使用默认处理
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};
