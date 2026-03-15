import PptxGenJS from 'pptxgenjs';
import type { PlaitBoard, PlaitElement } from '@plait/core';
import { RectangleClient, getRectangleByElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { MindElement } from '@plait/mind';
import { FrameTransforms } from '../../plugins/with-frame';
import { isFrameElement, type PlaitFrame } from '../../types/frame.types';
import {
  sortElementsByPosition,
  extractTextFromElement,
  isTextElement,
  isImageElement,
} from '../../utils/selection-utils';
import { getCurrentFill, getCurrentStrokeColor } from '../../utils/property';

interface ExportPPTOptions {
  fileName?: string;
}

const SLIDE_WIDTH = 10;
const SLIDE_HEIGHT = 5.625;
// 画布默认使用的中文系统字体（与前端一致）
const DEFAULT_FONT_FACE = 'PingFang SC';

// ─── Color conversion ───

function toPptColor(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const c = color.trim();
  if (c === 'transparent' || c === 'none' || c === '') return undefined;

  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return hex.split('').map((ch) => ch + ch).join('').toUpperCase();
    }
    return hex.substring(0, 6).toUpperCase();
  }

  const rgbMatch = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return [r, g, b].map((v) => parseInt(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  return undefined;
}

// ─── Slate rich text extraction ───
//
// Plait geometry/text elements store text as:
//   element.text = { type: 'paragraph', children: [{ text: '...', 'font-size': 44, ... }] }
// MindElement / some elements use:
//   element.data = [ { type: 'paragraph', children: [...] }, ... ]
//
// We walk both to extract styled TextProps for pptxgenjs.

interface SlateLeaf {
  text: string;
  'font-size'?: number;
  'font-weight'?: string;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  bold?: boolean;
  [key: string]: any;
}

function isSlateLeaf(node: any): node is SlateLeaf {
  return node && typeof node === 'object' && typeof node.text === 'string';
}

function collectLeaves(node: any): SlateLeaf[] {
  if (isSlateLeaf(node)) return [node];
  const leaves: SlateLeaf[] = [];
  const children = node?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      leaves.push(...collectLeaves(child));
    }
  }
  return leaves;
}

function leafToTextProps(
  leaf: SlateLeaf,
  addBreakLine: boolean,
  fontScale: number
): PptxGenJS.TextProps {
  const opts: Record<string, any> = {};

  const fontSize = leaf['font-size'];
  if (fontSize && typeof fontSize === 'number') {
    opts.fontSize = Math.max(6, Math.round(fontSize * fontScale));
  }

  const fontWeight = leaf['font-weight'];
  const fontWeightNum = fontWeight ? Number(fontWeight) : NaN;
  if (
    fontWeight === 'bold' ||
    leaf.bold ||
    (!Number.isNaN(fontWeightNum) && fontWeightNum >= 500)
  ) {
    opts.bold = true;
  }

  const color = toPptColor(leaf.color);
  if (color) opts.color = color;

  if (leaf.italic) opts.italic = true;
  if (leaf.underline) opts.underline = { style: 'sng' };
  if (addBreakLine) opts.breakLine = true;

  return { text: leaf.text, options: opts };
}

/**
 * 从 Slate 段落节点数组中提取带样式的 TextProps
 */
function walkParagraphs(paragraphs: any[], fontScale: number): PptxGenJS.TextProps[] | null {
  const result: PptxGenJS.TextProps[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const isLastPara = pi === paragraphs.length - 1;
    const leaves = collectLeaves(paragraphs[pi]);
    if (leaves.length === 0) {
      if (!isLastPara) result.push({ text: '', options: { breakLine: true } });
      continue;
    }
    for (let li = 0; li < leaves.length; li++) {
      const isLastLeaf = li === leaves.length - 1;
      const needBreak = isLastLeaf && !isLastPara;
      result.push(leafToTextProps(leaves[li], needBreak, fontScale));
    }
  }

  if (result.length === 0) return null;
  return result.some((r) => r.text?.trim()) ? result : null;
}

interface RichTextResult {
  rows: PptxGenJS.TextProps[];
  align?: 'left' | 'center' | 'right';
}

/**
 * 统一提取元素的富文本（同时支持 element.data 和 element.text）
 * 同时提取段落对齐方式
 */
