/**
 * 长视频生成 MCP 工具
 *
 * 生成超过单个模型时长限制的长视频（如1分钟）
 * 工作流程：
 * 1. 调用文本模型生成分段视频脚本
 * 2. 创建第一个视频任务
 * 3. 后续任务由 long-video-chain-service 在前一个完成后串行创建
 */

import type { MCPTool, MCPResult, MCPExecuteOptions, MCPTaskResult } from '../types';
import { taskQueueService } from '../../services/task-queue';
import { TaskType } from '../../types/task.types';
import type { VideoModel } from '../../types/video.types';
import { VIDEO_MODEL_CONFIGS } from '../../constants/video-model-config';
import { defaultGeminiClient } from '../../utils/gemini-api';
import { geminiSettings } from '../../utils/settings-manager';
import type { GeminiMessage } from '../../utils/gemini-api/types';

/** 默认片段时长（秒） */
const DEFAULT_SEGMENT_DURATION = 8;

/** 默认长视频模型（支持首尾帧） */
const DEFAULT_LONG_VIDEO_MODEL: VideoModel = 'veo3.1';

/**
 * 长视频生成参数
 */
export interface LongVideoGenerationParams {
  /** 视频主题/描述 */
  prompt: string;
  /** 目标总时长（秒），默认 60 */
  totalDuration?: number;
  /** 每段视频时长（秒），默认 8 */
  segmentDuration?: number;
  /** 视频模型，默认 veo3.1（支持首尾帧） */
  model?: VideoModel;
  /** 视频尺寸 */
  size?: string;
  /** 首帧参考图片 URL（可选，用于第一段视频） */
  firstFrameImage?: string;
}

/**
 * 视频脚本片段
 */
export interface VideoSegmentScript {
  /** 片段序号（1开始） */
  index: number;
  /** 片段描述/提示词 */
  prompt: string;
  /** 片段时长 */
  duration: number;
}

/**
 * 长视频元数据（存储在任务params中）
 */
export interface LongVideoMeta {
  /** 批次ID */
  batchId: string;
  /** 当前片段序号（1开始） */
  segmentIndex: number;
  /** 总片段数 */
  totalSegments: number;
  /** 是否需要提取尾帧（最后一段不需要） */
  needsLastFrame: boolean;
  /** 完整的视频脚本列表 */
  scripts: VideoSegmentScript[];
  /** 视频模型 */
  model: VideoModel;
  /** 视频尺寸 */
  size: string;
}

/**
 * 生成视频脚本的系统提示词
 */
function getScriptGenerationPrompt(
  segmentCount: number,
  segmentDuration: number
): string {
  return `你是一个专业的视频脚本编剧。用户会给你一个视频主题，你需要将其拆分为 ${segmentCount} 个连续的视频片段脚本。

要求：
1. 每个片段时长约 ${segmentDuration} 秒
2. 片段之间要保持叙事连贯性，画面能自然衔接
3. 每个片段的描述要具体、可视化，包含：场景、主体、动作、镜头运动
4. 使用英文撰写描述以获得更好的生成效果

输出格式（严格遵循 JSON）：
\`\`\`json
{
  "segments": [
    {
      "index": 1,
      "prompt": "Segment 1 description in English...",
      "duration": ${segmentDuration}
    },
    {
      "index": 2,
      "prompt": "Segment 2 description in English...",
      "duration": ${segmentDuration}
    }
  ]
}
\`\`\`

注意：
- 第一个片段要有好的开场
- 相邻片段的结尾和开头要能自然衔接（因为会用尾帧作为下一段首帧）
- 最后一个片段要有完整的收尾`;
}

/**
 * 解析 AI 生成的视频脚本
 */
