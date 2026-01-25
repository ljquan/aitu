/**
 * GIF 时间清单管理
 * 
 * 用于加载 GIF 定义、保存时间清单
 */

import * as fs from 'fs';
import * as path from 'path';
import { GifDefinition, GifManifest, GifTimeSegment } from './gif-types';

/** GIF 定义目录 */
const GIFS_DIR = path.join(__dirname, 'gifs');

/** 项目根目录 */
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

/** 时间清单输出目录 */
const MANIFEST_OUTPUT_DIR = path.join(PROJECT_ROOT, 'apps/web-e2e/test-results');

/**
 * 加载所有 GIF 定义
 */
export function loadAllGifDefinitions(): GifDefinition[] {
  const definitions: GifDefinition[] = [];

  if (!fs.existsSync(GIFS_DIR)) {
    console.warn(`⚠️ GIF 定义目录不存在: ${GIFS_DIR}`);
    return definitions;
  }

  const files = fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif.json'));

  for (const file of files) {
    try {
      const filePath = path.join(GIFS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const def = JSON.parse(content) as GifDefinition;
      definitions.push(def);
      console.log(`📄 加载 GIF 定义: ${def.name} (${file})`);
    } catch (error) {
      console.error(`❌ 加载 GIF 定义失败: ${file}`, error);
    }
  }

  // 按 id 排序以保证顺序一致
  definitions.sort((a, b) => a.id.localeCompare(b.id));

  return definitions;
}

/**
 * 加载指定的 GIF 定义
 */
export function loadGifDefinition(id: string): GifDefinition | null {
  const definitions = loadAllGifDefinitions();
  return definitions.find(d => d.id === id) || null;
}

/**
 * 加载多个指定的 GIF 定义
 */
export function loadGifDefinitions(ids: string[]): GifDefinition[] {
  const definitions = loadAllGifDefinitions();
  return ids.map(id => definitions.find(d => d.id === id)).filter(Boolean) as GifDefinition[];
}

/**
 * 创建时间清单
 */
export function createManifest(
  videoPath: string,
  segments: GifTimeSegment[]
): GifManifest {
  return {
    videoPath,
    recordedAt: new Date().toISOString(),
    gifs: segments,
  };
}

/**
 * 保存时间清单到文件
 */
export function saveManifest(manifest: GifManifest, outputPath?: string): string {
  const finalPath = outputPath || path.join(MANIFEST_OUTPUT_DIR, 'gif-manifest.json');
  
  // 确保目录存在
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(finalPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n📋 时间清单已保存: ${finalPath}`);
  
  // 打印摘要
  console.log('\n📊 录制摘要:');
  for (const gif of manifest.gifs) {
    const duration = (gif.endTime - gif.startTime).toFixed(1);
    console.log(`   - ${gif.output}: ${gif.startTime.toFixed(1)}s - ${gif.endTime.toFixed(1)}s (${duration}s)`);
  }

  return finalPath;
}

/**
 * 加载时间清单
 */
export function loadManifest(manifestPath: string): GifManifest | null {
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as GifManifest;
  } catch (error) {
    console.error(`❌ 加载时间清单失败: ${manifestPath}`, error);
    return null;
  }
}

/**
 * 查找最新的视频文件
 */
export function findLatestVideo(testResultsDir: string): string | null {
  if (!fs.existsSync(testResultsDir)) {
    return null;
  }

  let latestVideo: string | null = null;
  let latestTime = 0;

  function searchDir(dir: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else if (item.endsWith('.webm')) {
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestVideo = fullPath;
        }
      }
    }
  }

  searchDir(testResultsDir);
  return latestVideo;
}

/**
 * 输出裁剪建议
 */
export function printTrimSuggestions(segments: GifTimeSegment[]): void {
  console.log('\n✂️ 裁剪建议:');
  for (const seg of segments) {
    const startWithBuffer = Math.max(0, seg.startTime - 0.5);
    const duration = seg.endTime - seg.startTime + 0.5;
    console.log(`   ${seg.id}: --trim ${startWithBuffer.toFixed(1)}:${duration.toFixed(1)}`);
  }
}
