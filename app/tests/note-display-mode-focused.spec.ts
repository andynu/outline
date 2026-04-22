import { test, expect } from '@playwright/test';

/**
 * Focused item must honor noteDisplayMode ('none' | 'one-line' | 'full'), except
 * that Shift+Enter (isEditingNote) always shows the textarea regardless of mode.
 *
 * See bd issue otl-qe80.
 */

async function setNoteDisplayMode(page: import('@playwright/test').Page, mode: 'none' | 'one-line' | 'full') {
  // Click the toolbar toggle until the button reports the desired mode. The
  // cycle is one-line -> full -> none -> one-line.
  const btn = page.locator('.toolbar-btn.note-display-toggle');
  for (let i = 0; i < 4; i++) {
    const current = await btn.getAttribute('data-note-display-mode');
    if (current === mode) return;
    await btn.click();
    await page.waitForTimeout(50);
  }
  throw new Error(`Could not set noteDisplayMode to ${mode}`);
}

async function focusFirstItem(page: import('@playwright/test').Page) {
  const firstItem = page.locator('.outline-item').first();
  // Click on the content area to ensure the TipTap editor is mounted/focused.
  const content = firstItem.locator('.editor-wrapper, .ProseMirror, .static-content').first();
  await content.click();
  await page.waitForTimeout(150);
  return firstItem;
}

async function seedNoteOnFirstItem(page: import('@playwright/test').Page, noteText: string) {
  await focusFirstItem(page);

  await page.keyboard.press('Shift+Enter');
  const noteInput = page.locator('.note-input');
  await expect(noteInput).toBeVisible();
  await noteInput.fill(noteText);
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

test.describe('Focused item respects noteDisplayMode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Reset localStorage to a predictable noteDisplayMode, then reload so the
    // store picks it up. Do this BEFORE interacting with the app so the
    // toolbar reflects the starting state.
    await page.evaluate(() => {
      const raw = localStorage.getItem('outline-settings');
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.noteDisplayMode = 'one-line';
      localStorage.setItem('outline-settings', JSON.stringify(parsed));
    });
    await page.reload();
    await page.waitForSelector('.outline-item');
  });

  test("'none' hides the note on the focused item", async ({ page }) => {
    await seedNoteOnFirstItem(page, 'A short note');
    await setNoteDisplayMode(page, 'none');

    const firstItem = await focusFirstItem(page);

    // No rendered note content on the focused item.
    await expect(firstItem.locator('.note-content')).toHaveCount(0);
  });

  test("Shift+Enter still opens the textarea when mode is 'none'", async ({ page }) => {
    await seedNoteOnFirstItem(page, 'Note body that must be editable');
    await setNoteDisplayMode(page, 'none');

    const firstItem = await focusFirstItem(page);

    // Sanity check: note is hidden by default under 'none'.
    await expect(firstItem.locator('.note-content')).toHaveCount(0);

    // Shift+Enter should reveal the textarea with the existing note content.
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    await expect(noteInput).toHaveValue('Note body that must be editable');

    // Blurring should collapse the note again.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(firstItem.locator('.note-content')).toHaveCount(0);
    await expect(firstItem.locator('.note-input')).toHaveCount(0);
  });

  test("'one-line' truncates the focused item's note to ~100 chars with ellipsis", async ({ page }) => {
    const longLine = 'B'.repeat(150);
    await seedNoteOnFirstItem(page, longLine);
    // Mode is already 'one-line' from beforeEach; ensure it.
    await setNoteDisplayMode(page, 'one-line');

    const firstItem = await focusFirstItem(page);

    const preview = firstItem.locator('.note-preview');
    await expect(preview).toBeVisible();
    const text = (await preview.textContent()) || '';
    expect(text.endsWith('...')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(110);
  });

  test("'full' shows the full note on the focused item", async ({ page }) => {
    const longLine = 'C'.repeat(150);
    await seedNoteOnFirstItem(page, longLine);
    await setNoteDisplayMode(page, 'full');

    const firstItem = await focusFirstItem(page);

    const content = firstItem.locator('.note-content').first();
    await expect(content).toBeVisible();
    // Full mode should not collapse with ellipsis; the full line is visible.
    const text = (await content.textContent()) || '';
    expect(text).toContain(longLine);
    // And there should be no .note-preview class (that's reserved for one-line).
    await expect(firstItem.locator('.note-content.note-preview')).toHaveCount(0);
  });
});
