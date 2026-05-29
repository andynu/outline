import { test, expect, type Locator, type Page } from '@playwright/test';

// Focus an item AND give its contenteditable DOM focus before keyboard ops.
// Clicking sets React focus (the .focused class), but the editor only gets DOM
// focus on a setTimeout(0) tick (useOutlineEditor), so a bare item-click +
// key-press races that tick and drops the keystroke under load. The Arrow keys
// for cross-item navigation are handled in the editor's ProseMirror keydown
// (useOutlineEditor.ts) and are lost entirely when the editor lacks DOM focus.
// Clicking the editor focuses it synchronously. Only the focused item renders
// .outline-editor (descendants are static), so the selector is unique.
async function focusItemEditor(page: Page, item: Locator) {
  await item.locator('.editor-wrapper').first().click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load. The first root node is promoted to the
    // document title (otl-nroo) — wait for the title editor too so the
    // title-vs-item split has settled before any .outline-item.first() query.
    await page.waitForSelector('.outline-item', { timeout: 10000 });
    await page.waitForSelector('.document-title-editor-inner');
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

  test('Arrow Up at first item moves focus to the document title', async ({ page }) => {
    // Focus the first real outline item ("Getting Started"). Targeting by text
    // avoids the title-promotion race that makes .outline-item.first() unstable
    // on load, and focusItemEditor gives the editor DOM focus so the editor-
    // scoped ArrowUp handler actually fires.
    const firstItem = page
      .locator('.outline-container > .outline-item')
      .filter({ hasText: 'Getting Started' })
      .first();
    await focusItemEditor(page, firstItem);

    // Up from the first item leaves the outline and focuses the document title
    // (requestTitleFocus) — focus is no longer on any outline item, and the
    // title editor becomes the active element.
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.outline-item.focused')).toHaveCount(0);
    await expect(page.locator('.document-title-editor-inner')).toBeFocused();
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

    // After zooming, focus automatically moves to the first child
    // (improved UX compared to leaving focus on invisible zoomed node)
    const focusedItem = page.locator('.outline-item.focused .editor-wrapper');
    await expect(focusedItem).toContainText('Child item 1');

    // Arrow Down moves to next child
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await expect(focusedItem).toContainText('Child item 2');
  });
});
