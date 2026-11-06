import { expect, test } from '@playwright/test';
import { mockTrips, openLoggedIn, tripsFixture } from './helpers.ts';

test('abre la página, busca y pinta una tarjeta por bus', async ({ page }) => {
  const { trips } = tripsFixture();
  await mockTrips(page);
  await openLoggedIn(page);

  await page.getByRole('button', { name: 'Buscar buses' }).click();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Madrid Estación Sur → Talavera');
  await expect(page.getByRole('article')).toHaveCount(trips.length);
  await expect(page.getByText(`${trips.length} buses`, { exact: true })).toBeVisible();
});
