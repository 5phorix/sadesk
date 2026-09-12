import { expect, test } from '@playwright/test';

test('application shell loads', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('SADESK Compta');
  await expect(page.locator('#root')).toBeVisible();
});
