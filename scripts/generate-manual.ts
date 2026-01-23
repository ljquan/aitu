/**
 * 用户手册生成脚本
 * 
 * 从 E2E 测试结果中提取带有 'manual' 注解的测试用例，
 * 结合截图生成 HTML 格式的用户手册。
 * 
 * 用法: npx ts-node scripts/generate-manual.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  title: string;
  fullTitle: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  annotations: Array<{
    type: string;
    description?: string;
  }>;
  attachments: Array<{
    name: string;
    path: string;
    contentType: string;
  }>;
}

interface ManualMetadata {
  category: string;
  title: string;
  description?: string;
  steps: string[];
  tags?: string[];
}

interface ManualPage {
  id: string;
  category: string;
  title: string;
  description: string;
  steps: Array<{
    order: number;
    title: string;
    description: string;
    screenshot?: string;
  }>;
  screenshots: string[];
}

// 预定义的分类
const CATEGORIES: Record<string, { name: string; order: number }> = {
  'getting-started': { name: '快速开始', order: 1 },
  'drawing': { name: '绘图功能', order: 2 },
  'ai-generation': { name: 'AI 生成', order: 3 },
  'mindmap': { name: '思维导图', order: 4 },
  'media-library': { name: '素材库', order: 5 },
  'project': { name: '项目管理', order: 6 },
  'settings': { name: '设置', order: 7 },
  'advanced': { name: '高级功能', order: 8 },
};

// 读取测试结果 JSON
function readTestResults(resultsPath: string): TestResult[] {
  try {
    const content = fs.readFileSync(resultsPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Playwright JSON reporter 格式
    if (data.suites) {
      const results: TestResult[] = [];
      
      const extractTests = (suite: any, parentTitle: string = '') => {
        const fullTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
        
        if (suite.specs) {
          for (const spec of suite.specs) {
            for (const test of spec.tests || []) {
              results.push({
                title: spec.title,
                fullTitle: `${fullTitle} > ${spec.title}`,
                file: suite.file || '',
                status: test.status,
                duration: test.results?.[0]?.duration || 0,
                annotations: test.annotations || [],
                attachments: test.results?.[0]?.attachments || [],
              });
            }
          }
        }
        
        if (suite.suites) {
          for (const childSuite of suite.suites) {
            extractTests(childSuite, fullTitle);
          }
        }
      };
      
      for (const suite of data.suites) {
        extractTests(suite);
      }
      
      return results;
    }
    
    return [];
  } catch (error) {
    console.error('Failed to read test results:', error);
    return [];
  }
}

// 从测试结果中提取手册元数据
function extractManualTests(results: TestResult[]): ManualPage[] {
  const pages: ManualPage[] = [];
  
  for (const result of results) {
    // 查找 manual 类型的注解
    const manualAnnotation = result.annotations.find(a => a.type === 'manual');
    if (!manualAnnotation?.description) continue;
    
    try {
      const metadata: ManualMetadata = JSON.parse(manualAnnotation.description);
      
      // 提取截图附件
      const screenshots = result.attachments
        .filter(a => a.contentType === 'image/png')
        .map(a => a.path);
      
      // 构建步骤
      const steps = metadata.steps.map((step, index) => ({
        order: index + 1,
        title: step,
        description: step,
        screenshot: screenshots[index],
      }));
      
      pages.push({
        id: generateId(result.title),
        category: metadata.category || 'advanced',
        title: metadata.title || result.title,
        description: metadata.description || '',
        steps,
        screenshots,
      });
    } catch (error) {
      console.warn(`Failed to parse manual metadata for "${result.title}":`, error);
    }
  }
  
  return pages;
}

// 生成 ID
function generateId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 获取版本号
function getVersion(): string {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    );
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// 生成 HTML 头部
function generateHtmlHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Aitu 用户手册</title>
  <style>
    :root {
      --primary-color: #F39C12;
      --secondary-color: #5A4FCF;
      --text-color: #333;
      --bg-color: #fff;
      --border-color: #e0e0e0;
      --code-bg: #f5f5f5;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background: var(--bg-color);
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 2px solid var(--primary-color);
    }
    
    .header h1 {
      font-size: 2.5rem;
      color: var(--primary-color);
      margin-bottom: 0.5rem;
    }
    
    .header .version {
      color: #666;
      font-size: 0.9rem;
    }
    
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: 250px;
      height: 100vh;
      background: #fafafa;
      border-right: 1px solid var(--border-color);
      padding: 2rem 1rem;
      overflow-y: auto;
    }
    
    .sidebar-nav {
      list-style: none;
    }
    
    .sidebar-nav li {
      margin-bottom: 0.5rem;
    }
    
    .sidebar-nav a {
      color: var(--text-color);
      text-decoration: none;
      display: block;
      padding: 0.5rem;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    .sidebar-nav a:hover {
      background: #eee;
    }
    
    .sidebar-nav .category {
      font-weight: bold;
      color: var(--secondary-color);
      margin-top: 1rem;
      margin-bottom: 0.5rem;
    }
    
    .main-content {
      margin-left: 270px;
      padding: 2rem;
    }
    
    .page-section {
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    .page-section h2 {
      color: var(--secondary-color);
      margin-bottom: 1rem;
    }
    
    .page-section p {
      margin-bottom: 1rem;
    }
    
    .steps {
      counter-reset: step;
    }
    
    .step {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }
    
    .step-number {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      background: var(--primary-color);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    
    .step-content {
      flex: 1;
    }
    
    .step-content h4 {
      margin-bottom: 0.5rem;
    }
    
    .step-screenshot {
      max-width: 100%;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-top: 1rem;
    }
    
    .footer {
      text-align: center;
      padding: 2rem;
      color: #666;
      font-size: 0.9rem;
    }
    
    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }
      .main-content {
        margin-left: 0;
      }
    }
  </style>
</head>`;
}

// 生成侧边栏导航
function generateSidebar(pages: ManualPage[]): string {
  // 按分类组织页面
  const byCategory = new Map<string, ManualPage[]>();
  
  for (const page of pages) {
    const category = page.category || 'advanced';
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(page);
  }
  
  // 按分类顺序排序
  const sortedCategories = Array.from(byCategory.entries())
    .sort((a, b) => {
      const orderA = CATEGORIES[a[0]]?.order || 999;
      const orderB = CATEGORIES[b[0]]?.order || 999;
      return orderA - orderB;
    });
  
  let html = '<nav class="sidebar">\n<ul class="sidebar-nav">\n';
  html += '<li><a href="index.html"><strong>首页</strong></a></li>\n';
  
  for (const [categoryId, categoryPages] of sortedCategories) {
    const categoryName = CATEGORIES[categoryId]?.name || categoryId;
    html += `<li class="category">${categoryName}</li>\n`;
    
    for (const page of categoryPages) {
      html += `<li><a href="${page.id}.html">${page.title}</a></li>\n`;
    }
  }
  
  html += '</ul>\n</nav>';
  return html;
}

// 生成单个页面
function generatePage(page: ManualPage, allPages: ManualPage[], version: string): string {
  let html = generateHtmlHead(page.title);
  
  html += `
<body>
${generateSidebar(allPages)}
<main class="main-content">
  <article class="page-section">
    <h2>${page.title}</h2>
    ${page.description ? `<p>${page.description}</p>` : ''}
    
    <div class="steps">
`;

  for (const step of page.steps) {
    html += `
      <div class="step">
        <div class="step-number">${step.order}</div>
        <div class="step-content">
          <h4>${step.title}</h4>
          <p>${step.description}</p>
          ${step.screenshot ? `<img class="step-screenshot" src="screenshots/${path.basename(step.screenshot)}" alt="${step.title}">` : ''}
        </div>
      </div>
`;
  }

  html += `
    </div>
  </article>
</main>

<footer class="footer">
  <p>Aitu 用户手册 v${version} | 由 E2E 测试自动生成</p>
  <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
</footer>
</body>
</html>`;

  return html;
}

// 生成首页
function generateIndex(pages: ManualPage[], version: string): string {
  let html = generateHtmlHead('首页');
  
  html += `
<body>
${generateSidebar(pages)}
<main class="main-content">
  <div class="header">
    <h1>🎨 Aitu 用户手册</h1>
    <p class="version">版本 ${version}</p>
  </div>
  
  <section class="page-section">
    <h2>欢迎使用 Aitu</h2>
    <p>Aitu (爱图) 是一个基于 Plait 框架构建的开源白板应用，支持思维导图、流程图、自由绘画、图片插入，以及 AI 驱动的内容生成。</p>
    
    <h3>主要功能</h3>
    <ul>
      <li><strong>绘图工具</strong> - 画笔、形状、文本等基础绘图功能</li>
      <li><strong>AI 生成</strong> - 通过 AI 生成图片和视频</li>
      <li><strong>思维导图</strong> - 快速创建和编辑思维导图</li>
      <li><strong>素材库</strong> - 管理和使用素材资源</li>
      <li><strong>项目管理</strong> - 管理多个画板项目</li>
    </ul>
  </section>
  
  <section class="page-section">
    <h2>目录</h2>
`;

  // 按分类显示页面链接
  const byCategory = new Map<string, ManualPage[]>();
  for (const page of pages) {
    const category = page.category || 'advanced';
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(page);
  }
  
  const sortedCategories = Array.from(byCategory.entries())
    .sort((a, b) => {
      const orderA = CATEGORIES[a[0]]?.order || 999;
      const orderB = CATEGORIES[b[0]]?.order || 999;
      return orderA - orderB;
    });
  
  for (const [categoryId, categoryPages] of sortedCategories) {
    const categoryName = CATEGORIES[categoryId]?.name || categoryId;
    html += `<h3>${categoryName}</h3>\n<ul>\n`;
    
    for (const page of categoryPages) {
      html += `<li><a href="${page.id}.html">${page.title}</a>${page.description ? ` - ${page.description}` : ''}</li>\n`;
    }
    
    html += '</ul>\n';
  }

  html += `
  </section>
</main>

<footer class="footer">
  <p>Aitu 用户手册 v${version} | 由 E2E 测试自动生成</p>
  <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
</footer>
</body>
</html>`;

  return html;
}

// 主函数
async function main() {
  const outputDir = path.join(process.cwd(), 'docs', 'user-manual');
  const screenshotsDir = path.join(outputDir, 'screenshots');
  const resultsPath = path.join(process.cwd(), 'apps', 'web-e2e', 'test-results', 'results.json');
  
  console.log('🔍 Reading test results...');
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  // 读取测试结果
  let pages: ManualPage[] = [];
  
  if (fs.existsSync(resultsPath)) {
    const results = readTestResults(resultsPath);
    pages = extractManualTests(results);
    console.log(`📊 Found ${pages.length} manual test cases`);
  } else {
    console.log('⚠️  No test results found, generating template manual...');
    
    // 生成模板页面
    pages = [
      {
        id: 'getting-started',
        category: 'getting-started',
        title: '快速开始',
        description: '了解如何快速上手 Aitu',
        steps: [
          { order: 1, title: '打开应用', description: '访问 opentu.ai 打开 Aitu 应用' },
          { order: 2, title: '选择工具', description: '从左侧工具栏选择需要的绘图工具' },
          { order: 3, title: '开始创作', description: '在画布上开始您的创作' },
        ],
        screenshots: [],
      },
      {
        id: 'ai-generation',
        category: 'ai-generation',
        title: 'AI 图片生成',
        description: '使用 AI 生成图片',
        steps: [
          { order: 1, title: '输入提示词', description: '在底部输入框中输入您想要生成的图片描述' },
          { order: 2, title: '选择模型', description: '点击 # 选择合适的生成模型' },
          { order: 3, title: '发送请求', description: '点击发送按钮或按回车键开始生成' },
        ],
        screenshots: [],
      },
    ];
  }
  
  // 获取版本号
  const version = getVersion();
  console.log(`📦 Version: ${version}`);
  
  // 生成首页
  const indexHtml = generateIndex(pages, version);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);
  console.log('✅ Generated index.html');
  
  // 生成各个页面
  for (const page of pages) {
    const pageHtml = generatePage(page, pages, version);
    fs.writeFileSync(path.join(outputDir, `${page.id}.html`), pageHtml);
    console.log(`✅ Generated ${page.id}.html`);
    
    // 复制截图
    for (const screenshot of page.screenshots) {
      if (fs.existsSync(screenshot)) {
        const destPath = path.join(screenshotsDir, path.basename(screenshot));
        fs.copyFileSync(screenshot, destPath);
      }
    }
  }
  
  console.log(`\n🎉 User manual generated at: ${outputDir}`);
  console.log(`📄 Total pages: ${pages.length + 1}`);
}

main().catch(console.error);
