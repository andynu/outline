import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Arrow Down moves focus to next item', async ({ page }) => {
    // Click on first item to focus it
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Get the focused item's text
    const focusedBefore = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    // Press ArrowDown to move to next item
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Check that focus moved to a different item
    const focusedAfter = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(focusedAfter).not.toBe(focusedBefore);
  });

  test('Arrow Up moves focus to previous item', async ({ page }) => {
    // Click on second item to focus it (so we can go up)
    const editors = page.locator('.editor-wrapper');
    await editors.nth(1).click();
    await page.waitForTimeout(100);

    // Get the focused item's text
    const focusedBefore = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    // Press ArrowUp to move to previous item
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Check that focus moved to a different item
    const focusedAfter = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(focusedAfter).not.toBe(focusedBefore);
  });

  test('Arrow Down from first item moves to second item', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');

    // Click on first item
    await editors.first().click();
    await page.waitForTimeout(100);

    const firstItemText = await editors.first().textContent();

    // Press ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // The focused item should now be the second item
    const secondItemText = await editors.nth(1).textContent();
    const focusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    expect(focusedText).not.toBe(firstItemText);
    expect(focusedText).toBe(secondItemText);
  });

  test('Arrow Up from second item moves to first item', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');

    // Click on second item
    await editors.nth(1).click();
    await page.waitForTimeout(100);

    // Press ArrowUp
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // The focused item should now be the first item
    const firstItemText = await editors.first().textContent();
    const focusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    expect(focusedText).toBe(firstItemText);
  });

  test('focused item has visual indicator', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');

    // Click on first item
    await editors.first().click();
    await page.waitForTimeout(100);

    // Check that exactly one item has the focused class
    const focusedItems = page.locator('.outline-item.focused');
    await expect(focusedItems).toHaveCount(1);
  });

  test('navigation changes which item has focused class', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');

    // Click on first item
    await editors.first().click();
    await page.waitForTimeout(100);

    // Get the first focused item's id via data attribute or text
    const focusedItem1 = page.locator('.outline-item.focused');
    const text1 = await focusedItem1.locator('.editor-wrapper').first().textContent();

    // Navigate down
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Get the second focused item
    const focusedItem2 = page.locator('.outline-item.focused');
    const text2 = await focusedItem2.locator('.editor-wrapper').first().textContent();

    // Should be different items
    expect(text1).not.toBe(text2);

    // Navigate back up
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Should be back to first item
    const focusedItem3 = page.locator('.outline-item.focused');
    const text3 = await focusedItem3.locator('.editor-wrapper').first().textContent();
    expect(text3).toBe(text1);
  });

  test('Arrow Up at first item stays on first item', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');

    // Click on first item
    await editors.first().click();
    await page.waitForTimeout(100);

    const firstItemText = await editors.first().textContent();

    // Press ArrowUp - should stay on first item
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Should still be on first item
    const focusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(focusedText).toBe(firstItemText);
  });

  test('Arrow Down at last item stays on last item', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    const count = await editors.count();

    // Click on last item
    await editors.last().click();
    await page.waitForTimeout(100);

    const lastItemText = await editors.last().textContent();

    // Press ArrowDown - should stay on last item
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Should still be on last item
    const focusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(focusedText).toBe(lastItemText);
  });

  test('Arrow Down after zoom-in selects first child', async ({ page }) => {
    // First create a nested structure - create children under first item
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Create a child by pressing Enter then Tab to indent
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item 1');
    await page.keyboard.press('Tab'); // Indent to become child
    await page.waitForTimeout(100);

    // Create another child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item 2');
    await page.waitForTimeout(100);

    // Go back to parent and zoom into it
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);  // Wait for editor to mount after focus change
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);

    // Now zoom in with Ctrl+]
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(200);

    // After zooming, the zoomed node's children should be visible
    // Verify we can see the zoom breadcrumbs
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // At this point, focusedId points to the zoomed node which is NOT visible
    // (only its children are visible). Press ArrowDown should select first child.
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Verify the first child is now focused
    const focusedItem = page.locator('.outline-item.focused .editor-wrapper');
    await expect(focusedItem).toContainText('Child item 1');
  });
});
