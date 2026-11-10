import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults } from '../lib/samar.ts';
import {
  isDirect, stopsAtSantaOlalla, tripKind, KIND_LABEL, isAmbiguous, passesThrough,
  todayMadrid, isAllowedDate, parseDirection, searchDate, buyUrl, onlyToAlcorcon, siblingArrivals, alcorconTwin,
  rule909, shares909Row, seatsContext,
} from '../lib/rules.ts';

const { trips } = parseResults(readFileSync(new URL('./fixtures/samar-ida-2026-11-03.html', import.meta.url), 'utf8'));
const t = (exp: string) => trips.find((x) => x.expedition === exp)!;

test('isDirect y Santa Olalla', () => {
  assert.equal(isDirect(t('909003')), true);
  assert.equal(stopsAtSantaOlalla(t('909003')), false);
  assert.equal(isDirect(t('909001')), false);
  assert.equal(stopsAtSantaOlalla(t('909001')), true);
  assert.equal(stopsAtSantaOlalla({ ...t('909003'), stops: [{ name: 'SANTA OLALLA', time: '00:00' }] }), true);
});

test('tripKind: tres tipos', () => {
  assert.equal(tripKind(t('909003')), 'directo');
  assert.equal(tripKind(t('910001')), 'ruta-santa-olalla');
  assert.equal(tripKind(t('901001')), 'ruta');
  assert.equal(tripKind(t('907001')), 'ruta');
  assert.equal(KIND_LABEL.ruta, 'Ruta');
});

test('isAmbiguous: 901/902/903 de las 08:00 sí; 909 de las 10:00 no', () => {
  assert.equal(isAmbiguous(t('901001'), trips), true);
  assert.equal(isAmbiguous(t('909003'), trips), false);
});

test('passesThrough solo para 901-905', () => {
  assert.equal(passesThrough(trips.find((x) => x.line === '904')!), true);
  assert.equal(passesThrough(trips.find((x) => x.line === '909')!), false);
});

test('todayMadrid usa la hora de España', () => {
  assert.equal(todayMadrid(new Date('2026-11-02T23:30:00Z')), '2026-11-03');
  assert.equal(todayMadrid(new Date('2026-11-02T22:30:00Z')), '2026-11-02');
});

test('isAllowedDate: de hoy a hoy+60', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(isAllowedDate('2026-11-02', now), true);
  assert.equal(isAllowedDate('2027-01-01', now), true);
  assert.equal(isAllowedDate('2027-01-02', now), false);
  assert.equal(isAllowedDate('2026-11-01', now), false);
  for (const bad of ['2026-13-01', '2026-11-3', '2026-11-31', 'mañana', '']) assert.equal(isAllowedDate(bad, now), false, bad);
});

test('searchDate: una fecha que se quedó en el pasado (pestaña abierta desde ayer) pasa a hoy', () => {
  const now = new Date('2026-11-03T08:00:00Z');
  assert.equal(searchDate('2026-11-02', now), '2026-11-03');
  assert.equal(searchDate('2026-11-05', now), '2026-11-05');
  assert.equal(searchDate('', now), '2026-11-03');
});

test('parseDirection', () => {
  assert.equal(parseDirection('ida'), 'ida');
  assert.equal(parseDirection('vuelta'), 'vuelta');
  assert.equal(parseDirection('x'), null);
  assert.equal(parseDirection(null), null);
});

test('buyUrl: enlace al paso 1 de autobusing con trayecto y fecha, sin hora (así autobusing no elige el bus)', () => {
  const u = new URL(buyUrl({ originCode: '0831', destinationCode: '0108' }, '2026-11-09'));
  assert.equal(`${u.origin}${u.pathname}`, 'https://regular.autobusing.es/venta/inicio_info');
  assert.deepEqual(Object.fromEntries(u.searchParams), { empresa: 'samar', origen_codigo: '0831', destino_codigo: '0108', fecha_ida: '2026-11-09' });
});

// Talavera → Madrid, 16/11: a las 05:45 hay un 909 normal (→ 07:05) y otro que solo llega hasta Alcorcón (→ 06:50)
const nov16 = parseResults(readFileSync(new URL('./fixtures/samar-vuelta-2026-11-16.html', import.meta.url), 'utf8')).trips;
const on16 = (dep: string, arr: string) => nov16.find((x) => x.departure === dep && x.arrival === arr)!;

test('onlyToAlcorcon: detecta el aviso con o sin tildes y mayúsculas', () => {
  assert.equal(onlyToAlcorcon({ alerts: ['ESTE SERVICIO SÓLO LLEGA HASTA ALCORCÓN, NO TIENE PARADA EN LA ESTACIÓN SUR'] }), true);
  assert.equal(onlyToAlcorcon({ alerts: ['solo llega hasta alcorcon'] }), true);
  assert.equal(onlyToAlcorcon({ alerts: [] }), false);
  assert.equal(onlyToAlcorcon({ alerts: ['LOS BILLETES CON EL Nº 91 - 92 O 93 SALEN DE LA DÁRSENA 5'] }), false);
  assert.equal(onlyToAlcorcon(on16('05:45', '06:50')), true);
  assert.equal(onlyToAlcorcon(on16('05:45', '07:05')), false);
});

