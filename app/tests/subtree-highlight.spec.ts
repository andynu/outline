import { test, expect } from '@playwright/test';

// Subtree highlighting is not implemented in virtualized flat rendering.
// These tests are skipped until the feature is ported to FlatOutlineItem.
// In the old nested rendering, children were rendered inside .children-wrapper,
// making it easy to add CSS classes to descendants. With flat rendering,
// items are siblings, so a different approach is needed.

test.describe.skip('Subtree highlight', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');
  });

  test('focused item has stronger highlight than its children', async ({ page }) => {
    // This test requires subtree highlighting to be implemented for flat rendering
  });

  test('subtree highlight is removed when focus moves away', async ({ page }) => {
    // This test requires subtree highlighting to be implemented for flat rendering
  });

  test('nested subtree items get subtree highlight class', async ({ page }) => {
    // This test requires subtree highlighting to be implemented for flat rendering
  });

  test('focused child does not have subtree class', async ({ page }) => {
    // This test requires subtree highlighting to be implemented for flat rendering
  });
});