function parseVideoScript(response: string): VideoSegmentScript[] {
  try {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/\{[\s\S]*"segments"[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('[LongVideo] Failed to find JSON in response');
      return [];
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.segments)) {
      console.error('[LongVideo] Invalid script format: segments is not an array');
      return [];
    }

    return parsed.segments.map((seg: any, i: number) => ({
      index: seg.index || i + 1,
      prompt: seg.prompt || '',
      duration: seg.duration || DEFAULT_SEGMENT_DURATION,
    }));
  } catch (error) {
    console.error('[LongVideo] Failed to parse script:', error);
    return [];
  }
}

/**
 * 调用文本模型生成视频脚本
 */
async function generateVideoScript(
  userPrompt: string,
  segmentCount: number,
  segmentDuration: number,
  onChunk?: (chunk: string) => void
): Promise<VideoSegmentScript[]> {
  const settings = geminiSettings.get();
  const textModel = settings.textModelName;

  const systemPrompt = getScriptGenerationPrompt(segmentCount, segmentDuration);

  const messages: GeminiMessage[] = [
    {
      role: 'system',
      content: [{ type: 'text', text: systemPrompt }],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: `视频主题：${userPrompt}` }],
    },
  ];

  let fullResponse = '';

  const response = await defaultGeminiClient.sendChat(
    messages,
    (chunk) => {
      fullResponse += chunk;
      onChunk?.(chunk);
    },
    undefined,
    textModel
  );

  if (response.choices && response.choices.length > 0) {
    fullResponse = response.choices[0].message.content || fullResponse;
  }

  // console.log('[LongVideo] Script generation response:', fullResponse);

  return parseVideoScript(fullResponse);
}

/**
 * 创建单个视频任务
 */
export function createLongVideoSegmentTask(
  segment: VideoSegmentScript,
  meta: LongVideoMeta,
  firstFrameUrl?: string
): any {
  // 构建上传图片参数
  const uploadedImages: any[] = [];

  // 如果有首帧图片，添加到 slot 0
  if (firstFrameUrl) {
    uploadedImages.push({
      slot: 0,
      slotLabel: '首帧',
      url: firstFrameUrl,
      name: 'first-frame.png',
    });
  }

  // 创建任务
  const task = taskQueueService.createTask(
    {
      prompt: segment.prompt,
      size: meta.size,
      duration: segment.duration,
      model: meta.model,
      uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
      // 长视频链式生成元数据
      longVideoMeta: meta,
      // 批量参数（用于UI展示）
      batchId: meta.batchId,
      batchIndex: segment.index,
      batchTotal: meta.totalSegments,
    },
    TaskType.VIDEO
  );

  // console.log(`[LongVideo] Created task ${segment.index}/${meta.totalSegments}:`, task.id);
  return task;
}

/**
 * 执行长视频生成（queue 模式）
 * 只创建第一个视频任务，后续任务由 chain service 串行创建
 */
