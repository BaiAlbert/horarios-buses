import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults } from '../lib/samar.ts';
import { isAmbiguous, rule909, seatsContext, siblingArrivals } from '../lib/rules.ts';
import { parseOrigenId, parseSchedule, parseSeatMap, fetchSeats, pickRow } from '../lib/autobusing.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const { trips } = parseResults(fx('samar-ida-2026-11-03.html'));
const trip0730 = trips.find((x) => x.expedition === '910001')!;

type Call = { method: string; path: string; cookie: string | null; body: string };

// Imita a autobusing: una cookie nueva (s1, s2…) en cada inicio_info, 302 en los POST y fixtures en los GET.
// Recuerda qué nromov eligió cada sesión, para devolver con plazasByNromov el mapa de asientos de esa fila.
function fakeAutobusing(opts: {
  plazas?: string; plazasHtml?: string; plazasByNromov?: Record<string, string>;
  horarios?: string; horariosHtml?: string; status500?: boolean; horariosPost?: (body: string) => Response;
} = {}) {
  const calls: Call[] = [];
  let sessions = 0;
  const pickedBy = new Map<string | null, string | null>(); // cookie → nromov elegido
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const cookie = headers.get('cookie');
    const body = init.body ? String(init.body) : '';
    calls.push({ method, path: url.pathname, cookie, body });
    if (opts.status500) return new Response('error', { status: 500 });
    const key = `${method} ${url.pathname}`;
    if (key === 'GET /venta/inicio_info') {
      sessions++;
      return new Response(fx('ab-inicio.html'), { headers: { 'set-cookie': `rack.session=s${sessions}; path=/; HttpOnly` } });
    }
    if (key === 'POST /venta/horarios') {
      pickedBy.set(cookie, new URLSearchParams(body).get('venta[nromov_ida]'));
      if (opts.horariosPost) return opts.horariosPost(body);
    }
    if (method === 'POST') return new Response(null, { status: 302, headers: { location: '/venta/plazas' } });
    if (key === 'GET /venta/horarios') return new Response(opts.horariosHtml ?? fx(opts.horarios ?? 'ab-horarios-ida-2026-11-03.html'));
    if (key === 'GET /venta/plazas') {
      const nromov = pickedBy.get(cookie);
      if (opts.plazasByNromov && nromov) return new Response(fx(opts.plazasByNromov[nromov]));
      return new Response(opts.plazasHtml ?? fx(opts.plazas ?? 'ab-plazas-0730.html'));
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('parsers sobre fixtures reales', () => {
  assert.equal(parseOrigenId(fx('ab-inicio.html')), '287');
  const rows = parseSchedule(fx('ab-horarios-ida-2026-11-03.html'));
  assert.equal(rows.length, 41);
  assert.deepEqual(rows[0], { departure: '00:30', arrival: '02:05', nromov: '4184920', full: false, alcorcon: false });
  assert.ok(rows.some((r) => r.departure === '23:45' && r.arrival === '01:40'));
  assert.deepEqual(parseSeatMap(fx('ab-plazas-1000.html')), { when: '03/11/2026 10:00', free: 36, occupied: 14, total: 50 });
  assert.deepEqual(parseSeatMap(fx('ab-plazas-0730.html')), { when: '03/11/2026 07:30', free: 31, occupied: 19, total: 50 });
});

test('fetchSeats 07:30 (910001): 5 peticiones, nromov correcto y cookie reenviada', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  const r = await fetchSeats(trip0730, '2026-11-03', { fetchImpl, now: () => new Date('2026-11-02T21:00:00Z') });
  assert.deepEqual(r, { ok: true, kind: 'count', free: 31, occupied: 19, total: 50, checkedAt: '2026-11-02T21:00:00.000Z' });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    'GET /venta/inicio_info', 'POST /venta/inicio', 'GET /venta/horarios', 'POST /venta/horarios', 'GET /venta/plazas',
  ]);
  assert.match(calls[1].body, /venta%5Bfecha_ida%5D=03%2F11%2F2026/);
  assert.match(calls[1].body, /venta%5Borigen_id%5D=287/);
  assert.match(calls[3].body, /venta%5Bnromov_ida%5D=4119481/);
  assert.ok(calls.slice(1).every((c) => c.cookie === 'rack.session=s1'));
  assert.ok(!calls.some((c) => c.method === 'POST' && c.path === '/venta/plazas'));
});

