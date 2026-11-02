import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionToken, isValidSession } from '../lib/auth.ts';

test('la sesión vale con la contraseña actual y deja de valer al cambiarla', async () => {
  const tok = await sessionToken('vieja');
  assert.equal(await isValidSession(tok, 'vieja'), true);
  assert.equal(await isValidSession(tok, 'nueva'), false);
});

test('sin cookie o sin APP_PASSWORD → false', async () => {
  assert.equal(await isValidSession(undefined, 'x'), false);
  assert.equal(await isValidSession(await sessionToken('x'), undefined), false);
  assert.equal(await isValidSession('cualquiera', ''), false);
  assert.equal(await isValidSession('basura', 'x'), false);
});
