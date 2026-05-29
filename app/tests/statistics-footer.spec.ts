import { test, expect, type Locator, type Page } from '@playwright/test';

// Give the focused item's contenteditable real DOM focus before keyboard ops.
// Clicking the item sets React focus, but the editor focuses on a setTimeout(0)
// tick, so a bare click + key-press races it under load. See notes.spec.ts.
async function focusItemEditor(page: Page, item: Locator) {
  await item.click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

// Parse the leading integer out of a stat item's text (e.g. "12 words" -> 12).
async function statValue(item: Locator): Promise<number> {
  const t = await item.textContent();
  return parseInt(t?.match(/\d+/)?.[0] || '0');
}

test.describe('Statistics footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('status bar shows word count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('words');
  });

  test('status bar shows items in content count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('in items');
  });

  test('status bar shows notes word count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('in notes');
  });

  test('status bar shows item count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('items');
  });

  test('statistics have tooltips', async ({ page }) => {
    // Check that stat items have title attributes
    const totalWordsItem = page.locator('.stat-item[title*="Total words"]');
    await expect(totalWordsItem).toBeVisible();

    const contentWordsItem = page.locator('.stat-item[title*="Words in item content"]');
    await expect(contentWordsItem).toBeVisible();

    const noteWordsItem = page.locator('.stat-item[title*="Words in notes"]');
    await expect(noteWordsItem).toBeVisible();

    const itemCountItem = page.locator('.stat-item[title*="Total items"]');
    await expect(itemCountItem).toBeVisible();
  });

  test('word count updates when typing', async ({ page }) => {
    const totalWordsItem = page.locator('.stat-item[title*="Total words"]');

    // Get initial word count
    const initialWords = await statValue(totalWordsItem);

    // Focus an item (with the editor DOM-focused) and type some words
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);
    await page.keyboard.type(' extra words here');

    // Word count should increase (the stat recompute is async/debounced — poll)
    await expect.poll(() => statValue(totalWordsItem)).toBeGreaterThan(initialWords);
  });

  test('item count updates when adding items', async ({ page }) => {
    const itemCountItem = page.locator('.stat-item[title*="Total items"]');

    // Get initial item count
    const initialCount = await statValue(itemCountItem);

    // Add a new item
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);
    await page.keyboard.press('Enter');

    // Item count should have increased by 1 (poll — recompute is async)
    await expect.poll(() => statValue(itemCountItem)).toBe(initialCount + 1);
  });

  test('note words update when adding note', async ({ page }) => {
    const noteWordsItem = page.locator('.stat-item[title*="Words in notes"]');

    // Get initial note word count (should be 0 initially)
    const initialNoteWords = await statValue(noteWordsItem);

    // Focus an item and open its note editor
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Type in the note (no Escape — count updates live on input; this also
    // avoids the otl-qro7 escape-focus bug)
    await noteInput.fill('This is a test note with words');

    // Note word count should increase (poll — recompute is async)
    await expect.poll(() => statValue(noteWordsItem)).toBeGreaterThan(initialNoteWords);
  });

  test('separators are visible between stats', async ({ page }) => {
    const separators = page.locator('.stat-separator');
    await expect(separators).toHaveCount(3); // 3 separators between 4 stats
  });
});
