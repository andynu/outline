import { test, expect } from '@playwright/test';

// Regression test for otl-o38c: pressing Enter on the last root item should
// insert the new item AFTER that item (at the end), not somewhere in the
// middle. Previously fixed in 9538af6 for `=== null` vs `== null` on
// parent_id; this file re-proves the invariant at the integration level and
// covers additional edge cases (last child, repeated Enter).

test.describe('Enter on last root item — position correctness (otl-o38c)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  // Read the text of each root-level outline item in DOM order.
  async function readRootItemContents(page: import('@playwright/test').Page): Promise<string[]> {
    return await page.evaluate(() => {
      // Root-level items are direct children of .outline-container.
      const items = Array.from(document.querySelectorAll('.outline-container > .outline-item'));
      return items.map(el => {
        // Focused items have a TipTap editor (.outline-editor); unfocused have
        // static HTML in .static-content. Both live inside .editor-wrapper.
        const wrapper = el.querySelector(':scope > .item-row .editor-wrapper');
        const editor = wrapper?.querySelector('.outline-editor, .static-content');
        return (editor?.textContent ?? '').trim();
      });
    });
  }

  // Click the item-row of the last root item so it receives focus (triggering
  // mount of the TipTap editor), then return once the editor is ready.
  async function focusLastRootItem(page: import('@playwright/test').Page) {
    const rootItems = page.locator('.outline-container > .outline-item');
    const count = await rootItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Click the content of the last root item; this sets focus via click
    // handler on .item-row.
    const last = rootItems.nth(count - 1);
    const contentClick = last.locator(':scope > .item-row .editor-wrapper').first();
    await contentClick.click();
    // Wait for the TipTap editor to mount for the now-focused item.
    await page.waitForSelector('.outline-container > .outline-item.focused .outline-editor', { timeout: 3000 });
    await page.waitForTimeout(50);
    return count;
  }

  test('Enter on the last (collapsed) root item creates a new empty item AT THE END', async ({ page }) => {
    // Collapse the last root so Enter creates a sibling (not a first-child).
    // The Workflowy-style Enter path only creates a sibling when the current
    // item has no visible children (either no children at all or collapsed).
    const initialRootCount = await focusLastRootItem(page);
    // Collapse with Ctrl+. (see collapse-shortcut.spec.ts)
    await page.keyboard.press('Control+.');
    await page.waitForTimeout(100);

    await page.keyboard.press('End');
    await page.waitForTimeout(30);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    const sentinel = 'SENTINEL_LAST_ROOT_' + Date.now().toString(36);
    await page.keyboard.type(sentinel);
    await page.waitForTimeout(200);

    const contents = await readRootItemContents(page);
    expect(contents.length).toBe(initialRootCount + 1);

    const sentinelIdx = contents.findIndex(c => c.includes(sentinel));
    expect(sentinelIdx, `Sentinel missing. Contents: ${JSON.stringify(contents)}`).toBeGreaterThanOrEqual(0);
    expect(
      sentinelIdx,
      `Sentinel should be LAST root (idx ${contents.length - 1}) but was at idx ${sentinelIdx}. Contents: ${JSON.stringify(contents)}`,
    ).toBe(contents.length - 1);
  });

  test('Two Enters in a row at the end of the last (collapsed) root item both land at the tail in order', async ({ page }) => {
    const initialRootCount = await focusLastRootItem(page);
    await page.keyboard.press('Control+.');
    await page.waitForTimeout(100);
    await page.keyboard.press('End');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const sentinel1 = 'SENT1_' + Date.now().toString(36);
    await page.keyboard.type(sentinel1);
    await page.waitForTimeout(150);

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const sentinel2 = 'SENT2_' + Date.now().toString(36);
    await page.keyboard.type(sentinel2);
    await page.waitForTimeout(200);

    const contents = await readRootItemContents(page);
    expect(contents.length).toBe(initialRootCount + 2);

    const idx1 = contents.findIndex(c => c.includes(sentinel1));
    const idx2 = contents.findIndex(c => c.includes(sentinel2));

    expect(idx1, `sentinel1 missing: ${JSON.stringify(contents)}`).toBeGreaterThanOrEqual(0);
    expect(idx2, `sentinel2 missing: ${JSON.stringify(contents)}`).toBeGreaterThanOrEqual(0);

    expect(idx1, `Expected sentinel1 at idx ${contents.length - 2}`).toBe(contents.length - 2);
    expect(idx2, `Expected sentinel2 at last idx ${contents.length - 1}`).toBe(contents.length - 1);
  });

  test('Enter on last child of a parent lands as the new last child', async ({ page }) => {
    // Mock data: "Getting Started" has three children; last is "Press Shift+Tab to outdent".
    const targetText = 'Press Shift+Tab to outdent';
    const wrappers = page.locator('.outline-item .editor-wrapper');
    const count = await wrappers.count();

    let targetIdx = -1;
    for (let i = 0; i < count; i++) {
      const t = await wrappers.nth(i).textContent();
      if (t?.includes(targetText)) { targetIdx = i; break; }
    }
    expect(targetIdx, 'Expected mock data anchor to exist').toBeGreaterThanOrEqual(0);

    await wrappers.nth(targetIdx).click();
    await page.waitForSelector('.outline-item.focused .outline-editor', { timeout: 3000 });
    await page.waitForTimeout(50);
    await page.keyboard.press('End');

    const sentinel = 'LAST_CHILD_SENT_' + Date.now().toString(36);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.type(sentinel);
    await page.waitForTimeout(200);

    // The new item should be the LAST child of the same parent as the target.
    const positions = await page.evaluate((sent) => {
      const items = Array.from(document.querySelectorAll('.outline-item'));
      for (const item of items) {
        const wrapper = item.querySelector(':scope > .item-row .editor-wrapper');
        const editor = wrapper?.querySelector('.outline-editor, .static-content');
        if (editor?.textContent?.includes(sent)) {
          const parent = item.parentElement!;
          const siblings = Array.from(parent.children).filter(c => c.classList.contains('outline-item'));
          const idx = siblings.indexOf(item);
          const texts = siblings.map(s => {
            const w = s.querySelector(':scope > .item-row .editor-wrapper');
            const e = w?.querySelector('.outline-editor, .static-content');
            return (e?.textContent ?? '').trim();
          });
          return { idx, count: siblings.length, texts };
        }
      }
      return null;
    }, sentinel);

    expect(positions, 'Sentinel must exist in DOM').not.toBeNull();
    expect(
      positions!.idx,
      `Sentinel should be LAST sibling (idx ${positions!.count - 1}) but was idx ${positions!.idx}. Siblings: ${JSON.stringify(positions!.texts)}`,
    ).toBe(positions!.count - 1);
    // The sibling immediately before it should be the original last-child anchor.
    expect(positions!.texts[positions!.idx - 1]).toContain(targetText);
  });
});
