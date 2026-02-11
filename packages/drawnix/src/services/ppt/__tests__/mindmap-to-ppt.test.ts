/**
 * 思维导图转 PPT 单元测试
 *
 * 测试场景：
 * 1. extractTextFromMindData - 从 MindElement.data 提取文本
 * 2. extractMindmapStructure - 递归提取思维导图层级结构
 * 3. flattenChildrenToBullets - 展平子节点为要点列表
 * 4. convertMindmapToOutline - 转换为 PPT 大纲
 * 5. mindmapToOutline - 端到端：MindElement → PPT 大纲
 */

import { describe, it, expect } from 'vitest';
import type { MindElement } from '@plait/mind';
import type { MindmapNodeInfo, PPTOutline } from '../ppt.types';
import {
  extractTextFromMindData,
  extractMindmapStructure,
  flattenChildrenToBullets,
  convertMindmapToOutline,
  mindmapToOutline,
} from '../mindmap-to-ppt';

// ============================================
// 测试辅助：构建 MindElement mock 数据
// ============================================

/** 构建符合 Plait 结构的 MindElement data（BaseData 格式） */
function buildMindData(text: string) {
  return {
    topic: {
      children: [{ text }],
    },
  };
}

/** 构建 MindElement mock（最小结构） */
function buildMindElement(
  text: string,
  children: MindElement[] = [],
  isRoot = false
): MindElement {
  const element: any = {
    id: `mock-${Math.random().toString(36).slice(2, 8)}`,
    data: buildMindData(text),
    children,
    width: 100,
    height: 40,
  };
  if (isRoot) {
    element.type = 'mindmap';
    element.points = [[0, 0], [100, 40]];
    element.isRoot = true;
  }
  return element as MindElement;
}

/** 构建完整的思维导图根元素（PlaitMind 格式） */
function buildMindMap(
  rootText: string,
  childSpecs: { text: string; children?: { text: string; children?: { text: string }[] }[] }[]
): MindElement {
  const childElements = childSpecs.map((spec) => {
    const grandChildren = (spec.children || []).map((grandSpec) => {
      const greatGrandChildren = (grandSpec.children || []).map((ggSpec) =>
        buildMindElement(ggSpec.text)
      );
      return buildMindElement(grandSpec.text, greatGrandChildren);
    });
    return buildMindElement(spec.text, grandChildren);
  });
  return buildMindElement(rootText, childElements, true);
}

// ============================================
// 测试用例
// ============================================

describe('extractTextFromMindData', () => {
  it('应从 BaseData 格式（topic: ParagraphElement）提取文本', () => {
    const data = buildMindData('Hello World');
    expect(extractTextFromMindData(data as any)).toBe('Hello World');
  });

  it('应处理空 data', () => {
    expect(extractTextFromMindData(null as any)).toBe('');
    expect(extractTextFromMindData(undefined as any)).toBe('');
  });

  it('应处理 topic 中包含多个文本节点', () => {
    const data = {
      topic: {
        children: [
          { text: 'Hello ' },
          { text: 'World', bold: true },
        ],
      },
    };
    expect(extractTextFromMindData(data as any)).toBe('Hello World');
  });

  it('应兼容直接是 Slate 节点的 data（有 children）', () => {
    const data = {
      children: [{ text: '兼容格式' }],
    };
    expect(extractTextFromMindData(data as any)).toBe('兼容格式');
  });

  it('应兼容字符串格式的 data', () => {
    expect(extractTextFromMindData('直接字符串' as any)).toBe('直接字符串');
  });

  it('应自动 trim 空格', () => {
    const data = buildMindData('  需求分析  ');
    expect(extractTextFromMindData(data as any)).toBe('需求分析');
  });
});

describe('extractMindmapStructure', () => {
  it('应正确提取单节点', () => {
    const element = buildMindElement('根节点', [], true);
    const result = extractMindmapStructure(element);

    expect(result.text).toBe('根节点');
    expect(result.depth).toBe(0);
    expect(result.children).toHaveLength(0);
  });

  it('应递归提取多层结构', () => {
    const mindMap = buildMindMap('项目规划', [
      {
        text: '需求分析',
        children: [
          { text: '用户调研' },
          { text: '竞品分析' },
        ],
      },
      {
        text: 'UI设计',
        children: [
          { text: '原型设计' },
        ],
      },
    ]);

    const result = extractMindmapStructure(mindMap);

    expect(result.text).toBe('项目规划');
    expect(result.depth).toBe(0);
    expect(result.children).toHaveLength(2);

    // 一级子节点
    expect(result.children[0].text).toBe('需求分析');
    expect(result.children[0].depth).toBe(1);
    expect(result.children[0].children).toHaveLength(2);

    // 二级子节点
    expect(result.children[0].children[0].text).toBe('用户调研');
    expect(result.children[0].children[0].depth).toBe(2);
    expect(result.children[0].children[1].text).toBe('竞品分析');

    expect(result.children[1].text).toBe('UI设计');
    expect(result.children[1].children).toHaveLength(1);
    expect(result.children[1].children[0].text).toBe('原型设计');
  });

  it('应处理空子节点列表', () => {
    const element: any = {
      data: buildMindData('无子节点'),
      children: [],
      width: 100,
      height: 40,
    };
    const result = extractMindmapStructure(element);
    expect(result.children).toHaveLength(0);
  });
});

