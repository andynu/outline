import { test, expect } from '@playwright/test';

/**
 * Regression tests for otl-pati: DatePicker popup must remain within the
 * viewport regardless of where the trigger badge is, and regardless of
 * the zoom level applied to .outline-container.
 */

test.describe('Date picker viewport overflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('stays within viewport when defer badge is near right edge', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });

    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a defer date so the defer badge appears.
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);
    await expect(page.locator('.date-picker')).toBeVisible();
    await page.locator('.quick-date').filter({ hasText: 'Tomorrow' }).click();
    await page.waitForTimeout(300);

    // Click the defer badge to open the picker from its trigger position.
    const focusedItem = page.locator('.outline-item.focused');
    const deferBadge = focusedItem.locator('.date-badge.defer');
    await expect(deferBadge).toBeVisible();

    // Narrow the viewport so whatever column the badge sits in will be close
    // to the right edge — this reproduces the original bug scenario.
    await deferBadge.click();
    await page.waitForTimeout(150);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    const pickerBox = await datePicker.boundingBox();
    const viewport = page.viewportSize()!;
    expect(pickerBox).not.toBeNull();
    if (!pickerBox) return;

    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.y).toBeGreaterThanOrEqual(0);
    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('stays within viewport at non-default zoom levels', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });

    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a defer date so the badge is available as a trigger.
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);
    await page.locator('.quick-date').filter({ hasText: 'Tomorrow' }).click();
    await page.waitForTimeout(300);

    // Apply zoom via the zoom store (mirrors Ctrl+= several times).
    await page.evaluate(() => {
      const el = document.querySelector('.outline-container') as HTMLElement | null;
      if (el) el.style.zoom = '1.3';
      document.documentElement.style.setProperty('--zoom-level', '1.3');
    });

    const focusedItem = page.locator('.outline-item.focused');
    const deferBadge = focusedItem.locator('.date-badge.defer');
    await expect(deferBadge).toBeVisible();
    await deferBadge.click();
    await page.waitForTimeout(150);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    const pickerBox = await datePicker.boundingBox();
    const viewport = page.viewportSize()!;
    expect(pickerBox).not.toBeNull();
    if (!pickerBox) return;

    // Picker must not overflow viewport edges.
    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.y).toBeGreaterThanOrEqual(0);
    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('due badge picker also stays within viewport near right edge', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });

    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a due date so the due badge appears.
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);
    await page.locator('.quick-date').filter({ hasText: 'Tomorrow' }).click();
    await page.waitForTimeout(300);

    const focusedItem = page.locator('.outline-item.focused');
    const dueBadge = focusedItem.locator('.date-badge:not(.defer)').first();
    await expect(dueBadge).toBeVisible();
    await dueBadge.click();
    await page.waitForTimeout(150);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    const pickerBox = await datePicker.boundingBox();
    const viewport = page.viewportSize()!;
    expect(pickerBox).not.toBeNull();
    if (!pickerBox) return;

    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.y).toBeGreaterThanOrEqual(0);
  });
});