function extractElementRichText(
  element: PlaitElement,
  fontScale: number
): RichTextResult | null {
  // 1) element.data：MindElement / 部分 PlaitText 使用 data 数组
  const data = (element as any).data;
  if (data && Array.isArray(data)) {
    const rows = walkParagraphs(data, fontScale);
    if (rows) {
      const align = extractAlign(data[0]);
      return { rows, align };
    }
  }

  // 2) element.text：PlaitGeometry / PlaitText 使用单个 Slate 段落
  const textObj = (element as any).text;
  if (textObj && typeof textObj === 'object' && 'children' in textObj) {
    const rows = walkParagraphs([textObj], fontScale);
    if (rows) {
      const align = extractAlign(textObj);
      return { rows, align };
    }
  }

  return null;
}

function extractAlign(para: any): 'left' | 'center' | 'right' | undefined {
  if (!para || typeof para !== 'object') return undefined;
  const a = para.align;
  if (a === 'center' || a === 'right' || a === 'left') return a;
  return undefined;
}

/**
 * 纯文本兜底（无样式数据时使用）
 */
function buildPlainTextRows(
  text: string,
  fontSizePt: number
): PptxGenJS.TextProps[] {
  return text.split('\n').map((line, i, arr) => ({
    text: line,
    options: {
      fontSize: fontSizePt,
      ...(i < arr.length - 1 ? { breakLine: true } : {}),
    },
  }));
}

function isShortSingleLine(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  if (!t) return false;
  // 没有显式换行且字符数不多（如「感谢聆听」「Q&A」）
  return !text.includes('\n') && t.length <= 12;
}

// ─── Shape type mapping ───

function mapShapeType(pptx: PptxGenJS, shape: string): any {
  const st = pptx.ShapeType as Record<string, any>;
  switch (shape) {
    case 'rectangle': case 'process': return st.rect;
    case 'ellipse': case 'circle': return st.ellipse;
    case 'roundedRectangle': case 'round_rectangle': return st.roundRect;
    case 'diamond': case 'decision': return st.diamond;
    case 'triangle': return st.triangle;
    case 'parallelogram': return st.parallelogram;
    case 'trapezoid': return st.trapezoid;
    case 'hexagon': return st.hexagon;
    case 'star4': return st.star4;
    case 'star5': case 'star': return st.star5;
    case 'cloud': return st.cloud;
    default: return st.rect;
  }
}

// ─── Position / style helpers ───

/**
 * widthBuffer > 1 时：按中心点向两侧扩展宽度，防止 PPT 字体度量差异导致换行
 */
function computeSlidePosition(
  elRect: { x: number; y: number; width: number; height: number },
  frameRect: { x: number; y: number; width: number; height: number },
  widthBuffer = 1
) {
  const relX = (elRect.x - frameRect.x) / frameRect.width;
  const relY = (elRect.y - frameRect.y) / frameRect.height;
  const relW = elRect.width / frameRect.width;
  const relH = elRect.height / frameRect.height;

  const w = Math.max(0.1, relW * SLIDE_WIDTH * widthBuffer);
  const rawX = relX * SLIDE_WIDTH;
  const expandDelta = (w - relW * SLIDE_WIDTH) / 2;

  return {
    x: Math.max(0, rawX - expandDelta),
    y: Math.max(0, relY * SLIDE_HEIGHT),
    w,
    h: Math.max(0.1, relH * SLIDE_HEIGHT),
  };
}

function getElementFillOpts(
  board: PlaitBoard,
  element: PlaitElement
): { fill?: { color: string } } {
  const fillColor = toPptColor(getCurrentFill(board, element));
  return fillColor ? { fill: { color: fillColor } } : {};
}

function getElementLineOpts(
  board: PlaitBoard,
  element: PlaitElement
): { line?: { color: string; width: number } } {
  const strokeColor = toPptColor(getCurrentStrokeColor(board, element));
  if (!strokeColor) return {};
  return { line: { color: strokeColor, width: (element as any).strokeWidth || 1 } };
}

// ─── Image helper ───

