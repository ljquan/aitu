/**
 * 用户手册生成助手
 * 提供测试步骤记录和截图管理功能
 */
import { type Page, type TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface ManualStep {
  order: number;
  action: string;
  description: string;
  screenshotPath?: string;
  timestamp: number;
}

export interface ManualMetadata {
  category: string;
  title: string;
  description?: string;
  steps: string[];
  tags?: string[];
}

export class ManualHelper {
  private page: Page;
  private testInfo: TestInfo;
  private steps: ManualStep[] = [];
  private screenshotDir: string;
  private stepCounter = 0;

  constructor(page: Page, testInfo: TestInfo) {
    this.page = page;
    this.testInfo = testInfo;
    this.screenshotDir = path.join('test-results', 'manual-screenshots', testInfo.title.replace(/[^a-zA-Z0-9]/g, '_'));
    
    // 确保截图目录存在
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * 设置文档元数据
   */
  setMetadata(metadata: ManualMetadata) {
    this.testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify(metadata),
    });
  }

  /**
   * 记录一个操作步骤并截图
   */
  async step(action: string, description: string): Promise<void> {
    this.stepCounter++;
    const screenshotName = `step-${this.stepCounter}-${action.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const screenshotPath = path.join(this.screenshotDir, screenshotName);

    // 截图
    await this.page.screenshot({ path: screenshotPath });

    // 记录步骤
    this.steps.push({
      order: this.stepCounter,
      action,
      description,
      screenshotPath,
      timestamp: Date.now(),
    });

    // 附加到测试报告
    await this.testInfo.attach(`步骤 ${this.stepCounter}: ${action}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }

  /**
   * 记录步骤但不截图
   */
  addStep(action: string, description: string): void {
    this.stepCounter++;
    this.steps.push({
      order: this.stepCounter,
      action,
      description,
      timestamp: Date.now(),
    });
  }

  /**
   * 仅截图，用于额外的说明图片
   */
  async screenshot(name: string): Promise<string> {
    const screenshotName = `${name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const screenshotPath = path.join(this.screenshotDir, screenshotName);
    await this.page.screenshot({ path: screenshotPath });
    
    await this.testInfo.attach(name, {
      path: screenshotPath,
      contentType: 'image/png',
    });
    
    return screenshotPath;
  }

  /**
   * 获取所有步骤
   */
  getSteps(): ManualStep[] {
    return this.steps;
  }

  /**
   * 导出步骤为 JSON
   */
  exportSteps(): string {
    return JSON.stringify({
      testTitle: this.testInfo.title,
      steps: this.steps,
      totalSteps: this.steps.length,
      exportTime: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * 保存步骤到文件
   */
  saveSteps(): void {
    const stepsFile = path.join(this.screenshotDir, 'steps.json');
    fs.writeFileSync(stepsFile, this.exportSteps());
  }
}

/**
 * 创建带手册元数据的测试装饰器
 */
export function withManualMetadata(metadata: ManualMetadata) {
  return (testInfo: TestInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify(metadata),
    });
  };
}