test('siblingArrivals e isAmbiguous solo cuentan buses con la misma marca de Alcorcón', () => {
  assert.deepEqual(siblingArrivals(on16('05:45', '07:05'), nov16), []);
  assert.deepEqual(siblingArrivals(on16('05:45', '06:50'), nov16), []);
  assert.deepEqual(siblingArrivals(on16('06:00', '07:20'), nov16), ['07:50']);
  const normal = on16('05:45', '07:05');
  const twin = { ...on16('05:45', '06:50'), arrival: '07:05' }; // mismas horas, pero de Alcorcón
  assert.equal(isAmbiguous(normal, [normal, twin]), false);
  assert.equal(isAmbiguous(normal, [normal, { ...normal, expedition: 'otro' }]), true);
});

test('alcorconTwin: el bus normal que sale a la misma hora que uno de Alcorcón', () => {
  assert.equal(alcorconTwin(on16('05:45', '07:05'), nov16), true);
  assert.equal(alcorconTwin(on16('05:45', '06:50'), nov16), false); // él es el de Alcorcón
  assert.equal(alcorconTwin(on16('06:00', '07:20'), nov16), false);
});

// REGLA DEL 909 DIRECTO (DIRECT_909_RULE): autobusing pone a los 909 directos la llegada teórica, salida + 1:20.
// Sábado 28/11: a las 09:00 salen el 909 directo y el 905, los dos → 10:20 en samar.es; en autobusing, 10:20 y 10:50.
// Domingo 29/11: a las 19:00 salen el 904 (→ 20:30), el 909 directo y el 905 (los dos → 20:20); en autobusing, solo 20:20.
const vuelta = (d: string) => parseResults(readFileSync(new URL(`./fixtures/samar-vuelta-2026-11-${d}.html`, import.meta.url), 'utf8')).trips;
const nov28 = vuelta('28');
const nov29 = vuelta('29');
const line = (all: typeof nov28, dep: string, l: string) => all.find((x) => x.departure === dep && x.line === l)!;

test('REGLA DEL 909: el 909 directo y otro bus con sus mismas horas (salida + 1:20) ya no son ambiguos; apagada, sí', () => {
  for (const l of ['909', '905']) {
    assert.equal(isAmbiguous(line(nov28, '09:00', l), nov28), false);
    assert.equal(isAmbiguous(line(nov28, '09:00', l), nov28, false), true);
  }
  // sin 909 directo entre ellos, siguen ambiguos: 909 de ruta y 910 (07:00 → 09:00 del 16/11), 901 y 902 (11:15 del 16/11)
  assert.ok(nov16.filter((x) => x.departure === '07:00' && x.arrival === '09:00').every((x) => isAmbiguous(x, nov16)));
  assert.ok(nov16.filter((x) => x.departure === '11:15' && x.arrival === '13:10').every((x) => isAmbiguous(x, nov16)));
});

test('rule909: qué filas no son de un bus y si se queda las sobrantes', () => {
  assert.equal(rule909(line(nov28, '09:00', '909'), nov28), undefined); // el 909 directo empareja como siempre
  assert.deepEqual(rule909(line(nov28, '09:00', '905'), nov28), { theoretical: '10:20', not909Rows: true, leftovers: true });
  assert.deepEqual(rule909(line(nov28, '05:15', '910'), nov28), { theoretical: '06:35', not909Rows: true, leftovers: true });
  // domingo 19:00: el 904 y el 905 no son 909 directos, así que ninguno de los dos se queda las sobrantes
  assert.deepEqual(rule909(line(nov29, '19:00', '905'), nov29), { theoretical: '20:20', not909Rows: true, leftovers: false });
  // un bus solo a su hora (904 de las 10:15, 16/11): no hay 909 cuyas filas apartar, pero las sobrantes son suyas
  assert.deepEqual(rule909(line(nov16, '10:15', '904'), nov16), { theoretical: '11:35', not909Rows: false, leftovers: true });
  assert.equal(rule909(line(nov28, '09:00', '905'), nov28, false), undefined);
  // cruza medianoche: 23:00 + 1:20 = 00:20
  assert.equal(rule909({ ...line(nov28, '09:00', '905'), departure: '23:00' }, [])?.theoretical, '00:20');
});

test('shares909Row: el bus que tiene las mismas horas que un 909 directo (su fila en autobusing es otra)', () => {
  assert.equal(shares909Row(line(nov28, '09:00', '905'), nov28), true);
  assert.equal(shares909Row(line(nov28, '09:00', '909'), nov28), false);
  assert.equal(shares909Row(line(nov29, '19:00', '905'), nov29), true);
  assert.equal(shares909Row(line(nov29, '19:00', '904'), nov29), false); // llega a otra hora (20:30)
  assert.equal(shares909Row(line(nov28, '09:00', '905'), nov28, false), false);
});

// /api/seats pasa esto tal cual a fetchSeats: si faltara rule909, el 905 recibiría la fila del 909.
test('seatsContext: hermanos, gemelo de Alcorcón, regla del 909 y ambigüedad, todo junto', () => {
  assert.deepEqual(seatsContext(line(nov28, '09:00', '905'), nov28), {
    siblingArrivals: ['10:20'], alcorconTwin: false, rule909: { theoretical: '10:20', not909Rows: true, leftovers: true }, ambiguous: false,
  });
  assert.deepEqual(seatsContext(on16('05:45', '07:05'), nov16), { siblingArrivals: [], alcorconTwin: true, rule909: undefined, ambiguous: false });
  // 909 de ruta de las 07:00 (→ 09:00): el 910 tiene sus mismas horas
  assert.deepEqual(seatsContext(on16('07:00', '09:00'), nov16), {
    siblingArrivals: ['08:20', '09:00'], alcorconTwin: false, rule909: { theoretical: '08:20', not909Rows: true, leftovers: false }, ambiguous: true,
  });
});
