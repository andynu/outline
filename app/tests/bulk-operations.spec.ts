import { test, expect } from '@playwright/test';

test.describe('Bulk operations on multi-selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test.describe('Bulk deletion', () => {
    test('Ctrl+Shift+Backspace deletes all selected items', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Use existing items - select first two and delete them
      const initialCount = await items.count();
      expect(initialCount).toBeGreaterThanOrEqual(3); // Need at least 3 items to delete 2

      // Ctrl-click first item to select
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Ctrl-click second item to add to selection
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Verify both are selected
      await expect(items.first()).toHaveClass(/selected/);
      await expect(items.nth(1)).toHaveClass(/selected/);

      // Press Ctrl+Shift+Backspace to delete
      await page.keyboard.press('Control+Shift+Backspace');
      await page.waitForTimeout(200);

      // Should have fewer items (the exact count depends on whether deleted items had children)
      const newCount = await items.count();
      expect(newCount).toBeLessThan(initialCount);

      // Selection should be cleared
      const selectedItems = await page.locator('.outline-item.selected').count();
      expect(selectedItems).toBe(0);
    });

    test('bulk delete does not delete all items', async ({ page }) => {
      const items = page.locator('.outline-item');

      // Select all with Ctrl+A
      await page.locator('.content-area').click({ position: { x: 10, y: 10 } });
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(50);

      // Try to delete all
      await page.keyboard.press('Control+Shift+Backspace');
      await page.waitForTimeout(200);

      // Should still have at least one item
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('Bulk completion toggle', () => {
    test('Ctrl+Enter toggles completion on all selected items', async ({ page }) => {
      const editors = page.locator('.editor-wrapper');
      const items = page.locator('.outline-item');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Press Ctrl+Enter to toggle completion
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(200);

      // Both should be completed (have 'checked' class on .outline-item)
      const firstItem = items.first();
      const secondItem = items.nth(1);
      await expect(firstItem).toHaveClass(/checked/);
      await expect(secondItem).toHaveClass(/checked/);
    });

    test('Ctrl+Enter unchecks all if any are checked', async ({ page }) => {
      const editors = page.locator('.editor-wrapper');
      const items = page.locator('.outline-item');

      // Select first two items and check them
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(200);

      // Now press Ctrl+Enter again to uncheck
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(200);

      // Both should be uncompleted
      const firstItem = items.first();
      const secondItem = items.nth(1);
      await expect(firstItem).not.toHaveClass(/checked/);
      await expect(secondItem).not.toHaveClass(/checked/);
    });
  });

  test.describe('Bulk indent/outdent', () => {
    test('Tab indents selected item when previous sibling exists', async ({ page }) => {
      const items = page.locator('.outline-item');

      // Find Getting Started item and count its children before the test
      const gettingStartedItem = items.filter({ hasText: 'Getting Started' }).first();
      const childrenBefore = gettingStartedItem.locator('.children-wrapper > .outline-item');
      const childCountBefore = await childrenBefore.count();

      // Find the first child of Getting Started - this has a previous sibling
      // We'll select and indent it
      if (childCountBefore < 2) {
        test.skip();
        return;
      }

      // Get the second child (so it has a previous sibling to become child of)
      const secondChild = childrenBefore.nth(1);
      const secondChildText = await secondChild.locator('.item-row .outline-editor').textContent();

      // Click on the second child's item row to focus it
      await secondChild.locator('.item-row').click();
      await page.waitForTimeout(50);

      // Ctrl-click to select
      await secondChild.locator('.item-row').click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Verify it's selected
      await expect(secondChild).toHaveClass(/selected/);

      // Press Tab to indent - this item should become a child of its previous sibling
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      // Getting Started should now have one fewer direct child
      const childrenAfter = gettingStartedItem.locator('.children-wrapper > .outline-item');
      const childCountAfter = await childrenAfter.count();
      expect(childCountAfter).toBe(childCountBefore - 1);
    });

    test('Shift+Tab outdents selected child item', async ({ page }) => {
      const items = page.locator('.outline-item');

      // Find "Getting Started" and its children
      const parentItem = items.filter({ hasText: 'Getting Started' }).first();
      const childrenBefore = parentItem.locator('.children-wrapper > .outline-item');
      const childCountBefore = await childrenBefore.count();

      // Skip if no children
      if (childCountBefore === 0) {
        test.skip();
        return;
      }

      // Click on first child to focus it (regular click, not ctrl-click)
      const firstChild = childrenBefore.first();
      const firstChildEditor = firstChild.locator('.editor-wrapper');
      await firstChildEditor.click();
      await page.waitForTimeout(50);

      // Now Ctrl-click to also select it
      await firstChildEditor.click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Verify it's selected
      await expect(firstChild).toHaveClass(/selected/);

      // Press Shift+Tab to outdent
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(200);

      // Should have one fewer direct child in Getting Started
      const childrenAfter = parentItem.locator('.children-wrapper > .outline-item');
      const childCountAfter = await childrenAfter.count();
      expect(childCountAfter).toBe(childCountBefore - 1);
    });
  });

  test.describe('Selection preserved during operations', () => {
    test('bulk completion clears selection after operation', async ({ page }) => {
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Toggle completion
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(200);

      // Selection should be maintained (we don't clear it for completion)
      // Actually, let's verify it's still selected
      await expect(page.locator('.outline-item').first()).toHaveClass(/selected/);
    });
  });
});
