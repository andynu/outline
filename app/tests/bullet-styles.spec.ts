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
    // Click on an existing item to ensure focus
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create a new leaf item using Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200); // Wait for editor to initialize
    await page.keyboard.type('Parent to be');
    await page.waitForTimeout(100);

    // Verify it starts as a leaf (filled bullet, no has-children class)
    const parentItem = page.locator('.outline-item').filter({ hasText: 'Parent to be' });
    await expect(parentItem).toBeVisible();
    let bullet = parentItem.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('●');
    await expect(bullet).not.toHaveClass(/has-children/);

    // Add a child by pressing Enter then Tab to indent
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200); // Wait for new editor to initialize
    await page.keyboard.type('Child item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');

    // Wait for update
    await page.waitForTimeout(200);

    // Now the parent should have has-children class (still filled bullet)
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
