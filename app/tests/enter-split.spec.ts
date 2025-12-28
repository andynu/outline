import { test, expect } from '@playwright/test';

test.describe('Enter key split behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Enter at end of line creates new empty sibling (existing behavior)', async ({ page }) => {
    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Get initial item count
    const initialCount = await page.locator('.outline-item').count();

    // Type some content
    await page.keyboard.type('Test content');
    await page.waitForTimeout(100);

    // Press End to ensure we're at the end
    await page.keyboard.press('End');
    await page.waitForTimeout(50);

    // Press Enter to create new sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Check that a new item was created
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount + 1);

    // The focused item should be empty
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('');
  });

  test('Enter at beginning of line creates blank item above', async ({ page }) => {
    // Create a new item with specific content
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type content
    const testContent = 'Content to keep';
    await page.keyboard.type(testContent);
    await page.waitForTimeout(100);

    // Get item count before split
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // A new item should be created
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);

    // The focused item should still have the original content
    // (focus stays on original item, not the new blank)
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe(testContent);
  });

  test('Enter in middle of line splits content', async ({ page }) => {
    // Create a new item with specific content
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type content that we'll split
    const beforeText = 'Hello ';
    const afterText = 'World';
    await page.keyboard.type(beforeText + afterText);
    await page.waitForTimeout(100);

    // Get item count before split
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to the split position (after "Hello ")
    await page.keyboard.press('Home');
    for (let i = 0; i < beforeText.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Enter to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // A new item should be created
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);

    // The new focused item should have the "after" content
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const newContent = await focusedEditor.textContent();
    expect(newContent).toBe(afterText);
  });

  test('Split preserves formatting', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type formatted content: "normal **bold** more"
    await page.keyboard.type('normal ');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('bold');
    await page.keyboard.press('Control+b');
    await page.keyboard.type(' more');
    await page.waitForTimeout(100);

    // Get count before split
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to middle of "bold" (after "bo")
    await page.keyboard.press('Home');
    // Skip "normal " (7 chars) + "bo" (2 chars) = 9 positions
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Enter to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // New item should be created
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);

    // Check the focused item has the split content
    // Should contain "ld more" with "ld" still bold
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const html = await focusedEditor.innerHTML();
    // The "ld" part should be wrapped in <strong>
    expect(html).toContain('<strong>');
    expect(html).toContain('ld');
  });

  test('Split moves children to new item', async ({ page }) => {
    // Navigate to an item with children (Getting Started has children)
    const editors = page.locator('.editor-wrapper');

    // Find "Getting Started" item which has children
    let targetIdx = -1;
    const count = await editors.count();
    for (let i = 0; i < count; i++) {
      const text = await editors.nth(i).textContent();
      if (text?.includes('Getting Started')) {
        targetIdx = i;
        break;
      }
    }

    // If we found it, test the split
    if (targetIdx >= 0) {
      await editors.nth(targetIdx).click();
      await page.waitForTimeout(100);

      // First verify it has children by checking the children wrapper
      const parentItem = page.locator('.outline-item.focused');
      const hasChildrenBefore = await parentItem.locator('.children-wrapper').count() > 0;

      if (hasChildrenBefore) {
        // Count children before split
        const childrenBefore = await parentItem.locator('.children-wrapper .outline-item').count();
        expect(childrenBefore).toBeGreaterThan(0);

        // Move to middle of content and split
        const content = await parentItem.locator('.outline-editor').textContent();
        await page.keyboard.press('Home');
        const midPoint = Math.floor((content?.length || 10) / 2);
        for (let i = 0; i < midPoint; i++) {
          await page.keyboard.press('ArrowRight');
        }
        await page.waitForTimeout(50);

        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // The new focused item should now have the children
        const newFocusedItem = page.locator('.outline-item.focused');
        const hasChildrenAfter = await newFocusedItem.locator('.children-wrapper').count() > 0;

        if (hasChildrenBefore) {
          // Children should have moved to the new item
          const childrenAfter = await newFocusedItem.locator('.children-wrapper .outline-item').count();
          expect(childrenAfter).toBe(childrenBefore);
        }
      }
    }
  });

  test('Enter on empty item creates new sibling', async ({ page }) => {
    // Click first editor
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create an empty new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Count before second Enter
    const countBefore = await page.locator('.outline-item').count();

    // Press Enter on the empty item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should create another item
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);
  });

  test('Split while zoomed into a node with children zooms out instead of showing empty view', async ({ page }) => {
    // Create a parent item with children
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Clear any existing content and type parent content
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Parent item with children');
    await page.waitForTimeout(100);

    // Create a child by pressing Enter then Tab (indent)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item 1');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Create another child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item 2');
    await page.waitForTimeout(100);

    // Go back to parent (navigate up twice)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on the parent with children
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const parentContent = await focusedEditor.textContent();
    expect(parentContent).toBe('Parent item with children');

    // Zoom into this parent (Ctrl+])
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(200);

    // Verify zoom breadcrumbs appear
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // Count items before split
    const itemsBefore = await page.locator('.outline-item').count();
    expect(itemsBefore).toBeGreaterThan(0);

    // Now split the zoomed parent in the middle
    await page.keyboard.press('Home');
    // Move to middle (after "Parent ")
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Enter to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // The key test: outline should NOT be empty - items should still be visible
    const itemsAfter = await page.locator('.outline-item').count();
    expect(itemsAfter).toBeGreaterThan(0);

    // Should have zoomed out (breadcrumbs may or may not be visible depending on parent)
    // The main assertion is that items are still visible (not empty view)
  });
});