test('fetchSeats: bus de samar.es sin pareja en autobusing (910 20:15→22:00) → ok:false', async () => {
  const { calls, fetchImpl } = fakeAutobusing();
  const r = await fetchSeats({ ...trip0730, departure: '20:15', arrival: '22:00' }, '2026-11-03', { fetchImpl });
  assert.deepEqual(r, { ok: false, reason: 'No aparece en la venta online' }); // sin la lista de hermanos no se descarta
  assert.ok(!calls.some((c) => c.path === '/venta/plazas'));
});

test('fetchSeats sin otros buses a esa hora: solo coincide la salida (910 20:15→22:00 vs 20:15→22:10) → plazas con matchedArrival', async () => {
  const plazasHtml = fx('ab-plazas-0730.html').replace('03/11/2026 07:30', '03/11/2026 20:15');
  const { calls, fetchImpl } = fakeAutobusing({ plazasHtml });
  const r = await fetchSeats({ ...trip0730, departure: '20:15', arrival: '22:00' }, '2026-11-03', { fetchImpl, siblingArrivals: [], now: () => new Date('2026-11-02T21:00:00Z') });
  assert.deepEqual(r, { ok: true, kind: 'count', free: 31, occupied: 19, total: 50, checkedAt: '2026-11-02T21:00:00.000Z', matchedArrival: '22:10' });
  const row = parseSchedule(fx('ab-horarios-ida-2026-11-03.html')).find((x) => x.departure === '20:15')!;
  assert.match(calls[3].body, new RegExp(`venta%5Bnromov_ida%5D=${row.nromov}`));
});

