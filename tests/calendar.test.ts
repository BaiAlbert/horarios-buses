import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateEs, monthGrid } from '../lib/calendar.ts';

test('formatDateEs: día/mes/año', () => {
  assert.equal(formatDateEs('2026-11-03'), '03/11/2026');
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
