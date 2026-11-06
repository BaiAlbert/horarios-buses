import { expect, test, type Page } from '@playwright/test';
import {
  CHECKED_AT, mockSeats, mockTrips, openLoggedIn, search, tripsFixture, type SeatsBody,
} from './helpers.ts';

const { trips } = tripsFixture();
const first = trips[0];

async function openFirstCard(page: Page) {
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);
  return page.getByRole('article').first();
}

const seatsButton = (card: ReturnType<Page['getByRole']>) => card.getByRole('button', { name: 'Ver plazas libres' });

test('la tarjeta muestra horas, duración, línea, paradas y tipo', async ({ page }) => {
  const card = await openFirstCard(page);

  await expect(card.locator('time.times').first()).toHaveText(first.departure);
  await expect(card.locator('time.times').last()).toHaveText(first.arrival);
  await expect(card.locator('.track')).toContainText('1 h 35 min');
  await expect(card.locator('.meta')).toContainText(`Línea ${first.line}`);
  await expect(card.locator('.meta')).toContainText(`${first.stops.length} paradas`);
  await expect(card.locator('.stops li')).toHaveCount(first.stops.length);
  await expect(card.locator('.kind')).toHaveText('Ruta · Santa Olalla');
});

test('avisos propios del bus: solo los buses que los tienen', async ({ page }) => {
  await openFirstCard(page);
  const withAlerts = trips.filter((t) => t.alerts.length > 0).length;

  await expect(page.locator('.trip-alerts')).toHaveCount(withAlerts);
  await expect(page.locator('.trip-alerts').first()).toContainText(/\S/);
});

test('plazas con cifras: pide el bus concreto y solo cambia esa tarjeta', async ({ page }) => {
  const card = await openFirstCard(page);
  await mockSeats(page, { ok: true, kind: 'count', free: 12, occupied: 30, total: 42, checkedAt: CHECKED_AT, passThrough: false });

  const request = page.waitForRequest((r) => r.url().includes('/api/seats'));
  await seatsButton(card).click();

  const params = new URL((await request).url()).searchParams;
  expect(Object.fromEntries(params)).toEqual({ dir: 'ida', date: '2026-11-03', exp: first.expedition });
  await expect(card.locator('.seats-ok')).toContainText('12 libres · 30 ocupadas · 42 totales');
  await expect(card.locator('.seats-ok small')).toHaveText('(consultado 09:59)');
  await expect(seatsButton(page.getByRole('article').nth(1))).toBeVisible(); // las demás siguen sin consultar
});

test('mientras consulta: botón «Consultando…» desactivado', async ({ page }) => {
  const card = await openFirstCard(page);
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/api/seats?*', async (route) => {
    await gate;
    await route.fulfill({ json: { ok: true, kind: 'available', checkedAt: CHECKED_AT, passThrough: false } });
  });

  await seatsButton(card).click();
  await expect(card.getByRole('button', { name: 'Consultando…' })).toBeDisabled();
  release();
  await expect(card.getByText('Quedan plazas')).toBeVisible();
});

const cases: [string, SeatsBody, (card: ReturnType<Page['getByRole']>) => Promise<void>][] = [
  ['completo', { ok: true, kind: 'full', checkedAt: CHECKED_AT, passThrough: false }, async (card) => {
    await expect(card.locator('.seats-full')).toContainText('Completo: no quedan plazas');
  }],
  ['quedan plazas sin cifra', { ok: true, kind: 'available', checkedAt: CHECKED_AT, passThrough: false }, async (card) => {
    await expect(card.locator('.seats-ok')).toContainText('Quedan plazas');
    await expect(card.locator('.seats-ok')).toContainText('no tiene elección de asiento');
  }],
  ['no disponible, con el motivo', { ok: false, reason: 'Varios buses salen y llegan a la misma hora', passThrough: false }, async (card) => {
    const line = card.locator('.unavailable');
    await expect(line).toContainText('Plazas no disponibles');
    await expect(line).toContainText('(Varios buses salen y llegan a la misma hora)');
    await expect(line).toHaveAttribute('title', 'Varios buses salen y llegan a la misma hora');
  }],
  ['llegada distinta en autobusing', { ok: true, kind: 'available', checkedAt: CHECKED_AT, matchedArrival: '12:34', passThrough: false }, async (card) => {
    await expect(card.locator('.note')).toHaveText(`Aviso: en el sistema de venta este bus llega a las 12:34 (en Samar, a las ${first.arrival}). Se ha emparejado solo por la hora de salida.`);
  }],
  ['bus que continúa más allá del trayecto', { ok: true, kind: 'available', checkedAt: CHECKED_AT, passThrough: true }, async (card) => {
    await expect(card.locator('.note')).toHaveText('Este bus continúa más allá de tu trayecto; las plazas podrían referirse a todo el recorrido.');
  }],
];

for (const [nombre, body, comprobar] of cases) {
  test(`plazas: ${nombre}`, async ({ page }) => {
    const card = await openFirstCard(page);
    await mockSeats(page, body);
    await seatsButton(card).click();
    await comprobar(card);
    await expect(seatsButton(card)).toHaveCount(0); // ya no ofrece volver a consultar
  });
}

test('plazas: error 502 y «Reintentar»', async ({ page }) => {
  const card = await openFirstCard(page);
  await page.route('**/api/seats?*', (route) => route.fulfill({ status: 502, json: { error: 'x' } }));
  await seatsButton(card).click();
  await expect(card.locator('.seats .error')).toContainText('No se pudo consultar.');

  await mockSeats(page, { ok: true, kind: 'full', checkedAt: CHECKED_AT, passThrough: false });
  await card.getByRole('button', { name: 'Reintentar' }).click();
  await expect(card.locator('.seats-full')).toBeVisible();
});

test('plazas: respuesta sin forma de resultado cuenta como error', async ({ page }) => {
  const card = await openFirstCard(page);
  await page.route('**/api/seats?*', (route) => route.fulfill({ json: { hola: 1 } }));
  await seatsButton(card).click();
  await expect(card.locator('.seats .error')).toBeVisible();
});

test('plazas: 401 manda a /login', async ({ page }) => {
  const card = await openFirstCard(page);
  await page.route('**/api/seats?*', (route) => route.fulfill({ status: 401, json: { error: 'No autorizado' } }));
  await seatsButton(card).click();
  await expect(page).toHaveURL(/\/login$/);
});