async function ensureBase64Image(url: string): Promise<string> {
  if (!url) throw new Error('图片 URL 为空');
  if (url.startsWith('data:')) return url;

  const response = await fetch(url, { referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`获取图片失败: ${response.status}`);
  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('图片转换失败'));
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

// ─── Frame sorting ───

function sortFramesForPPT(frames: PlaitFrame[]): PlaitFrame[] {
  return [...frames].sort((a, b) => {
    const metaA = (a as PlaitFrame & { pptMeta?: { pageIndex?: number } }).pptMeta;
    const metaB = (b as PlaitFrame & { pptMeta?: { pageIndex?: number } }).pptMeta;
    const pageA = metaA?.pageIndex ?? 0;
    const pageB = metaB?.pageIndex ?? 0;
    if (pageA && pageB && pageA !== pageB) return pageA - pageB;

    const rectA = RectangleClient.getRectangleByPoints(a.points);
    const rectB = RectangleClient.getRectangleByPoints(b.points);
    return rectA.x - rectB.x;
  });
}

// ─── Core: convert one Frame into a PPT slide ───

async function addFrameSlide(
  pptx: PptxGenJS,
  board: PlaitBoard,
  frame: PlaitFrame
): Promise<boolean> {
  const children = FrameTransforms.getFrameChildren(board, frame);
  if (!children.length) return false;

  const frameRect = RectangleClient.getRectangleByPoints(frame.points);
  const slide = pptx.addSlide();
  const ordered = sortElementsByPosition(board, children as PlaitElement[]);

  // 字号缩放：画布 px → PPT pt（保持视觉比例一致）
  // 1920px 宽的画布映射到 10 英寸（720pt）宽的幻灯片
  const fontScale = (SLIDE_WIDTH * 72) / frameRect.width;

  // 兜底字号（按缩放后）
  const defaultTitlePt = Math.max(8, Math.round(44 * fontScale));
  const defaultBodyPt = Math.max(6, Math.round(18 * fontScale));

  for (const element of ordered) {
    try {
      const rect = getRectangleByElements(board, [element], false);
      const pos = computeSlidePosition(rect, frameRect);

      // --- PlaitText (standalone text box) ---
      if (isTextElement(board, element)) {
        const rawText = extractTextFromElement(element, board);
        const isSingle = isShortSingleLine(rawText);
        // 文本框加 40% 宽度缓冲，补偿 PPT 与 CSS 字体度量差异
        const textPos = computeSlidePosition(rect, frameRect, 1.4);
        const rich = extractElementRichText(element, fontScale);
        if (rich) {
          slide.addText(rich.rows, {
            x: textPos.x,
            y: textPos.y,
            w: textPos.w,
            h: textPos.h,
            valign: 'top',
            wrap: !isSingle,
            align: rich.align || 'center',
            fontFace: DEFAULT_FONT_FACE,
          });
        } else if (rawText) {
          slide.addText(buildPlainTextRows(rawText, defaultTitlePt), {
            x: textPos.x,
            y: textPos.y,
            w: textPos.w,
            h: textPos.h,
            valign: 'top',
            wrap: !isSingle,
            align: 'center',
            fontFace: DEFAULT_FONT_FACE,
          });
        }
        continue;
      }

      // --- Image element ---
      if (isImageElement(board, element)) {
        const url = (element as any).url || (element as any).image?.url;
        if (!url) continue;
        try {
          const data = await ensureBase64Image(url);
          slide.addImage({ data, x: pos.x, y: pos.y, w: pos.w, h: pos.h });
        } catch {
          console.debug('[PPT Export] Image load failed, skipping');
        }
        continue;
      }

      // --- Geometry shape (not PlaitText) ---
      if (
        PlaitDrawElement.isGeometry?.(element) &&
        !PlaitDrawElement.isText?.(element)
      ) {
        const shape = (element as any).shape || 'rectangle';
        const shapeType = mapShapeType(pptx, shape);
        const fillOpts = getElementFillOpts(board, element);
        const lineOpts = getElementLineOpts(board, element);

        const baseOpts: Record<string, any> = {
          x: pos.x, y: pos.y, w: pos.w, h: pos.h,
          ...fillOpts, ...lineOpts,
        };

        if (shape === 'roundedRectangle' || shape === 'round_rectangle') {
          baseOpts.rectRadius = 0.2;
        }

        const rich = extractElementRichText(element, fontScale);
        const plainText = extractTextFromElement(element, board);
        const isSingle = isShortSingleLine(plainText);
        if (rich) {
          slide.addText(rich.rows, {
            ...baseOpts,
            shape: shapeType,
            valign: 'middle',
            align: rich.align || 'center',
            wrap: !isSingle,
            fontFace: DEFAULT_FONT_FACE,
          });
        } else if (plainText) {
          slide.addText(buildPlainTextRows(plainText, defaultBodyPt), {
            ...baseOpts,
            shape: shapeType,
            valign: 'middle',
            align: 'center',
            wrap: !isSingle,
            fontFace: DEFAULT_FONT_FACE,
          });
        } else {
          slide.addShape(shapeType, baseOpts);
        }
        continue;
      }

      // --- Arrow line / Vector line ---
      if (
        PlaitDrawElement.isArrowLine?.(element) ||
        PlaitDrawElement.isVectorLine?.(element)
      ) {
        const points = (element as any).points;
        if (!points || points.length < 2) continue;

        const startPt = points[0] as [number, number];
        const endPt = points[points.length - 1] as [number, number];

        const sx = ((startPt[0] - frameRect.x) / frameRect.width) * SLIDE_WIDTH;
        const sy = ((startPt[1] - frameRect.y) / frameRect.height) * SLIDE_HEIGHT;
        const ex = ((endPt[0] - frameRect.x) / frameRect.width) * SLIDE_WIDTH;
        const ey = ((endPt[1] - frameRect.y) / frameRect.height) * SLIDE_HEIGHT;

        const strokeColor = toPptColor(getCurrentStrokeColor(board, element));
        const lineProps: Record<string, any> = {
          color: strokeColor || '333333',
          width: (element as any).strokeWidth || 1,
        };

        if (PlaitDrawElement.isArrowLine?.(element)) {
          const source = (element as any).source;
          const target = (element as any).target;
          if (source?.marker && source.marker !== 'none') {
            lineProps.beginArrowType = 'triangle';
          }
          if (!target?.marker || target.marker !== 'none') {
            lineProps.endArrowType = 'triangle';
          }
        }

        slide.addShape(pptx.ShapeType.line, {
          x: Math.min(sx, ex),
          y: Math.min(sy, ey),
          w: Math.abs(ex - sx) || 0.01,
          h: Math.abs(ey - sy) || 0.01,
          flipH: ex < sx,
          flipV: ey < sy,
          line: lineProps,
        });
        continue;
      }

      // --- Mind element ---
      if (MindElement.isMindElement?.(board, element)) {
        const rich = extractElementRichText(element, fontScale);
        const text = extractTextFromElement(element, board);
        const isSingle = isShortSingleLine(text);
        if (rich) {
          slide.addText(rich.rows, {
            x: pos.x,
            y: pos.y,
            w: pos.w,
            h: pos.h,
            valign: 'middle',
            wrap: !isSingle,
            fontFace: DEFAULT_FONT_FACE,
          });
        } else if (text) {
          slide.addText(buildPlainTextRows(text, defaultBodyPt), {
            x: pos.x,
            y: pos.y,
            w: pos.w,
            h: pos.h,
            valign: 'middle',
            wrap: !isSingle,
            fontFace: DEFAULT_FONT_FACE,
          });
        }
        continue;
      }

      // --- Fallback ---
      const richFallback = extractElementRichText(element, fontScale);
      const fallbackText = extractTextFromElement(element, board);
      const isSingle = isShortSingleLine(fallbackText);
      if (richFallback) {
        slide.addText(richFallback.rows, {
          x: pos.x,
          y: pos.y,
          w: pos.w,
          h: pos.h,
          valign: 'top',
          wrap: !isSingle,
          align: richFallback.align,
          fontFace: DEFAULT_FONT_FACE,
        });
      } else if (fallbackText) {
        slide.addText(buildPlainTextRows(fallbackText, defaultBodyPt), {
          x: pos.x,
          y: pos.y,
          w: pos.w,
          h: pos.h,
          valign: 'top',
          wrap: !isSingle,
          fontFace: DEFAULT_FONT_FACE,
        });
      }
    } catch (err) {
      console.debug('[PPT Export] Skipping element:', err);
    }
  }

  return true;
}

// ─── Public API ───

export async function exportFramesToPPT(
  board: PlaitBoard,
  frames: PlaitFrame[],
  options: ExportPPTOptions = {}
): Promise<void> {
  if (!frames.length) throw new Error('没有可导出的 Frame');

  const sortedFrames = sortFramesForPPT(frames);
  const pptx = new PptxGenJS();

  let addedCount = 0;
  for (const frame of sortedFrames) {
    const ok = await addFrameSlide(pptx, board, frame);
    if (ok) addedCount += 1;
  }

  if (addedCount === 0) throw new Error('PPT 导出失败：没有生成任何页面');

  const baseName =
    options.fileName ||
    (sortedFrames.length === 1 && sortedFrames[0].name
      ? sortedFrames[0].name
      : 'aitu-ppt');

  await pptx.writeFile({
    fileName: baseName.endsWith('.pptx') ? baseName : `${baseName}.pptx`,
  });
}

export async function exportAllPPTFrames(
  board: PlaitBoard,
  options: ExportPPTOptions = {}
): Promise<void> {
  const allFrames: PlaitFrame[] = [];
  for (const el of board.children as PlaitElement[]) {
    if (isFrameElement(el)) {
      allFrames.push(el as PlaitFrame);
    }
  }
  if (!allFrames.length) throw new Error('当前画布没有可导出的 Frame');
  await exportFramesToPPT(board, allFrames, options);
}
