import { test, expect } from '@playwright/test';

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Tab indents the current item', async ({ page }) => {
    // Find "Press Tab to indent" and click it
    const editor = page.locator('.outline-editor').filter({ hasText: /^Press Tab to indent$/ });
    await editor.click();

    // Get the focused outline-item (the one with .focused class directly)
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

  test('Shift+Tab outdents the current item', async ({ page }) => {
    // Find "Press Shift+Tab to outdent" and click it (it should be at depth 2 initially)
    const editor = page.locator('.outline-editor').filter({ hasText: /^Press Shift\+Tab to outdent$/ });
    await editor.click();

    // Get the focused outline-item
    const focusedItem = page.locator('.outline-item.focused');
    const initialStyle = await focusedItem.getAttribute('style');
    const initialMargin = parseInt(initialStyle?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    // We need it to be indented first - if margin is 0, indent it first
    if (initialMargin === 0) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }

    const beforeOutdent = await focusedItem.getAttribute('style');
    const beforeMargin = parseInt(beforeOutdent?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    // Press Shift+Tab to outdent
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // Check that the margin decreased
    const newStyle = await focusedItem.getAttribute('style');
    const newMargin = parseInt(newStyle?.match(/margin-left:\s*(\d+)px/)?.[1] || '0');

    expect(newMargin).toBeLessThan(beforeMargin);
  });

  test('Enter creates a new sibling item', async ({ page }) => {
    // Count initial items
    const initialCount = await page.locator('.outline-item').count();

    // Click on first root item to focus it
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();

    // Press Enter to create new sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Check that a new item was created
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount + 1);
  });

  test('Arrow keys navigate between items', async ({ page }) => {
    // Click on first item to focus it
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(50);

    // Get the focused item's text (use first() to avoid strict mode issues)
    const focusedBefore = await page.locator('.outline-item.focused .outline-editor').first().textContent();

    // Press Down to move to next item
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Check that focus moved to a different item
    const focusedAfter = await page.locator('.outline-item.focused .outline-editor').first().textContent();
    expect(focusedAfter).not.toBe(focusedBefore);
  });
});
