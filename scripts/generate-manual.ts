/**
 * 用户手册生成脚本 (MDX 版本)
 * 
 * 从 MDX 文档编译生成 HTML 格式的用户手册，
 * 支持 Screenshot 组件引用 E2E 测试生成的截图。
 * 
 * 用法: npx ts-node scripts/generate-manual.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { compile } from '@mdx-js/mdx';
import { glob } from 'glob';

// 配置类型定义
interface Config {
  site: {
    title: string;
    description: string;
    logo: string;
  };
  categories: Record<string, { name: string; order: number }>;
  screenshots: {
    source: string;
    output: string;
  };
  output: {
    dir: string;
    format: string;
  };
}

// 页面元数据
interface PageMeta {
  title: string;
  category?: string;
  order?: number;
}

// 页面数据
interface Page {
  slug: string;
  filePath: string;
  meta: PageMeta;
  content: string;
  html: string;
}

// 读取配置文件
function readConfig(configPath: string): Config {
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(content) as Config;
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

// 简单的 Markdown 转 HTML（不使用 MDX 运行时）
function markdownToHtml(markdown: string, screenshotsDir: string): string {
  let html = markdown;
  
  // 处理代码块（必须在行内代码之前处理）
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim();
      return `<pre><code class="language-${lang || 'text'}">${escapedCode}</code></pre>`;
    }
  );
  
  // 处理 Screenshot 组件
  html = html.replace(
    /<Screenshot\s+id="([^"]+)"(?:\s+alt="([^"]*)")?\s*\/>/g,
    (_, id, alt) => {
      const imgPath = `screenshots/${id}.png`;
      return `<img class="step-screenshot" src="${imgPath}" alt="${alt || id}" loading="lazy" />`;
    }
  );
  
  // 处理标题（从小到大，避免误匹配）
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // 处理粗体和斜体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // 处理行内代码（在代码块之后处理）
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // 处理链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // 处理 tip/note 块
  html = html.replace(
    /:::tip\n([\s\S]*?):::/g,
    '<div class="tip"><strong>提示：</strong>$1</div>'
  );
  html = html.replace(
    /:::note\n([\s\S]*?):::/g,
    '<div class="note"><strong>注意：</strong>$1</div>'
  );
  
  // 处理无序列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n)+/g, (match) => `<ul>${match}</ul>`);
  
  // 处理表格
  html = html.replace(
    /\|(.+)\|\n\|[-|]+\|\n((?:\|.+\|\n)+)/g,
    (_, header, rows) => {
      const headers = header.split('|').filter((s: string) => s.trim()).map((s: string) => `<th>${s.trim()}</th>`).join('');
      const bodyRows = rows.trim().split('\n').map((row: string) => {
        const cells = row.split('|').filter((s: string) => s.trim()).map((s: string) => `<td>${s.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }
  );
  
  // 处理段落（简单处理：连续的非标签文本）
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inParagraph = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isHtmlTag = /^<[a-z]|^<\/[a-z]/i.test(line);
    const isEmpty = line === '';
    
    if (isEmpty) {
      if (inParagraph) {
        processedLines.push('</p>');
        inParagraph = false;
      }
      processedLines.push('');
    } else if (isHtmlTag) {
      if (inParagraph) {
        processedLines.push('</p>');
        inParagraph = false;
      }
      processedLines.push(line);
    } else {
      if (!inParagraph) {
        processedLines.push('<p>');
        inParagraph = true;
      }
      processedLines.push(line);
    }
  }
  
  if (inParagraph) {
    processedLines.push('</p>');
  }
  
  return processedLines.join('\n');
}

// 生成 HTML 头部和样式
function generateHtmlHead(title: string, siteTitle: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${siteTitle}</title>
  <style>
    :root {
      --primary-color: #F39C12;
      --secondary-color: #5A4FCF;
      --accent-color: #E91E63;
      --text-color: #333;
      --bg-color: #fff;
      --border-color: #e0e0e0;
      --code-bg: #f5f5f5;
      --tip-bg: #e8f5e9;
      --tip-border: #4caf50;
      --note-bg: #e3f2fd;
      --note-border: #2196f3;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.7;
      color: var(--text-color);
      background: var(--bg-color);
    }
    
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: 280px;
      height: 100vh;
      background: #fafafa;
      border-right: 1px solid var(--border-color);
      padding: 1.5rem;
      overflow-y: auto;
    }
    
    .sidebar-header {
      font-size: 1.25rem;
      font-weight: bold;
      color: var(--primary-color);
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid var(--primary-color);
    }
    
    .sidebar-nav {
      list-style: none;
    }
    
    .sidebar-nav li {
      margin-bottom: 0.25rem;
    }
    
    .sidebar-nav a {
      color: var(--text-color);
      text-decoration: none;
      display: block;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      transition: all 0.2s;
      font-size: 0.9rem;
    }
    
    .sidebar-nav a:hover {
      background: #eee;
      color: var(--primary-color);
    }
    
    .sidebar-nav a.active {
      background: var(--primary-color);
      color: white;
    }
    
    .sidebar-nav .category {
      font-weight: 600;
      color: var(--secondary-color);
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .main-content {
      margin-left: 300px;
      padding: 2rem 3rem;
      max-width: 900px;
    }
    
    h1 {
      font-size: 2rem;
      color: var(--secondary-color);
      margin-bottom: 1.5rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid var(--primary-color);
    }
    
    h2 {
      font-size: 1.5rem;
      color: var(--secondary-color);
      margin-top: 2.5rem;
      margin-bottom: 1rem;
    }
    
    h3 {
      font-size: 1.2rem;
      color: #444;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
    }
    
    p {
      margin-bottom: 1rem;
    }
    
    ul, ol {
      margin-bottom: 1rem;
      padding-left: 1.5rem;
    }
    
    li {
      margin-bottom: 0.5rem;
    }
    
    code {
      background: var(--code-bg);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.9em;
    }
    
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    
    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5rem;
    }
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }
    
    th {
      background: #f5f5f5;
      font-weight: 600;
    }
    
    .step-screenshot {
      max-width: 100%;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      margin: 1.5rem 0;
      border: 1px solid var(--border-color);
    }
    
    .tip {
      background: var(--tip-bg);
      border-left: 4px solid var(--tip-border);
      padding: 1rem 1.25rem;
      margin: 1.5rem 0;
      border-radius: 0 8px 8px 0;
    }
    
    .note {
      background: var(--note-bg);
      border-left: 4px solid var(--note-border);
      padding: 1rem 1.25rem;
      margin: 1.5rem 0;
      border-radius: 0 8px 8px 0;
    }
    
    .footer {
      margin-top: 4rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border-color);
      text-align: center;
      color: #666;
      font-size: 0.9rem;
    }
    
    a {
      color: var(--secondary-color);
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }
      .main-content {
        margin-left: 0;
        padding: 1rem;
      }
    }
  </style>
</head>`;
}

// 生成侧边栏导航
function generateSidebar(pages: Page[], config: Config, currentSlug: string): string {
  // 按分类组织页面
  const byCategory = new Map<string, Page[]>();
  let indexPage: Page | null = null;
  
  for (const page of pages) {
    if (page.slug === 'index') {
      indexPage = page;
      continue;
    }
    const category = page.meta.category || 'advanced';
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(page);
  }
  
  // 按分类顺序和页面顺序排序
  const sortedCategories = Array.from(byCategory.entries())
    .sort((a, b) => {
      const orderA = config.categories[a[0]]?.order || 999;
      const orderB = config.categories[b[0]]?.order || 999;
      return orderA - orderB;
    });
  
  for (const [, categoryPages] of sortedCategories) {
    categoryPages.sort((a, b) => (a.meta.order || 0) - (b.meta.order || 0));
  }
  
  let html = '<nav class="sidebar">\n';
  html += `<div class="sidebar-header">🎨 ${config.site.title}</div>\n`;
  html += '<ul class="sidebar-nav">\n';
  
  // 首页链接
  if (indexPage) {
    const isActive = currentSlug === 'index' ? ' class="active"' : '';
    html += `<li><a href="index.html"${isActive}><strong>首页</strong></a></li>\n`;
  }
  
  // 分类和页面
  for (const [categoryId, categoryPages] of sortedCategories) {
    const categoryName = config.categories[categoryId]?.name || categoryId;
    html += `<li class="category">${categoryName}</li>\n`;
    
    for (const page of categoryPages) {
      const isActive = currentSlug === page.slug ? ' class="active"' : '';
      html += `<li><a href="${page.slug}.html"${isActive}>${page.meta.title}</a></li>\n`;
    }
  }
  
  html += '</ul>\n</nav>';
  return html;
}

// 生成单个页面
function generatePage(page: Page, allPages: Page[], config: Config, version: string): string {
  let html = generateHtmlHead(page.meta.title, config.site.title);
  
  html += `
<body>
${generateSidebar(allPages, config, page.slug)}
<main class="main-content">
  <article>
    ${page.html}
  </article>
  
  <footer class="footer">
    <p>${config.site.title} v${version}</p>
    <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
  </footer>
</main>
</body>
</html>`;

  return html;
}

// 复制截图文件
function copyScreenshots(sourceDir: string, outputDir: string): number {
  if (!fs.existsSync(sourceDir)) {
    console.log(`⚠️  截图源目录不存在: ${sourceDir}`);
    return 0;
  }
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const files = fs.readdirSync(sourceDir);
  let copied = 0;
  
  for (const file of files) {
    if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
      const sourcePath = path.join(sourceDir, file);
      // 从文件名提取 ID（去掉哈希后缀）
      let targetName = file;
      // 处理带哈希的文件名，如 "ai-step-0-abc123.png" -> "ai-step-0.png"
      const hashMatch = file.match(/^(.+)-[a-f0-9]{8,}\.png$/);
      if (hashMatch) {
        targetName = `${hashMatch[1]}.png`;
      }
      const targetPath = path.join(outputDir, targetName);
      fs.copyFileSync(sourcePath, targetPath);
      copied++;
    }
  }
  
  return copied;
}

// 从 E2E 测试结果目录复制新截图
function copyE2EScreenshots(outputDir: string): number {
  const e2eScreenshotsDir = path.join(process.cwd(), 'apps', 'web-e2e', 'test-results', 'manual-screenshots');
  
  if (!fs.existsSync(e2eScreenshotsDir)) {
    console.log(`ℹ️  E2E 截图目录不存在: ${e2eScreenshotsDir}`);
    console.log(`   运行 'pnpm manual:screenshots' 生成截图`);
    return 0;
  }
  
  const copied = copyScreenshots(e2eScreenshotsDir, outputDir);
  if (copied > 0) {
    console.log(`📷 从 E2E 测试结果复制了 ${copied} 个截图`);
  }
  return copied;
}

// 从 E2E 测试结果复制 GIF 文件
function copyE2EGifs(outputDir: string): number {
  const gifsOutputDir = path.join(outputDir, 'gifs');
  const e2eTestResults = path.join(process.cwd(), 'apps', 'web-e2e', 'test-results');
  
  if (!fs.existsSync(e2eTestResults)) {
    return 0;
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(gifsOutputDir)) {
    fs.mkdirSync(gifsOutputDir, { recursive: true });
  }
  
  let copied = 0;
  
  // 递归查找所有 GIF 文件
  function findGifs(dir: string) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        findGifs(fullPath);
      } else if (item.endsWith('.gif')) {
        // 从目录名提取有意义的文件名
        const parentDir = path.basename(path.dirname(fullPath));
        let targetName = item;
        
        // 如果是 E2E 生成的目录，提取测试名称作为文件名
        if (parentDir.includes('manual-gen')) {
          const match = parentDir.match(/GIF-动图录制-(.+?)-manual/);
          if (match) {
            targetName = match[1].replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '-') + '.gif';
          }
        }
        
        const targetPath = path.join(gifsOutputDir, targetName);
        fs.copyFileSync(fullPath, targetPath);
        copied++;
      }
    }
  }
  
  // 也检查 gifs 目录（如果 video-to-gif.js 已经生成了）
  const gifsSourceDir = path.join(process.cwd(), 'apps', 'web', 'public', 'user-manual', 'gifs');
  if (fs.existsSync(gifsSourceDir)) {
    const files = fs.readdirSync(gifsSourceDir);
    for (const file of files) {
      if (file.endsWith('.gif')) {
        const sourcePath = path.join(gifsSourceDir, file);
        const targetPath = path.join(gifsOutputDir, file);
        fs.copyFileSync(sourcePath, targetPath);
        copied++;
      }
    }
  }
  
  findGifs(e2eTestResults);
  
  if (copied > 0) {
    console.log(`🎬 复制了 ${copied} 个 GIF 动图`);
  }
  return copied;
}

// 主函数
async function main() {
  const manualDir = path.join(process.cwd(), 'docs', 'user-manual');
  const contentDir = path.join(manualDir, 'content');
  const configPath = path.join(manualDir, 'config.yaml');
  
  console.log('🔍 读取配置...');
  
  // 读取配置
  if (!fs.existsSync(configPath)) {
    console.error('❌ 配置文件不存在:', configPath);
    process.exit(1);
  }
  
  const config = readConfig(configPath);
  const version = getVersion();
  
  // 解析输出目录路径
  const outputDir = path.resolve(manualDir, config.output.dir);
  const screenshotsOutputDir = path.join(outputDir, 'screenshots');
  const screenshotsSourceDir = path.resolve(manualDir, config.screenshots.source);
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`📦 版本: ${version}`);
  console.log(`📁 内容目录: ${contentDir}`);
  console.log(`📁 输出目录: ${outputDir}`);
  
  // 查找所有 MDX 文件
  const mdxFiles = await glob('**/*.mdx', { cwd: contentDir });
  console.log(`📄 找到 ${mdxFiles.length} 个 MDX 文件`);
  
  if (mdxFiles.length === 0) {
    console.error('❌ 没有找到 MDX 文件');
    process.exit(1);
  }
  
  // 解析所有页面
  const pages: Page[] = [];
  
  for (const mdxFile of mdxFiles) {
    const filePath = path.join(contentDir, mdxFile);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // 解析 frontmatter
    const { data, content } = matter(fileContent);
    const meta = data as PageMeta;
    
    // 生成 slug
    const slug = mdxFile
      .replace(/\.mdx$/, '')
      .replace(/\//g, '-')
      .replace(/^-/, '');
    
    // 转换 Markdown 为 HTML
    const html = markdownToHtml(content, screenshotsOutputDir);
    
    pages.push({
      slug: slug === 'index' ? 'index' : slug,
      filePath,
      meta,
      content,
      html,
    });
  }
  
  // 生成 HTML 文件
  for (const page of pages) {
    const pageHtml = generatePage(page, pages, config, version);
    const outputPath = path.join(outputDir, `${page.slug}.html`);
    fs.writeFileSync(outputPath, pageHtml);
    console.log(`✅ 生成: ${page.slug}.html`);
  }
  
  // 先从 E2E 测试结果复制新截图（如果存在）
  const e2eCopied = copyE2EScreenshots(screenshotsOutputDir);
  
  // 再从配置的源目录复制（可能有一些非 E2E 生成的截图）
  const sourceCopied = copyScreenshots(screenshotsSourceDir, screenshotsOutputDir);
  if (sourceCopied > 0) {
    console.log(`📷 从源目录复制了 ${sourceCopied} 个截图`);
  }
  
  // 复制 GIF 动图
  copyE2EGifs(outputDir);
  
  console.log(`\n🎉 用户手册生成完成！`);
  console.log(`📁 输出目录: ${outputDir}`);
  console.log(`📄 共 ${pages.length} 个页面`);
}

main().catch(console.error);
