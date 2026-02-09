/**
 * PPT 生成 MCP 工具
 *
 * 功能：根据用户主题，调用 AI 生成结构化 PPT 大纲，然后自动创建多个 Frame 并布局文本内容。
 *
 * 工作流程：
 * 1. 调用文本模型生成 PPT 大纲 JSON（含 imagePrompt）
 * 2. 逐页创建 Frame（1920x1080）并横向排列
 * 3. 使用布局引擎在 Frame 内放置文本元素
 * 4. 将 imagePrompt 存储到 Frame 的 pptMeta 扩展属性中
 * 5. 聚焦视口到第一个 Frame
 */

import type { MCPTool, MCPResult, MCPExecuteOptions } from '../types';
import type { PlaitBoard, Point } from '@plait/core';
import { Transforms, BoardTransforms, PlaitBoard as PlaitBoardUtils, RectangleClient } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { getBoard } from './shared';
import { FrameTransforms } from '../../plugins/with-frame';
import { isFrameElement, PlaitFrame } from '../../types/frame.types';
import { defaultGeminiClient } from '../../utils/gemini-api';
import { geminiSettings } from '../../utils/settings-manager';
import type { GeminiMessage } from '../../utils/gemini-api/types';
import {
  type PPTGenerationParams,
  type PPTOutline,
  type PPTPageSpec,
  type PPTFrameMeta,
  type LayoutElement,
  type FrameRect,
  generateOutlineSystemPrompt,
  generateOutlineUserPrompt,
  parseOutlineResponse,
  layoutPageContent,
  convertToAbsoluteCoordinates,
  PPT_FRAME_WIDTH,
  PPT_FRAME_HEIGHT,
} from '../../services/ppt';

/** Frame 间距 */
const FRAME_GAP = 60;

/**
 * 计算新 Frame 的插入位置
 * PPT Frame 固定 1920x1080（横屏），放在最右侧 Frame 的右边
 */
function calcNewFramePosition(board: PlaitBoard): Point {
  const existingFrames: RectangleClient[] = [];

  for (const el of board.children) {
    if (isFrameElement(el)) {
      existingFrames.push(RectangleClient.getRectangleByPoints(el.points));
    }
  }

  // 无 Frame 时居中显示
  if (existingFrames.length === 0) {
    const container = PlaitBoardUtils.getBoardContainer(board);
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    const zoom = board.viewport?.zoom ?? 1;
    const orig = board.viewport?.origination;
    const ox = orig ? orig[0] : 0;
    const oy = orig ? orig[1] : 0;
    const cx = ox + vw / 2 / zoom;
    const cy = oy + vh / 2 / zoom;
    return [cx - PPT_FRAME_WIDTH / 2, cy - PPT_FRAME_HEIGHT / 2];
  }

  // 横屏：放在最右侧 Frame 的右边
  let maxRight = -Infinity;
  let refY = 0;
  for (const r of existingFrames) {
    const right = r.x + r.width;
    if (right > maxRight) {
      maxRight = right;
      refY = r.y;
    }
  }
  return [maxRight + FRAME_GAP, refY];
}

/**
 * 聚焦视口到指定 Frame
 */
function focusOnFrame(board: PlaitBoard, frame: PlaitFrame): void {
  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const padding = 80;

  const container = PlaitBoardUtils.getBoardContainer(board);
  const viewportWidth = container.clientWidth;
  const viewportHeight = container.clientHeight;

  // 计算缩放比例，让 Frame 适应视口
  const scaleX = viewportWidth / (rect.width + padding * 2);
  const scaleY = viewportHeight / (rect.height + padding * 2);
  const zoom = Math.min(scaleX, scaleY, 1);

  // 计算 Frame 中心点
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // 计算 origination：使 Frame 中心对齐视口中心
  const origination: [number, number] = [
    centerX - viewportWidth / 2 / zoom,
    centerY - viewportHeight / 2 / zoom,
  ];

  BoardTransforms.updateViewport(board, origination, zoom);
}

/**
 * 调用文本模型生成 PPT 大纲
 */
async function generatePPTOutline(
  topic: string,
  options: PPTGenerationParams,
  onChunk?: (chunk: string) => void
): Promise<PPTOutline> {
  const settings = geminiSettings.get();
  const textModel = settings.textModelName;

  const systemPrompt = generateOutlineSystemPrompt({
    pageCount: options.pageCount,
    language: options.language,
    extraRequirements: options.extraRequirements,
  });
  const userPrompt = generateOutlineUserPrompt(topic, options);

  const messages: GeminiMessage[] = [
    {
      role: 'system',
      content: [{ type: 'text', text: systemPrompt }],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: userPrompt }],
    },
  ];

  let fullResponse = '';

  const response = await defaultGeminiClient.sendChat(
    messages,
    (chunk) => {
      fullResponse = chunk; // sendChat 返回累积内容
      onChunk?.(chunk);
    },
    undefined,
    textModel
  );

  if (response.choices && response.choices.length > 0) {
    fullResponse = response.choices[0].message.content || fullResponse;
  }

  return parseOutlineResponse(fullResponse);
}

