import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateEs, formatDuration, monthGrid } from '../lib/calendar.ts';

test('formatDateEs: día/mes/año', () => {
  assert.equal(formatDateEs('2026-11-03'), '03/11/2026');
});

test('formatDuration: abreviada a la vista, completa para lectores de pantalla', () => {
  assert.deepEqual(formatDuration('01:35'), { short: '1 h 35 min', long: '1 hora 35 minutos' });
  assert.deepEqual(formatDuration('02:01'), { short: '2 h 1 min', long: '2 horas 1 minuto' });
  assert.deepEqual(formatDuration('02:00'), { short: '2 h', long: '2 horas' });
  assert.deepEqual(formatDuration('00:55'), { short: '55 min', long: '55 minutos' });
  assert.deepEqual(formatDuration('00:00'), { short: '00:00', long: '00:00' });
  assert.deepEqual(formatDuration('1h35'), { short: '1h35', long: '1h35' });
});

test('monthGrid: semanas de lunes a domingo (noviembre 2026 empieza en domingo)', () => {
  const weeks = monthGrid(2026, 10);
  assert.deepEqual(weeks[0], [null, null, null, null, null, null, '2026-11-01']);
  assert.equal(weeks[1][0], '2026-11-02'); // lunes
  assert.deepEqual(weeks.at(-1), ['2026-11-30', null, null, null, null, null, null]);
  assert.ok(weeks.every((w) => w.length === 7));
});

test('monthGrid: febrero 2027 (empieza en lunes, 28 días = 4 semanas)', () => {
  const weeks = monthGrid(2027, 1);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[0][0], '2027-02-01');
  assert.equal(weeks[3][6], '2027-02-28');
});
