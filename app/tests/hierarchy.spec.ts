import { test, expect } from '@playwright/test';

test.describe('Hierarchy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Tab indents item under previous sibling', async ({ page }) => {
    // Find "Press Tab to indent" and click it
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await editor.click();
    await page.waitForTimeout(100);

    // Get the focused outline-item
    const focusedItem = page.locator('.outline-item.focused');
    const initialStyle = await focusedItem.getAttribute('style');
    const initialMargin = parseInt(initialStyle?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    // Press Tab to indent
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Check that the margin increased (item is now more indented)
    const newStyle = await focusedItem.getAttribute('style');
    const newMargin = parseInt(newStyle?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    expect(newMargin).toBeGreaterThan(initialMargin);
  });

  test('Shift+Tab outdents item to parent level', async ({ page }) => {
    // First, indent an item so we can outdent it
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await editor.click();
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');

    // Ensure it's indented first
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    const beforeOutdent = await focusedItem.getAttribute('style');
    const beforeMargin = parseInt(beforeOutdent?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');
    expect(beforeMargin).toBeGreaterThan(0);

    // Press Shift+Tab to outdent
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // Check that the margin decreased
    const newStyle = await focusedItem.getAttribute('style');
    const newMargin = parseInt(newStyle?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    expect(newMargin).toBeLessThan(beforeMargin);
  });

  test('expand button shows on items with children', async ({ page }) => {
    // Find an item that has children - "Getting Started" has children
    const gettingStarted = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();

    // Check that it has an expand button
    const expandBtn = gettingStarted.locator('.expand-btn').first();
    await expect(expandBtn).toBeVisible();
  });

  test('collapse button hides children', async ({ page }) => {
    // Find "Getting Started" which has children
    const gettingStartedRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();

    // Find its expand button (should show ▼ indicating expanded)
    const expandBtn = gettingStartedRow.locator('.expand-btn').first();
    await expect(expandBtn).toBeVisible();

    // Check that children are visible before collapse
    // "Press Enter to create a new item" is a child of "Getting Started"
    const childItem = page.locator('.editor-wrapper').filter({ hasText: 'Press Enter to create a new item' });
    await expect(childItem).toBeVisible();

    // Click to collapse
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Children should now be hidden
    await expect(childItem).not.toBeVisible();
  });

  test('expand button shows children', async ({ page }) => {
    // First collapse "Getting Started"
    const gettingStartedRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const expandBtn = gettingStartedRow.locator('.expand-btn').first();

    // Collapse
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Verify collapsed
    const childItem = page.locator('.editor-wrapper').filter({ hasText: 'Press Enter to create a new item' });
    await expect(childItem).not.toBeVisible();

    // Now click to expand
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Children should be visible again
    await expect(childItem).toBeVisible();
  });

  test('collapse indicator shows correct state', async ({ page }) => {
    const gettingStartedRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const expandBtn = gettingStartedRow.locator('.expand-btn').first();

    // Initially expanded - should show ▼
    const expandIcon = expandBtn.locator('.expand-icon');
    await expect(expandIcon).toHaveText('▼');

    // Collapse
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Should now show ▶
    await expect(expandIcon).toHaveText('▶');

    // Expand again
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Should show ▼ again
    await expect(expandIcon).toHaveText('▼');
  });

  test('items without children have no expand button', async ({ page }) => {
    // Find an item that definitely has no children - "Welcome to Outline" is at root with no children
    const welcomeItem = page.locator('.outline-item').filter({ hasText: /^Welcome to Outline$/ }).first();

    // Check that it has no expand button
    const expandBtn = welcomeItem.locator('.expand-btn');
    await expect(expandBtn).toHaveCount(0);
  });

  test('multiple indent/outdent cycles work correctly', async ({ page }) => {
    // Create a new item so we have a clean slate
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');

    // Get initial margin
    const initial = await focusedItem.getAttribute('style');
    const initialMargin = parseInt(initial?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    // Indent twice
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    const afterTwoIndents = await focusedItem.getAttribute('style');
    const marginAfterIndent = parseInt(afterTwoIndents?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');
    expect(marginAfterIndent).toBeGreaterThan(initialMargin);

    // Outdent twice
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(50);
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    const afterOutdent = await focusedItem.getAttribute('style');
    const finalMargin = parseInt(afterOutdent?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    // Should be back to around initial margin
    expect(finalMargin).toBeLessThanOrEqual(initialMargin);
  });
});