async function executeLongVideoGeneration(
  params: LongVideoGenerationParams,
  options: MCPExecuteOptions
): Promise<MCPTaskResult> {
  const {
    prompt,
    totalDuration = 60,
    segmentDuration = DEFAULT_SEGMENT_DURATION,
    model = DEFAULT_LONG_VIDEO_MODEL,
    size = '16x9',
    firstFrameImage,
  } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 prompt',
      type: 'error',
    };
  }

  // 检查模型是否支持首尾帧
  const modelConfig = VIDEO_MODEL_CONFIGS[model];
  if (!modelConfig || modelConfig.imageUpload.mode !== 'frames') {
    console.warn(`[LongVideo] Model ${model} does not support first/last frame, using veo3.1`);
  }

  try {
    // 计算需要多少个片段
    const segmentCount = Math.ceil(totalDuration / segmentDuration);

    // console.log(`[LongVideo] Generating ${segmentCount} segments for ${totalDuration}s video`);

    // 通知 AI 分析阶段开始
    options.onChunk?.(`正在为您规划 ${totalDuration} 秒的长视频，分为 ${segmentCount} 个片段...\n\n`);

    // 1. 调用文本模型生成视频脚本
    const scripts = await generateVideoScript(
      prompt,
      segmentCount,
      segmentDuration,
      options.onChunk
    );

    if (scripts.length === 0) {
      return {
        success: false,
        error: '视频脚本生成失败，请重试',
        type: 'error',
      };
    }

    options.onChunk?.(`\n\n✓ 脚本生成完成，共 ${scripts.length} 个片段\n\n`);

    // 2. 只创建第一个视频任务，后续任务由 chain service 串行创建
    const batchId = `long_video_${Date.now()}`;
    const firstScript = scripts[0];

    const meta: LongVideoMeta = {
      batchId,
      segmentIndex: 1,
      totalSegments: scripts.length,
      needsLastFrame: scripts.length > 1, // 只有多片段时需要提取尾帧
      scripts, // 保存完整脚本供后续使用
      model,
      size,
    };

    const firstTask = createLongVideoSegmentTask(firstScript, meta, firstFrameImage);

    // 只添加第一个视频片段步骤到工作流
    // 后续片段和合并由 long-video-chain-service 自动处理，不在工作流中显示
    options.onAddSteps?.([{
      id: firstTask.id,
      mcp: 'generate_video',
      args: { prompt: firstScript.prompt, model, size },
      description: `生成视频片段 1/${scripts.length}: ${firstScript.prompt.substring(0, 50)}...`,
      status: 'completed', // 任务已创建，标记为已完成避免重复执行
      options: {
        mode: 'queue' as const,
        batchId,
        batchIndex: 1,
        batchTotal: scripts.length,
        globalIndex: 1,
      },
    }]);

    options.onChunk?.(`\n✓ 已创建第 1 个视频生成任务\n`);
    options.onChunk?.(`\n📊 **长视频生成计划**：\n`);
    options.onChunk?.(`- 总时长：${totalDuration} 秒\n`);
    options.onChunk?.(`- 片段数：${scripts.length} 个（每段 ${segmentDuration} 秒）\n`);
    options.onChunk?.(`- 生成方式：串行生成（前一段完成后自动创建下一段）\n`);
    options.onChunk?.(`\n💡 **温馨提示**：\n`);
    options.onChunk?.(`- 每段视频生成完成后，系统会自动提取尾帧作为下一段的首帧，确保画面连贯\n`);
    options.onChunk?.(`- 所有片段生成完成后会自动合并并插入画布\n`);
    options.onChunk?.(`- 您可以在任务队列中查看实时进度\n`);

    return {
      success: true,
      data: {
        batchId,
        taskId: firstTask.id,
        segmentCount: scripts.length,
        totalDuration,
        scripts,
      },
      type: 'video',
      taskId: firstTask.id,
    };
  } catch (error: any) {
    console.error('[LongVideo] Generation failed:', error);

    return {
      success: false,
      error: error.message || '长视频生成失败',
      type: 'error',
    };
  }
}

/**
 * 长视频生成 MCP 工具定义
 */
