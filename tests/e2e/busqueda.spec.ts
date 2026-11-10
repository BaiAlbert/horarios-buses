import { expect, test } from '@playwright/test';
import { DAY, mockTrips, mockTripsStatus, openLoggedIn, search, searchButton, tripsFixture } from './helpers.ts';

const status = (page: import('@playwright/test').Page) => page.locator('#resultados [role="status"]');

test('ida: título con foco, contador, fecha y línea de estado para lectores', async ({ page }) => {
  const { trips } = tripsFixture();
  await mockTrips(page);
  await openLoggedIn(page);
  await expect(page.getByText('Elige el trayecto y el día')).toBeAttached(); // oculto por CSS en móvil vertical

  const request = page.waitForRequest((r) => r.url().includes('/api/trips'));
  await search(page);

  expect(new URL((await request).url()).search).toBe(`?dir=ida&date=${DAY}`);
  const heading = page.getByRole('heading', { level: 2 });
  await expect(heading).toHaveText('Madrid Estación Sur → Talavera');
  await expect(heading).toBeFocused();
  await expect(page.locator('.results-head .count')).toHaveText(`${trips.length} buses`);
  await expect(page.locator('.results-head .date')).toHaveText(/martes.*3 de noviembre/);
  await expect(status(page)).toHaveText(new RegExp(`^${trips.length} buses, .*3 de noviembre`));
  await expect(page.getByRole('article')).toHaveCount(trips.length);
});

test('vuelta: pide dir=vuelta y muestra el trayecto contrario', async ({ page }) => {
  const vuelta = tripsFixture('samar-vuelta-2026-11-06.html');
  await mockTrips(page, vuelta);
  await openLoggedIn(page);

  await page.getByText('Talavera → Madrid Estación Sur').click();
  const request = page.waitForRequest((r) => r.url().includes('/api/trips'));
  await search(page);

  expect(new URL((await request).url()).searchParams.get('dir')).toBe('vuelta');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Talavera → Madrid Estación Sur');
  await expect(page.getByRole('article')).toHaveCount(vuelta.trips.length);
});

test('mientras carga: esqueletos, botón desactivado y el resultado es del trayecto buscado, no del marcado después', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/api/trips?*', async (route) => { await gate; await route.fulfill({ json: tripsFixture() }); });
  await openLoggedIn(page);

  await searchButton(page).click();
  const busy = page.getByRole('button', { name: 'Buscando…' });
  await expect(busy).toBeDisabled();
  await expect(page.locator('.skeleton')).toHaveCount(3);
  await expect(status(page)).toHaveText('Buscando buses…');

  await page.getByText('Talavera → Madrid Estación Sur').click(); // cambia el selector con la búsqueda en vuelo
  release();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Madrid Estación Sur → Talavera');
  await expect(searchButton(page)).toBeEnabled();
  await expect(page.locator('.skeleton')).toHaveCount(0);
});

test('sin servicio: mensaje y sin barra de filtros ni interruptor lateral', async ({ page }) => {
  await mockTrips(page, tripsFixture('samar-vacio.html'));
  await openLoggedIn(page);
  await search(page);

  await expect(page.getByText('No hay buses para este día. Prueba con otra fecha.')).toBeVisible();
  await expect(status(page)).toHaveText('No hay buses para este día.');
  await expect(page.getByRole('group', { name: 'Filtros' })).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.locator('.results-head .count')).toHaveCount(0);
});

test('error 502: avisa y «Reintentar» vuelve a consultar', async ({ page }) => {
  await mockTripsStatus(page, 502);
  await openLoggedIn(page);
  await searchButton(page).click();

  await expect(page.getByText('No se pudo consultar Samar.', { exact: false }).first()).toBeVisible();
  await expect(status(page)).toHaveText('No se pudo consultar Samar.');

  await mockTrips(page); // Samar vuelve
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('article')).toHaveCount(tripsFixture().trips.length);
});

test('sin red: «Sin conexión a internet.»', async ({ page, context }) => {
  await openLoggedIn(page);
  await context.setOffline(true);
  await searchButton(page).click();

  await expect(status(page)).toHaveText('Sin conexión a internet.');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

for (const [nombre, cuerpo] of [
  ['objeto vacío', {}],
  ['sin lista de buses', { notices: [], fetchedAt: '2026-11-03T09:00:00Z' }],
  ['fecha de consulta ilegible', { trips: [], notices: [], fetchedAt: 'ayer' }],
] as const) {
  test(`200 con cuerpo inesperado (${nombre}): error, no página en blanco`, async ({ page }) => {
    await mockTripsStatus(page, 200, cuerpo);
    await openLoggedIn(page);
    await searchButton(page).click();

    await expect(status(page)).toHaveText('No se pudo consultar Samar.');
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
}

test('401: manda a /login', async ({ page }) => {
  await mockTripsStatus(page, 401, { error: 'No autorizado' });
  await openLoggedIn(page);
  await searchButton(page).click();

  await expect(page).toHaveURL(/\/login$/);
});

test.describe('aviso de resultados guardados', () => {
  // el reloj está fijado a las 00:10 de Madrid (23:10Z del día anterior)
  test('con 12 min de antigüedad: lo avisa con la hora de consulta', async ({ page }) => {
    await mockTrips(page, tripsFixture(undefined, '2026-11-02T22:58:00Z'));
    await openLoggedIn(page);
    await search(page);

    await expect(page.locator('.fetched--cached')).toHaveText(/Resultados guardados, consultados a las 23:58 \(hace 12 min\)/);
  });

  test('recién descargado: solo «Consultado a las»', async ({ page }) => {
    await mockTrips(page); // 30 s de antigüedad
    await openLoggedIn(page);
    await search(page);

    await expect(page.locator('.fetched')).toHaveText('Consultado a las 00:09');
    await expect(page.locator('.fetched--cached')).toHaveCount(0);
  });

  test('reloj del móvil por detrás de la consulta: no inventa una edad', async ({ page }) => {
    await mockTrips(page, tripsFixture(undefined, `${DAY}T09:30:00Z`)); // «en el futuro»
    await openLoggedIn(page);
    await search(page);

    await expect(page.locator('.fetched')).toHaveText('Consultado a las 10:30');
    await expect(page.locator('.fetched--cached')).toHaveCount(0);
  });
});
