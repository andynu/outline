import { test, expect } from '@playwright/test';

test.describe('Zoom history back/forward restores focus and scroll (otl-5lm0)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');
  });

  test('zoom back restores the item that was zoomed from as focused', async ({ page }) => {
    // "Press Tab to indent" is the middle child of "Getting Started" in the
    // mock document. Zooming into it and then going back should restore focus
    // to THIS item — not the first child of "Getting Started".
    const middleChild = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await middleChild.click();
    await page.waitForTimeout(150);

    // Confirm it is focused before we zoom.
    await expect(page.locator('.outline-item.focused')).toContainText('Press Tab to indent');

    // Zoom in via Ctrl+].
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // Alt+Left = go back in zoom history.
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(300);

    // Focus must return to "Press Tab to indent" — the item we zoomed from.
    const focused = page.locator('.outline-item.focused');
    await expect(focused).toHaveCount(1);
    await expect(focused).toContainText('Press Tab to indent');

    // Sibling "Press Enter to create a new item" (first child) must NOT be
    // the focused item — that was the old bug.
    await expect(focused).not.toContainText('Press Enter to create a new item');
  });

  test('zoom forward restores the state we were at before going back', async ({ page }) => {
    const middleChild = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await middleChild.click();
    await page.waitForTimeout(150);

    // Zoom in.
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // Back — when we're no longer zoomed, the close button disappears but
    // the breadcrumb nav stays visible so forward navigation is available.
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(300);
    await expect(page.locator('.zoom-close-btn')).not.toBeVisible();

    // Forward — should be zoomed into "Press Tab to indent" again.
    await page.keyboard.press('Alt+ArrowRight');
    await page.waitForTimeout(300);
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();
    await expect(page.locator('.breadcrumb-item.current')).toContainText('Press Tab to indent');
  });

  test('multiple zoom levels each restore their own focus on back', async ({ page }) => {
    // Zoom into "Getting Started" from the root. Before zooming, focus on a
    // specific child of Getting Started to capture a non-default focus state.
    const getStartedItem = page.locator('.editor-wrapper').filter({ hasText: /^Getting Started$/ });
    await getStartedItem.click();
    await page.waitForTimeout(100);
    // Focus is now on "Getting Started".
    await expect(page.locator('.outline-item.focused')).toContainText('Getting Started');

    // Zoom into "Getting Started" via Ctrl+].
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

    // Now focus a grandchild and zoom into it too.
    const pressTab = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await pressTab.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

    // Go back once — should be zoomed at "Getting Started" level with focus
    // restored to "Press Tab to indent".
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(300);
    await expect(page.locator('.breadcrumb-item.current')).toContainText('Getting Started');
    await expect(page.locator('.outline-item.focused')).toContainText('Press Tab to indent');

    // Go back again — should un-zoom entirely, with focus restored to
    // "Getting Started" (the item we zoomed from at the outer level).
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(300);
    await expect(page.locator('.zoom-close-btn')).not.toBeVisible();
    await expect(page.locator('.outline-item.focused')).toContainText('Getting Started');
  });
});