/**
 * 创建单个 PPT 页面（Frame + 文本内容）
 */
function createPPTPage(
  board: PlaitBoard,
  pageSpec: PPTPageSpec,
  pageIndex: number,
  framePosition: Point
): PlaitFrame {
  // 1. 创建 Frame
  const framePoints: [Point, Point] = [
    framePosition,
    [framePosition[0] + PPT_FRAME_WIDTH, framePosition[1] + PPT_FRAME_HEIGHT],
  ];
  const frameName = pageSpec.title || `Slide ${pageIndex}`;
  const frame = FrameTransforms.insertFrame(board, framePoints, frameName);

  // 2. 计算布局
  const frameRect: FrameRect = {
    x: framePosition[0],
    y: framePosition[1],
    width: PPT_FRAME_WIDTH,
    height: PPT_FRAME_HEIGHT,
  };
  const layoutElements = layoutPageContent(pageSpec, frameRect);
  const absoluteElements = convertToAbsoluteCoordinates(layoutElements, frameRect);

  // 3. 插入文本元素并绑定到 Frame
  for (const element of absoluteElements) {
    const insertPoint: Point = element.point;

    // 跳过占位符文本
    if (element.text === '[图片区域]') {
      continue;
    }

    // 记录插入前的 children 数量
    const childrenCountBefore = board.children.length;

    // 插入文本
    DrawTransforms.insertText(board, insertPoint, element.text);

    // 绑定到 Frame
    if (board.children.length > childrenCountBefore) {
      const newElement = board.children[childrenCountBefore];
      if (newElement) {
        FrameTransforms.bindToFrame(board, newElement, frame);
      }
    }
  }

  // 4. 设置 pptMeta 扩展属性
  const pptMeta: PPTFrameMeta = {
    layout: pageSpec.layout,
    pageIndex,
  };
  if (pageSpec.imagePrompt) {
    pptMeta.imagePrompt = pageSpec.imagePrompt;
  }
  if (pageSpec.notes) {
    pptMeta.notes = pageSpec.notes;
  }

  // 查找 frame 在 board.children 中的索引并设置属性
  const frameIndex = board.children.findIndex((el) => el.id === frame.id);
  if (frameIndex !== -1) {
    Transforms.setNode(board, { pptMeta } as any, [frameIndex]);
  }

  return frame;
}

/**
 * 执行 PPT 生成
 */
async function executePPTGeneration(
  params: PPTGenerationParams,
  options: MCPExecuteOptions
): Promise<MCPResult> {
  const { topic, pageCount, language, extraRequirements } = params;

  if (!topic || typeof topic !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 topic（PPT 主题）',
      type: 'error',
    };
  }

  const board = getBoard();
  if (!board) {
    return {
      success: false,
      error: '画布未初始化，请先打开画布',
      type: 'error',
    };
  }

  try {
    // 通知开始生成
    options.onChunk?.(`🎯 正在为「${topic}」生成 PPT 大纲...\n\n`);

    // 1. 生成大纲
    const outline = await generatePPTOutline(topic, params, (chunk) => {
      // 流式输出大纲生成过程
    });

    options.onChunk?.(`\n\n✓ 大纲生成完成，共 ${outline.pages.length} 页\n\n`);
    options.onChunk?.(`📑 **PPT 结构**：\n`);

    // 显示大纲结构
    outline.pages.forEach((page, index) => {
      const hasImage = page.imagePrompt ? ' 🖼️' : '';
      options.onChunk?.(`${index + 1}. ${page.title} (${page.layout})${hasImage}\n`);
    });

    options.onChunk?.(`\n正在创建 Frame 并布局内容...\n\n`);

    // 2. 逐页创建 Frame
    let firstFrame: PlaitFrame | null = null;
    let createdCount = 0;

    for (let i = 0; i < outline.pages.length; i++) {
      const pageSpec = outline.pages[i];
      const pageIndex = i + 1;

      // 计算 Frame 位置
      const framePosition = calcNewFramePosition(board);

      // 创建页面
      const frame = createPPTPage(board, pageSpec, pageIndex, framePosition);

      if (i === 0) {
        firstFrame = frame;
      }

      createdCount++;
      options.onChunk?.(`✓ 第 ${pageIndex}/${outline.pages.length} 页已创建\n`);
    }

    // 3. 聚焦到第一个 Frame
    if (firstFrame) {
      focusOnFrame(board, firstFrame);
    }

    // 4. 统计配图页面
    const pagesWithImage = outline.pages.filter((p) => p.imagePrompt).length;

    options.onChunk?.(`\n🎉 **PPT 生成完成！**\n`);
    options.onChunk?.(`- 共创建 ${createdCount} 个 Frame\n`);
    if (pagesWithImage > 0) {
      options.onChunk?.(`- 其中 ${pagesWithImage} 页可配图（在 Frame 面板中点击配图按钮）\n`);
    }
    options.onChunk?.(`\n💡 **提示**：\n`);
    options.onChunk?.(`- 在左侧「Frame」面板查看所有页面\n`);
    options.onChunk?.(`- 点击页面可聚焦查看\n`);
    options.onChunk?.(`- 点击「幻灯片播放」可全屏演示\n`);

    return {
      success: true,
      data: {
        title: outline.title,
        pageCount: createdCount,
        pagesWithImage,
        outline,
      },
      type: 'text',
    };
  } catch (error: any) {
    console.error('[PPT] Generation failed:', error);
    return {
      success: false,
      error: error.message || 'PPT 生成失败',
      type: 'error',
    };
  }
}

