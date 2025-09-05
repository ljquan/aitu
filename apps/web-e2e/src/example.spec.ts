import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect h1 to contain a substring.
  expect(await page.title()).toContain('AI图片视频创作');
  expect(page.locator('drawnix')).toBeTruthy();
});
