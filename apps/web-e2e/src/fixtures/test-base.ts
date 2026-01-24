/**
 * Playwright 测试基类
 * 自动收集 console error/warning 日志：
 * - error 视为失败
 * - warning 记录为告警（不失败）
 */
import { test as base, expect, type ConsoleMessage } from '@playwright/test';
 
type ConsoleLogBucket = {
  errors: string[];
  warnings: string[];
};
 
export const test = base.extend<{ consoleLogs: ConsoleLogBucket }>({
  consoleLogs: async ({ page }, use, testInfo) => {
    const logs: ConsoleLogBucket = { errors: [], warnings: [] };
 
    const onConsole = (msg: ConsoleMessage) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        logs.errors.push(text);
        return;
      }
      if (msg.type() === 'warning') {
        logs.warnings.push(text);
      }
    };
 
    const onPageError = (error: Error) => {
      logs.errors.push(error.message);
    };
 
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
 
    await use(logs);
 
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
 
    if (logs.warnings.length > 0) {
      await testInfo.attach('console-warnings', {
        body: JSON.stringify(logs.warnings, null, 2),
        contentType: 'application/json',
      });
    }
 
    if (logs.errors.length > 0) {
      await testInfo.attach('console-errors', {
        body: JSON.stringify(logs.errors, null, 2),
        contentType: 'application/json',
      });
      throw new Error(`检测到 console error: ${logs.errors.join(' | ')}`);
    }
  },
});
 
export { expect };
