import { test, expect, type Locator, type Page } from '@playwright/test';

// The first root node ("Welcome to Outline") is promoted to the document title
// (.document-title-editor-inner), NOT rendered as an .outline-item, and which-it-is
// races on load — so `.outline-item.first()` / `.editor-wrapper.first()` can transiently
// resolve to the soon-to-be-title node. "Getting Started" is the first *real* outline
// item; target it by text for a stable subject.
function gettingStarted(page: Page): Locator {
  return page.locator('.outline-container > .outline-item').filter({ hasText: 'Getting Started' }).first();
}

// Focus an item AND give its contenteditable DOM focus before keyboard shortcuts.
// Clicking the item sets React focus (the .focused class), but the editor only
// receives DOM focus on a setTimeout(0) tick, so a bare item-click + shortcut races
// that tick and drops the keystroke under load (Ctrl+Shift+X / Ctrl+Enter are
// editor-scoped). Only the focused item renders .outline-editor, so the selector is
// unique; clicking it focuses the contenteditable synchronously.
async function focusItemEditor(page: Page, item: Locator) {
  await item.click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

test.describe('Edit menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the title node to be promoted so "Getting Started" is stably first.
    await page.waitForSelector('.document-title-editor-inner');
    await page.waitForSelector('.outline-item');
  });

  test('Edit menu is visible and clickable', async ({ page }) => {
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await expect(editMenu).toBeVisible();

    // Click to open
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // Menu content should be visible
    await expect(editMenu.locator('.menu-content')).toBeVisible();
  });

  test('Edit menu contains Undo, Redo, and Delete Completed Items', async ({ page }) => {
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // Check for menu items
    await expect(editMenu.locator('.menu-item-btn').filter({ hasText: 'Undo' })).toBeVisible();
    await expect(editMenu.locator('.menu-item-btn').filter({ hasText: 'Redo' })).toBeVisible();
    await expect(editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' })).toBeVisible();
  });

  test('Delete Completed Items is disabled when no completed items exist', async ({ page }) => {
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // The button should be disabled since there are no completed items
    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).toBeDisabled();
  });

  test('Delete Completed Items is enabled when completed items exist', async ({ page }) => {
    // First create a completed item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type something, convert to checkbox, and mark it complete
    await page.keyboard.type('Task to complete');
    await page.keyboard.press('Control+Shift+x'); // Convert to checkbox
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Enter'); // Mark complete
    await page.waitForTimeout(100);

    // Verify item is checked
    await expect(page.locator('.outline-item.checked')).toBeVisible();

    // Now open Edit menu
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // The button should be enabled
    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).not.toBeDisabled();
  });

  test('Delete Completed Items removes all completed items', async ({ page }) => {
    // Focus a stable item's editor (not .editor-wrapper.first(), which races the
    // title-node promotion) with synchronous contenteditable DOM focus.
    await focusItemEditor(page, gettingStarted(page));

    // Create a new sibling; Enter moves focus to the new empty item, whose editor
    // also focuses on a setTimeout(0) tick — re-acquire DOM focus before shortcuts.
    await page.keyboard.press('Enter');
    await page.locator('.outline-item.focused .outline-editor').click();
    await page.keyboard.type('Task 1 - done');
    await page.keyboard.press('Control+Shift+x'); // Convert to checkbox
    // Wait for the checkbox to actually appear on the focused item before completing.
    await expect(page.locator('.outline-item.focused .checkbox-btn')).toBeVisible();
    await page.keyboard.press('Control+Enter'); // Mark complete

    // Verify completed item exists (web-first; gates the counts below).
    await expect(page.locator('.outline-item.checked')).toHaveCount(1);

    // Count items before
    const countBefore = await page.locator('.outline-item').count();
    const checkedBefore = await page.locator('.outline-item.checked').count();

    // Open Edit menu and click Delete Completed Items
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).not.toBeDisabled();
    await deleteBtn.click();

    // All completed items should be gone (web-first wait before reading counts).
    await expect(page.locator('.outline-item.checked')).toHaveCount(0);
    const checkedAfter = await page.locator('.outline-item.checked').count();
    expect(checkedAfter).toBe(0);

    // Total items should be reduced by the number of completed items
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore - checkedBefore);
  });

  test('Delete Completed Items button becomes disabled after deletion', async ({ page }) => {
    // Create a completed item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Task to delete');
    await page.keyboard.press('Control+Shift+x'); // Convert to checkbox
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Enter'); // Mark complete
    await page.waitForTimeout(100);

    // Open Edit menu and click Delete Completed Items
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).not.toBeDisabled();
    await deleteBtn.click();
    await page.waitForTimeout(300);

    // Open menu again
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // Button should now be disabled
    const deleteBtnAfter = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtnAfter).toBeDisabled();
  });
});
