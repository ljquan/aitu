/**
 * 新手引导步骤配置
 *
 * 注意：targetId 需要与对应的工具栏元素 id 保持一致
 */

import { TutorialStep } from '../../types/tutorial.types';

/** 引导目标元素 ID 常量 */
export const TUTORIAL_TARGET_IDS = {
  /** 统一工具栏 */
  UNIFIED_TOOLBAR: 'tour-unified-toolbar',
  /** 创作工具区域（中间可滚动部分） */
  CREATION_TOOLS: 'tour-creation-tools',
  /** AI 生图按钮 */
  AI_IMAGE_BUTTON: 'tour-ai-image-button',
  /** AI 视频按钮 */
  AI_VIDEO_BUTTON: 'tour-ai-video-button',
  /** 图片按钮 */
  IMAGE_BUTTON: 'tour-image-button',
  /** 任务按钮 */
  TASK_BUTTON: 'tour-task-button',
} as const;

/** 新手引导步骤列表 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'intro',
    title: '欢迎来到 Aitu 爱图',
    description:
      '这是一个强大的 AI 驱动的创意画板。您可以创建思维导图、流程图，还能使用 AI 生成图片和视频。让我们花一分钟了解基本操作。',
    position: 'center',
  },
  {
    id: 'toolbar',
    title: '创作工具栏',
    description:
      '这是您的创作工具箱，包含了丰富的绘图和编辑工具：\n• 手形工具 - 拖动画布\n• 选择工具 - 选中元素\n• 思维导图 - 快速创建脑图\n• 文本、画笔、形状、箭头等',
    targetId: TUTORIAL_TARGET_IDS.CREATION_TOOLS,
    position: 'right',
  },
  {
    id: 'ai-image',
    title: 'AI 生成图片',
    description:
      '这是 AI 图片生成功能。输入文字描述，AI 将为您创作独特的图片。支持写实风、插画风、卡通风等多种风格。',
    targetId: TUTORIAL_TARGET_IDS.AI_IMAGE_BUTTON,
    position: 'right',
  },
  {
    id: 'ai-video',
    title: 'AI 生成视频',
    description:
      '使用 AI 生成短视频。描述您想要的场景，AI 将创作出动态视频内容。支持多种风格和场景。',
    targetId: TUTORIAL_TARGET_IDS.AI_VIDEO_BUTTON,
    position: 'right',
  },
  {
    id: 'task-panel',
    title: '任务队列',
    description:
      '这里显示您的 AI 生成任务。所有图片和视频的生成进度都可以在这里查看。任务完成后，作品会自动添加到画布中。',
    targetId: TUTORIAL_TARGET_IDS.TASK_BUTTON,
    position: 'top',
  },
  {
    id: 'canvas-tips',
    title: '画布操作技巧',
    description:
      '• 鼠标滚轮可以缩放画布\n• 按住空格键拖动可以平移视图\n• 双指捏合在触控设备上也可以缩放\n• 工具栏支持拖拽排序，右键可以自定义显示的工具',
    position: 'center',
  },
  {
    id: 'finish',
    title: '准备就绪',
    description:
      '您已经掌握了 Aitu 的基础操作！现在可以开始您的创作之旅了。如需再次查看引导，可以在菜单中找到"新手教程"选项。',
    position: 'center',
  },
];
