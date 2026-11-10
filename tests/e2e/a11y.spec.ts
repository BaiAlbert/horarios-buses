import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockTrips, mockTripsStatus, openLoggedIn, search, searchButton, tripsFixture } from './helpers.ts';

// Reglas WCAG 2.x A y AA. Axe solo detecta una parte de los problemas (no sustituye a probar con un lector de pantalla)
async function sinViolaciones(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const resumen = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map((n) => `   ${n.target.join(' ')}`).join('\n')}`);
  expect(resumen, resumen.join('\n')).toEqual([]);
}

for (const esquema of ['light', 'dark'] as const) {
  test.describe(`esquema ${esquema}`, () => {
    test.use({ colorScheme: esquema });
    // el contraste no depende del tamaño: en dispositivos solo se repite el tema claro, para comprobar la maquetación
    test.skip(({ isMobile }) => esquema === 'dark' && isMobile, 'el tema oscuro se comprueba en escritorio');

    test('inicio', async ({ page }) => {
      await mockTrips(page);
      await openLoggedIn(page);
      await sinViolaciones(page);
    });

    test('resultados con filtros, avisos y plazas', async ({ page }) => {
      await mockTrips(page);
      await openLoggedIn(page);
      await search(page);
      await page.route('**/api/seats?*', (r) => r.fulfill({ json: { ok: true, kind: 'count', free: 5, occupied: 30, total: 35, checkedAt: '2026-11-03T08:59:00Z', passThrough: false } }));
      await page.getByRole('button', { name: 'Ver plazas libres' }).first().click();
      await expect(page.locator('.seats-ok').first()).toBeVisible();
      await sinViolaciones(page);
    });

    test('resultados con itinerarios y avisos plegados', async ({ page }) => {
      await mockTrips(page);
      await openLoggedIn(page);
      await search(page);
      await page.getByRole('switch', { name: 'Ocultar paradas' }).locator('visible=true').check();
      await page.getByRole('button', { name: /Avisos de Samar/ }).click();
      await sinViolaciones(page);
    });

    test('resultados con aviso de caché', async ({ page }) => {
      await mockTrips(page, tripsFixture(undefined, '2026-11-02T22:50:00Z'));
      await openLoggedIn(page);
      await search(page);
      await expect(page.locator('.fetched--cached')).toBeVisible();
      await sinViolaciones(page);
    });

    test('sin servicio', async ({ page }) => {
      await mockTrips(page, tripsFixture('samar-vacio.html'));
      await openLoggedIn(page);
      await search(page);
      await sinViolaciones(page);
    });

    test('error de Samar', async ({ page }) => {
      await mockTripsStatus(page, 502);
      await openLoggedIn(page);
      await searchButton(page).click();
      await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
      await sinViolaciones(page);
    });

    test('calendario abierto', async ({ page }) => {
      await mockTrips(page);
      await openLoggedIn(page);
      await page.locator('#date').click();
      await expect(page.getByRole('dialog', { name: 'Elegir día del viaje' })).toBeVisible();
      await sinViolaciones(page);
    });

    test('login, también con error', async ({ page }) => {
      await page.goto('/login');
      await sinViolaciones(page);
      await page.getByLabel('Contraseña', { exact: true }).fill('mala');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Contraseña' })).toBeVisible();
      await sinViolaciones(page);
    });
  });
}

test('página 404', async ({ page }) => {
  await openLoggedIn(page, '/no-existe');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await sinViolaciones(page);
});
