import { test, expect } from '@playwright/test';

// Dynalist-style progressive Ctrl+A cascade.
// Initial mock data shape:
//   - "Welcome to Outline" (title root, not in visible list)
//   - "Getting Started" (root2, has 3 children)
//       - "Press Enter to create a new item"
//       - "Press Tab to indent"          <-- our "current" anchor
//       - "Press Shift+Tab to outdent"
//   - "Features" (root3, has 3 children)
//       - "Hierarchical notes"
//       - "Rich text editing"
//       - "Cross-device sync (coming soon)"

test.describe('Progressive Ctrl+A cascade', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('outline-session-state');
    });
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('five-press cascade: text → node → siblings → parent → parent-siblings/all', async ({ page }) => {
    // Focus "Press Tab to indent" with cursor mid-text.
    const anchor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await anchor.click();
    await page.waitForTimeout(100);

    // Place cursor at end and collapse any accidental selection.
    await page.keyboard.press('End');
    await page.waitForTimeout(50);

    // Press 1: Ctrl+A → editor text selected (navigate mode NOT active).
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);

    // After the first press, focus is still in the editor (edit mode) and no
    // outline item has been selected yet.
    expect(await page.locator('.outline-item.selected').count()).toBe(0);
    // The focused item is still being edited (OutlineItem renders the editor,
    // not OutlineItemStatic).
    expect(await page.locator('.outline-item.focused .outline-editor').count()).toBe(1);

    // Press 2: Ctrl+A → exit edit mode, select current node only.
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);

    let selected = await page.locator('.outline-item.selected').allTextContents();
    expect(selected.length).toBe(1);
    expect(selected[0]).toContain('Press Tab to indent');

    // Press 3: Ctrl+A → include siblings of current (all 3 children of "Getting Started").
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);

    selected = await page.locator('.outline-item.selected').allTextContents();
    const selectedText = selected.join('\n');
    expect(selectedText).toContain('Press Enter to create a new item');
    expect(selectedText).toContain('Press Tab to indent');
    expect(selectedText).toContain('Press Shift+Tab to outdent');
    // Parent "Getting Started" should NOT be selected yet.
    expect(selectedText).not.toContain('Getting Started');

    // Press 4: Ctrl+A → include parent node "Getting Started".
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);

    selected = await page.locator('.outline-item.selected').allTextContents();
    const selectedText4 = selected.join('\n');
    expect(selectedText4).toContain('Getting Started');
    expect(selectedText4).toContain('Press Tab to indent');
    // "Features" (parent's sibling) should NOT be included at this step.
    expect(selectedText4).not.toContain('Features');

    // Press 5: Ctrl+A → include parent's siblings. Parent is a root, so we cap
    // to "all visible" (which includes Features subtree). "Welcome to Outline"
    // is the title root and not rendered as an outline-item.
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);

    selected = await page.locator('.outline-item.selected').allTextContents();
    const selectedText5 = selected.join('\n');
    expect(selectedText5).toContain('Getting Started');
    expect(selectedText5).toContain('Features');
    expect(selectedText5).toContain('Hierarchical notes');
    expect(selectedText5).toContain('Rich text editing');
    expect(selectedText5).toContain('Cross-device sync');

    // All visible outline-items should be selected.
    const visibleCount = await page.locator('.outline-item').count();
    const selectedCount = await page.locator('.outline-item.selected').count();
    expect(selectedCount).toBe(visibleCount);

    // Press 6: we're capped — selection stays the same.
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    const finalCount = await page.locator('.outline-item.selected').count();
    expect(finalCount).toBe(visibleCount);
  });

  test('clicking another node resets cascade state', async ({ page }) => {
    const anchor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await anchor.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('End');

    // Advance to level 3 (text → node → siblings).
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);

    expect(await page.locator('.outline-item.selected').count()).toBeGreaterThan(1);

    // Click a different editor to reset focus. The click should also clear selection.
    const other = page.locator('.editor-wrapper').filter({ hasText: /^Hierarchical notes$/ });
    await other.click();
    await page.waitForTimeout(150);

    expect(await page.locator('.outline-item.selected').count()).toBe(0);

    // Press Ctrl+A now: we are in a new editor. Behavior should start from step 1
    // (editor text selection), not jump straight to node-level selection.
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);

    expect(await page.locator('.outline-item.selected').count()).toBe(0);
    expect(await page.locator('.outline-item.focused .outline-editor').count()).toBe(1);

    // A second press advances to node-level selection, confirming the cascade
    // restarted at level 1 (not continuing from the previous level 3).
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);
    const selected = await page.locator('.outline-item.selected').allTextContents();
    expect(selected.length).toBe(1);
    expect(selected[0]).toContain('Hierarchical notes');
  });

  test('pre-existing full text selection advances directly to node selection', async ({ page }) => {
    const anchor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await anchor.click();
    await page.waitForTimeout(100);

    // Programmatically select all text in the active editor without using Ctrl+A.
    await page.evaluate(() => {
      const active = document.activeElement;
      const editor = active?.closest('.outline-editor') as HTMLElement | null;
      if (!editor) return;
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    await page.waitForTimeout(50);

    // Single Ctrl+A should advance directly to node-level selection.
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);

    const selected = await page.locator('.outline-item.selected').allTextContents();
    expect(selected.length).toBe(1);
    expect(selected[0]).toContain('Press Tab to indent');
  });

  test('Ctrl+Shift+A still selects siblings (does not interfere with cascade)', async ({ page }) => {
    const anchor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await anchor.click();
    await page.waitForTimeout(100);

    // Exit edit mode with Escape first so Ctrl+Shift+A global handler fires.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);

    await page.keyboard.press('Control+Shift+A');
    await page.waitForTimeout(150);

    const selected = await page.locator('.outline-item.selected').allTextContents();
    const joined = selected.join('\n');
    expect(joined).toContain('Press Enter to create a new item');
    expect(joined).toContain('Press Tab to indent');
    expect(joined).toContain('Press Shift+Tab to outdent');
    // Should not yet include the parent.
    expect(joined).not.toContain('Getting Started');
  });
});
