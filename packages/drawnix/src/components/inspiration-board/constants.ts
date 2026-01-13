/**
 * Inspiration Board Constants
 *
 * 灵感创意板块常量配置
 */

import { InspirationCategory, InspirationTemplate } from './types';

/**
 * 每页显示的模版数量
 */
export const ITEMS_PER_PAGE = 3;

/**
 * 预设灵感模版列表
 */
export const INSPIRATION_TEMPLATES: InspirationTemplate[] = [
  {
    id: 'grid-emoji',
    title: '智能拆分宫格图',
    description: '宫格图，风格统一',
    prompt: '生成16宫格猫咪表情包',
    category: InspirationCategory.GRID,
    imageUrl: 'https://tuziphoto.codernote.club/aitu/gonggetu.jpg',
    badgeColor: 'badge--grid',
  },
  {
    id: 'flowchart-process',
    title: '业务流程图',
    description: '使用 Mermaid 语法生成清晰的流程图',
    prompt: '绘制一个用户注册登录的流程图，包含邮箱验证、密码校验、短信验证码、登录成功/失败等节点',
    category: InspirationCategory.FLOWCHART,
    imageUrl: 'https://tuziphoto.codernote.club/aitu/liuchengtu.png',
    badgeColor: 'badge--flowchart',
  },
  {
    id: 'mindmap-project',
    title: '项目规划脑图',
    description: '快速生成结构化的思维导图，梳理项目计划',
    prompt: '创建一个关于「移动应用开发」的思维导图，包含需求分析、UI设计、前端开发、后端开发、测试上线等主要分支',
    category: InspirationCategory.MINDMAP,
    imageUrl: 'https://tuziphoto.codernote.club/aitu/siweidaotu.png',
    badgeColor: 'badge--mindmap',
  },

];

/**
 * 分类对应的颜色配置
 */
export const CATEGORY_COLORS: Record<InspirationCategory, { bg: string; text: string }> = {
  [InspirationCategory.VIDEO]: { bg: '#fce7f3', text: '#be185d' },
  [InspirationCategory.IMAGE]: { bg: '#dbeafe', text: '#1d4ed8' },
  [InspirationCategory.MINDMAP]: { bg: '#dcfce7', text: '#15803d' },
  [InspirationCategory.FLOWCHART]: { bg: '#fef3c7', text: '#b45309' },
  [InspirationCategory.GRID]: { bg: '#f3e8ff', text: '#7c3aed' },
  [InspirationCategory.SVG]: { bg: '#e0e7ff', text: '#4338ca' },
};