describe('flattenChildrenToBullets', () => {
  it('应展平一级子节点', () => {
    const children: MindmapNodeInfo[] = [
      { text: '要点1', children: [], depth: 0 },
      { text: '要点2', children: [], depth: 0 },
      { text: '要点3', children: [], depth: 0 },
    ];
    const bullets = flattenChildrenToBullets(children);
    expect(bullets).toEqual(['要点1', '要点2', '要点3']);
  });

  it('应处理多层嵌套（带缩进）', () => {
    const children: MindmapNodeInfo[] = [
      {
        text: '技术选型',
        children: [
          { text: 'React Native', children: [], depth: 2 },
          { text: 'Flutter', children: [], depth: 2 },
        ],
        depth: 1,
      },
    ];
    const bullets = flattenChildrenToBullets(children);
    expect(bullets).toEqual([
      '技术选型',
      '  React Native',
      '  Flutter',
    ]);
  });

  it('应限制展开深度', () => {
    const children: MindmapNodeInfo[] = [
      {
        text: '一级',
        children: [
          {
            text: '二级',
            children: [
              { text: '三级（不应出现）', children: [], depth: 3 },
            ],
            depth: 2,
          },
        ],
        depth: 1,
      },
    ];
    // maxDepth = 2，只展开 2 层
    const bullets = flattenChildrenToBullets(children, 2);
    expect(bullets).toEqual(['一级', '  二级']);
    expect(bullets).not.toContain('    三级（不应出现）');
  });

  it('应跳过空文本节点', () => {
    const children: MindmapNodeInfo[] = [
      { text: '有内容', children: [], depth: 0 },
      { text: '', children: [], depth: 0 },
      { text: '也有内容', children: [], depth: 0 },
    ];
    const bullets = flattenChildrenToBullets(children);
    expect(bullets).toEqual(['有内容', '也有内容']);
  });
});

describe('convertMindmapToOutline', () => {
  it('应为空思维导图生成默认封面和结尾', () => {
    const rootInfo: MindmapNodeInfo = {
      text: '',
      children: [],
      depth: 0,
    };
    const outline = convertMindmapToOutline(rootInfo);

    expect(outline.title).toBe('未命名演示文稿');
    expect(outline.pages).toHaveLength(2); // 封面 + 结尾
    expect(outline.pages[0].layout).toBe('cover');
    expect(outline.pages[0].title).toBe('未命名演示文稿');
    expect(outline.pages[1].layout).toBe('ending');
    expect(outline.pages[1].title).toBe('谢谢观看');
  });

  it('应正确生成完整大纲（封面 + 目录 + 内容页 + 结尾）', () => {
    const rootInfo: MindmapNodeInfo = {
      text: 'App开发计划',
      children: [
        {
          text: '需求分析',
          children: [
            { text: '市场调研', children: [], depth: 2 },
            { text: '用户画像', children: [], depth: 2 },
          ],
          depth: 1,
        },
        {
          text: 'UI设计',
          children: [
            { text: '原型设计', children: [], depth: 2 },
          ],
          depth: 1,
        },
        {
          text: '开发实现',
          children: [],
          depth: 1,
        },
      ],
      depth: 0,
    };

    const outline = convertMindmapToOutline(rootInfo);

    // 标题
    expect(outline.title).toBe('App开发计划');

    // 封面页
    expect(outline.pages[0].layout).toBe('cover');
    expect(outline.pages[0].title).toBe('App开发计划');
    expect(outline.pages[0].subtitle).toBe('共 3 个主题');

    // 目录页
    expect(outline.pages[1].layout).toBe('toc');
    expect(outline.pages[1].bullets).toEqual(['需求分析', 'UI设计', '开发实现']);

    // 内容页 - 需求分析
    expect(outline.pages[2].layout).toBe('title-body');
    expect(outline.pages[2].title).toBe('需求分析');
    expect(outline.pages[2].bullets).toEqual(['市场调研', '用户画像']);

    // 内容页 - UI设计
    expect(outline.pages[3].layout).toBe('title-body');
    expect(outline.pages[3].title).toBe('UI设计');
    expect(outline.pages[3].bullets).toEqual(['原型设计']);

    // 内容页 - 开发实现（无子节点）
    expect(outline.pages[4].layout).toBe('title-body');
    expect(outline.pages[4].title).toBe('开发实现');
    expect(outline.pages[4].bullets).toBeUndefined();

    // 结尾页
    expect(outline.pages[5].layout).toBe('ending');
    expect(outline.pages[5].title).toBe('谢谢观看');

    // 总页数 = 封面 + 目录 + 3 个内容页 + 结尾 = 6
    expect(outline.pages).toHaveLength(6);
  });

  it('应支持禁用目录页', () => {
    const rootInfo: MindmapNodeInfo = {
      text: '测试',
      children: [
        { text: '章节1', children: [], depth: 1 },
        { text: '章节2', children: [], depth: 1 },
      ],
      depth: 0,
    };

    const outline = convertMindmapToOutline(rootInfo, { includeToc: false });

    // 封面 + 2 个内容页 + 结尾 = 4（无目录页）
    expect(outline.pages).toHaveLength(4);
    expect(outline.pages.map((p) => p.layout)).toEqual([
      'cover', 'title-body', 'title-body', 'ending',
    ]);
  });

  it('应支持自定义结尾文案', () => {
    const rootInfo: MindmapNodeInfo = {
      text: '演讲',
      children: [],
      depth: 0,
    };
    const outline = convertMindmapToOutline(rootInfo, {
      endingTitle: 'Thanks!',
      endingSubtitle: 'Q&A Time',
    });
    expect(outline.pages[1].title).toBe('Thanks!');
    expect(outline.pages[1].subtitle).toBe('Q&A Time');
  });
});

