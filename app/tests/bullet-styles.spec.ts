import { test, expect } from '@playwright/test';

test.describe('Bullet styles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('.outline-item');
  });

  test('leaf items show filled bullet (●)', async ({ page }) => {
    // Click on an existing item to ensure focus
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create a new item with no children
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Leaf item test');
    await page.waitForTimeout(100);

    // The new item should be focused (use .focused class like other tests)
    const newItem = page.locator('.outline-item.focused');
    await expect(newItem).toBeVisible();
    const bullet = newItem.locator('> .item-row .bullet');

    // Check that it's a filled bullet
    await expect(bullet).toHaveText('●');
    await expect(bullet).not.toHaveClass(/has-children/);
  });

  test('items with visible children show filled bullet (●)', async ({ page }) => {
    // Find an item that has visible children (expanded)
    // The "Getting Started" or "Features" items should have children in demo data
    const itemWithChildren = page.locator('.outline-item').filter({
      has: page.locator('.children-wrapper'),
    }).first();

    // Get the bullet for this item
    const bullet = itemWithChildren.locator('> .item-row .bullet').first();

    // Should show filled bullet and have has-children class
    await expect(bullet).toHaveText('●');
    await expect(bullet).toHaveClass(/has-children/);
    await expect(bullet).not.toHaveClass(/collapsed/);
  });

  test('collapsed items with children show fisheye bullet (◉)', async ({ page }) => {
    // Find an item with children - "Getting Started" has children
    const itemWithChildren = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const bullet = itemWithChildren.locator('> .item-row .bullet').first();

    // Start expanded - should show ●
    await expect(bullet).toHaveText('●');

    // Click bullet to collapse
    await bullet.click();

    // Wait for collapse animation
    await page.waitForTimeout(100);

    // Now the bullet should show the collapsed indicator (◉)
    await expect(bullet).toHaveText('◉');
    await expect(bullet).toHaveClass(/has-children/);
    await expect(bullet).toHaveClass(/collapsed/);
  });

  test('bullet gets has-children class when item gets children', async ({ page }) => {
    const items = page.locator('.outline-item');
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');

    // Helper: ensure the focused item's contenteditable has DOM focus before
    // editor-scoped keys. React focus lands first, but the contenteditable only
    // receives DOM focus on a setTimeout(0) tick (editor-dom-focus-race), so a
    // keypress fired too early is dropped. Clicking the focused editor forces it,
    // and End parks the caret at line end so a following Enter creates a trailing
    // sibling instead of splitting mid-text.
    const focusEditor = async () => {
      await expect(page.locator('.outline-item.focused')).toHaveCount(1);
      await focusedEditor.click();
      await page.keyboard.press('End');
    };

    // Focus Getting Started (the first real outline item; the first root is the
    // document title — see otl-nroo) and give its editor DOM focus.
    await page.locator('.outline-container > .outline-item')
      .filter({ hasText: 'Getting Started' }).first()
      .locator('.editor-wrapper').first().click();
    await focusEditor();
    const baseCount = await items.count();

    // Create a new leaf item with Enter, gating each step on observed state.
    await page.keyboard.press('Enter');
    await expect(items).toHaveCount(baseCount + 1);
    await focusEditor();
    await page.keyboard.type('Parent to be');
    await expect(focusedEditor).toHaveText('Parent to be');

    // Scope to the item whose OWN row carries the text. A bare
    // filter({ hasText: 'Parent to be' }) also matches any ANCESTOR whose subtree
    // contains it: pressing Enter at the end of an expanded parent (Getting
    // Started) inserts "Parent to be" as its first child (Workflowy behavior, see
    // useOutlineEditor), so Getting Started's subtree now contains the text and
    // .first() would resolve to Getting Started — which already has children, so
    // the "no has-children" assertion would see a stale parent. A parent's own
    // children live under > .children-wrapper, never under > .item-row, so
    // matching the row text isolates "Parent to be" itself.
    const parentItem = page.locator('.outline-item')
      .filter({ has: page.locator('> .item-row', { hasText: 'Parent to be' }) });
    await expect(parentItem).toBeVisible();
    let bullet = parentItem.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('●');
    await expect(bullet).not.toHaveClass(/has-children/);

    // Add a child: Enter to create a sibling, type it, then Tab to indent it
    // under "Parent to be".
    await page.keyboard.press('Enter');
    await expect(items).toHaveCount(baseCount + 2);
    await focusEditor();
    await page.keyboard.type('Child item');
    await expect(focusedEditor).toHaveText('Child item');
    await focusEditor();
    await page.keyboard.press('Tab');

    // The child now nests under "Parent to be"; the parent gains has-children
    // (still a filled bullet).
    await expect(
      parentItem.locator('> .children-wrapper > .children > .outline-item').filter({ hasText: 'Child item' })
    ).toBeVisible();
    bullet = parentItem.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('●');
    await expect(bullet).toHaveClass(/has-children/);
  });

  test('bullet style updates when collapsing/expanding', async ({ page }) => {
    // Find an item with children - "Getting Started" has children
    const itemWithChildren = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const bullet = itemWithChildren.locator('> .item-row .bullet').first();

    // Start expanded - should show ●
    await expect(bullet).toHaveText('●');

    // Collapse by clicking bullet - should show ◉
    await bullet.click();
    await page.waitForTimeout(100);
    await expect(bullet).toHaveText('◉');

    // Expand again by clicking bullet - should show ●
    await bullet.click();
    await page.waitForTimeout(100);
    await expect(bullet).toHaveText('●');
  });

  test('checkbox items do not show bullets', async ({ page }) => {
    // Click on an existing item to ensure focus
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Checkbox test');
    await page.waitForTimeout(100);

    // Use the focused item locator (more reliable than hasText for TipTap editors)
    const focusedItem = page.locator('.outline-item.focused');

    // Verify it's a bullet initially
    await expect(focusedItem.locator('.bullet')).toBeVisible();

    // Convert to checkbox with Ctrl+Shift+X
    await page.keyboard.press('Control+Shift+x');
    await page.waitForTimeout(100);

    // The item should show a checkbox, not a bullet
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    await expect(focusedItem.locator('.bullet')).not.toBeVisible();
  });
});
