import { test, expect, type Locator, type Page } from '@playwright/test';

// Regression guard for otl-xdbx: dropping a URL onto any region of the app
// (sidebar, outline body, notes, empty space, window chrome) must not cause
// the webview to navigate to that URL. If the global drag/drop guard is
// removed, the browser's default behavior for a text/uri-list drop is to
// navigate — which in a Tauri webview looks like a full page reload and
// loses unsaved state.

// Focus an item AND give its contenteditable DOM focus before keyboard ops.
// Clicking sets React focus, but the editor only gets DOM focus on a
// setTimeout(0) tick, so Shift+Enter (handled in the editor's ProseMirror
// keydown, opens the note input) is dropped if it races that tick. Clicking
// the editor focuses it synchronously. Only the focused item renders
// .outline-editor (descendants are static), so the selector is unique.
async function focusItemEditor(page: Page, item: Locator) {
  await item.locator('.editor-wrapper').first().click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

test.describe('URL drag/drop hardening', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
    // First root node is promoted to the document title (otl-nroo); wait for
    // the title editor so the title-vs-item split has settled before any
    // .outline-item query.
    await page.waitForSelector('.document-title-editor-inner');
  });

  async function assertNoNavigationAfterDrop(page, targetSelector: string) {
    const initialUrl = page.url();
    const target = page.locator(targetSelector).first();
    await expect(target).toBeVisible();

    // Fire a synthetic drop sequence carrying a URL payload. We dispatch
    // dragover and drop events on the target and on window with a DataTransfer
    // containing a text/uri-list entry — same shape the webview sees when
    // the user drags a link from their browser.
    const navigated = await page.evaluate(async (selector) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return 'no-target';

      const dt = new DataTransfer();
      dt.setData('text/uri-list', 'https://example.com/malicious');
      dt.setData('text/plain', 'https://example.com/malicious');

      const fire = (type: string, node: EventTarget) => {
        const ev = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        node.dispatchEvent(ev);
        return ev.defaultPrevented;
      };

      // Simulate the full drag sequence
      fire('dragenter', el);
      const overPrevented = fire('dragover', el);
      const dropPrevented = fire('drop', el);

      return {
        overPrevented,
        dropPrevented,
        href: window.location.href,
      };
    }, targetSelector);

    // After the drop, URL must not have changed.
    expect(page.url()).toBe(initialUrl);

    // The global guard (or a specific handler) must have prevented the
    // default for both dragover and drop — otherwise the webview would
    // navigate.
    expect(navigated).toMatchObject({
      overPrevented: true,
      dropPrevented: true,
    });
  }

  test('dropping a URL onto the outline body does not navigate', async ({ page }) => {
    await assertNoNavigationAfterDrop(page, '.outline-container');
  });

  test('dropping a URL onto the app body does not navigate', async ({ page }) => {
    await assertNoNavigationAfterDrop(page, 'body');
  });

  test('dropping a URL onto an outline item does not navigate', async ({ page }) => {
    await assertNoNavigationAfterDrop(page, '.outline-item');
  });

  test('dropping a URL into a note input does not navigate', async ({ page }) => {
    // Focus the first real outline item ("Getting Started") with editor DOM
    // focus so Shift+Enter actually opens the note input (the keystroke is
    // editor-scoped and is dropped if the contenteditable lacks DOM focus).
    const firstItem = page
      .locator('.outline-container > .outline-item')
      .filter({ hasText: 'Getting Started' })
      .first();
    await focusItemEditor(page, firstItem);

    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    await assertNoNavigationAfterDrop(page, '.note-input');
  });
});