/**
 * generate_ppt MCP 工具定义
 */
export const pptGenerationTool: MCPTool = {
  name: 'generate_ppt',
  description: `生成 PPT 演示文稿工具。根据用户提供的主题或内容描述，自动生成结构化的 PPT 演示文稿。

使用场景：
- 用户想要创建 PPT、演示文稿、幻灯片
- 用户提供了一个主题，想要生成对应的演示内容
- 关键词：PPT、演示文稿、幻灯片、presentation、slides

工作原理：
1. 调用 AI 生成 PPT 大纲（包含版式、标题、正文、配图提示词）
2. 自动创建多个 Frame（1920x1080），每个 Frame 代表一页
3. 根据版式规则在 Frame 内布局文本内容
4. 视口自动聚焦到第一页

支持的版式：
- cover: 封面页
- toc: 目录页
- title-body: 标题正文页
- image-text: 图文页
- comparison: 对比页
- ending: 结尾页

配图说明：
- 生成的 PPT 默认只包含文本内容
- AI 会为适合配图的页面生成 imagePrompt
- 用户可在 Frame 面板中选择性地为页面生成配图`,

  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'PPT 主题或内容描述',
      },
      pageCount: {
        type: 'string',
        description: '页数控制：short(5-7页), normal(8-12页), long(13-18页)',
        enum: ['short', 'normal', 'long'],
        default: 'normal',
      },
      language: {
        type: 'string',
        description: '输出语言，默认中文',
        default: '中文',
      },
      extraRequirements: {
        type: 'string',
        description: '额外要求，如风格、重点内容等',
      },
    },
    required: ['topic'],
  },

  supportedModes: ['async'],

  promptGuidance: {
    whenToUse: '当用户想要创建 PPT、演示文稿、幻灯片时使用。关键词：PPT、演示文稿、幻灯片、presentation、slides、做个汇报、生成演示。',

    parameterGuidance: {
      topic: '用户的 PPT 主题或内容描述。可以是一个简单的主题词，也可以是详细的内容大纲。',
      pageCount: '根据用户需求选择：short 适合简短汇报(5-7页)，normal 适合常规演示(8-12页)，long 适合详细讲解(13-18页)。',
      language: '根据用户语言偏好设置，默认中文。如果用户用英文交流，可以设为 English。',
      extraRequirements: '用户的额外要求，如"简洁风格"、"重点突出数据"、"适合技术分享"等。',
    },

    bestPractices: [
      '将用户的描述直接作为 topic 传递，工具会自动规划内容结构',
      '如果用户提到"简短"、"快速"，使用 pageCount: "short"',
      '如果用户提到"详细"、"完整"，使用 pageCount: "long"',
      '生成完成后提醒用户可以在 Frame 面板中为页面添加配图',
    ],

    examples: [
      {
        input: '帮我做一个关于人工智能发展的 PPT',
        args: {
          topic: '人工智能发展',
          pageCount: 'normal',
          language: '中文',
        },
      },
      {
        input: '生成一个简短的产品介绍幻灯片',
        args: {
          topic: '产品介绍',
          pageCount: 'short',
          language: '中文',
        },
      },
      {
        input: 'Create a detailed presentation about climate change',
        args: {
          topic: 'Climate Change',
          pageCount: 'long',
          language: 'English',
        },
      },
      {
        input: '做一个关于团队年度总结的 PPT，要突出数据和成果',
        args: {
          topic: '团队年度总结',
          pageCount: 'normal',
          language: '中文',
          extraRequirements: '突出数据展示和成果呈现',
        },
      },
    ],

    warnings: [
      'PPT 生成需要几秒钟时间，请耐心等待',
      '生成的 PPT 默认只包含文本，配图需要用户在 Frame 面板中手动触发',
      '每次生成会创建新的 Frame，不会覆盖已有内容',
    ],
  },

  execute: async (
    params: Record<string, unknown>,
    options?: MCPExecuteOptions
  ): Promise<MCPResult> => {
    const typedParams = params as unknown as PPTGenerationParams;
    return executePPTGeneration(typedParams, options || {});
  },
};

/**
 * 便捷方法：生成 PPT
 */
export async function generatePPT(
  params: PPTGenerationParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): Promise<MCPResult> {
  return pptGenerationTool.execute(
    params as unknown as Record<string, unknown>,
    { ...options, mode: 'async' }
  );
}