test('pickRow: un solo bus de samar.es a esa hora y varias filas sin llegada exacta → por descarte, todas (hasta 3)', () => {
  const r = pickRow({ departure: '15:00', arrival: '16:30', alerts: [] }, [], parseSchedule(fx('ab-horarios-ida-2026-11-03.html')))!;
  assert.deepEqual([r.exact, r.rows.map((x) => x.arrival)], [false, ['16:45', '16:20', '16:50']]);
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
const at = (departure: string, arrival: string, alerts: string[] = []) => ({ departure, arrival, alerts });
const ALC = ['ESTE SERVICIO SÓLO LLEGA HASTA ALCORCÓN, NO TIENE PARADA EN LA ESTACIÓN SUR'];

test('pickRow: empareja por descarte cuando samar.es tiene otro bus a la misma hora (06:00 del 06/11)', () => {
  // samar: 909 06:00→07:20 y 910 06:00→07:50; autobusing: 06:00-07:20 (Completo) y 06:00-07:55
  const r910 = pickRow(at('06:00', '07:50'), ['07:20'], vueltaRows)!;
  assert.deepEqual([r910.rows.map((x) => x.arrival), r910.exact], [['07:55'], false]);
  const r909 = pickRow(at('06:00', '07:20'), ['07:50'], vueltaRows)!;
  assert.deepEqual([r909.rows.map((x) => x.arrival), r909.exact, r909.rows[0].full], [['07:20'], true, true]);
});

test('pickRow: solo coincide la salida y no hay más buses a esa hora → empareja sin exactitud', () => {
  const r = pickRow(at('05:00', '06:05', ALC), [], vueltaRows)!;
  assert.deepEqual([r.rows.map((x) => x.arrival), r.exact], [['06:20'], false]);
});

test('pickRow: refuerzo, dos filas idénticas 07:00→08:20 → devuelve las dos', () => {
  const r = pickRow(at('07:00', '08:20'), ['09:00', '09:00'], vueltaRows)!;
  assert.deepEqual([r.rows.length, r.exact], [2, true]);
});

const nov09 = parseSchedule(fx('ab-horarios-vuelta-2026-11-09.html'));

test('pickRow: refuerzo, dos filas idénticas 05:15→06:35 → devuelve las dos en orden', () => {
  const r = pickRow(at('05:15', '06:35'), ['07:05'], nov09)!;
  assert.deepEqual([r.exact, r.rows.map((x) => x.nromov)], [true, ['4123139', '4123140']]);
});

test('fetchSeats: 905 de las 10:30 (12:00), sin fila propia → «No aparece en la venta online»', async () => {
  const { fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-09.html' });
  const r = await fetchSeats({ ...trip0730, departure: '10:30', arrival: '12:00' }, '2026-11-09', { fetchImpl, siblingArrivals: ['11:50', '12:30'] });
  assert.deepEqual(r, { ok: false, reason: 'No aparece en la venta online' });
});

test('fetchSeats: 910 05:15→07:05 con dos filas sobrantes (07:10 y 07:15) → refuerzo por descarte, con la llegada de cada una', async () => {
  const { fetchImpl } = fakeAutobusing({
    horarios: 'ab-horarios-vuelta-2026-11-09.html',
    plazasByNromov: { '4123182': 'ab-plazas-0515-a.html', '4123183': 'ab-plazas-0515-a.html' },
  });
  const r = await fetchSeats({ ...trip0730, departure: '05:15', arrival: '07:05' }, '2026-11-09', { fetchImpl, siblingArrivals: ['06:35'] });
  assert.ok(r.ok && r.kind === 'several');
  assert.deepEqual(r.buses, [
    { kind: 'count', free: 3, occupied: 62, total: 65, arrival: '07:10' },
    { kind: 'count', free: 3, occupied: 62, total: 65, arrival: '07:15' },
  ]);
});

// TALAVERA → MADRID, 16/11: cada bus de samar.es contra la tabla completa (17/11, misma estructura y nada lleno)
// y contra la del 16/11 con los llenos ocultos. Ver «Cómo queda cada caso» en el diseño del emparejamiento v2.
const nov16 = parseResults(fx('samar-vuelta-2026-11-16.html')).trips;
const full17 = parseSchedule(fx('ab-horarios-vuelta-2026-11-17.html'));
const llenos16 = parseSchedule(fx('ab-horarios-vuelta-2026-11-16-llenos.html'));
const bus16 = (dep: string, arr: string) => nov16.find((t) => t.departure === dep && t.arrival === arr)!;
const pick16 = (rows: typeof full17, dep: string, arr: string) => {
  const p = pickRow(bus16(dep, arr), siblingArrivals(bus16(dep, arr), nov16), rows);
  return p && [p.exact, p.rows.map((r) => r.nromov ?? 'Completo')];
};

test('pickRow 16/11: el 05:45 normal y el de Alcorcón no se mezclan', () => {
  assert.deepEqual(pick16(full17, '05:45', '07:05'), [true, ['4128377']]);
  assert.deepEqual(pick16(full17, '05:45', '06:50'), [false, ['4128378']]);
});

test('pickRow 16/11: por descarte, el bus recibe todas las filas sobrantes de su marca', () => {
  assert.deepEqual(pick16(full17, '05:00', '06:05'), [false, ['4128373', '4128374']]);
  assert.deepEqual(pick16(full17, '05:15', '07:05'), [false, ['4128418', '4128419']]);
  assert.deepEqual(pick16(full17, '06:00', '07:50'), [false, ['4128422', '4128423']]);
  assert.deepEqual(pick16(full17, '05:15', '06:35'), [true, ['4128375', '4128376']]);
  assert.equal(pick16(full17, '10:30', '12:00'), null); // 905: no está en autobusing
});

test('pickRow 16/11 con los llenos ocultos: el 05:45 normal no aparece; el de Alcorcón y el 05:00 siguen', () => {
  assert.equal(pick16(llenos16, '05:45', '07:05'), null);
  assert.deepEqual(pick16(llenos16, '05:45', '06:50'), [false, ['4127601']]);
  assert.deepEqual(pick16(llenos16, '05:00', '06:05'), [false, ['Completo']]);
});

test('16/11: los dos 07:00→09:00 siguen ambiguos, y todo bus normal recibe al menos una fila', () => {
  const at0700 = nov16.filter((t) => t.departure === '07:00' && t.arrival === '09:00');
  assert.equal(at0700.length, 2);
  assert.ok(at0700.every((t) => isAmbiguous(t, nov16)));
  const sinFila = ['10:30', '11:15', '18:15', '18:30'];
  const normales = nov16.filter((t) => !isAmbiguous(t, nov16) && t.line !== '907' && !sinFila.includes(t.departure));
  const huerfanos = normales.filter((t) => !pickRow(t, siblingArrivals(t, nov16), full17)).map((t) => `${t.departure}-${t.arrival}`);
  assert.deepEqual(huerfanos, []);
});

test('pickRow: dudas → null', () => {
  // dos buses de samar sin pareja exacta y dos filas libres: no se puede saber cuál es cuál
  const rows = [{ departure: '10:00', arrival: '11:00', nromov: '1', full: false, alcorcon: false }, { departure: '10:00', arrival: '11:30', nromov: '2', full: false, alcorcon: false }];
  assert.equal(pickRow(at('10:00', '11:10'), ['11:40'], rows), null);
  // no hay ninguna salida a esa hora
  assert.equal(pickRow(at('04:00', '05:00'), [], vueltaRows), null);
});

test('parseSchedule lee la nota «solo llega hasta Alcorcón» de cada fila (17/11, tabla completa)', () => {
  const rows = parseSchedule(fx('ab-horarios-vuelta-2026-11-17.html'));
  assert.equal(rows.length, 43);
  const flagged = rows.filter((r) => r.alcorcon).map((r) => `${r.departure}-${r.arrival} ${r.nromov}`);
  assert.deepEqual(flagged, ['05:00-06:20 4128373', '05:00-06:20 4128374', '05:45-07:05 4128378']);
  assert.equal(rows.find((r) => r.nromov === '4128377')?.alcorcon, false);
});

test('parseSchedule: en la tabla con los llenos ocultos (16/11), la fila «Completo» de las 05:00 conserva la nota', () => {
  const rows = parseSchedule(fx('ab-horarios-vuelta-2026-11-16-llenos.html'));
  assert.equal(rows.length, 40);
  assert.deepEqual(rows[0], { departure: '05:00', arrival: '06:20', nromov: null, full: true, alcorcon: true });
});

test('parseSchedule incluye las salidas «Completo» (sin botón de selección)', () => {
  const rows = parseSchedule(fx('ab-horarios-vuelta-2026-11-06.html'));
  assert.deepEqual(rows[0], { departure: '05:00', arrival: '06:20', nromov: null, full: true, alcorcon: true });
  assert.ok(rows.some((r) => r.departure === '09:30' && r.arrival === '11:20' && !r.full && r.nromov));
});

test('fetchSeats: el bus está completo → full, sin seleccionar bus ni pedir plazas', async () => {
  const { calls, fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-06.html' });
  const r = await fetchSeats({ ...trip0730, departure: '05:00', arrival: '06:05', alerts: ALC }, '2026-11-06', { fetchImpl, siblingArrivals: [], now: () => new Date('2026-11-05T21:00:00Z') });
  assert.deepEqual(r, { ok: true, kind: 'full', checkedAt: '2026-11-05T21:00:00.000Z', matchedArrival: '06:20' });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /venta/inicio_info', 'POST /venta/inicio', 'GET /venta/horarios']);
});

test('fetchSeats: bus sin elección de asiento (salta a /venta/viajeros) y no «Completo» → quedan plazas, sin número', async () => {
  const { calls, fetchImpl } = fakeAutobusing({ horariosPost: () => new Response(null, { status: 302, headers: { location: '/venta/viajeros' } }) });
  const r = await fetchSeats(trip0730, '2026-11-03', { fetchImpl, now: () => new Date('2026-11-02T21:00:00Z') });
  assert.deepEqual(r, { ok: true, kind: 'available', checkedAt: '2026-11-02T21:00:00.000Z' });
  assert.ok(!calls.some((c) => c.path === '/venta/viajeros' || c.path === '/venta/plazas'));
});

test('fetchSeats lanza error si autobusing devuelve 500', async () => {
  const { fetchImpl } = fakeAutobusing({ status500: true });
  await assert.rejects(fetchSeats(trip0730, '2026-11-03', { fetchImpl }));
});

test('fetchSeats corta todo el recorrido al agotar el presupuesto de tiempo, aunque cada petición tenga su propio plazo', async () => {
  const hang = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
  await assert.rejects(fetchSeats(trip0730, '2026-11-03', { fetchImpl: hang, budgetMs: 20 }), { name: 'TimeoutError' });
});

// REFUERZO (09/11, Talavera→Madrid): samar.es tiene un bus 05:15→06:35 (909) y otro 05:15→07:05 (910);
// autobusing tiene DOS filas 05:15→06:35 (4123139: 65 asientos, 3 libres; 4123140: 60 asientos, 4 libres).
const refuerzo = { ...trip0730, departure: '05:15', arrival: '06:35' };
const refuerzoOpts = { siblingArrivals: ['07:05'], now: () => new Date('2026-11-08T21:00:00Z') };
const plazasRefuerzo = { '4123139': 'ab-plazas-0515-a.html', '4123140': 'ab-plazas-0515-b.html' };
const radioOf = (nromov: string) => `<input id="venta_nromov_ida" name="venta[nromov_ida]" type="radio" value="${nromov}"/>`;
const picksOf = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.path === '/venta/horarios');

test('fetchSeats: refuerzo → plazas de cada fila por separado, cada una con su propia sesión', async () => {
  const { calls, fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-09.html', plazasByNromov: plazasRefuerzo });
  const r = await fetchSeats(refuerzo, '2026-11-09', { fetchImpl, ...refuerzoOpts });
  assert.deepEqual(r, {
    ok: true, kind: 'several', checkedAt: '2026-11-08T21:00:00.000Z',
    buses: [{ kind: 'count', free: 3, occupied: 62, total: 65, arrival: '06:35' }, { kind: 'count', free: 4, occupied: 56, total: 60, arrival: '06:35' }],
  });
  const picks = picksOf(calls);
  assert.equal(picks.length, 2);
  assert.equal(new Set(picks.map((c) => c.cookie)).size, 2); // cada nromov, con una cookie distinta
  assert.ok(!calls.some((c) => c.method === 'POST' && c.path === '/venta/plazas'));
});

test('fetchSeats: refuerzo con una fila «Completo» → esa sale completa sin seleccionarla, la otra con plazas', async () => {
  const horariosHtml = fx('ab-horarios-vuelta-2026-11-09.html').replace(radioOf('4123139'), 'Completo');
  const { calls, fetchImpl } = fakeAutobusing({ horariosHtml, plazasByNromov: plazasRefuerzo });
  const r = await fetchSeats(refuerzo, '2026-11-09', { fetchImpl, ...refuerzoOpts });
  assert.deepEqual(r, {
    ok: true, kind: 'several', checkedAt: '2026-11-08T21:00:00.000Z',
    buses: [{ kind: 'full', arrival: '06:35' }, { kind: 'count', free: 4, occupied: 56, total: 60, arrival: '06:35' }],
  });
  assert.ok(!picksOf(calls).some((c) => c.body.includes('4123139')));
});

test('fetchSeats: refuerzo con una fila sin elección de asiento → esa fila «quedan plazas»', async () => {
  const horariosPost = (body: string) =>
    new Response(null, { status: 302, headers: { location: body.includes('4123140') ? '/venta/viajeros' : '/venta/plazas' } });
  const { fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-09.html', plazasByNromov: plazasRefuerzo, horariosPost });
  const r = await fetchSeats(refuerzo, '2026-11-09', { fetchImpl, ...refuerzoOpts });
  assert.ok(r.ok && r.kind === 'several');
  assert.deepEqual(r.buses, [{ kind: 'count', free: 3, occupied: 62, total: 65, arrival: '06:35' }, { kind: 'available', arrival: '06:35' }]);
});

test('fetchSeats: refuerzo y una sesión recibe plazas de otra hora → todo ok:false, sin resultados a medias', async () => {
  const { fetchImpl } = fakeAutobusing({
    horarios: 'ab-horarios-vuelta-2026-11-09.html',
    plazasByNromov: { ...plazasRefuerzo, '4123140': 'ab-plazas-0730.html' },
  });
  assert.deepEqual(await fetchSeats(refuerzo, '2026-11-09', { fetchImpl, ...refuerzoOpts }), { ok: false, reason: 'La respuesta no corresponde al bus' });
});

test('fetchSeats: más de 3 filas idénticas → ok:false sin seleccionar ninguna', async () => {
  const row = (n: string) => `<tr><td class="radio">${radioOf(n)}</td><td><strong>05:15</strong></td><td><strong>06:35</strong></td><td class="numeric">11,33€</td></tr>`;
  const horariosHtml = ['1', '2', '3', '4'].map(row).join('');
  const { calls, fetchImpl } = fakeAutobusing({ horariosHtml });
  assert.deepEqual(await fetchSeats(refuerzo, '2026-11-09', { fetchImpl, ...refuerzoOpts }), { ok: false, reason: 'Demasiadas filas iguales en autobusing' });
  assert.equal(picksOf(calls).length, 0);
});

test('fetchSeats: más de 3 filas sobrantes por descarte → ok:false sin seleccionar ninguna', async () => {
  const row = (n: string, arr: string) => `<tr><td class="radio">${radioOf(n)}</td><td><strong>05:15</strong></td><td><strong>${arr}</strong></td><td class="numeric">11,33€</td></tr>`;
  const horariosHtml = [row('1', '07:10'), row('2', '07:20'), row('3', '07:30'), row('4', '07:40')].join('');
  const { calls, fetchImpl } = fakeAutobusing({ horariosHtml });
  const r = await fetchSeats({ ...trip0730, departure: '05:15', arrival: '07:05' }, '2026-11-09', { fetchImpl, siblingArrivals: [] });
  assert.deepEqual(r, { ok: false, reason: 'Demasiadas filas iguales en autobusing' });
  assert.equal(picksOf(calls).length, 0);
});

// REVISIÓN: si autobusing cambiara el HTML de la nota y ya no se leyera, el 05:45 normal recibiría también la fila
// de Alcorcón (sus plazas mezcladas). Si samar.es tiene un bus de Alcorcón a esa hora y ninguna fila lleva la nota,
// mejor «no disponible».
test('fetchSeats: hay bus de Alcorcón en samar.es pero ninguna fila con la nota → ok:false, sin seleccionar', async () => {
  const horariosHtml = fx('ab-horarios-vuelta-2026-11-17.html').replaceAll('<td colspan="4">', '<td colspan="5">');
  const { calls, fetchImpl } = fakeAutobusing({ horariosHtml });
  const normal = bus16('05:45', '07:05');
  const r = await fetchSeats(normal, '2026-11-16', { fetchImpl, siblingArrivals: siblingArrivals(normal, nov16), alcorconTwin: true });
  assert.deepEqual(r, { ok: false, reason: 'No se distingue el bus de Alcorcón en autobusing' });
  assert.equal(picksOf(calls).length, 0);
});

// REVISIÓN: el 903 de las 11:15 (→ 13:15). La única fila 11:15 → 13:10 puede ser del 901, del 902 o suya; los dos
// primeros son ambiguos entre sí, así que no «son dueños» de esa fila: no se sabe, no «no aparece».
test('fetchSeats: 903 11:15→13:15, con una sola fila 11:15→13:10 que 901 y 902 se disputan → «Varias filas posibles»', async () => {
  const { fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-17.html' });
  const t903 = bus16('11:15', '13:15');
  const r = await fetchSeats(t903, '2026-11-16', { fetchImpl, siblingArrivals: siblingArrivals(t903, nov16) });
  assert.deepEqual(r, { ok: false, reason: 'Varias filas posibles en autobusing' });
});

// REGLA DEL 909 DIRECTO (DIRECT_909_RULE en rules.ts), sobre capturas reales de Talavera → Madrid:
// sábado 28/11 y domingo 29/11. autobusing pone a los 909 directos la llegada teórica (salida + 1:20).
const sat = parseResults(fx('samar-vuelta-2026-11-28.html')).trips;
const sun = parseResults(fx('samar-vuelta-2026-11-29.html')).trips;
const rows28 = parseSchedule(fx('ab-horarios-vuelta-2026-11-28.html'));
const rows29 = parseSchedule(fx('ab-horarios-vuelta-2026-11-29.html'));
const byLine = (all: typeof sat, dep: string, l: string) => all.find((t) => t.departure === dep && t.line === l)!;
// Lo que recibe cada bus: «ambiguo», las llegadas de sus filas (y si es exacta) o «—».
const outcome = (t: (typeof sat)[number], all: typeof sat, rows: typeof rows28, on = true) => {
  if (isAmbiguous(t, all, on)) return 'ambiguo';
  const p = pickRow(t, siblingArrivals(t, all), rows, rule909(t, all, on));
  return p ? `${p.exact ? 'exacta' : 'descarte'} ${p.rows.map((r) => r.arrival).join(',')}` : '—';
};

test('REGLA DEL 909, 28/11: a las 09:00 el 909 directo se queda la fila 10:20 y el 905 la 10:50 (apagada, los dos ambiguos)', () => {
  assert.equal(outcome(byLine(sat, '09:00', '909'), sat, rows28), 'exacta 10:20');
  assert.equal(outcome(byLine(sat, '09:00', '905'), sat, rows28), 'descarte 10:50');
  assert.equal(outcome(byLine(sat, '09:00', '905'), sat, rows28, false), 'ambiguo');
});

test('REGLA DEL 909, 28/11: la fila sobrante va al único bus de su hora que no es 909 directo (apagada, se ignora)', () => {
  assert.equal(outcome(byLine(sat, '05:15', '910'), sat, rows28), 'descarte 07:05,07:15,07:05');
  assert.equal(outcome(byLine(sat, '10:30', '910'), sat, rows28), 'descarte 12:30,12:25');
  assert.equal(outcome(byLine(sat, '05:15', '909'), sat, rows28), 'exacta 06:35,06:35');
  assert.equal(outcome(byLine(sat, '05:15', '910'), sat, rows28, false), 'exacta 07:05,07:05');
  assert.equal(outcome(byLine(sat, '10:30', '910'), sat, rows28, false), 'exacta 12:30');
});

// Todos los buses de todos los fixtures, con la regla encendida y apagada: solo pueden cambiar estos.
test('REGLA DEL 909: en todos los fixtures, solo cambian los buses previstos', () => {
  const pairs: [string, string, string][] = [
    ['03/11 ida', 'samar-ida-2026-11-03.html', 'ab-horarios-ida-2026-11-03.html'],
    ['06/11', 'samar-vuelta-2026-11-06.html', 'ab-horarios-vuelta-2026-11-06.html'],
    ['16/11', 'samar-vuelta-2026-11-16.html', 'ab-horarios-vuelta-2026-11-17.html'],
    ['16/11 llenos', 'samar-vuelta-2026-11-16.html', 'ab-horarios-vuelta-2026-11-16-llenos.html'],
    ['28/11', 'samar-vuelta-2026-11-28.html', 'ab-horarios-vuelta-2026-11-28.html'],
    ['29/11', 'samar-vuelta-2026-11-29.html', 'ab-horarios-vuelta-2026-11-29.html'],
  ];
  const changed: string[] = [];
  for (const [day, s, a] of pairs) {
    const all = parseResults(fx(s)).trips;
    const rows = parseSchedule(fx(a));
    for (const t of all) {
      const [on, off] = [outcome(t, all, rows), outcome(t, all, rows, false)];
      if (on !== off) changed.push(`${day} ${t.departure} ${t.line}: ${off} → ${on}`);
    }
  }
  assert.deepEqual(changed, [
    '28/11 05:15 910: exacta 07:05,07:05 → descarte 07:05,07:15,07:05',
    '28/11 09:00 909: ambiguo → exacta 10:20',
    '28/11 09:00 905: ambiguo → descarte 10:50',
    '28/11 10:30 910: exacta 12:30 → descarte 12:30,12:25',
    '29/11 19:00 909: ambiguo → exacta 20:20',
    '29/11 19:00 905: ambiguo → —',
  ]);
});

test('fetchSeats, REGLA DEL 909: 905 de las 09:00 del 28/11 → plazas de la fila 10:50, con matchedArrival', async () => {
  const { calls, fetchImpl } = fakeAutobusing({
    horarios: 'ab-horarios-vuelta-2026-11-28.html',
    plazasHtml: fx('ab-plazas-0730.html').replace('03/11/2026 07:30', '28/11/2026 09:00'),
  });
  const t905 = byLine(sat, '09:00', '905');
  const r = await fetchSeats(t905, '2026-11-28', { fetchImpl, ...seatsContext(t905, sat), now: () => new Date('2026-11-09T12:00:00Z') });
  assert.deepEqual(r, { ok: true, kind: 'count', free: 31, occupied: 19, total: 50, checkedAt: '2026-11-09T12:00:00.000Z', matchedArrival: '10:50' });
  assert.equal(new URLSearchParams(picksOf(calls)[0].body).get('venta[nromov_ida]'), '4135606');
});

// Domingo 19:00: la única fila (20:20) es del 909 directo. Al 904 (→ 20:30) y al 905 no les queda ninguna.
test('fetchSeats, REGLA DEL 909: domingo 29/11 a las 19:00, el 904 y el 905 «No aparecen» (apagada, el 904 «Varias filas»)', async () => {
  assert.equal(outcome(byLine(sun, '19:00', '909'), sun, rows29), 'exacta 20:20');
  const { fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-29.html' });
  for (const l of ['904', '905']) {
    const t = byLine(sun, '19:00', l);
    const r = await fetchSeats(t, '2026-11-29', { fetchImpl, ...seatsContext(t, sun) });
    assert.deepEqual(r, { ok: false, reason: 'No aparece en la venta online' });
  }
  const t904 = byLine(sun, '19:00', '904');
  const off = await fetchSeats(t904, '2026-11-29', { fetchImpl, siblingArrivals: siblingArrivals(t904, sun), rule909: rule909(t904, sun, false) });
  assert.deepEqual(off, { ok: false, reason: 'Varias filas posibles en autobusing' });
});
