import { test, expect } from '@playwright/test';

test.describe('Drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('drag handle is visible on hover', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.hover();
    await page.waitForTimeout(100);

    // Use direct child selector to avoid nested items' drag handles
    const dragHandle = firstItem.locator('> .item-row > .drag-handle');
    await expect(dragHandle).toBeVisible();
  });

  test('drag handle has draggable attribute', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    const dragHandle = firstItem.locator('> .item-row > .drag-handle');

    await expect(dragHandle).toHaveAttribute('draggable', 'true');
  });

  test('dragging adds dragging class to item', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    const dragHandle = firstItem.locator('> .item-row > .drag-handle');

    // Start drag
    await dragHandle.hover();
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Move to trigger drag
    await page.mouse.move(100, 200);
    await page.waitForTimeout(100);

    // Check for dragging class
    await expect(firstItem).toHaveClass(/dragging/);

    // End drag
    await page.mouse.up();
  });

  test('can start drag on second item', async ({ page }) => {
    // Get items - need to get them at root level only
    const items = page.locator('.outline-container > .outline-item');
    const secondItem = items.nth(1);
    const dragHandle = secondItem.locator('> .item-row > .drag-handle');

    // Start dragging second item
    await dragHandle.hover();
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Move to trigger drag
    await page.mouse.move(100, 200);
    await page.waitForTimeout(100);

    // Check for dragging class on the second item
    await expect(secondItem).toHaveClass(/dragging/);

    // End drag
    await page.mouse.up();
  });

  test('cannot drop item on itself', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    const dragHandle = firstItem.locator('> .item-row > .drag-handle');
    const initialText = await firstItem.locator('> .item-row .editor-wrapper').first().textContent();

    // Try to drag item onto itself
    const box = await firstItem.boundingBox();
    if (box) {
      await dragHandle.hover();
      await page.mouse.down();
      await page.waitForTimeout(100);

      // Move within the same item
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);

      // Drop
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Item should still be first and unchanged
      const newText = await page.locator('.outline-item').first().locator('> .item-row .editor-wrapper').first().textContent();
      expect(newText).toBe(initialText);
    }
  });

  test('drag state clears after drop', async ({ page }) => {
    const items = page.locator('.outline-container > .outline-item');
    const firstItem = items.first();
    const dragHandle = firstItem.locator('> .item-row > .drag-handle');

    // Start and complete a drag
    const box = await firstItem.boundingBox();
    if (box) {
      await dragHandle.hover();
      await page.mouse.down();
      await page.waitForTimeout(100);

      // Move somewhere
      await page.mouse.move(box.x + 50, box.y + 100);
      await page.waitForTimeout(100);

      // Drop
      await page.mouse.up();
      await page.waitForTimeout(100);

      // The dragging class should be removed
      await expect(firstItem).not.toHaveClass(/dragging/);
    }
  });
});
