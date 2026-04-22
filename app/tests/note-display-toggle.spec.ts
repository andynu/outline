import { test, expect } from '@playwright/test';

/**
 * Tests for the toolbar button that cycles through the three
 * noteDisplayMode states: none -> one-line -> full -> none.
 *
 * The static (unfocused) renderer is the one that respects noteDisplayMode,
 * so the test creates a note on the first item, then focuses a different
 * item so the first item is rendered via OutlineItemStatic.
 */
test.describe('Note display toolbar toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');

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
    // Create at least two items so we can focus one and leave the other unfocused.
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Seed a multi-line note on the first item.
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    const longLine = 'A'.repeat(150); // > 100 chars so truncation kicks in for one-line
    await noteInput.fill(`${longLine}\nSecond line of the note`);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Ensure there's a second item to focus; if not, create one.
    const itemCount = await page.locator('.outline-item').count();
    if (itemCount < 2) {
      // Move caret to end and press Enter to create a new sibling.
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Second item');
      await page.waitForTimeout(100);
    }

    // Focus the second item so the first one renders via OutlineItemStatic.
    const secondItem = page.locator('.outline-item').nth(1);
    await secondItem.click();
    await page.waitForTimeout(100);

    const btn = page.locator('.toolbar-btn.note-display-toggle');
    // state starts as one-line per beforeEach
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');

    // One-line mode: note-preview exists on the first (now unfocused) item
    const firstNotePreview = firstItem.locator('.note-preview');
    await expect(firstNotePreview).toBeVisible();
    const oneLineText = (await firstNotePreview.textContent()) || '';
    // truncated (...) since plain text > 100 chars
    expect(oneLineText.endsWith('...')).toBe(true);
    expect(oneLineText.length).toBeLessThanOrEqual(110);

    // Cycle to 'full'
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'full');
    await expect(firstNotePreview).toBeVisible();
    // in full mode, the full first line (150 A's) should be present
    const fullText = (await firstNotePreview.textContent()) || '';
    expect(fullText).toContain(longLine);

    // Cycle to 'none' — preview is not rendered
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'none');
    await expect(firstItem.locator('.note-preview')).toHaveCount(0);

    // Cycle back to 'one-line'
    await btn.click();
    await expect(btn).toHaveAttribute('data-note-display-mode', 'one-line');
    await expect(firstItem.locator('.note-preview')).toBeVisible();
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