export const longVideoGenerationTool: MCPTool = {
  name: 'generate_long_video',
  description: `生成长视频工具。用于生成超过单个模型时长限制的长视频（如1分钟）。

使用场景：
- 用户想要生成1分钟或更长的视频
- 用户描述了一个需要多个场景的完整故事
- 用户明确提到"长视频"、"1分钟视频"、"完整视频"等关键词

工作原理：
1. 先调用文本模型将用户描述拆分为多个连续的视频片段脚本
2. 串行生成视频：第1段完成后提取尾帧，作为第2段首帧，以此类推
3. 所有视频片段分别加入任务队列，用户可以在任务面板查看进度

不适用场景：
- 用户只需要一个短视频（15秒以内），使用 generate_video 工具
- 用户只是在聊天，没有生成视频的意图`,

  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '视频主题/故事描述，详细描述想要生成的视频内容、故事情节',
      },
      totalDuration: {
        type: 'number',
        description: '目标总时长（秒），默认 60 秒',
        default: 60,
      },
      segmentDuration: {
        type: 'number',
        description: '每个片段的时长（秒），默认 8 秒',
        default: 8,
      },
      model: {
        type: 'string',
        description: '视频生成模型，默认使用 veo3.1（支持首尾帧）',
        default: 'veo3.1',
      },
      size: {
        type: 'string',
        description: '视频尺寸，默认 16x9',
        default: '16x9',
      },
      firstFrameImage: {
        type: 'string',
        description: '第一段视频的首帧参考图片 URL（可选）',
      },
    },
    required: ['prompt'],
  },

  supportedModes: ['queue'],

  promptGuidance: {
    whenToUse: '当用户想要生成超过15秒的长视频时使用，特别是1分钟视频。关键词：长视频、1分钟、完整故事、多场景。',

    parameterGuidance: {
      prompt: '用户的视频主题或故事描述，可以是一个完整的故事大纲。工具会自动将其拆分为多个连贯的片段。',
      totalDuration: '默认60秒（1分钟）。用户说"1分钟视频"时设为60，"30秒"设为30。',
      segmentDuration: '每段视频时长，默认8秒。这个值通常不需要用户指定。',
      model: '默认使用 veo3.1，因为它支持首尾帧，能保证片段间的连贯性。',
      firstFrameImage: '可选参数。当用户选中图片并希望从该图片开始生成视频时使用。传递 "[图片1]" 等占位符，系统会自动替换为真实URL。',
    },

    bestPractices: [
      '将用户的描述直接传给 prompt，工具会自动调用文本模型生成分段脚本',
      '不需要用户提供详细的分段描述，工具会自动规划',
      '建议提醒用户长视频生成需要较长时间（每段约1-3分钟）',
      '如果用户选中了图片，可以将其作为 firstFrameImage 传递，这样第一段视频会从该图片开始',
    ],

    examples: [
      {
        input: '帮我生成一个1分钟的视频，讲述一只猫咪从早到晚的一天',
        args: {
          prompt: '一只可爱的橘猫从早到晚的一天生活：清晨在窗台晒太阳、中午在厨房偷吃鱼、下午追逐蝴蝶玩耍、傍晚蜷缩在沙发上打盹、夜晚望着月亮',
          totalDuration: 60,
        },
      },
      {
        input: '创作一个30秒的日落延时视频',
        args: {
          prompt: '从太阳开始下山到完全落入地平线的日落延时摄影，天空从金色渐变为橙色再到粉紫色',
          totalDuration: 30,
        },
      },
      {
        input: '[图片1] 让这个场景动起来，生成30秒视频',
        args: {
          prompt: 'Cinematic video starting from this scene, camera slowly panning around, natural ambient movement, objects gently swaying, dynamic lighting changes, smooth transitions',
          totalDuration: 30,
          firstFrameImage: '[图片1]',
        },
      },
    ],

    warnings: [
      '长视频生成需要较长时间，每个片段约1-3分钟，且串行生成',
      '生成完成后会产生多个独立的视频文件，需要用户手动下载或合并',
      '确保使用支持首尾帧的模型（如 veo3.1）以保证片段间的连贯性',
    ],
  },

  execute: async (params: Record<string, unknown>, options?: MCPExecuteOptions): Promise<MCPResult> => {
    const typedParams = params as unknown as LongVideoGenerationParams;
    return executeLongVideoGeneration(typedParams, options || {});
  },
};

/**
 * 便捷方法：创建长视频生成任务
 */
export function createLongVideoTask(
  params: LongVideoGenerationParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): Promise<MCPTaskResult> {
  return longVideoGenerationTool.execute(
    params as unknown as Record<string, unknown>,
    { ...options, mode: 'queue' }
  ) as Promise<MCPTaskResult>;
}
