import { test, expect } from '@playwright/test';

type Row = { text: string; depth: number; focused: boolean };
// Visible items, top-to-bottom, with nesting depth (number of .children-wrapper
// ancestors). Focused items render .outline-editor, others .static-content —
// exactly one content node per item.
async function visibleTree(page: import('@playwright/test').Page): Promise<Row[]> {
  return page.$$eval('.outline-editor, .static-content', (nodes) =>
    nodes.map((n) => {
      const item = (n as HTMLElement).closest('.outline-item') as HTMLElement | null;
      let depth = 0;
      let p: HTMLElement | null = item?.parentElement ?? null;
      while (p) { if (p.classList && p.classList.contains('children-wrapper')) depth++; p = p.parentElement; }
      return { text: (n.textContent || '').trim(), depth, focused: !!(item && item.classList.contains('focused')) };
    })
  );
}

test.describe('Enter key split behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Enter at end of line creates new empty sibling (existing behavior)', async ({ page }) => {
    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Get initial item count
    const initialCount = await page.locator('.outline-item').count();

    // Type some content
    await page.keyboard.type('Test content');
    await page.waitForTimeout(100);

    // Press End to ensure we're at the end
    await page.keyboard.press('End');
    await page.waitForTimeout(50);

    // Press Enter to create new sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Check that a new item was created
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount + 1);

    // The focused item should be empty
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('');
  });

  test('Enter at beginning of line creates blank item above', async ({ page }) => {
    // Create a new item with specific content
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type content
    const testContent = 'Content to keep';
    await page.keyboard.type(testContent);
    await page.waitForTimeout(100);

    // Get item count before split
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // A new item should be created
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);

    // The focused item should still have the original content
    // (focus stays on original item, not the new blank)
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe(testContent);
  });

  test('Enter in middle of line splits content', async ({ page }) => {
    // Create a new item with specific content
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type content that we'll split
    const beforeText = 'Hello ';
    const afterText = 'World';
    await page.keyboard.type(beforeText + afterText);
    await page.waitForTimeout(100);

    // Get item count before split
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to the split position (after "Hello ")
    await page.keyboard.press('Home');
    for (let i = 0; i < beforeText.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Enter to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // A new item should be created
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);

    // The new focused item should have the "after" content
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const newContent = await focusedEditor.textContent();
    expect(newContent).toBe(afterText);
  });

  test('Split preserves formatting', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type formatted content: "normal **bold** more"
    await page.keyboard.type('normal ');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('bold');
    await page.keyboard.press('Control+b');
    await page.keyboard.type(' more');
    await page.waitForTimeout(100);

    // Get count before split
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to middle of "bold" (after "bo")
    await page.keyboard.press('Home');
    // Skip "normal " (7 chars) + "bo" (2 chars) = 9 positions
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Enter to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // New item should be created
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);

    // Check the focused item has the split content
    // Should contain "ld more" with "ld" still bold
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const html = await focusedEditor.innerHTML();
    // The "ld" part should be wrapped in <strong>
    expect(html).toContain('<strong>');
    expect(html).toContain('ld');
  });

  test('Split on an expanded parent: after-text becomes first child, children stay (otl-3smu)', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Build ParentZ with children C1, C2 (expanded)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('ParentZ');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('C1');
    await page.waitForTimeout(150);
    await page.keyboard.press('Tab'); // C1 becomes child of ParentZ
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('C2'); // sibling of C1 (also child of ParentZ)
    await page.waitForTimeout(200);

    // Focus ParentZ (visible order: ParentZ, C1, C2 -> two ArrowUps)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    // Restore DOM focus (lost after structural/nav ops), then place caret after "Paren"
    await page.locator('.outline-item.focused .outline-editor').click();
    await page.waitForTimeout(60);
    expect(await page.locator('.outline-item.focused .outline-editor').textContent()).toBe('ParentZ');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);

    // Split: "Paren" | "tZ"
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // The after-text is focused...
    const focused = page.locator('.outline-item.focused .outline-editor');
    expect(await focused.textContent()).toBe('tZ');

    // ...and it is the FIRST CHILD of "Paren", which keeps C1/C2. Children never migrate.
    const tree = await visibleTree(page);
    const pIdx = tree.findIndex((r) => r.text === 'Paren');
    expect(pIdx).toBeGreaterThanOrEqual(0);
    const d = tree[pIdx].depth;
    expect(tree[pIdx + 1]).toMatchObject({ text: 'tZ', depth: d + 1, focused: true });
    expect(tree[pIdx + 2]).toMatchObject({ text: 'C1', depth: d + 1 });
    expect(tree[pIdx + 3]).toMatchObject({ text: 'C2', depth: d + 1 });
  });

  test('Enter on empty item creates new sibling', async ({ page }) => {
    // Click first editor
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create an empty new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Count before second Enter
    const countBefore = await page.locator('.outline-item').count();

    // Press Enter on the empty item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should create another item
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore + 1);
  });

  test('Split while zoomed into a node with children keeps the view populated', async ({ page }) => {
    // Create a parent item with children
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Clear any existing content and type parent content
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Parent item with children');
    await page.waitForTimeout(100);

    // Create a child by pressing Enter then Tab (indent)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item 1');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Create another child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item 2');
    await page.waitForTimeout(100);

    // Go back to parent (navigate up twice)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on the parent with children
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const parentContent = await focusedEditor.textContent();
    expect(parentContent).toBe('Parent item with children');

    // Zoom into this parent (Ctrl+])
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(200);

    // Verify zoom breadcrumbs appear
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // Count items before split
    const itemsBefore = await page.locator('.outline-item').count();
    expect(itemsBefore).toBeGreaterThan(0);

    // Now split the zoomed parent in the middle
    await page.keyboard.press('Home');
    // Move to middle (after "Parent ")
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Enter to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // The key test: outline should NOT be empty - items should still be visible.
    // Under otl-3smu the after-text becomes a first child (inside the zoom) and
    // the existing children stay, so the view is populated without zooming out.
    const itemsAfter = await page.locator('.outline-item').count();
    expect(itemsAfter).toBeGreaterThan(0);
  });

  test('Split places caret at the split point (start of new item), not the end', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Fresh item with content to split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('HelloWorld');
    await page.waitForTimeout(100);

    // Move caret to just after "Hello" (5 chars from start)
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Split
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // New focused item holds the "after" text
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    expect(await focusedEditor.textContent()).toBe('World');

    // Caret must be at the START of the new item: the next typed char lands before "World"
    await page.keyboard.type('X');
    await page.waitForTimeout(100);
    expect(await focusedEditor.textContent()).toBe('XWorld');
  });
});
