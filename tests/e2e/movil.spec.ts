import { expect, test, type Page } from '@playwright/test';
import { mockSeats, mockTrips, openLoggedIn, search, searchButton, tripsFixture, CHECKED_AT } from './helpers.ts';

// Proyecto brave-movil (Pixel 7: 412 px, táctil). Lo que cambia con el tamaño: maquetación, controles y calendario

const sinScrollHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('buscar en el móvil: resultados sin desbordar y con el interruptor en el lateral', async ({ page }) => {
  const { trips } = tripsFixture();
  await mockTrips(page);
  await openLoggedIn(page);
  expect(await sinScrollHorizontal(page)).toBe(true);

  await search(page);
  await expect(page.getByRole('article')).toHaveCount(trips.length);
  expect(await sinScrollHorizontal(page)).toBe(true);
  // en pantalla estrecha «Ocultar paradas» va debajo del formulario y no en la barra de filtros
  await expect(page.locator('.switch--side')).toBeVisible();
  await expect(page.locator('.switch--bar')).toBeHidden();
  await expect(page.locator('.toolbar-label-text')).toBeHidden();
});

test('controles táctiles de al menos 44 px', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);
  await mockSeats(page, { ok: true, kind: 'full', checkedAt: CHECKED_AT, passThrough: false });

  const pequenos: string[] = [];
  for (const [nombre, loc] of [
    ['Buscar buses', searchButton(page)],
    ['chip', page.locator('.chip').first()],
    ['interruptor', page.locator('.switch--side')],
    ['Ver plazas', page.getByRole('button', { name: 'Ver plazas libres' }).first()],
    ['Avisos de Samar', page.getByRole('button', { name: /Avisos de Samar/ })],
  ] as const) {
    const box = await loc.boundingBox();
    if (!box || box.height < 44) pequenos.push(`${nombre}: ${box?.height}px`);
  }
  expect(pequenos).toEqual([]);
});

test('el calendario cabe en la pantalla, también en 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockTrips(page);
  await openLoggedIn(page);
  await page.locator('#date').click();

  const calendario = page.getByRole('dialog', { name: 'Elegir día del viaje' });
  await expect(calendario).toBeVisible();
  const box = (await calendario.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(await sinScrollHorizontal(page)).toBe(true);

  await page.locator('[data-date="2026-11-20"]').tap();
  await expect(calendario).toBeHidden();
  await expect(page.locator('#date')).toContainText('20/11/2026');
});

test('320 px: ni la búsqueda ni los resultados desbordan', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test('apaisado: la barra de filtros y el formulario siguen usables', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);

  await expect(page.getByRole('group', { name: 'Filtros' })).toBeVisible();
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test('login en el móvil: sin desbordar y con el campo a la vista', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Contraseña')).toBeInViewport();
  expect(await sinScrollHorizontal(page)).toBe(true);
});
