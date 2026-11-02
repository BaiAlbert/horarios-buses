import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults } from '../lib/samar.ts';
import { parseOrigenId, parseSchedule, parseSeatMap, fetchSeats, pickRow } from '../lib/autobusing.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const { trips } = parseResults(fx('samar-ida-2026-11-03.html'));
const trip0730 = trips.find((x) => x.expedition === '910001')!;

type Call = { method: string; path: string; cookie: string | null; body: string };

// Imita a autobusing: cookie en inicio_info, 302 en los POST y fixtures en los GET.
function fakeAutobusing(opts: { plazas?: string; plazasHtml?: string; horarios?: string; status500?: boolean; horariosPost?: () => Response } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    calls.push({ method, path: url.pathname, cookie: headers.get('cookie'), body: init.body ? String(init.body) : '' });
    if (opts.status500) return new Response('error', { status: 500 });
    const key = `${method} ${url.pathname}`;
    if (key === 'GET /venta/inicio_info') {
      return new Response(fx('ab-inicio.html'), { headers: { 'set-cookie': 'rack.session=abc; path=/; HttpOnly' } });
    }
    if (key === 'POST /venta/horarios' && opts.horariosPost) return opts.horariosPost();
    if (method === 'POST') return new Response(null, { status: 302, headers: { location: '/venta/plazas' } });
    if (key === 'GET /venta/horarios') return new Response(fx(opts.horarios ?? 'ab-horarios-ida-2026-11-03.html'));
    if (key === 'GET /venta/plazas') return new Response(opts.plazasHtml ?? fx(opts.plazas ?? 'ab-plazas-0730.html'));
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('parsers sobre fixtures reales', () => {
  assert.equal(parseOrigenId(fx('ab-inicio.html')), '287');
  const rows = parseSchedule(fx('ab-horarios-ida-2026-11-03.html'));
  assert.equal(rows.length, 41);
  assert.deepEqual(rows[0], { departure: '00:30', arrival: '02:05', nromov: '4184920', full: false });
  assert.ok(rows.some((r) => r.departure === '23:45' && r.arrival === '01:40'));
  assert.deepEqual(parseSeatMap(fx('ab-plazas-1000.html')), { when: '03/11/2026 10:00', free: 36, occupied: 14, total: 50 });
  assert.deepEqual(parseSeatMap(fx('ab-plazas-0730.html')), { when: '03/11/2026 07:30', free: 31, occupied: 19, total: 50 });
});

test('fetchSeats 07:30 (910001): 5 peticiones, nromov correcto y cookie reenviada', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  const r = await fetchSeats(trip0730, '2026-11-03', { fetchImpl, now: () => new Date('2026-11-02T21:00:00Z') });
  assert.deepEqual(r, { ok: true, seats: { free: 31, occupied: 19, total: 50, checkedAt: '2026-11-02T21:00:00.000Z' } });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    'GET /venta/inicio_info', 'POST /venta/inicio', 'GET /venta/horarios', 'POST /venta/horarios', 'GET /venta/plazas',
  ]);
  assert.match(calls[1].body, /venta%5Bfecha_ida%5D=03%2F11%2F2026/);
  assert.match(calls[1].body, /venta%5Borigen_id%5D=287/);
  assert.match(calls[3].body, /venta%5Bnromov_ida%5D=4119481/);
  assert.ok(calls.slice(1).every((c) => c.cookie === 'rack.session=abc'));
  assert.ok(!calls.some((c) => c.method === 'POST' && c.path === '/venta/plazas'));
});

test('fetchSeats: bus de samar.es sin pareja en autobusing (910 20:15→22:00) → ok:false', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  const r = await fetchSeats({ ...trip0730, departure: '20:15', arrival: '22:00' }, '2026-11-03', { fetchImpl });
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => c.path === '/venta/plazas'));
});

test('fetchSeats sin otros buses a esa hora: solo coincide la salida (910 20:15→22:00 vs 20:15→22:10) → plazas con matchedArrival', async () => {
  const plazasHtml = fx('ab-plazas-0730.html').replace('03/11/2026 07:30', '03/11/2026 20:15');
  const { calls, fetchImpl } = fakeAutobusing({ plazasHtml });
  const r = await fetchSeats({ ...trip0730, departure: '20:15', arrival: '22:00' }, '2026-11-03', { fetchImpl, siblingArrivals: [], now: () => new Date('2026-11-02T21:00:00Z') });
  assert.deepEqual(r, { ok: true, seats: { free: 31, occupied: 19, total: 50, checkedAt: '2026-11-02T21:00:00.000Z' }, matchedArrival: '22:10' });
  const row = parseSchedule(fx('ab-horarios-ida-2026-11-03.html')).find((x) => x.departure === '20:15')!;
  assert.match(calls[3].body, new RegExp(`venta%5Bnromov_ida%5D=${row.nromov}`));
});

test('fetchSeats sin otros buses a esa hora: varias salidas a esa hora en autobusing y ninguna llegada coincide → ok:false', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  const r = await fetchSeats({ ...trip0730, departure: '15:00', arrival: '16:30' }, '2026-11-03', { fetchImpl, siblingArrivals: [] });
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => c.path === '/venta/plazas'));
});

