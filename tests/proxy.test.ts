import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import manifest from '../app/manifest.ts';

// proxy.ts importa next/server, que Node no resuelve fuera de Next: se lee el literal del matcher del propio archivo
const literal = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8').match(/matcher: \[('.*')\]/)?.[1];
assert.ok(literal, 'no se encontró el matcher en proxy.ts');
const matcher: string = new Function(`return ${literal}`)();

// Next convierte «/(...)» en una expresión regular que se aplica a la ruta entera
const protegida = (path: string) => new RegExp(`^${matcher}$`).test(path);

test('el proxy protege la página y la API', () => {
  for (const p of ['/', '/api/trips', '/api/seats', '/otra']) assert.equal(protegida(p), true, p);
});

test('el proxy deja pasar solo el login y los recursos públicos', () => {
  for (const p of ['/login', '/_next/static/chunks/a.js', '/_next/image', '/favicon.ico', '/icon.svg', '/apple-icon', '/robots.txt', '/manifest.webmanifest']) {
    assert.equal(protegida(p), false, p);
  }
});

test('un prefijo parecido a una ruta pública no se salta la sesión', () => {
  for (const p of ['/login-x', '/loginx/a', '/robots.txtx', '/iconxsvg', '/faviconxico', '/apple-icons', '/_next/staticx']) {
    assert.equal(protegida(p), true, p);
  }
});

// el navegador pide el manifiesto y sus iconos sin cookie de sesión: si el proxy los protegiera, recibiría la página de login
test('el manifiesto y sus iconos son públicos', () => {
  const m = manifest();
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  assert.ok(m.icons?.length);
  for (const { src } of m.icons ?? []) assert.equal(protegida(src), false, src);
});
