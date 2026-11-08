import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults, resultsUrl, fetchTrips, SCHEMA_VERSION } from '../lib/samar.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('resultsUrl ida y vuelta', () => {
  assert.equal(resultsUrl('ida', '2026-11-03'), 'https://www.samar.es/horarios/autobuses/madrid-estacion-sur/talavera-de-la-reina/341/261?IsOneWay=true&OutboundDate=2026-11-03');
  assert.equal(resultsUrl('vuelta', '2026-11-06'), 'https://www.samar.es/horarios/autobuses/talavera-de-la-reina/madrid-estacion-sur/261/341?IsOneWay=true&OutboundDate=2026-11-06');
});

test('parseResults ida 03/11: 46 buses con itinerario', () => {
  const { trips, notices } = parseResults(fx('samar-ida-2026-11-03.html'));
  assert.equal(trips.length, 46);
  assert.deepEqual(trips[0], {
    expedition: '910047', line: '910', departure: '00:30', arrival: '02:05', duration: '01:35',
    originCode: '0108', destinationCode: '0831',
    stops: [
      { name: 'Madrid-Estacion Sur', time: '00:30' },
      { name: 'Valmojado', time: '01:15' },
      { name: 'Santa Cruz del Retamar', time: '01:25' },
      { name: 'Santa Olalla', time: '01:35' },
      { name: 'Talavera de La Reina', time: '02:05' },
    ],
    alerts: [],
  });
  assert.equal(notices.length, 2);
  assert.match(notices[1], /^LOS DÍAS 1 Y 2 DE NOVIEMBRE/);
});

test('parseResults extrae los avisos de parada de cada bus, sin repetir', () => {
  const vuelta = parseResults(fx('samar-vuelta-2026-11-06.html')).trips;
  assert.deepEqual(vuelta.find((t) => t.expedition === '909537')!.alerts, ['ESTE SERVICIO SÓLO LLEGA HASTA ALCORCÓN, NO TIENE PARADA EN LA ESTACIÓN SUR']);
  assert.equal(vuelta.filter((t) => t.alerts.length > 0).length, 2);
  const ida = parseResults(fx('samar-ida-2026-11-03.html')).trips;
  assert.deepEqual(ida.find((t) => t.expedition === '901001')!.alerts, ['LOS BILLETES CON EL Nº 91 - 92 O 93 DE AUTOBÚS (CORRESPONDEN A LAS DÁRSENAS DE LA 44 A 53)']);
  assert.deepEqual(ida.find((t) => t.expedition === '909003')!.alerts, []);
});

test('parseResults vuelta 06/11: 48 buses', () => {
  assert.equal(parseResults(fx('samar-vuelta-2026-11-06.html')).trips.length, 48);
});

test('parseResults sin servicio: 0 buses, sin error', () => {
  assert.equal(parseResults(fx('samar-vacio.html')).trips.length, 0);
});

test('parseResults lanza error si falta una tarjeta', () => {
  const html = fx('samar-ida-2026-11-03.html').replace('<div class="journey-card"', '<div class="xjourney"');
  assert.throws(() => parseResults(html), /resultados/);
});

test('parseResults cuenta también las tarjetas deshabilitadas (sin venta online)', () => {
  const html = fx('samar-ida-2026-11-03.html').replace('<div class="journey-card"', '<div class="journey-card journey-card--disabled"');
  const { trips } = parseResults(html);
  assert.equal(trips.length, 46);
  assert.equal(trips[0].expedition, '910047');
});

test('fetchTrips manda User-Agent y lanza error si no es 200', async () => {
  let ua = '';
  const ok = (async (_u: string, init: RequestInit) => {
    ua = new Headers(init.headers).get('user-agent')!;
    return new Response(fx('samar-vacio.html'));
  }) as unknown as typeof fetch;
  const r = await fetchTrips('ida', '2026-11-03', ok);
  assert.equal(r.trips.length, 0);
  assert.ok(Number.isFinite(Date.parse(r.fetchedAt)));
  assert.match(ua, /Firefox/);
  const bad = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(fetchTrips('ida', '2026-11-03', bad));
});

test('si cambia la forma de Trip hay que subir SCHEMA_VERSION (la caché sobrevive a despliegues)', () => {
  const trip = parseResults(fx('samar-ida-2026-11-03.html')).trips[0];
  assert.deepEqual(
    { version: SCHEMA_VERSION, keys: Object.keys(trip).sort() },
    { version: 5, keys: ['alerts', 'arrival', 'departure', 'destinationCode', 'duration', 'expedition', 'line', 'originCode', 'stops'] },
  );
});
