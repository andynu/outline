import { test, expect, type Locator, type Page } from '@playwright/test';

// The first root node is promoted to the document title, not an .outline-item
// (see otl-nroo), so we target "Getting Started" — the first real outline item,
// which has 3 children in the seed.
function gettingStarted(page: Page): Locator {
  return page.locator('.outline-container > .outline-item').filter({ hasText: 'Getting Started' }).first();
}

// Nesting depth of the focused item (number of .children-wrapper ancestors).
const focusedDepth = (page: Page): Promise<number> =>
  page.locator('.outline-item.focused').first().evaluate((el) => {
    let d = 0;
    let p: HTMLElement | null = el.parentElement;
    while (p) { if (p.classList && p.classList.contains('children-wrapper')) d++; p = p.parentElement; }
    return d;
  });

test.describe('Lazy rendering of collapsed nodes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('children of collapsed nodes are not rendered', async ({ page }) => {
    const gs = gettingStarted(page);

    // Getting Started starts with its 3 seed children rendered
    await expect(gs.locator('> .children-wrapper > .children > .outline-item')).toHaveCount(3);

    // Collapse it by clicking its own bullet
    await gs.locator('> .item-row .bullet').click();

    // The children-wrapper should be removed from the DOM (lazy: not just hidden)
    await expect(gs.locator('> .children-wrapper')).toHaveCount(0);
  });

  test('children are rendered when node is expanded', async ({ page }) => {
    const gs = gettingStarted(page);
    const bullet = gs.locator('> .item-row .bullet');

    // Collapse
    await bullet.click();
    await expect(bullet).toHaveClass(/collapsed/);
    await expect(gs.locator('> .children-wrapper')).toHaveCount(0);

    // Expand again — children should be rendered
    await bullet.click();
    await expect(gs.locator('> .children-wrapper')).toBeVisible();
    await expect(gs.locator('> .children-wrapper > .children > .outline-item')).toHaveCount(3);
  });

  test('deeply nested collapsed children are not rendered', async ({ page }) => {
    const gs = gettingStarted(page);
    const children = gs.locator('> .children-wrapper > .children > .outline-item');
    await expect(children).toHaveCount(3);

    // Build a second level: indent the 2nd child under the 1st (-> grandchild),
    // ensuring DOM focus before the structural key-press (editor-dom-focus-race).
    await children.nth(1).locator('.editor-wrapper').first().click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);
    await page.locator('.outline-item.focused .outline-editor').click();
    const depth = await focusedDepth(page);
    await page.keyboard.press('Tab');
    await expect.poll(() => focusedDepth(page).catch(() => depth)).toBe(depth + 1);

    // Getting Started now has a 2-level subtree; collapse it
    await expect(gs.locator('.outline-item').first()).toBeVisible();
    await gs.locator('> .item-row .bullet').click();

    // All nested items (children + grandchild) should be removed from the DOM
    await expect(gs.locator('.outline-item')).toHaveCount(0);
  });
});
