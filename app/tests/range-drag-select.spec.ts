import { test, expect } from '@playwright/test';

/**
 * Helper: get the bounding box of the text-content area of the n-th visible
 * outline item. The item-row layout puts .drag-handle on the left and the
 * editor-wrapper (text) to the right. Drag-select gestures should start
 * anywhere OTHER than the drag-handle, so we target the editor-wrapper.
 */
async function itemTextBox(page: import('@playwright/test').Page, n: number) {
  const items = page.locator('.outline-item');
  // Use `>>` to pick the direct editor-wrapper inside the n-th item's own
  // .item-row, not any descendant item's wrapper.
  const wrapper = items.nth(n).locator('> .item-row > .editor-wrapper');
  const box = await wrapper.boundingBox();
  if (!box) throw new Error(`No boundingBox for item ${n}`);
  return box;
}

test.describe('Click-and-drag range selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
    // Ensure nothing is focused / in edit mode — click a neutral area.
    await page.locator('.content-area').click({ position: { x: 2, y: 2 } });
    await page.waitForTimeout(50);
  });

  test('dragging from one item to another selects the range', async ({ page }) => {
    const items = page.locator('.outline-item');
    const count = await items.count();
    test.skip(count < 3, 'Needs at least 3 outline items in the seed document');

    const firstBox = await itemTextBox(page, 0);
    const thirdBox = await itemTextBox(page, 2);

    // Drag from center of first item's text area to center of third item's.
    const startX = firstBox.x + 20;
    const startY = firstBox.y + firstBox.height / 2;
    const endX = thirdBox.x + 20;
    const endY = thirdBox.y + thirdBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move in small steps so intermediate mousemove listeners fire.
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    // All three items in the drag range should be selected (DFS order).
    await expect(items.nth(0)).toHaveClass(/selected/);
    await expect(items.nth(1)).toHaveClass(/selected/);
    await expect(items.nth(2)).toHaveClass(/selected/);
  });

  test('selection persists after mouseup', async ({ page }) => {
    const items = page.locator('.outline-item');
    const count = await items.count();
    test.skip(count < 2, 'Needs at least 2 outline items');

    const firstBox = await itemTextBox(page, 0);
    const secondBox = await itemTextBox(page, 1);

    await page.mouse.move(firstBox.x + 20, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + 20, secondBox.y + secondBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    await expect(items.nth(0)).toHaveClass(/selected/);
    await expect(items.nth(1)).toHaveClass(/selected/);

    // Persists after a short wait (no async clear).
    await page.waitForTimeout(200);
    await expect(items.nth(0)).toHaveClass(/selected/);
    await expect(items.nth(1)).toHaveClass(/selected/);
  });

  test('plain click (no drag) still focuses the item — gesture does not fire', async ({ page }) => {
    // A click that doesn't exceed the threshold (5px) must NOT trigger
    // range-select; it should fall through to the normal click handler
    // (focus the item, clearing any existing selection).
    const items = page.locator('.outline-item');
    const secondItem = items.nth(1);

    await secondItem.locator('> .item-row > .editor-wrapper').first().click();
    await page.waitForTimeout(80);

    // No items should have the .selected class (focus uses .focused, not .selected).
    const selectedCount = await page.locator('.outline-item.selected').count();
    expect(selectedCount).toBe(0);
  });

  test('drag-to-reorder from drag handle is not hijacked by range-select', async ({ page }) => {
    // Starting a drag on the .drag-handle must still trigger HTML5 reorder-drag
    // (adds .dragging class), not the range-select gesture.
    const items = page.locator('.outline-container > .outline-item');
    const firstItem = items.first();
    const dragHandle = firstItem.locator('> .item-row > .drag-handle');

    await dragHandle.hover();
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(100, 400, { steps: 5 });
    await page.waitForTimeout(50);

    // Reorder drag in progress — item gets .dragging class, no multi-select.
    await expect(firstItem).toHaveClass(/dragging/);
    const selectedCount = await page.locator('.outline-item.selected').count();
    expect(selectedCount).toBe(0);

    await page.mouse.up();
  });

  test('drag upward also selects the range', async ({ page }) => {
    const items = page.locator('.outline-item');
    const count = await items.count();
    test.skip(count < 3, 'Needs at least 3 outline items');

    const firstBox = await itemTextBox(page, 0);
    const thirdBox = await itemTextBox(page, 2);

    // Drag from third item upward to first item.
    await page.mouse.move(thirdBox.x + 20, thirdBox.y + thirdBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(firstBox.x + 20, firstBox.y + firstBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    await expect(items.nth(0)).toHaveClass(/selected/);
    await expect(items.nth(1)).toHaveClass(/selected/);
    await expect(items.nth(2)).toHaveClass(/selected/);
  });
});
