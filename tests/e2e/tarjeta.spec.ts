import { expect, test, type Page } from '@playwright/test';
import { buyUrl } from '../../lib/rules.ts';
import {
  CHECKED_AT, DAY, mockSeats, mockTrips, openLoggedIn, search, tripsFixture, type SeatsBody,
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

// Refuerzo por descarte: dos filas que sobran a esa hora, con llegadas distintas de la de samar.es
const descarte = [
  { kind: 'full' as const, arrival: '07:10' },
  { kind: 'count' as const, free: 3, occupied: 52, total: 55, arrival: '07:15' },
];

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
    await expect(card.locator('.seats .note')).toHaveText(`Aviso: en el sistema de venta este bus llega a las 12:34 (en Samar, a las ${first.arrival}). Se ha emparejado solo por la hora de salida.`);
  }],
  ['refuerzo: plazas de cada autobús por separado y en orden', {
    ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false,
    buses: [{ kind: 'count', free: 3, occupied: 62, total: 65, arrival: first.arrival }, { kind: 'full', arrival: first.arrival }, { kind: 'available', arrival: first.arrival }],
  }, async (card) => {
    const box = card.locator('.seats-ok');
    await expect(box).toContainText('3 autobuses a esta hora');
    await expect(box.locator('li')).toHaveText(['1.º: 3 libres de 65', '2.º: completo', '3.º: quedan plazas (sin elección de asiento)']);
  }],
  ['refuerzo con todos los autobuses completos', {
    ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false, buses: [{ kind: 'full', arrival: first.arrival }, { kind: 'full', arrival: first.arrival }],
  }, async (card) => {
    await expect(card.locator('.seats-full')).toContainText('2 autobuses a esta hora');
    await expect(card.locator('.seats-ok')).toHaveCount(0);
  }],
  ['refuerzo por descarte: llegada de cada autobús y aviso', {
    ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false, buses: descarte,
  }, async (card) => {
    await expect(card.locator('.seats li')).toHaveText(['1.º (llega 07:10 según autobusing): completo', '2.º (llega 07:15 según autobusing): 3 libres de 55']);
    await expect(card.locator('.seats .note')).toHaveText(`Aviso: en el sistema de venta estos autobuses llegan a las 07:10 y 07:15 (en Samar, a las ${first.arrival}). Se han emparejado por descarte: puede que no hagan exactamente el mismo recorrido.`);
  }],
  ['bus que continúa más allá del trayecto', { ok: true, kind: 'available', checkedAt: CHECKED_AT, passThrough: true }, async (card) => {
    await expect(card.locator('.seats .note')).toHaveText('Este bus continúa más allá de tu trayecto; las plazas podrían referirse a todo el recorrido.');
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

const buyLink = (card: ReturnType<Page['getByRole']>) => card.getByRole('link', { name: /Comprar en autobusing/ });
const buyHint = (card: ReturnType<Page['getByRole']>) => card.locator('.buy .note');

test('comprar: un enlace por tarjeta, al paso 1 de autobusing sin hora y en otra pestaña', async ({ page }) => {
  const card = await openFirstCard(page);
  // una por tarjeta, salvo las de buses sin venta online (en este fixture, dos 907)
  const sold = page.getByRole('article').filter({ hasNotText: 'Este bus no se vende online.' });
  await expect(page.getByRole('link', { name: /Comprar en autobusing/ })).toHaveCount(await sold.count());
  expect(await sold.count()).toBe((await page.getByRole('article').count()) - 2);

  const link = buyLink(card);
  await expect(link).toHaveAttribute('href', buyUrl(first, DAY));
  // el fixture es de Madrid a Talavera: los códigos salen del propio bus, no están fijos
  await expect(link).toHaveAttribute('href', /origen_codigo=0108&destino_codigo=0831/);
  expect(await link.getAttribute('href')).not.toContain('hora_ida');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  await expect(link).toHaveAccessibleName(/se abre en otra pestaña/);
  await expect(buyHint(card)).toHaveText(`En autobusing, busca la fila de las ${first.departure} que llega a las ${first.arrival}. Si no está, «Ver plazas libres» te dice cuál es.`);
});

const hintCases: [string, SeatsBody, string][] = [
  ['llegada distinta en autobusing', { ok: true, kind: 'available', checkedAt: CHECKED_AT, matchedArrival: '09:58', passThrough: false },
    `En autobusing, elige la fila ${first.departure} → 09:58.`],
  ['refuerzo de 2', { ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false, buses: [{ kind: 'full', arrival: first.arrival }, { kind: 'available', arrival: first.arrival }] },
    `En autobusing hay 2 filas ${first.departure} → ${first.arrival}; las dos son este horario.`],
  ['refuerzo de 3', { ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false, buses: [{ kind: 'full', arrival: first.arrival }, { kind: 'full', arrival: first.arrival }, { kind: 'available', arrival: first.arrival }] },
    `En autobusing hay 3 filas ${first.departure} → ${first.arrival}; todas son este horario.`],
  ['varias filas posibles', { ok: false, reason: 'Varias filas posibles en autobusing', passThrough: false },
    `En autobusing no se sabe qué fila de las ${first.departure} es este bus (en Samar llega a las ${first.arrival}).`],
  ['refuerzo por descarte', { ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false, buses: descarte },
    `En autobusing, elige una de las filas de las ${first.departure} que llegan a las 07:10 y 07:15.`],
  ['no aparece en la venta online', { ok: false, reason: 'No aparece en la venta online', passThrough: false },
    'Ahora mismo no aparece en la venta online: puede estar completo o no venderse online.'],
  ['otro fallo (dos buses con las mismas horas)', { ok: false, reason: 'Varios buses salen y llegan a la misma hora', passThrough: false },
    `En autobusing, busca la fila de las ${first.departure} que llega a las ${first.arrival}.`],
];

for (const [nombre, body, pista] of hintCases) {
  test(`comprar: la pista se ajusta tras consultar las plazas (${nombre})`, async ({ page }) => {
    const card = await openFirstCard(page);
    await mockSeats(page, body);
    await seatsButton(card).click();
    await expect(buyHint(card)).toHaveText(pista);
    await expect(buyLink(card)).toBeVisible(); // el enlace sigue ahí, haya o no plazas
  });
}

// TALAVERA → MADRID, 16/11: a las 05:45 salen un 909 normal (→ 07:05) y otro que solo llega hasta Alcorcón (→ 06:50).
// En autobusing las dos filas dicen 05:45 → 07:05; solo la nota de Alcorcón las distingue.
async function openNov16(page: Page) {
  await mockTrips(page, tripsFixture('samar-vuelta-2026-11-16.html'));
  await openLoggedIn(page);
  await search(page);
}
const cardAt = (page: Page, times: RegExp) =>
  page.getByRole('article').filter({ has: page.locator('header.journey', { hasText: times }) });

test('comprar: pistas de los dos 05:45 (el normal y el de Alcorcón)', async ({ page }) => {
  await openNov16(page);
  const alcorcon = cardAt(page, /05:45.*06:50/);
  const normal = cardAt(page, /05:45.*07:05/);
  await expect(buyHint(alcorcon)).toHaveText('En autobusing, elige la fila de las 05:45 que dice «solo llega hasta Alcorcón» (allí puede poner otra hora de llegada).');
  await expect(buyHint(normal)).toHaveText('En autobusing, busca la fila de las 05:45 que llega a las 07:05 (la que no dice «solo llega hasta Alcorcón»). Si no está, «Ver plazas libres» te dice cuál es.');

  await mockSeats(page, { ok: true, kind: 'count', free: 8, occupied: 44, total: 52, checkedAt: CHECKED_AT, matchedArrival: '07:05', passThrough: false });
  await seatsButton(alcorcon).click();
  await expect(buyHint(alcorcon)).toHaveText('En autobusing, elige la fila 05:45 → 07:05 (la que dice «solo llega hasta Alcorcón»).');
});

test('bus sin venta online (907, sin precio en samar.es): sin botones y lo dice', async ({ page }) => {
  await openNov16(page);
  const card = cardAt(page, /09:15.*12:25/);
  await expect(card.getByText('Este bus no se vende online.')).toBeVisible();
  await expect(seatsButton(card)).toHaveCount(0);
  await expect(buyLink(card)).toHaveCount(0);
});

// REVISIÓN: una respuesta de /api/trips de antes de onlineSale (guardada en el navegador justo antes de desplegar)
// no trae ese campo; si falta, el bus se vende, como dice el diseño.
test('bus sin el dato onlineSale (respuesta antigua): se ofrecen plazas y compra', async ({ page }) => {
  const old = tripsFixture();
  await mockTrips(page, { ...old, trips: old.trips.map(({ onlineSale: _, ...t }) => t as typeof t & { onlineSale: boolean }) });
  await openLoggedIn(page);
  await search(page);
  await expect(page.getByText('Este bus no se vende online.')).toHaveCount(0);
  await expect(seatsButton(page.getByRole('article').first())).toBeVisible();
});

// REGLA DEL 909 (DIRECT_909_RULE en lib/rules.ts), sábado 28/11 de Talavera a Madrid. A las 09:00 salen el 909 directo
// y el 905, los dos → 10:20 en samar.es; en autobusing, la fila 10:20 es la del 909 y la del 905 llega a las 10:50.
async function openNov28(page: Page) {
  await mockTrips(page, tripsFixture('samar-vuelta-2026-11-28.html'));
  await openLoggedIn(page);
  await search(page);
}
const lineCard = (page: Page, times: RegExp, line: string) => cardAt(page, times).filter({ hasText: `Línea ${line}` });

test('comprar, regla del 909: a las 09:00 del sábado la pista no manda al 905 a la fila del 909', async ({ page }) => {
  await openNov28(page);
  const c909 = lineCard(page, /09:00.*10:20/, '909');
  const c905 = lineCard(page, /09:00.*10:20/, '905');
  await expect(buyHint(c909)).toHaveText('En autobusing, busca la fila de las 09:00 que llega a las 10:20. Si no está, «Ver plazas libres» te dice cuál es.');
  await expect(buyHint(c905)).toHaveText('En autobusing, la fila de las 09:00 que llega a las 10:20 es la del directo 909; la de este bus llega a otra hora. «Ver plazas libres» te dice cuál es.');

  await mockSeats(page, { ok: true, kind: 'count', free: 31, occupied: 19, total: 50, checkedAt: CHECKED_AT, matchedArrival: '10:50', passThrough: true });
  await seatsButton(c905).click();
  await expect(c905.locator('.seats')).toContainText('31 libres');
  await expect(c905.locator('.seats .note').first()).toHaveText('Aviso: en el sistema de venta este bus llega a las 10:50 (en Samar, a las 10:20). Se ha emparejado solo por la hora de salida.');
  await expect(buyHint(c905)).toHaveText('En autobusing, elige la fila 09:00 → 10:50.');
});

test('comprar, regla del 909: si falla la consulta, la pista del 905 sigue sin mandarlo a la fila del 909', async ({ page }) => {
  await openNov28(page);
  const c905 = lineCard(page, /09:00.*10:20/, '905');
  await page.route('**/api/seats?*', (route) => route.fulfill({ status: 502, json: { error: 'x' } }));
  await seatsButton(c905).click();
  await expect(buyHint(c905)).toHaveText('En autobusing, la fila de las 09:00 que llega a las 10:20 es la del directo 909; la de este bus llega a otra hora.');
});

// A las 05:15 del sábado el 910 tiene dos filas exactas (07:05) y una sobrante (07:15), que la regla le da también.
test('plazas, regla del 909: refuerzo con filas exactas y una sobrante → llegada de cada autobús, aviso y pista', async ({ page }) => {
  await openNov28(page);
  const card = lineCard(page, /05:15.*07:05/, '910');
  await mockSeats(page, {
    ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false, buses: [
      { kind: 'count', free: 3, occupied: 52, total: 55, arrival: '07:05' },
      { kind: 'full', arrival: '07:15' },
      { kind: 'count', free: 20, occupied: 35, total: 55, arrival: '07:05' },
    ],
  });
  await seatsButton(card).click();
  await expect(card.locator('.seats ol.buses li')).toHaveText([
    '1.º (llega 07:05 según autobusing): 3 libres de 55',
    '2.º (llega 07:15 según autobusing): completo',
    '3.º (llega 07:05 según autobusing): 20 libres de 55',
  ]);
  await expect(card.locator('.seats .note')).toHaveText('Aviso: en el sistema de venta estos autobuses llegan a las 07:05 y 07:15 (en Samar, a las 07:05). Se han emparejado por descarte: puede que no hagan exactamente el mismo recorrido.');
  await expect(buyHint(card)).toHaveText('En autobusing, elige una de las filas de las 05:15 que llegan a las 07:05 y 07:15.');
});
