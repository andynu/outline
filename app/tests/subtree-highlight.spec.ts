import { test, expect } from '@playwright/test';

test.describe('Subtree highlight', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('.outline-item');
  });

  test('focused item has stronger highlight than its children', async ({ page }) => {
    // Find an item with children and focus it
    const itemWithChildren = page.locator('.outline-item').filter({
      has: page.locator('.children-wrapper'),
    }).first();

    // Click to focus the parent item
    await itemWithChildren.locator('> .item-row').click();
    await page.waitForTimeout(100);

    // The parent should have .focused class
    await expect(itemWithChildren).toHaveClass(/focused/);

    // Child items should have .in-focused-subtree class (not the .focused class directly)
    const children = itemWithChildren.locator('.children .outline-item');
    const firstChild = children.first();
    await expect(firstChild).toHaveClass(/in-focused-subtree/);
    // The child should NOT be the focused item itself
    const childClasses = await firstChild.getAttribute('class');
    expect(childClasses).toContain('in-focused-subtree');
    expect(childClasses?.split(' ').includes('focused')).toBe(false);
  });

  test('subtree highlight is removed when focus moves away', async ({ page }) => {
    // Find an item with children
    const itemWithChildren = page.locator('.outline-item').filter({
      has: page.locator('.children-wrapper'),
    }).first();

    // Focus it
    await itemWithChildren.locator('> .item-row').click();
    await page.waitForTimeout(100);

    // Verify children have subtree class
    const children = itemWithChildren.locator('.children .outline-item');
    await expect(children.first()).toHaveClass(/in-focused-subtree/);

    // Now focus a different item (use arrow down to go to a child)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // The first child is now focused, so the parent should not be focused
    await expect(itemWithChildren).not.toHaveClass(/focused/);
    // The first child should now be focused
    await expect(children.first()).toHaveClass(/focused/);
    // The first child should not have in-focused-subtree since it's the focused one
    await expect(children.first()).not.toHaveClass(/in-focused-subtree/);
  });

  test('nested subtree items get subtree highlight class', async ({ page }) => {
    // Create a nested structure: parent > child > grandchild
    // First find an existing item with multiple levels
    const expandBtns = page.locator('.expand-btn');

    // Expand all items to ensure we have visible nested structure
    for (let i = 0; i < 3; i++) {
      const btn = expandBtns.nth(i);
      if (await btn.isVisible()) {
        const isCollapsed = await btn.locator('.expand-icon').textContent();
        if (isCollapsed === '▶') {
          await btn.click();
        }
      }
    }

    await page.waitForTimeout(100);

    // Find an item with a child that also has children (nested)
    const nestedItem = page.locator('.outline-item').filter({
      has: page.locator('.children-wrapper .outline-item .children-wrapper'),
    }).first();

    if (await nestedItem.count() > 0) {
      // Focus the root of this nested structure
      await nestedItem.locator('> .item-row').click();
      await page.waitForTimeout(100);

      // All descendants should have the subtree class
      const allDescendants = nestedItem.locator('.children-wrapper .outline-item');
      const count = await allDescendants.count();

      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(allDescendants.nth(i)).toHaveClass(/in-focused-subtree/);
      }
    }
  });

  test('focused child does not have subtree class', async ({ page }) => {
    // Find an item with children
    const itemWithChildren = page.locator('.outline-item').filter({
      has: page.locator('.children-wrapper'),
    }).first();

    // Focus it
    await itemWithChildren.locator('> .item-row').click();
    await page.waitForTimeout(100);

    // Get the first child and focus it
    const firstChild = itemWithChildren.locator('.children .outline-item').first();

    // Navigate to the child
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // The child should be focused (not have in-focused-subtree)
    await expect(firstChild).toHaveClass(/focused/);
    await expect(firstChild).not.toHaveClass(/in-focused-subtree/);
  });
});
