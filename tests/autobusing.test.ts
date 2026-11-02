import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults } from '../lib/samar.ts';
import { parseOrigenId, parseSchedule, parseSeatMap, fetchSeats } from '../lib/autobusing.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const { trips } = parseResults(fx('samar-ida-2026-11-03.html'));
const trip0730 = trips.find((x) => x.expedition === '910001')!;

type Call = { method: string; path: string; cookie: string | null; body: string };

// Imita a autobusing: cookie en inicio_info, 302 en los POST y fixtures en los GET.
function fakeAutobusing(opts: { plazas?: string; status500?: boolean } = {}) {
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
    if (method === 'POST') return new Response(null, { status: 302, headers: { location: '/venta/plazas' } });
    if (key === 'GET /venta/horarios') return new Response(fx('ab-horarios-ida-2026-11-03.html'));
    if (key === 'GET /venta/plazas') return new Response(fx(opts.plazas ?? 'ab-plazas-0730.html'));
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('parsers sobre fixtures reales', () => {
  assert.equal(parseOrigenId(fx('ab-inicio.html')), '287');
  const rows = parseSchedule(fx('ab-horarios-ida-2026-11-03.html'));
  assert.equal(rows.length, 41);
  assert.deepEqual(rows[0], { departure: '00:30', arrival: '02:05', nromov: '4184920' });
  assert.ok(rows.some((r) => r.departure === '23:45' && r.arrival === '01:40'));
  assert.deepEqual(parseSeatMap(fx('ab-plazas-1000.html')), { when: '03/11/2026 10:00', free: 36, occupied: 14, total: 50 });
  assert.deepEqual(parseSeatMap(fx('ab-plazas-0730.html')), { when: '03/11/2026 07:30', free: 31, occupied: 19, total: 50 });
});

test('fetchSeats 07:30 (910001): 5 peticiones, nromov correcto y cookie reenviada', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  const r = await fetchSeats(trip0730, '2026-11-03', fetchImpl, () => new Date('2026-11-02T21:00:00Z'));
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
  const r = await fetchSeats({ ...trip0730, departure: '20:15', arrival: '22:00' }, '2026-11-03', fetchImpl);
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => c.path === '/venta/plazas'));
});

test('fetchSeats: bus que cruza medianoche (23:45→01:40) se empareja', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  await fetchSeats({ ...trip0730, departure: '23:45', arrival: '01:40' }, '2026-11-03', fetchImpl);
  const row = parseSchedule(fx('ab-horarios-ida-2026-11-03.html')).find((r) => r.departure === '23:45')!;
  assert.match(calls[3].body, new RegExp(`venta%5Bnromov_ida%5D=${row.nromov}`));
});

test('fetchSeats: la página de plazas es de otra hora → ok:false', async () => {
  const { fetchImpl } = fakeAutobusing({ plazas: 'ab-plazas-1000.html' });
  assert.equal((await fetchSeats(trip0730, '2026-11-03', fetchImpl)).ok, false);
});

test('fetchSeats lanza error si autobusing devuelve 500', async () => {
  const { fetchImpl } = fakeAutobusing({ status500: true });
  await assert.rejects(fetchSeats(trip0730, '2026-11-03', fetchImpl));
});
