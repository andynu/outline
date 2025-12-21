import { test, expect } from '@playwright/test';

test.describe('Bullet styles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('.outline-item');
  });

  test('leaf items show hollow bullet (○)', async ({ page }) => {
    // Create a new item with no children
    await page.keyboard.press('End'); // Go to last item
    await page.keyboard.press('Enter');
    await page.keyboard.type('Leaf item test');

    // Wait for the new item to be rendered
    await page.waitForTimeout(100);

    // The new item should show a hollow bullet since it has no children
    const newItem = page.locator('.outline-item').filter({ hasText: 'Leaf item test' });
    const bullet = newItem.locator('.bullet');

    // Check that it's a hollow bullet (no children)
    await expect(bullet).toHaveText('○');
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

  test('collapsed items with children show dot bullet (◉)', async ({ page }) => {
    // Find an item with children that we can collapse
    const collapseButton = page.locator('.expand-btn').first();
    await expect(collapseButton).toBeVisible();

    // Get the parent outline-item
    const parentItem = collapseButton.locator('..');

    // Click to collapse
    await collapseButton.click();

    // Wait for collapse animation
    await page.waitForTimeout(100);

    // Now the bullet should show the collapsed indicator (◉)
    const bullet = parentItem.locator('.bullet').first();
    await expect(bullet).toHaveText('◉');
    await expect(bullet).toHaveClass(/has-children/);
    await expect(bullet).toHaveClass(/collapsed/);
  });

  test('bullet style updates when item gets children', async ({ page }) => {
    // Create a new leaf item
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Parent to be');

    // Verify it starts as a leaf (hollow bullet)
    const parentItem = page.locator('.outline-item').filter({ hasText: 'Parent to be' });
    let bullet = parentItem.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('○');

    // Add a child by pressing Enter then Tab to indent
    await page.keyboard.press('Enter');
    await page.keyboard.type('Child item');
    await page.keyboard.press('Tab');

    // Wait for update
    await page.waitForTimeout(100);

    // Now the parent should show a filled bullet
    bullet = parentItem.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('●');
    await expect(bullet).toHaveClass(/has-children/);
  });

  test('bullet style updates when collapsing/expanding', async ({ page }) => {
    // Find an expandable item
    const collapseButton = page.locator('.expand-btn').first();
    await expect(collapseButton).toBeVisible();

    // Get the bullet (using the parent .item-row)
    const itemRow = collapseButton.locator('..');
    const bullet = itemRow.locator('.bullet');

    // Start expanded - should show ●
    await expect(bullet).toHaveText('●');

    // Collapse - should show ◉
    await collapseButton.click();
    await page.waitForTimeout(100);
    await expect(bullet).toHaveText('◉');

    // Expand again - should show ●
    await collapseButton.click();
    await page.waitForTimeout(100);
    await expect(bullet).toHaveText('●');
  });

  test('checkbox items do not show bullets', async ({ page }) => {
    // Find or create a checkbox item
    // First create a new item
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Checkbox test');

    // Convert to checkbox with Ctrl+Shift+X
    await page.keyboard.press('Control+Shift+X');

    // The item should show a checkbox, not a bullet
    const checkboxItem = page.locator('.outline-item').filter({ hasText: 'Checkbox test' });
    await expect(checkboxItem.locator('.checkbox-btn')).toBeVisible();
    await expect(checkboxItem.locator('.bullet')).not.toBeVisible();
  });
});
