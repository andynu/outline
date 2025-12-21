import { test, expect } from '@playwright/test';

test.describe('Rich text formatting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+B makes text bold', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type some text
    await page.keyboard.type('some text here');
    await page.waitForTimeout(100);

    // Select "text"
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await page.keyboard.press('Control+Shift+ArrowLeft');

    // Press Ctrl+B to bold
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(100);

    // Check for bold formatting
    const focusedItem = page.locator('.outline-item.focused');
    const bold = focusedItem.locator('strong');
    await expect(bold).toBeVisible();
  });

  test('Ctrl+I makes text italic', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('some text here');
    await page.waitForTimeout(100);

    // Select "text"
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await page.keyboard.press('Control+Shift+ArrowLeft');

    // Press Ctrl+I to italicize
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(100);

    // Check for italic formatting
    const focusedItem = page.locator('.outline-item.focused');
    const italic = focusedItem.locator('em');
    await expect(italic).toBeVisible();
  });


  test('toggle bold on and off', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('bold test');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.press('Control+a');

    // Bold on
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    let bold = focusedItem.locator('strong');
    await expect(bold).toBeVisible();

    // Bold off
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(100);

    bold = focusedItem.locator('strong');
    await expect(bold).not.toBeVisible();
  });

  test('auto-link detects URLs', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type a URL followed by space to trigger auto-link
    await page.keyboard.type('Check out https://example.com for more', { delay: 30 });
    await page.waitForTimeout(200);

    // Check for link
    const focusedItem = page.locator('.outline-item.focused');
    const link = focusedItem.locator('a[href]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://example.com');
  });

  test('auto-link with www prefix', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Visit www.example.com today', { delay: 30 });
    await page.waitForTimeout(200);

    const focusedItem = page.locator('.outline-item.focused');
    const link = focusedItem.locator('a[href]');
    await expect(link).toBeVisible();
  });

  test('link has target blank attribute', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('See https://test.com here', { delay: 30 });
    await page.waitForTimeout(200);

    const focusedItem = page.locator('.outline-item.focused');
    const link = focusedItem.locator('a[href]');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('Ctrl+E makes text code', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('some code here');
    await page.waitForTimeout(100);

    // Select "code"
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await page.keyboard.press('Control+Shift+ArrowLeft');

    // Press Ctrl+E to make code (TipTap default)
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(100);

    // Check for code formatting
    const focusedItem = page.locator('.outline-item.focused');
    const code = focusedItem.locator('code');
    await expect(code).toBeVisible();
  });

  test('multiple formatting can be combined', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('formatted text');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.press('Control+a');

    // Apply bold
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(50);

    // Apply italic
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    // Should have both bold and italic
    const boldItalic = focusedItem.locator('strong em, em strong');
    await expect(boldItalic).toBeVisible();
  });
});
