import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Tests for the toolbar button that cycles through the three
 * noteDisplayMode states: none -> one-line -> full -> none.
 *
 * The static (unfocused) renderer is the one that respects noteDisplayMode,
 * so the test creates a note on the first item, then focuses a different
 * item so the first item is rendered via OutlineItemStatic.
 */

// Focus an item AND give its contenteditable DOM focus before keyboard ops.
// Clicking sets React focus (the .focused class), but the editor only gets DOM
// focus on a setTimeout(0) tick, so Shift+Enter (handled in the editor's
// ProseMirror keydown) is dropped if it races that tick. Clicking the editor
// focuses it synchronously. Only the focused item renders .outline-editor.
async function focusItemEditor(page: Page, item: Locator) {
  await item.locator('.editor-wrapper').first().click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

test.describe('Note display toolbar toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');
    // First root node is promoted to the document title (otl-nroo); wait for
    // the title editor so the title-vs-item split has settled before any
    // .outline-item query.
    await page.waitForSelector('.document-title-editor-inner');

    // Reset the stored noteDisplayMode to the default ('one-line')
    // so the toggle starts in a predictable state even if a previous
    // run left it elsewhere in localStorage.
    await page.evaluate(() => {
      const raw = localStorage.getItem('outline-settings');
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.noteDisplayMode = 'one-line';
      localStorage.setItem('outline-settings', JSON.stringify(parsed));
    });
    await page.reload();
    await page.waitForSelector('.outline-item');
    await page.waitForSelector('.document-title-editor-inner');
  });

  test('toolbar button is visible and starts in one-line mode', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.note-display-toggle');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');
    await expect(btn).toHaveAttribute('title', /Notes: One line/);
  });

  test('cycles one-line -> full -> none -> one-line on click', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.note-display-toggle');

    // starts as one-line (per beforeEach)
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');

    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'full');
    await expect(btn).toHaveAttribute('title', /Notes: Full/);

    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'none');
    await expect(btn).toHaveAttribute('title', /Notes: Hidden/);

    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');
    await expect(btn).toHaveAttribute('title', /Notes: One line/);
  });

  test('cycling the button affects note rendering on unfocused items', async ({ page }) => {
    // Use two stable top-level items so one can hold the note while the other
    // takes focus. "Getting Started" carries the note; "Features" gets focus,
    // leaving "Getting Started" rendered via OutlineItemStatic (the renderer
    // that honors noteDisplayMode). Neither is a descendant of the other, so
    // the per-item .note-preview locator stays unambiguous.
    const notedItem = page
      .locator('.outline-container > .outline-item')
      .filter({ hasText: 'Getting Started' })
      .first();
    const focusTarget = page
      .locator('.outline-container > .outline-item')
      .filter({ hasText: 'Features' })
      .first();

    // Seed a multi-line note on the noted item (editor DOM focus required for
    // Shift+Enter to open the note input).
    await focusItemEditor(page, notedItem);
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    const longLine = 'A'.repeat(150); // > 100 chars so truncation kicks in for one-line
    await noteInput.fill(`${longLine}\nSecond line of the note`);
    // Shift+Enter from inside the note closes it and commits the value.
    await page.keyboard.press('Shift+Enter');
    await expect(noteInput).toBeHidden();

    // Focus a different item so the noted item renders via OutlineItemStatic.
    await focusTarget.locator('.editor-wrapper').first().click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);
    await expect(notedItem).not.toHaveClass(/(^|\s)focused(\s|$)/);

    const btn = page.locator('.toolbar-btn.note-display-toggle');
    // state starts as one-line per beforeEach
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');

    // One-line mode: note-preview exists on the now-unfocused noted item.
    // Scope with .first() — the item's subtree could contain other previews.
    const notePreview = notedItem.locator('.note-preview').first();
    await expect(notePreview).toBeVisible();
    // truncated (...) since plain text > 100 chars
    await expect(notePreview).toHaveText(/\.\.\.$/);
    await expect.poll(async () => ((await notePreview.textContent()) || '').length)
      .toBeLessThanOrEqual(110);

    // Cycle to 'full'
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'full');
    await expect(notePreview).toBeVisible();
    // in full mode, the full first line (150 A's) should be present
    await expect(notePreview).toContainText(longLine);

    // Cycle to 'none' — preview is not rendered
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'none');
    await expect(notedItem.locator('.note-preview')).toHaveCount(0);

    // Cycle back to 'one-line'
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');
    await expect(notedItem.locator('.note-preview').first()).toBeVisible();
  });

  test('Ctrl+Shift+N cycles noteDisplayMode: one-line -> full -> none -> one-line', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.note-display-toggle');

    // starts as one-line (per beforeEach)
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');

    // Press from body (not focused on an item) to verify it works globally.
    await page.locator('body').click();
    await page.keyboard.press('Control+Shift+N');
    await expect(btn).toHaveAttribute('data-note-display-mode', 'full');

    await page.keyboard.press('Control+Shift+N');
    await expect(btn).toHaveAttribute('data-note-display-mode', 'none');

    await page.keyboard.press('Control+Shift+N');
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');
  });

  test('Ctrl+Shift+N works while an outline item is focused for editing', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.note-display-toggle');
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');

    // Focus an item into edit mode.
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Control+Shift+N');
    await expect(btn).toHaveAttribute('data-note-display-mode', 'full');
  });

  test('toolbar button title mentions the keyboard shortcut', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.note-display-toggle');
    await expect(btn).toHaveAttribute('title', /Ctrl\+Shift\+N/);
    await expect(btn).toHaveAttribute('aria-label', /Ctrl\+Shift\+N/);
  });

  test('active class reflects whether notes are visible', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.note-display-toggle');

    // starts as one-line -> active
    await expect(btn).toHaveClass(/active/);

    // cycle to full -> still active
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'full');
    await expect(btn).toHaveClass(/active/);

    // cycle to none -> not active
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'none');
    await expect(btn).not.toHaveClass(/active/);
  });
});
