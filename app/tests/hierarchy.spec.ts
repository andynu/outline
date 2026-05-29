import { test, expect } from '@playwright/test';

// Indentation is rendered via nested .children-wrapper containers, not a
// margin-left on .outline-item. Measure nesting depth = number of
// .children-wrapper ancestors of the focused item.
function focusedDepth(page: import('@playwright/test').Page): Promise<number> {
  return page.locator('.outline-item.focused').first().evaluate((el) => {
    let d = 0;
    let p: HTMLElement | null = el.parentElement;
    while (p) { if (p.classList && p.classList.contains('children-wrapper')) d++; p = p.parentElement; }
    return d;
  });
}

test.describe('Hierarchy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Tab indents item under previous sibling', async ({ page }) => {
    // "Press Tab to indent" has a previous sibling, so it can be indented.
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await editor.click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);
    // item.click() sets React focus (.focused) but the contenteditable only gets
    // DOM focus on a setTimeout(0) tick; Tab is handled in ProseMirror keydown so
    // it is dropped under load if the editor lacks DOM focus. Click it to focus
    // synchronously. Only the focused item renders .outline-editor (unique).
    await page.locator('.outline-item.focused .outline-editor').click();

    const before = await focusedDepth(page);
    await page.keyboard.press('Tab');

    // Item is now nested one level deeper (under its previous sibling).
    await expect.poll(() => focusedDepth(page)).toBe(before + 1);
  });

  test('Shift+Tab outdents item to parent level', async ({ page }) => {
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await editor.click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);
    // Force synchronous DOM focus on the contenteditable before the key-presses;
    // Tab/Shift+Tab are handled in ProseMirror keydown and are dropped under load
    // if the editor only has React focus (the setTimeout(0) tick hasn't run).
    await page.locator('.outline-item.focused .outline-editor').click();

    // Indent first so there is something to outdent.
    const base = await focusedDepth(page);
    await page.keyboard.press('Tab');
    await expect.poll(() => focusedDepth(page)).toBe(base + 1);

    // Outdent returns it to its original depth.
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusedDepth(page)).toBe(base);
  });

  test('items with children show filled bullet', async ({ page }) => {
    // Find an item that has children - "Getting Started" has children
    const gettingStarted = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();

    // Check that it has a filled bullet (● = expanded with children)
    const bullet = gettingStarted.locator('.bullet').first();
    await expect(bullet).toHaveText('●');
  });

  test('clicking bullet collapses children', async ({ page }) => {
    // Find "Getting Started" which has children
    const gettingStartedRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();

    // Find its bullet (should show ● indicating expanded with children)
    const bullet = gettingStartedRow.locator('.bullet').first();
    await expect(bullet).toHaveText('●');

    // Check that children are visible before collapse
    // "Press Enter to create a new item" is a child of "Getting Started"
    const childItem = page.locator('.editor-wrapper').filter({ hasText: 'Press Enter to create a new item' });
    await expect(childItem).toBeVisible();

    // Click bullet to collapse
    await bullet.click();
    await page.waitForTimeout(100);

    // Children should now be hidden
    await expect(childItem).not.toBeVisible();
  });

  test('clicking bullet expands children', async ({ page }) => {
    // First collapse "Getting Started"
    const gettingStartedRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const bullet = gettingStartedRow.locator('.bullet').first();

    // Collapse
    await bullet.click();
    await page.waitForTimeout(100);

    // Verify collapsed
    const childItem = page.locator('.editor-wrapper').filter({ hasText: 'Press Enter to create a new item' });
    await expect(childItem).not.toBeVisible();

    // Now click to expand
    await bullet.click();
    await page.waitForTimeout(100);

    // Children should be visible again
    await expect(childItem).toBeVisible();
  });

  test('bullet shows correct state', async ({ page }) => {
    const gettingStartedRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const bullet = gettingStartedRow.locator('.bullet').first();

    // Initially expanded - should show ● (filled)
    await expect(bullet).toHaveText('●');

    // Collapse
    await bullet.click();
    await page.waitForTimeout(100);

    // Should now show ◉ (collapsed indicator - fisheye)
    await expect(bullet).toHaveText('◉');

    // Expand again
    await bullet.click();
    await page.waitForTimeout(100);

    // Should show ● again
    await expect(bullet).toHaveText('●');
  });

  test('items without children show filled bullet', async ({ page }) => {
    // Create a new leaf item to test with
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Test leaf item');
    await page.waitForTimeout(100);

    // Leaf items show filled bullet (same as expanded parents)
    const leafItem = page.locator('.outline-item.focused');
    const bullet = leafItem.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('●');
    await expect(bullet).not.toHaveClass(/has-children/);
  });

  test('indent then outdent returns to the original depth', async ({ page }) => {
    // Build two siblings so the second one has a previous sibling to indent under.
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);
    const c0 = await page.locator('.outline-item').count();
    await page.keyboard.press('Enter');
    await expect(page.locator('.outline-item')).toHaveCount(c0 + 1); // new item exists
    await page.waitForTimeout(80);                                   // editor mount/focus settles
    await page.keyboard.type('cycleA');
    await page.keyboard.press('Enter');
    await expect(page.locator('.outline-item')).toHaveCount(c0 + 2);
    await page.waitForTimeout(80);
    await page.keyboard.type('cycleB');
    await expect(page.locator('.outline-item.focused .outline-editor')).toHaveText('cycleB');

    const initial = await focusedDepth(page);

    // Indent cycleB under cycleA, then outdent back.
    await page.keyboard.press('Tab');
    await expect.poll(() => focusedDepth(page)).toBe(initial + 1);

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusedDepth(page)).toBe(initial);
  });
});
