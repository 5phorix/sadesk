import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('module Performance', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis pour les parcours authentifiés');
    await page.goto('/');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForLoadState('networkidle');

    const companyPrompt = page.getByText('Sélectionnez une société ou créez-en une nouvelle');
    if (await companyPrompt.isVisible().catch(() => false)) {
      await page.locator('div.cursor-pointer').first().click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('ouvre la configuration des KPI', async ({ page }) => {
    await page.goto('/KpiManagement');
    await expect(page.getByRole('heading', { name: 'KPI & indicateurs' })).toBeVisible();
  });

  test('ouvre les objectifs versionnés', async ({ page }) => {
    await page.goto('/Objectives');
    await expect(page.getByRole('heading', { name: 'Objectifs' })).toBeVisible();
  });

  test('ouvre le suivi budgétaire', async ({ page }) => {
    await page.goto('/BudgetTracking');
    await expect(page.getByRole('heading', { name: 'Suivi budgétaire' })).toBeVisible();
  });

  test('ouvre l’analyse des écarts', async ({ page }) => {
    await page.goto('/VarianceAnalysis');
    await expect(page.getByRole('heading', { name: 'Analyse des écarts' })).toBeVisible();
  });

  test('ouvre les plans d’action', async ({ page }) => {
    await page.goto('/ActionPlans');
    await expect(page.getByRole('heading', { name: 'Plans d’action' })).toBeVisible();
  });
});
