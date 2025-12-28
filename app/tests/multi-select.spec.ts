import { test, expect } from '@playwright/test';

test.describe('Multi-select', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl-click toggles selection on an item', async ({ page }) => {
    // Use editor-wrapper like other tests do
    const editors = page.locator('.editor-wrapper');
    const firstEditor = editors.first();
    const secondEditor = editors.nth(1);

    // Ctrl-click on first item to select it
    await firstEditor.click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);

    // First outline-item should be selected
    const firstItem = page.locator('.outline-item').first();
    await expect(firstItem).toHaveClass(/selected/);

    // Ctrl-click on second item to add to selection
    await secondEditor.click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);

    // Both items should be selected
    const secondItem = page.locator('.outline-item').nth(1);
    await expect(firstItem).toHaveClass(/selected/);
    await expect(secondItem).toHaveClass(/selected/);
  });

  test('Ctrl-click again deselects an item', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    const firstItem = page.locator('.outline-item').first();

    // Ctrl-click to select
    await firstEditor.click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);
    await expect(firstItem).toHaveClass(/selected/);

    // Ctrl-click again to deselect
    await firstEditor.click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);
    await expect(firstItem).not.toHaveClass(/selected/);
  });

  test('regular click clears selection', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    const firstItem = page.locator('.outline-item').first();
    const secondItem = page.locator('.outline-item').nth(1);

    // Ctrl-click to select first item
    await editors.first().click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);
    await expect(firstItem).toHaveClass(/selected/);

    // Regular click on second item should clear selection
    await editors.nth(1).click();
    await page.waitForTimeout(50);

    // Neither should be selected now
    await expect(firstItem).not.toHaveClass(/selected/);
    await expect(secondItem).not.toHaveClass(/selected/);
  });

  test('Shift-click selects range of items', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    const items = page.locator('.outline-item');

    // Focus the first item
    await editors.first().click();
    await page.waitForTimeout(50);

    // Verify first item is focused
    await expect(items.first()).toHaveClass(/focused/);

    // Shift-click on second item to select range (first and second)
    await editors.nth(1).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(50);

    // First two items should be selected
    await expect(items.first()).toHaveClass(/selected/);
    await expect(items.nth(1)).toHaveClass(/selected/);
  });

  test('Escape clears selection', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    const firstItem = page.locator('.outline-item').first();

    // Ctrl-click to select first item
    await firstEditor.click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);
    await expect(firstItem).toHaveClass(/selected/);

    // Press Escape to clear selection
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);

    await expect(firstItem).not.toHaveClass(/selected/);
  });

  test('Ctrl+A selects all items', async ({ page }) => {
    const items = page.locator('.outline-item');

    // First blur any editor (click somewhere neutral)
    await page.locator('.content-area').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(50);

    // Press Ctrl+A to select all
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // All items should be selected
    const itemCount = await items.count();
    for (let i = 0; i < itemCount; i++) {
      await expect(items.nth(i)).toHaveClass(/selected/);
    }
  });

  test('selected items have visual styling', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    const firstItem = page.locator('.outline-item').first();

    // Ctrl-click to select
    await firstEditor.click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);

    // Check that selected class is applied
    await expect(firstItem).toHaveClass(/selected/);

    // The item-row should have an outline (from our CSS)
    const itemRow = firstItem.locator('.item-row').first();
    const outline = await itemRow.evaluate(el => getComputedStyle(el).outline);
    expect(outline).not.toBe('none');
  });

  test('selection is distinct from focus styling', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    const firstItem = page.locator('.outline-item').first();
    const secondItem = page.locator('.outline-item').nth(1);

    // Focus second item normally
    await editors.nth(1).click();
    await page.waitForTimeout(50);

    // Second should be focused (not selected)
    await expect(secondItem).toHaveClass(/focused/);
    await expect(secondItem).not.toHaveClass(/selected/);

    // Ctrl-click first item to select it
    await editors.first().click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);

    // First is selected and focused, second is neither
    await expect(firstItem).toHaveClass(/selected/);
    await expect(firstItem).toHaveClass(/focused/);
    await expect(secondItem).not.toHaveClass(/focused/);
  });
});
