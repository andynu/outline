import { test, expect } from '@playwright/test';

test.describe('Date views panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  // Helper to open date views panel
  async function openDateViewsPanel(page: any) {
    const dateViewsBtn = page.locator('.toolbar-btn[title*="Date Views"]');
    await dateViewsBtn.click();
    await page.waitForTimeout(100);
  }

  test('toolbar button opens date views panel', async ({ page }) => {
    await openDateViewsPanel(page);

    // Check that modal appears with Date Views title
    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible({ timeout: 3000 });

    const header = modal.locator('.modal-header h2');
    await expect(header).toContainText('Date Views');
  });

  test('date views panel has view tabs', async ({ page }) => {
    await openDateViewsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Should have view tabs
    const viewTabs = page.locator('.view-tabs');
    await expect(viewTabs).toBeVisible();

    // Check for tab buttons
    await expect(page.locator('.view-tab').filter({ hasText: 'Today' })).toBeVisible();
    await expect(page.locator('.view-tab').filter({ hasText: 'Upcoming' })).toBeVisible();
    await expect(page.locator('.view-tab').filter({ hasText: 'Overdue' })).toBeVisible();
    await expect(page.locator('.view-tab').filter({ hasText: 'All Dates' })).toBeVisible();
  });

  test('Today tab is active by default', async ({ page }) => {
    await openDateViewsPanel(page);

    const todayTab = page.locator('.view-tab').filter({ hasText: 'Today' });
    await expect(todayTab).toHaveClass(/active/);
  });

  test('clicking tab changes active view', async ({ page }) => {
    await openDateViewsPanel(page);

    const upcomingTab = page.locator('.view-tab').filter({ hasText: 'Upcoming' });
    await upcomingTab.click();
    await page.waitForTimeout(100);

    await expect(upcomingTab).toHaveClass(/active/);

    // Today tab should not be active anymore
    const todayTab = page.locator('.view-tab').filter({ hasText: 'Today' });
    await expect(todayTab).not.toHaveClass(/active/);
  });

  test('close button closes panel', async ({ page }) => {
    await openDateViewsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Click close button
    const closeBtn = modal.locator('.close-btn');
    await closeBtn.click();
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('clicking backdrop closes panel', async ({ page }) => {
    await openDateViewsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Click on backdrop
    const backdrop = page.locator('.modal-backdrop');
    await backdrop.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('shows hint text at bottom', async ({ page }) => {
    await openDateViewsPanel(page);

    const hint = page.locator('.modal-footer .hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Escape');
  });

  test('shows results area', async ({ page }) => {
    await openDateViewsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Should have a results area
    const results = modal.locator('.results');
    await expect(results).toBeVisible();
  });

  test('shows empty state when no items for view', async ({ page }) => {
    await openDateViewsPanel(page);

    // Switch to Overdue tab (likely to be empty in test)
    const overdueTab = page.locator('.view-tab').filter({ hasText: 'Overdue' });
    await overdueTab.click();
    await page.waitForTimeout(100);

    // Either shows items or empty state
    const hasEmptyState = await page.locator('.empty-state').isVisible();
    const hasItems = await page.locator('.result-item').count() > 0;

    // One of these should be true
    expect(hasEmptyState || hasItems).toBe(true);
  });

  test('creating dated item shows in All Dates view', async ({ page }) => {
    // First create an item with a date
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Use date picker to set a date (Ctrl+D -> Today)
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    if (await datePicker.isVisible()) {
      await page.locator('.quick-date').filter({ hasText: 'Today' }).click();
      await page.waitForTimeout(100);
    }

    await page.keyboard.type('Dated item for test');
    await page.waitForTimeout(100);

    // Open date views panel
    await openDateViewsPanel(page);

    // Switch to All Dates view
    const allDatesTab = page.locator('.view-tab').filter({ hasText: 'All Dates' });
    await allDatesTab.click();
    await page.waitForTimeout(100);

    // Should have at least one item (the one we just created)
    const resultItems = page.locator('.result-item');
    const count = await resultItems.count();
    expect(count).toBeGreaterThan(0);
  });
});
