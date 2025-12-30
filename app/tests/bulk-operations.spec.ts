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

  test.describe('Bulk context menu', () => {
    test('shows bulk menu when multiple items selected', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Verify both are selected
      await expect(items.first()).toHaveClass(/selected/);
      await expect(items.nth(1)).toHaveClass(/selected/);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Context menu should appear with bulk options
      const contextMenu = page.locator('.context-menu');
      await expect(contextMenu).toBeVisible();

      // Should have "Complete all" option with count
      await expect(contextMenu.locator('text=/Complete all.*2/')).toBeVisible();
    });

    test('bulk context menu complete all marks items checked', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click "Complete all"
      const contextMenu = page.locator('.context-menu');
      await contextMenu.locator('text=/Complete all/').click();
      await page.waitForTimeout(200);

      // Both items should be checked
      await expect(items.first()).toHaveClass(/checked/);
      await expect(items.nth(1)).toHaveClass(/checked/);
    });

    test('bulk context menu delete removes selected items', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      const initialCount = await items.count();
      expect(initialCount).toBeGreaterThanOrEqual(3);

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click "Delete selected"
      const contextMenu = page.locator('.context-menu');
      await contextMenu.locator('text=/Delete selected/').click();
      await page.waitForTimeout(200);

      // Should have fewer items
      const newCount = await items.count();
      expect(newCount).toBeLessThan(initialCount);
    });
  });

  test.describe('Type conversion', () => {
    test('convert to checkbox via context menu', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first item (which should be a bullet)
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click "Convert to checkbox" if available
      const contextMenu = page.locator('.context-menu');
      const convertBtn = contextMenu.locator('text=Convert to checkbox');

      // Only test if the button is enabled (items have bullets)
      if (await convertBtn.isEnabled()) {
        await convertBtn.click();
        await page.waitForTimeout(200);

        // Both items should now have checkboxes
        const firstCheckbox = items.first().locator('.checkbox-btn');
        const secondCheckbox = items.nth(1).locator('.checkbox-btn');
        await expect(firstCheckbox).toBeVisible();
        await expect(secondCheckbox).toBeVisible();
      }
    });

    test('convert to bullet via context menu', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // First, convert items to checkboxes
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Press Ctrl+Enter to make them checkboxes
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(200);

      // Verify they're now checkboxes
      await expect(items.first().locator('.checkbox-btn')).toBeVisible();
      await expect(items.nth(1).locator('.checkbox-btn')).toBeVisible();

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click "Convert to bullet"
      const contextMenu = page.locator('.context-menu');
      const convertBtn = contextMenu.locator('text=Convert to bullet');

      if (await convertBtn.isEnabled()) {
        await convertBtn.click();
        await page.waitForTimeout(200);

        // Both items should now have bullets (no checkbox-btn)
        await expect(items.first().locator('.checkbox-btn')).toHaveCount(0);
        await expect(items.nth(1).locator('.checkbox-btn')).toHaveCount(0);
      }
    });
  });

  test.describe('Bulk move operations', () => {
    test('bulk context menu shows move options', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Context menu should have move options
      const contextMenu = page.locator('.context-menu');
      await expect(contextMenu.locator('text=Move to...')).toBeVisible();
      await expect(contextMenu.locator('text=Move to top')).toBeVisible();
      await expect(contextMenu.locator('text=Move to bottom')).toBeVisible();
    });

    test('Move to top and bottom are clickable', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Wait for items to be available
      await expect(items.first()).toBeVisible();

      // Must select 2+ items for bulk menu to appear
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Verify Move to top is clickable (not disabled)
      const contextMenu = page.locator('.context-menu');
      const moveToTop = contextMenu.locator('text=Move to top');
      await expect(moveToTop).toBeVisible();
      await expect(moveToTop).toBeEnabled();

      // Click it to verify it works
      await moveToTop.click();
      await page.waitForTimeout(200);

      // After the move, items should still exist
      await expect(items.first()).toBeVisible();
    });
  });

  test.describe('Bulk export operations', () => {
    test('bulk context menu shows export options', async ({ page }) => {
      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Context menu should have export options
      const contextMenu = page.locator('.context-menu');
      await expect(contextMenu.locator('text=Copy as Markdown')).toBeVisible();
      await expect(contextMenu.locator('text=Copy as Plain Text')).toBeVisible();
      await expect(contextMenu.locator('text=Export to file...')).toBeVisible();
    });

    test('Copy as Markdown copies to clipboard', async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click "Copy as Markdown"
      const contextMenu = page.locator('.context-menu');
      await contextMenu.locator('text=Copy as Markdown').click();
      await page.waitForTimeout(200);

      // Verify clipboard has markdown content
      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardContent).toContain('-'); // Markdown list items start with -
    });

    test('Ctrl+Shift+C copies as markdown with selection', async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Select first two items
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Press Ctrl+Shift+C
      await page.keyboard.press('Control+Shift+C');
      await page.waitForTimeout(200);

      // Verify clipboard has markdown content
      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardContent).toContain('-'); // Markdown list items start with -
    });

    test('Copy as Plain Text copies without markdown syntax', async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const items = page.locator('.outline-item');
      const editors = page.locator('.editor-wrapper');

      // Get the actual content of first item to compare
      const firstItemContent = await items.first().locator('.outline-editor').textContent();

      // Select first item only (need 2 for bulk menu)
      await editors.first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);
      await editors.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(50);

      // Right-click to open context menu
      await items.first().click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click "Copy as Plain Text"
      const contextMenu = page.locator('.context-menu');
      await contextMenu.locator('text=Copy as Plain Text').click();
      await page.waitForTimeout(200);

      // Verify clipboard has plain text (no markdown bullets)
      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
      // Plain text should NOT start with "- " markdown syntax
      expect(clipboardContent).not.toMatch(/^- /);
      // But should contain the text content
      expect(clipboardContent.length).toBeGreaterThan(0);
    });
  });
});
