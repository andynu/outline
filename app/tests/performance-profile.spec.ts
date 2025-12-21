import { test, expect } from '@playwright/test';

/**
 * Performance profiling tests for outline operations.
 *
 * These tests measure delete and create operations with the current document size.
 *
 * ## For comprehensive large-scale profiling (2000+ nodes):
 *
 * ### Option 1: Tauri Desktop App (recommended for real-world profiling)
 *   1. Run: cd app && npm run tauri dev
 *   2. Open Chrome DevTools (Ctrl+Shift+I) > Performance tab
 *   3. In console: outline._generateTestNodes(2000)
 *   4. Start recording, delete an item (Ctrl+Shift+Backspace), stop recording
 *
 * ### Option 2: Vite Dev Server (for JS-only profiling)
 *   1. Run: cd app && npm run dev
 *   2. Open http://localhost:5173 in Chrome
 *   3. Open DevTools > Console
 *   4. Run: outline._generateTestNodes(2000)
 *   5. Note: Delete won't persist since mock API doesn't know about test nodes
 *   6. Use _measureRender() to test tree building: outline._measureRender()
 *
 * ## Console Logs
 * The console will show [perf] logs for:
 *   - deleteNode: total, api, updateState times
 *   - buildTree: tree construction time (only when >10ms)
 *   - rebuildIndexes: index rebuild time (surgical or full, only when >2ms/5ms)
 */
test.describe('Performance profiling', () => {
  test('profile delete with baseline data', async ({ page }) => {
    // Capture console logs for performance metrics
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]')) {
        perfLogs.push(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Count initial items
    const initialCount = await page.locator('.outline-item').count();
    console.log(`Initial node count: ${initialCount}`);

    // Create a test item to delete
    await page.locator('.outline-item').first().click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Test item for deletion');
    await page.waitForTimeout(100);

    const countAfterCreate = await page.locator('.outline-item').count();
    expect(countAfterCreate).toBe(initialCount + 1);

    // Clear perf logs before measuring delete
    perfLogs.length = 0;

    // Delete the focused item
    await page.keyboard.press('Control+Shift+Backspace');
    await page.waitForTimeout(300);

    // Print performance results
    console.log('\n=== DELETE OPERATION PROFILE ===');
    for (const log of perfLogs) {
      console.log(log);
    }

    // Verify deletion happened
    const countAfterDelete = await page.locator('.outline-item').count();
    expect(countAfterDelete).toBe(initialCount);

    // Parse and display timing breakdown
    const deleteLog = perfLogs.find(l => l.includes('deleteNode:'));
    if (deleteLog) {
      const totalMatch = deleteLog.match(/total=(\d+\.?\d*)ms/);
      const apiMatch = deleteLog.match(/api=(\d+\.?\d*)ms/);
      const updateMatch = deleteLog.match(/updateState=(\d+\.?\d*)ms/);

      if (totalMatch && apiMatch && updateMatch) {
        console.log('\nParsed breakdown:');
        console.log(`  API call:        ${parseFloat(apiMatch[1]).toFixed(1)} ms`);
        console.log(`  updateState:     ${parseFloat(updateMatch[1]).toFixed(1)} ms`);
        console.log(`  Total:           ${parseFloat(totalMatch[1]).toFixed(1)} ms`);
      }
    }

    console.log('=== END PROFILE ===\n');
  });

  test('profile multiple operations for consistency', async ({ page }) => {
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]')) {
        perfLogs.push(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    const initialCount = await page.locator('.outline-item').count();
    const deleteTimes: number[] = [];

    // Create 10 items then delete them, measuring each delete
    for (let i = 0; i < 10; i++) {
      // Create
      await page.locator('.outline-item').first().click();
      await page.waitForTimeout(50);
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Test item ${i + 1}`);
      await page.waitForTimeout(50);

      // Delete
      perfLogs.length = 0;
      await page.keyboard.press('Control+Shift+Backspace');
      await page.waitForTimeout(150);

      const deleteLog = perfLogs.find(l => l.includes('deleteNode:'));
      if (deleteLog) {
        const match = deleteLog.match(/total=(\d+\.?\d*)ms/);
        if (match) {
          deleteTimes.push(parseFloat(match[1]));
        }
      }
    }

    console.log('\n=== DELETE CONSISTENCY TEST (10 create/delete cycles) ===');
    console.log(`Delete times: ${deleteTimes.map(t => t.toFixed(1) + 'ms').join(', ')}`);
    if (deleteTimes.length > 0) {
      console.log(`Average: ${(deleteTimes.reduce((a, b) => a + b, 0) / deleteTimes.length).toFixed(1)} ms`);
      console.log(`Min: ${Math.min(...deleteTimes).toFixed(1)} ms`);
      console.log(`Max: ${Math.max(...deleteTimes).toFixed(1)} ms`);
    }
    console.log('=== END CONSISTENCY TEST ===\n');

    // Verify we're back to initial count
    const finalCount = await page.locator('.outline-item').count();
    expect(finalCount).toBe(initialCount);
  });

  test('profile buildTree and rebuildIndexes with synthetic data', async ({ page }) => {
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]')) {
        perfLogs.push(text);
        console.log(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Generate synthetic test nodes
    console.log('\n=== SYNTHETIC DATA PERFORMANCE TEST ===');
    console.log('Note: Uses _generateTestNodes which bypasses normal update path');
    console.log('Full rebuilds are expected (no surgical updates)');

    for (const count of [100, 500, 1000, 2000]) {
      perfLogs.length = 0;

      // Generate test nodes
      await page.evaluate((c) => {
        (window as any).outline._generateTestNodes(c);
      }, count);
      await page.waitForTimeout(100);

      // Measure tree building
      await page.evaluate(() => {
        (window as any).outline._measureRender();
      });
      await page.waitForTimeout(50);

      // Find the perf logs for this iteration
      const rebuildLog = perfLogs.find(l => l.includes('rebuildIndexes'));

      console.log(`${count} nodes:`);
      if (rebuildLog) console.log(`  ${rebuildLog}`);
    }

    console.log('\n=== END SYNTHETIC TEST ===\n');
  });
});
