import { expect, test } from '@playwright/test';

test('application shell loads', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('SADESK Compta');
  await expect(page.locator('#root')).toBeVisible();
});

test('login workflow exposes password recovery', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
  await expect(page.getByRole('heading', { name: 'Réinitialiser le mot de passe' })).toBeVisible();
  await page.getByRole('button', { name: 'Retour à la connexion' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
});
