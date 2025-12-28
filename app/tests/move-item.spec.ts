import { test, expect } from '@playwright/test';

test.describe('Move item with Shift+Arrow keys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Shift+Down moves item down one position', async ({ page }) => {
    // Click on "Welcome to Outline" (first root item)
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Welcome to Outline$/ });
    await editor.click();
    await page.waitForTimeout(100);

    // Verify it's focused
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toBeVisible();

    // Press Shift+Down to move the first item down
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForTimeout(200);

    // The second root item should now be "Welcome to Outline"
    // "Getting Started" should now be first
    const firstEditor = page.locator('.editor-wrapper').first();
    await expect(firstEditor).toHaveText('Getting Started');
  });

  test('Shift+Down works multiple times consecutively', async ({ page }) => {
    // Click on "Welcome to Outline" (first root item)
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Welcome to Outline$/ });
    await editor.click();
    await page.waitForTimeout(100);

    // Press Shift+Down to move down once
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForTimeout(200);

    // "Welcome to Outline" should now be at second position (Getting Started is first)
    const secondRootItem = page.locator('.outline-container > .outline-item').nth(1);
    const secondEditor = secondRootItem.locator('.editor-wrapper').first();
    await expect(secondEditor).toHaveText('Welcome to Outline');

    // Press Shift+Down again to move down again
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForTimeout(200);

    // "Welcome to Outline" should now be at third position
    const thirdRootItem = page.locator('.outline-container > .outline-item').nth(2);
    const thirdEditor = thirdRootItem.locator('.editor-wrapper').first();
    await expect(thirdEditor).toHaveText('Welcome to Outline');
  });

  test('Shift+Up moves item up one position', async ({ page }) => {
    // Click on "Getting Started" (second root item)
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Getting Started$/ });
    await editor.click();
    await page.waitForTimeout(100);

    // Verify it's focused
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toBeVisible();

    // Press Shift+Up to move the second item up
    await page.keyboard.press('Shift+ArrowUp');
    await page.waitForTimeout(200);

    // "Getting Started" should now be first
    const firstEditor = page.locator('.editor-wrapper').first();
    await expect(firstEditor).toHaveText('Getting Started');
  });

  test('Shift+Up works multiple times consecutively', async ({ page }) => {
    // Click on "Features" (third root item)
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Features$/ });
    await editor.click();
    await page.waitForTimeout(100);

    // Press Shift+Up to move up once
    await page.keyboard.press('Shift+ArrowUp');
    await page.waitForTimeout(200);

    // "Features" should now be at second position
    const secondRootItem = page.locator('.outline-container > .outline-item').nth(1);
    const secondEditor = secondRootItem.locator('.editor-wrapper').first();
    await expect(secondEditor).toHaveText('Features');

    // Press Shift+Up again to move up again
    await page.keyboard.press('Shift+ArrowUp');
    await page.waitForTimeout(200);

    // "Features" should now be at first position
    const firstEditor = page.locator('.editor-wrapper').first();
    await expect(firstEditor).toHaveText('Features');
  });
});

test.describe('Quick Move dialog (Ctrl+Shift+M)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('opens quick move dialog and moves item to another parent', async ({ page }) => {
    // Focus on "Welcome to Outline" (first root item)
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Welcome to Outline$/ });
    await editor.click();
    await page.waitForTimeout(100);

    // Verify it's focused
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toBeVisible();

    // Get initial parent (should be root)
    const welcomeText = await page.locator('.outline-item.focused .editor-wrapper').textContent();
    expect(welcomeText).toContain('Welcome to Outline');

    // Open quick move dialog with Ctrl+Shift+M
    await page.keyboard.press('Control+Shift+M');
    await page.waitForTimeout(200);

    // Dialog should be visible
    const dialog = page.locator('.modal-backdrop');
    await expect(dialog).toBeVisible();

    // Type search query for "Features"
    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Features');
    await page.waitForTimeout(300);

    // Results should appear
    const results = page.locator('.result');
    await expect(results.first()).toBeVisible();

    // Press Enter to move to the selected result
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // "Welcome to Outline" should now be a child of "Features"
    // Find the Features item by its static-content text
    const featuresItem = page.locator('.outline-item').filter({
      has: page.locator('.static-content').filter({ hasText: 'Features' })
    }).first();
    const featuresChildren = featuresItem.locator('> .children-wrapper > .children > .outline-item');

    // Check that "Welcome to Outline" is now a child of Features
    // The moved item should be focused, so look for the TipTap editor
    await expect(featuresChildren).toHaveCount(4, { timeout: 5000 });

    // Verify the moved item is there (4 children: 3 original + 1 moved)
    const welcomeChild = featuresChildren.filter({ hasText: /Welcome to Outline/ });
    await expect(welcomeChild).toBeVisible({ timeout: 5000 });
  });
});
