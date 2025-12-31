/**
 * AI 指令常量
 * 这些指令用于指导文本模型基于画布上下文生成工作流
 */

// 指令项接口
export interface PromptItemData {
  content: string;
  scene: string;  // 适用场景描述
}

// AI 指令 - 用于文本模型生成工作流
export const AI_IMAGE_PROMPTS: Record<'zh' | 'en', PromptItemData[]> = {
  zh: [
    {
      content: '将选中的内容整理成思维导图',
      scene: '知识梳理、内容结构化、学习笔记'
    },
    {
      content: '为选中的主题生成详细的分析框架',
      scene: '项目分析、问题拆解、决策支持'
    },
    {
      content: '将文本内容转换为流程图',
      scene: '流程可视化、步骤说明、操作指南'
    },
    {
      content: '为这个概念生成相关的扩展内容',
      scene: '头脑风暴、创意发散、内容扩展'
    },
    {
      content: '总结并提炼关键要点',
      scene: '内容摘要、报告总结、快速了解'
    },
    {
      content: '分析这些内容之间的关联关系',
      scene: '关系分析、逻辑梳理、知识图谱'
    },
    {
      content: '为当前内容生成行动计划',
      scene: '任务规划、项目管理、执行方案'
    },
    {
      content: '对比分析这些选项的优缺点',
      scene: '方案对比、决策分析、选型评估'
    },
    {
      content: '生成一张与主题相关的配图',
      scene: '视觉辅助、内容配图、演示美化'
    }
  ],
  en: [
    {
      content: 'Organize the selected content into a mind map',
      scene: 'Knowledge organization, content structuring, study notes'
    },
    {
      content: 'Generate a detailed analysis framework for the selected topic',
      scene: 'Project analysis, problem breakdown, decision support'
    },
    {
      content: 'Convert the text content into a flowchart',
      scene: 'Process visualization, step explanation, operation guide'
    },
    {
      content: 'Generate related extended content for this concept',
      scene: 'Brainstorming, creative expansion, content extension'
    },
    {
      content: 'Summarize and extract key points',
      scene: 'Content summary, report summary, quick overview'
    },
    {
      content: 'Analyze the relationships between these contents',
      scene: 'Relationship analysis, logic organization, knowledge graph'
    },
    {
      content: 'Generate an action plan for the current content',
      scene: 'Task planning, project management, execution plan'
    },
    {
      content: 'Compare and analyze the pros and cons of these options',
      scene: 'Solution comparison, decision analysis, selection evaluation'
    },
    {
      content: 'Generate an image related to the topic',
      scene: 'Visual aid, content illustration, presentation enhancement'
    }
  ]
};

// AI 视频相关指令
export const AI_VIDEO_PROMPTS: Record<'zh' | 'en', PromptItemData[]> = {
  zh: [
    {
      content: '为这个场景生成一段动态视频',
      scene: '内容动态化、演示视频、宣传片'
    },
    {
      content: '将静态图片转换为动态视频',
      scene: '图片动态化、社交媒体内容'
    },
    {
      content: '生成一段产品展示视频',
      scene: '产品宣传、电商展示、营销素材'
    },
    {
      content: '创建一段解说动画视频',
      scene: '教程视频、知识讲解、培训内容'
    }
  ],
  en: [
    {
      content: 'Generate a dynamic video for this scene',
      scene: 'Content animation, demo video, promotional'
    },
    {
      content: 'Convert static image to dynamic video',
      scene: 'Image animation, social media content'
    },
    {
      content: 'Generate a product showcase video',
      scene: 'Product promotion, e-commerce display, marketing'
    },
    {
      content: 'Create an explainer animation video',
      scene: 'Tutorial video, knowledge explanation, training'
    }
  ]
};

// 类型定义
export type Language = 'zh' | 'en';

// 获取 AI 指令的辅助函数
export const getImagePrompts = (language: Language): PromptItemData[] => {
  return AI_IMAGE_PROMPTS[language];
};

// 获取视频相关指令的辅助函数
export const getVideoPrompts = (language: Language): PromptItemData[] => {
  return AI_VIDEO_PROMPTS[language];
};