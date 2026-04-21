import { test, expect } from '@playwright/test';

/**
 * Tests for clickable raw URLs in note content.
 *
 * The app falls back to window.open in browser (non-Tauri) mode, so we
 * spy on window.open to assert link activation routes through openUrl.
 */
test.describe('Clickable URLs in notes', () => {
  test.beforeEach(async ({ page }) => {
    // Install window.open spy BEFORE navigating so openUrl's browser-mode
    // fallback (window.open) can be observed.
    await page.addInitScript(() => {
      (window as any).__openedUrls = [];
      window.open = ((url?: string | URL) => {
        if (typeof url === 'string') {
          (window as any).__openedUrls.push(url);
        }
        return null as unknown as Window;
      }) as typeof window.open;
    });
    await page.goto('/');
    await page.waitForSelector('.outline-item');
  });

  async function focusFirstItem(page: import('@playwright/test').Page) {
    // Click the item then the inner content area to guarantee the TipTap
    // editor mounts and takes focus (OutlineItemStatic has no editor at all).
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused', { timeout: 5000 });
    // Click the editor wrapper to ensure ProseMirror has focus for shortcuts.
    const editor = page.locator('.outline-item.focused .editor-container').first();
    await editor.click();
  }

  async function addPlainTextNote(page: import('@playwright/test').Page, text: string) {
    await focusFirstItem(page);
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible({ timeout: 5000 });
    await noteInput.fill(text);
    await page.keyboard.press('Escape');
    // Wait for the note preview to render.
    await expect(page.locator('.outline-item').first().locator('.note-content')).toBeVisible();
  }

  test('plain-text note with URL renders clickable link that calls openUrl', async ({ page }) => {
    await addPlainTextNote(page, 'see https://example.com for more');

    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('.note-content a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://example.com');
    await expect(link).toHaveText('https://example.com');

    await link.click();
    const opened = await page.evaluate(() => (window as any).__openedUrls as string[]);
    expect(opened).toContain('https://example.com');
  });

  test('www URL in plain-text note is normalized to https', async ({ page }) => {
    await addPlainTextNote(page, 'visit www.example.org today');

    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('.note-content a');
    await expect(link).toHaveAttribute('href', 'https://www.example.org');

    await link.click();
    const opened = await page.evaluate(() => (window as any).__openedUrls as string[]);
    expect(opened).toContain('https://www.example.org');
  });

  test('trailing punctuation is not included in URL', async ({ page }) => {
    await addPlainTextNote(page, 'check https://example.com.');

    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('.note-content a');
    await expect(link).toHaveAttribute('href', 'https://example.com');
  });

  test('clicking URL in a note does not open the inline note editor', async ({ page }) => {
    await addPlainTextNote(page, 'see https://example.com here');

    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('.note-content a');
    await link.click();

    // Note input should NOT be visible — link click must short-circuit
    // the note-edit handler.
    await expect(page.locator('.note-input')).toHaveCount(0);
  });

  test('unfocused item (static renderer) makes URLs clickable in full-note preview', async ({ page }) => {
    // Note-display-mode 'one-line' strips tags. Set 'full' so the static
    // renderer emits HTML. Settings persist in localStorage, so set them
    // BEFORE adding the note (adding it via Shift+Enter requires a focused
    // item; static rendering kicks in for items that lose focus).
    await page.evaluate(() => {
      const raw = localStorage.getItem('outline-settings');
      const settings = raw ? JSON.parse(raw) : {};
      settings.noteDisplayMode = 'full';
      localStorage.setItem('outline-settings', JSON.stringify(settings));
    });
    await page.reload();
    await page.waitForSelector('.outline-item');

    // Create a sibling by pressing Enter in the focused editor first so
    // we have a second item to move focus to later. Then add a note to
    // the first item. Finally move focus to the sibling so the first
    // item re-renders via OutlineItemStatic.
    await focusFirstItem(page);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter'); // creates sibling (now focused)
    await page.waitForTimeout(100);

    // Go back to the first item.
    await page.locator('.outline-item').first().click();
    await page.waitForSelector('.outline-item.focused');
    const editor = page.locator('.outline-item.focused .editor-container').first();
    await editor.click();

    // Add the note.
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible({ timeout: 5000 });
    await noteInput.fill('see https://unfocused.example.com now');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Move focus to the second item so the first one becomes static.
    const secondItem = page.locator('.outline-item').nth(1);
    await secondItem.click();
    await page.waitForTimeout(200);

    // First item should now render via OutlineItemStatic (note-preview).
    const staticNote = page.locator('.outline-item').first().locator('.note-content.note-preview');
    await expect(staticNote).toBeVisible({ timeout: 5000 });

    const link = staticNote.locator('a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://unfocused.example.com');

    await link.click();
    const opened = await page.evaluate(() => (window as any).__openedUrls as string[]);
    expect(opened).toContain('https://unfocused.example.com');
  });
});
