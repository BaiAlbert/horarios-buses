import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults } from '../lib/samar.ts';
import {
  isDirect, stopsAtSantaOlalla, tripKind, KIND_LABEL, isAmbiguous, passesThrough,
  todayMadrid, isAllowedDate, parseDirection, searchDate,
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
  assert.equal(KIND_LABEL.ruta, 'Ruta · sin Santa Olalla');
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
