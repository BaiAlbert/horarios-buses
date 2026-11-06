import { expect, test } from '@playwright/test';
import { ORIGIN, PASSWORD, sessionCookie } from './helpers.ts';

const API = '/api/trips?dir=ida&date=2026-11-03';

test.describe('sin sesión', () => {
  test('la página principal redirige a /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buses Madrid ↔ Talavera');
  });

  test('la API responde 401 en JSON, sin redirigir', async ({ request }) => {
    const res = await request.get(API, { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: 'No autorizado' });
    expect((await request.get('/api/seats?dir=ida&date=2026-11-03&exp=910047', { maxRedirects: 0 })).status()).toBe(401);
  });

  for (const ruta of ['/login', '/robots.txt', '/manifest.webmanifest']) {
    test(`${ruta} es público`, async ({ request }) => {
      expect((await request.get(ruta, { maxRedirects: 0 })).status()).toBe(200);
    });
  }

  test('una ruta que solo se parece a una pública (/login-x) sí exige sesión', async ({ request }) => {
    const res = await request.get('/login-x', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe('/login');
  });

  test('cookie de otra contraseña: no vale', async ({ page, context }) => {
    await context.addCookies([await sessionCookie('otra')]);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get(API, { maxRedirects: 0 })).status()).toBe(401);
  });
});

test.describe('formulario', () => {
  test('el campo de contraseña tiene el foco y la página no se puede enviar vacía', async ({ page }) => {
    await page.goto('/login');
    const field = page.getByLabel('Contraseña');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await field.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  });

  test('contraseña incorrecta: error accesible, sin sesión y con retardo', async ({ page, context }) => {
    await page.goto('/login');
    const alert = page.getByRole('alert').filter({ hasText: 'Contraseña' }); // Next añade otro alert (anunciador de rutas)
    const intento = async (clave: string) => {
      await page.getByLabel('Contraseña').fill(clave);
      const [res] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'Entrar' }).click()]);
      await res.finished();
      return res.request().timing().responseEnd; // ms de la petición en sí, sin la espera del clic
    };

    await intento('mala');
    await expect(alert).toHaveText('Contraseña incorrecta');
    // se mide el segundo intento: el primero incluye el arranque en frío de la acción y daría por bueno un retardo de 0
    expect(await intento('mala2')).toBeGreaterThanOrEqual(900); // el retardo de 1 s frena los intentos seguidos
    await expect(page.getByLabel('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).filter((c) => c.name === 'hb_session')).toHaveLength(0);
  });

  test('contraseña correcta: entra, cookie httpOnly y la página ya no pide login', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(`${ORIGIN}/`);
    await expect(page.getByRole('button', { name: 'Buscar buses' })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === 'hb_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', secure: true });
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86_400); // ~30 días

    await page.reload();
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });
});
