import { test, expect } from '@playwright/test';

test.describe('Checkboxes and completion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+Shift+X converts bullet to checkbox', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type some text
    await page.keyboard.type('My task');
    await page.waitForTimeout(100);

    // It should be a bullet by default
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem.locator('.bullet')).toBeVisible();

    // Press Ctrl+Shift+X to convert to checkbox
    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    // Should now have a checkbox, not a bullet
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    await expect(focusedItem.locator('.bullet')).not.toBeVisible();
  });

  test('Ctrl+Shift+X converts checkbox back to bullet', async ({ page }) => {
    // Create a new item and convert to checkbox
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('My task');
    await page.waitForTimeout(100);

    // Convert to checkbox
    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();

    // Convert back to bullet
    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    // Should now have bullet again
    await expect(focusedItem.locator('.bullet')).toBeVisible();
    await expect(focusedItem.locator('.checkbox-btn')).not.toBeVisible();
  });

  test('Ctrl+Enter toggles completion', async ({ page }) => {
    // Create a new item and make it a checkbox
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Task to complete');
    await page.waitForTimeout(100);

    // Convert to checkbox
    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    const checkboxIcon = focusedItem.locator('.checkbox-icon');

    // Initially unchecked
    await expect(checkboxIcon).not.toHaveClass(/checked/);
    await expect(focusedItem).not.toHaveClass(/checked/);

    // Press Ctrl+Enter to complete
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    // Should now be checked
    await expect(checkboxIcon).toHaveClass(/checked/);
    await expect(focusedItem).toHaveClass(/checked/);
  });

  test('Ctrl+Enter toggles completion off', async ({ page }) => {
    // Create, convert, and complete an item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Task');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    // Complete it
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toHaveClass(/checked/);

    // Toggle off
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    await expect(focusedItem).not.toHaveClass(/checked/);
  });

  test('typing [ ] converts to checkbox', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type [ ] followed by space
    await page.keyboard.type('[ ] ', { delay: 50 });
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    // Should be converted to checkbox
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    // And should be unchecked
    await expect(focusedItem.locator('.checkbox-icon')).not.toHaveClass(/checked/);
  });

  test('typing [x] converts to checked checkbox', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type [x] followed by space
    await page.keyboard.type('[x] ', { delay: 50 });
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    // Should be converted to checkbox
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    // And should be checked
    await expect(focusedItem.locator('.checkbox-icon')).toHaveClass(/checked/);
  });

  test('completed items show strikethrough', async ({ page }) => {
    // Create and complete an item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Completed task');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    // Check that the item has the checked class which applies strikethrough
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toHaveClass(/checked/);

    // The editor content should have strikethrough via CSS
    const editor = focusedItem.locator('.outline-editor');
    const textDecoration = await editor.evaluate((el) => {
      return window.getComputedStyle(el).textDecoration;
    });
    expect(textDecoration).toContain('line-through');
  });

  test('clicking checkbox toggles completion', async ({ page }) => {
    // Create a checkbox item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Click test');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    const checkboxBtn = focusedItem.locator('.checkbox-btn');

    // Click to check
    await checkboxBtn.click();
    await page.waitForTimeout(100);

    await expect(focusedItem).toHaveClass(/checked/);

    // Click again to uncheck
    await checkboxBtn.click();
    await page.waitForTimeout(100);

    await expect(focusedItem).not.toHaveClass(/checked/);
  });

  test('checkbox shows check mark when completed', async ({ page }) => {
    // Create a checkbox item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Visual test');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    const checkboxIcon = focusedItem.locator('.checkbox-icon');

    // Initially no checkmark
    await expect(checkboxIcon).toHaveText('');

    // Complete it
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    // Should show checkmark
    await expect(checkboxIcon).toHaveText('✓');
  });
});