describe('mindmapToOutline（端到端）', () => {
  it('应从 MindElement 直接生成完整 PPT 大纲', () => {
    const mindMap = buildMindMap('未命名演示文稿', [
      {
        text: '需求分析',
        children: [
          { text: '市场调研' },
          { text: '用户画像' },
          { text: '功能清单' },
          { text: '竞品分析' },
        ],
      },
      {
        text: 'UI设计',
        children: [
          { text: '原型设计' },
          { text: '视觉设计' },
          { text: '交互设计' },
          { text: '设计规范' },
        ],
      },
      {
        text: '前端开发',
        children: [
          {
            text: '技术选型',
            children: [
              { text: 'React Native' },
              { text: 'Flutter' },
              { text: '原生开发' },
            ],
          },
          { text: '界面实现' },
          { text: '状态管理' },
          { text: '性能优化' },
        ],
      },
      {
        text: '后端开发',
        children: [
          { text: '架构设计' },
          { text: 'API接口' },
          { text: '数据库设计' },
          { text: '服务器部署' },
        ],
      },
      {
        text: '测试上线',
        children: [
          { text: '单元测试' },
          { text: '集成测试' },
          { text: '用户测试' },
          { text: '应用商店发布' },
        ],
      },
      {
        text: '运维迭代',
        children: [
          { text: '版本管理' },
          { text: '用户反馈' },
          { text: '数据分析' },
          { text: '持续优化' },
        ],
      },
    ]);

    const outline = mindmapToOutline(mindMap);

    // 标题
    expect(outline.title).toBe('未命名演示文稿');

    // 总页数 = 封面 + 目录 + 6 个内容页 + 结尾 = 9
    expect(outline.pages).toHaveLength(9);

    // 封面
    expect(outline.pages[0].layout).toBe('cover');
    expect(outline.pages[0].title).toBe('未命名演示文稿');
    expect(outline.pages[0].subtitle).toBe('共 6 个主题');

    // 目录
    expect(outline.pages[1].layout).toBe('toc');
    expect(outline.pages[1].bullets).toHaveLength(6);

    // 前端开发页 - 应包含三级节点（技术选型的子节点）
    const frontendPage = outline.pages[4]; // 封面 + 目录 + 需求分析 + UI设计 = index 4
    expect(frontendPage.title).toBe('前端开发');
    expect(frontendPage.bullets).toBeDefined();
    expect(frontendPage.bullets!.length).toBeGreaterThan(4);
    // 检查嵌套结构：技术选型的子节点应该有缩进
    expect(frontendPage.bullets!).toContain('技术选型');
    expect(frontendPage.bullets!.some((b) => b.includes('React Native'))).toBe(true);

    // 结尾
    expect(outline.pages[8].layout).toBe('ending');
    expect(outline.pages[8].title).toBe('谢谢观看');
  });

  it('应处理只有根节点的思维导图', () => {
    const mindMap = buildMindElement('只有标题', [], true);
    const outline = mindmapToOutline(mindMap);

    expect(outline.title).toBe('只有标题');
    expect(outline.pages).toHaveLength(2); // 封面 + 结尾
    expect(outline.pages[0].subtitle).toBeUndefined();
  });

  it('应处理深层嵌套结构', () => {
    const mindMap = buildMindMap('深层测试', [
      {
        text: '一级',
        children: [
          {
            text: '二级',
            children: [
              { text: '三级A' },
              { text: '三级B' },
            ],
          },
        ],
      },
    ]);

    const outline = mindmapToOutline(mindMap);
    const contentPage = outline.pages[2]; // 封面 + 目录 之后
    expect(contentPage.title).toBe('一级');
    expect(contentPage.bullets).toBeDefined();
    expect(contentPage.bullets!).toContain('二级');
    // 三级节点应有缩进
    expect(contentPage.bullets!.some((b) => b.startsWith('  ') && b.includes('三级A'))).toBe(true);
  });
});
