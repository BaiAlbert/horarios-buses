import { expect, test, type Page } from '@playwright/test';
import { CHECKED_AT, mockSeats, mockTrips, openLoggedIn, search, searchButton, tripsFixture } from './helpers.ts';

// Corre en cada dispositivo de playwright.config.ts, en vertical y en horizontal. No asume un tamaño:
// comprueba lo que debe cumplirse en todos (nada se sale de la pantalla, todo se alcanza, los controles se pueden pulsar).

const sinScrollHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('inicio y resultados no se salen de la pantalla por los lados', async ({ page }) => {
  const { trips } = tripsFixture();
  await mockTrips(page);
  await openLoggedIn(page);
  expect(await sinScrollHorizontal(page)).toBe(true);

  await search(page);
  await expect(page.getByRole('article')).toHaveCount(trips.length);
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test('«Ocultar paradas» aparece en un solo sitio, sea cual sea la maquetación', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);

  const visibles = await page.locator('.switch').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
  expect(visibles).toBe(1);
  await page.getByRole('switch', { name: 'Ocultar paradas' }).check();
  await expect(page.locator('article .collapse[data-open="false"]').first()).toBeAttached();
});

test('controles táctiles: miden lo que pide el diseño (44 px; 34 px en pantallas bajas)', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);
  await mockSeats(page, { ok: true, kind: 'full', checkedAt: CHECKED_AT, passThrough: false });

  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true); // si no, el test no mide lo que cree
  const minimo = (page.viewportSize()?.height ?? 0) <= 520 ? 34 : 44;
  const pequenos: string[] = [];
  for (const [nombre, loc] of [
    ['Buscar buses', searchButton(page)],
    ['botón de fecha', page.locator('#date')],
    ['chip', page.locator('.chip').first()],
    ['interruptor', page.locator('.switch').locator('visible=true')],
    ['Ver plazas', page.getByRole('button', { name: 'Ver plazas libres' }).first()],
    ['Comprar', page.getByRole('link', { name: /Comprar en autobusing/ }).first()],
    ['Avisos de Samar', page.getByRole('button', { name: /Avisos de Samar/ })],
  ] as const) {
    const box = await loc.boundingBox();
    if (!box || box.height < minimo) pequenos.push(`${nombre}: ${box?.height}px (mínimo ${minimo})`);
  }
  expect(pequenos).toEqual([]);
});

test('el buscador y el pie son alcanzables aunque la pantalla sea baja', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);

  // el bloque del buscador se queda fijo en dos columnas: si fuese más alto que la pantalla, lo de abajo no se podría alcanzar
  for (const loc of [page.locator('.route').last(), page.locator('#date'), searchButton(page)]) {
    await loc.scrollIntoViewIfNeeded();
    await expect(loc).toBeInViewport({ ratio: 0.9 }); // 0,9 y no 1: el redondeo de píxeles deja a veces un 0,5 % fuera
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const pie = page.getByRole('link', { name: 'samar.es' });
  await pie.scrollIntoViewIfNeeded();
  await expect(pie).toBeInViewport({ ratio: 0.9 });
});

test('el calendario cabe en la pantalla y se elige un día con el dedo', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await page.locator('#date').tap();

  const calendario = page.getByRole('dialog', { name: 'Elegir día del viaje' });
  await expect(calendario).toBeVisible();
  const box = (await calendario.boundingBox())!;
  const ancho = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(ancho);
  expect(await sinScrollHorizontal(page)).toBe(true);

  await page.locator('[data-date="2026-11-20"]').tap();
  await expect(calendario).toBeHidden();
  await expect(page.locator('#date')).toContainText('20/11/2026');
});

test('el login no se sale de la pantalla y el campo está a la vista', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeInViewport();
  expect(await sinScrollHorizontal(page)).toBe(true);
});
