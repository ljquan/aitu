/**
 * 长视频生成服务
 *
 * 生成超过单个模型时长限制的长视频（如1分钟）
 * 工作流程：
 * 1. 调用文本模型生成分段视频脚本
 * 2. 创建第一个视频任务
 * 3. 后续任务由 long-video-chain-service 在前一个完成后串行创建
 */

import type { MCPExecuteOptions, MCPTaskResult } from '../../mcp/types';
import { taskQueueService } from '../task-queue';
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

  return parseVideoScript(fullResponse);
}

/**
 * 创建单个视频片段任务
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

  return task;
}

/**
 * 创建长视频生成任务
 */
export async function createLongVideoTask(
  params: LongVideoGenerationParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
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

    // 通知 AI 分析阶段开始
    options?.onChunk?.(`正在为您规划 ${totalDuration} 秒的长视频，分为 ${segmentCount} 个片段...\n\n`);

    // 1. 调用文本模型生成视频脚本
    const scripts = await generateVideoScript(
      prompt,
      segmentCount,
      segmentDuration,
      options?.onChunk
    );

    if (scripts.length === 0) {
      return {
        success: false,
        error: '视频脚本生成失败，请重试',
        type: 'error',
      };
    }

    options?.onChunk?.(`\n\n✓ 脚本生成完成，共 ${scripts.length} 个片段\n\n`);

    // 2. 只创建第一个视频任务，后续任务由 chain service 串行创建
    const batchId = `long_video_${Date.now()}`;
    const firstScript = scripts[0];

    const meta: LongVideoMeta = {
      batchId,
      segmentIndex: 1,
      totalSegments: scripts.length,
      needsLastFrame: scripts.length > 1,
      scripts,
      model,
      size,
    };

    const firstTask = createLongVideoSegmentTask(firstScript, meta, firstFrameImage);

    // 只添加第一个视频片段步骤到工作流
    options?.onAddSteps?.([{
      id: firstTask.id,
      mcp: 'generate_video',
      args: { prompt: firstScript.prompt, model, size },
      description: `生成视频片段 1/${scripts.length}: ${firstScript.prompt.substring(0, 50)}...`,
      status: 'completed',
      options: {
        mode: 'queue' as const,
        batchId,
        batchIndex: 1,
        batchTotal: scripts.length,
        globalIndex: 1,
      },
    }]);

    options?.onChunk?.(`\n✓ 已创建第 1 个视频生成任务\n`);
    options?.onChunk?.(`\n📊 **长视频生成计划**：\n`);
    options?.onChunk?.(`- 总时长：${totalDuration} 秒\n`);
    options?.onChunk?.(`- 片段数：${scripts.length} 个（每段 ${segmentDuration} 秒）\n`);
    options?.onChunk?.(`- 生成方式：串行生成（前一段完成后自动创建下一段）\n`);
    options?.onChunk?.(`\n💡 **温馨提示**：\n`);
    options?.onChunk?.(`- 每段视频生成完成后，系统会自动提取尾帧作为下一段的首帧，确保画面连贯\n`);
    options?.onChunk?.(`- 所有片段生成完成后会自动合并并插入画布\n`);
    options?.onChunk?.(`- 您可以在任务队列中查看实时进度\n`);

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
