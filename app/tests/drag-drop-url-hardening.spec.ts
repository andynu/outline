import { test, expect } from '@playwright/test';

// Regression guard for otl-xdbx: dropping a URL onto any region of the app
// (sidebar, outline body, notes, empty space, window chrome) must not cause
// the webview to navigate to that URL. If the global drag/drop guard is
// removed, the browser's default behavior for a text/uri-list drop is to
// navigate — which in a Tauri webview looks like a full page reload and
// loses unsaved state.
test.describe('URL drag/drop hardening', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
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
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    await assertNoNavigationAfterDrop(page, '.note-input');
  });
});