test('fetchSeats: bus que cruza medianoche (23:45→01:40) se empareja', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  await fetchSeats({ ...trip0730, departure: '23:45', arrival: '01:40' }, '2026-11-03', { fetchImpl });
  const row = parseSchedule(fx('ab-horarios-ida-2026-11-03.html')).find((r) => r.departure === '23:45')!;
  assert.match(calls[3].body, new RegExp(`venta%5Bnromov_ida%5D=${row.nromov}`));
});

test('fetchSeats: la página de plazas es de otra hora → ok:false', async () => {
  const { fetchImpl } = fakeAutobusing({ plazas: 'ab-plazas-1000.html' });
  assert.equal((await fetchSeats(trip0730, '2026-11-03', { fetchImpl })).ok, false);
});

test('fetchSeats: autobusing rechaza la selección del bus (200 o 302 a horarios) → ok:false, sin pedir plazas', async () => {
  const rejections = [
    () => new Response(fx('ab-horarios-ida-2026-11-03.html')),
    () => new Response(null, { status: 302, headers: { location: '/venta/horarios' } }),
  ];
  for (const horariosPost of rejections) {
    const { calls, fetchImpl } = fakeAutobusing({ horariosPost });
    const r = await fetchSeats(trip0730, '2026-11-03', { fetchImpl });
    assert.equal(r.ok, false);
    assert.ok(!calls.some((c) => c.path === '/venta/plazas'));
  }
});

const vueltaRows = parseSchedule(fx('ab-horarios-vuelta-2026-11-06.html'));
const at = (departure: string, arrival: string) => ({ departure, arrival });

test('pickRow: empareja por descarte cuando samar.es tiene otro bus a la misma hora (06:00 del 06/11)', () => {
  // samar: 909 06:00→07:20 y 910 06:00→07:50; autobusing: 06:00-07:20 (Completo) y 06:00-07:55
  const r910 = pickRow(at('06:00', '07:50'), ['07:20'], vueltaRows)!;
  assert.deepEqual([r910.row.arrival, r910.exact], ['07:55', false]);
  const r909 = pickRow(at('06:00', '07:20'), ['07:50'], vueltaRows)!;
  assert.deepEqual([r909.row.arrival, r909.exact, r909.row.full], ['07:20', true, true]);
});

test('pickRow: solo coincide la salida y no hay más buses a esa hora → empareja sin exactitud', () => {
  const r = pickRow(at('05:00', '06:05'), [], vueltaRows)!;
  assert.deepEqual([r.row.arrival, r.exact], ['06:20', false]);
});

test('pickRow: dudas → null', () => {
  // autobusing tiene dos filas idénticas 07:00-08:20
  assert.equal(pickRow(at('07:00', '08:20'), ['09:00', '09:00'], vueltaRows), null);
  // dos buses de samar sin pareja exacta y dos filas libres: no se puede saber cuál es cuál
  const rows = [{ departure: '10:00', arrival: '11:00', nromov: '1', full: false }, { departure: '10:00', arrival: '11:30', nromov: '2', full: false }];
  assert.equal(pickRow(at('10:00', '11:10'), ['11:40'], rows), null);
  // no hay ninguna salida a esa hora
  assert.equal(pickRow(at('04:00', '05:00'), [], vueltaRows), null);
});

test('parseSchedule incluye las salidas «Completo» (sin botón de selección)', () => {
  const rows = parseSchedule(fx('ab-horarios-vuelta-2026-11-06.html'));
  assert.deepEqual(rows[0], { departure: '05:00', arrival: '06:20', nromov: null, full: true });
  assert.ok(rows.some((r) => r.departure === '09:30' && r.arrival === '11:20' && !r.full && r.nromov));
});

test('fetchSeats: el bus está completo → full, sin seleccionar bus ni pedir plazas', async () => {
  const { calls, fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-06.html' });
  const r = await fetchSeats({ ...trip0730, departure: '05:00', arrival: '06:05' }, '2026-11-06', { fetchImpl, siblingArrivals: [], now: () => new Date('2026-11-05T21:00:00Z') });
  assert.deepEqual(r, { ok: true, full: true, checkedAt: '2026-11-05T21:00:00.000Z', matchedArrival: '06:20' });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /venta/inicio_info', 'POST /venta/inicio', 'GET /venta/horarios']);
});

test('fetchSeats: autobusing salta a /venta/viajeros (bus sin elección de asiento) → ok:false con motivo claro', async () => {
  const { calls, fetchImpl } = fakeAutobusing({ horariosPost: () => new Response(null, { status: 302, headers: { location: '/venta/viajeros' } }) });
  const r = await fetchSeats(trip0730, '2026-11-03', { fetchImpl });
  assert.deepEqual(r, { ok: false, reason: 'Este bus no tiene elección de asiento en la venta online' });
  assert.ok(!calls.some((c) => c.path === '/venta/viajeros' || c.path === '/venta/plazas'));
});

test('fetchSeats lanza error si autobusing devuelve 500', async () => {
  const { fetchImpl } = fakeAutobusing({ status500: true });
  await assert.rejects(fetchSeats(trip0730, '2026-11-03', { fetchImpl }));
});
