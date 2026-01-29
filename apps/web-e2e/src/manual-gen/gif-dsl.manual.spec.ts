/**
 * GIF DSL 录制测试
 * 
 * 使用 DSL 定义批量录制用户手册 GIF
 * 
 * 使用方法：
 *   pnpm manual:gif:all     # 录制所有 GIF
 *   pnpm manual:gif:one <id>  # 录制指定 GIF
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { GifExecutor } from './gif-executor';
import {
  loadAllGifDefinitions,
  loadGifDefinition,
  createManifest,
  saveManifest,
  findLatestVideo,
} from './gif-manifest';
import { GifDefinition } from './gif-types';

// 从环境变量获取要录制的 GIF ID
const TARGET_GIF_ID = process.env.GIF_ID;

test.describe('GIF DSL 录制', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待应用加载
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    // 等待 UI 完全稳定
    await page.waitForTimeout(2000);
  });

  test('录制所有 GIF', async ({ page }) => {
    // 如果指定了特定 GIF，跳过此测试
    if (TARGET_GIF_ID) {
      test.skip();
      return;
    }

    const definitions = loadAllGifDefinitions();
    
    if (definitions.length === 0) {
      console.log('⚠️ 没有找到 GIF 定义文件');
      console.log('   请在 apps/web-e2e/src/manual-gen/gifs/ 目录创建 *.gif.json 文件');
      return;
    }

    console.log(`\n📚 加载了 ${definitions.length} 个 GIF 定义\n`);

    const executor = new GifExecutor();
    const segments = await executor.executeAll(page, definitions);

    // 保存时间清单
    // 注意：视频路径需要在测试完成后从 test-results 目录获取
    const testResultsDir = 'apps/web-e2e/test-results';
    
    // 等待一小段时间确保视频写入完成
    await page.waitForTimeout(500);

    // 创建临时清单（视频路径稍后由脚本填充）
    const manifest = createManifest('', segments);
    saveManifest(manifest);

    console.log('\n✅ 所有 GIF 录制完成');
    console.log('   运行以下命令生成 GIF:');
    console.log('   node scripts/video-to-gif.js --manifest apps/web-e2e/test-results/gif-manifest.json');
  });

  test('录制指定 GIF', async ({ page }) => {
    // 只有指定了特定 GIF 才运行此测试
    if (!TARGET_GIF_ID) {
      test.skip();
      return;
    }

    const definition = loadGifDefinition(TARGET_GIF_ID);
    
    if (!definition) {
      console.error(`❌ 未找到 GIF 定义: ${TARGET_GIF_ID}`);
      return;
    }

    console.log(`\n📄 加载 GIF 定义: ${definition.name}\n`);

    const executor = new GifExecutor();
    const segments = await executor.executeAll(page, [definition]);

    // 保存时间清单
    const manifest = createManifest('', segments);
    saveManifest(manifest);

    console.log(`\n✅ GIF 录制完成: ${definition.name}`);
  });
});
