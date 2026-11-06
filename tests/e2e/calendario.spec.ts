import { expect, test, type Page } from '@playwright/test';
import { DAY, mockTrips, openLoggedIn, search } from './helpers.ts';

// El reloj está en 2026-11-03 (martes): el primer día elegible es ese y el último, 60 días después
const LAST = '2027-01-02';

const trigger = (page: Page) => page.locator('#date');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Elegir día del viaje' });
const day = (page: Page, date: string) => page.locator(`[data-date="${date}"]`);

async function openCalendar(page: Page) {
  await mockTrips(page);
  await openLoggedIn(page);
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
}

test('el botón muestra hoy; al abrir, el foco entra en el día elegido', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await expect(trigger(page)).toContainText('03/11/2026');
  await expect(trigger(page)).toContainText('martes');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');

  await trigger(page).click();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.calendar-title')).toHaveText('noviembre de 2026');
  await expect(day(page, DAY)).toBeFocused();
  await expect(day(page, DAY)).toHaveAttribute('aria-pressed', 'true');
  await expect(day(page, DAY)).toHaveAttribute('aria-current', 'date');
  await expect(day(page, DAY)).toHaveAttribute('aria-label', 'martes, 3 de noviembre de 2026');
});

test('la etiqueta «Día del viaje» abre el calendario y un segundo clic lo cierra', async ({ page }) => {
  await mockTrips(page);
  await openLoggedIn(page);
  await page.getByText('Día del viaje', { exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await page.getByText('Día del viaje', { exact: true }).click();
  await expect(dialog(page)).toBeHidden();
});

test('Escape cierra y devuelve el foco al botón', async ({ page }) => {
  await openCalendar(page);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});

test('un clic fuera lo cierra', async ({ page }) => {
  await openCalendar(page);
  await page.getByText('Elige el trayecto y el día').click();
  await expect(dialog(page)).toBeHidden();
});

test('el tabulador saca el foco del calendario y lo cierra', async ({ page }) => {
  await openCalendar(page);
  await page.keyboard.press('Tab'); // de la rejilla (un solo día tabulable) al siguiente control de la página
  await expect(dialog(page)).toBeHidden();
});

test('flechas: ±1 día y ±7 días, sin salir de los días elegibles', async ({ page }) => {
  await openCalendar(page);

  await page.keyboard.press('ArrowLeft'); // el 2 es anterior a hoy: deshabilitado
  await expect(day(page, DAY)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(day(page, '2026-11-04')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(day(page, '2026-11-11')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(day(page, '2026-11-04')).toBeFocused();

  await day(page, '2026-11-30').focus();
  await page.keyboard.press('ArrowRight'); // el 1 de diciembre no está en esta cuadrícula
  await expect(day(page, '2026-11-30')).toBeFocused();
});

test('solo un día es tabulable (el resto, con flechas)', async ({ page }) => {
  await openCalendar(page);
  await expect(page.locator('td button[tabindex="0"]')).toHaveCount(1);
  await expect(day(page, DAY)).toHaveAttribute('tabindex', '0');
});

test('límites: nada antes de hoy ni después de +60 días', async ({ page }) => {
  await openCalendar(page);
  await expect(day(page, '2026-11-02')).toBeDisabled();
  await expect(day(page, DAY)).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();

  const next = page.getByRole('button', { name: 'Mes siguiente' });
  await next.click();
  await expect(page.locator('.calendar-title')).toHaveText('diciembre de 2026');
  await next.click();
  await expect(page.locator('.calendar-title')).toHaveText('enero de 2027');
  await expect(day(page, LAST)).toBeEnabled();
  await expect(day(page, '2027-01-03')).toBeDisabled();
  await expect(next).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mes anterior' })).toBeEnabled();
});

test('elegir un día cierra el calendario, lo refleja en el botón y se busca con esa fecha', async ({ page }) => {
  await openCalendar(page);
  await day(page, '2026-11-20').click();

  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toContainText('20/11/2026');
  await expect(trigger(page)).toContainText('viernes');

  const request = page.waitForRequest((r) => r.url().includes('/api/trips'));
  await search(page);
  expect(new URL((await request).url()).searchParams.get('date')).toBe('2026-11-20');
  await expect(page.locator('.results-head .date')).toHaveText(/viernes.*20 de noviembre/);
});

test('al reabrirlo, vuelve al mes del día elegido', async ({ page }) => {
  await openCalendar(page);
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await day(page, '2026-12-15').click();

  await trigger(page).click();
  await expect(page.locator('.calendar-title')).toHaveText('diciembre de 2026');
  await expect(day(page, '2026-12-15')).toBeFocused();
});
