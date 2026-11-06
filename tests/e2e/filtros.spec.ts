import { expect, test, type Page } from '@playwright/test';
import { KIND_LABEL, tripKind, type TripKind } from '../../lib/rules.ts';
import { mockTrips, openLoggedIn, search, searchButton, tripsFixture } from './helpers.ts';

const { trips, notices } = tripsFixture();
const KINDS = Object.keys(KIND_LABEL) as TripKind[];
const count = (k: TripKind) => trips.filter((t) => tripKind(t) === k).length;

const chip = (page: Page, k: TripKind) => page.getByRole('checkbox', { name: `${KIND_LABEL[k]} ${count(k)}`, exact: true });
const hideStops = (page: Page) => page.getByRole('switch', { name: 'Ocultar paradas' });
const noticesToggle = (page: Page) => page.getByRole('button', { name: /Avisos de Samar/ });

async function openResults(page: Page) {
  await mockTrips(page);
  await openLoggedIn(page);
  await search(page);
}

// la página vuelve a «idle» al recargar: hay que buscar de nuevo, las preferencias son lo que debe sobrevivir
async function reloadAndSearch(page: Page) {
  await page.reload();
  await searchButton(page).click();
  await page.getByRole('heading', { level: 2 }).waitFor();
}

test('un chip por tipo, con el número de buses de cada uno, todos marcados', async ({ page }) => {
  await openResults(page);
  for (const k of KINDS) await expect(chip(page, k)).toBeChecked();
  expect(KINDS.reduce((n, k) => n + count(k), 0)).toBe(trips.length);
});

test('desmarcar un tipo oculta sus buses y cambia el contador', async ({ page }) => {
  await openResults(page);
  await chip(page, 'directo').uncheck();

  const left = trips.length - count('directo');
  await expect(page.getByRole('article')).toHaveCount(left);
  await expect(page.locator('.results-head .count')).toHaveText(`${left} de ${trips.length} buses`);
  await expect(page.locator('#resultados [role="status"]')).toContainText(`${left} de ${trips.length} buses`);
  await expect(page.locator('.kind-directo.kind')).toHaveCount(0);

  await chip(page, 'directo').check();
  await expect(page.getByRole('article')).toHaveCount(trips.length);
});

test('sin ningún tipo marcado: «Ningún bus con los tipos seleccionados»', async ({ page }) => {
  await openResults(page);
  for (const k of KINDS) await chip(page, k).uncheck();

  await expect(page.getByText('Ningún bus con los tipos seleccionados.')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Filtros' })).toBeVisible(); // se puede volver a marcar
});

test('filtrar con el teclado no devuelve el foco al título', async ({ page }) => {
  await openResults(page);
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused(); // al buscar, sí

  await chip(page, 'ruta').focus();
  await page.keyboard.press('Space');
  await expect(chip(page, 'ruta')).not.toBeChecked();
  await expect(chip(page, 'ruta')).toBeFocused();
});

test('el filtro sobrevive a una recarga', async ({ page }) => {
  await openResults(page);
  await chip(page, 'ruta').uncheck();

  await reloadAndSearch(page);
  await expect(chip(page, 'ruta')).not.toBeChecked();
  await expect(page.getByRole('article')).toHaveCount(trips.length - count('ruta'));
});

test('«Ocultar paradas»: cierra los itinerarios de todas las tarjetas y se recuerda', async ({ page }) => {
  await openResults(page);
  const collapse = page.locator('article .collapse').first();
  await expect(collapse).toHaveAttribute('data-open', 'true');
  await expect(collapse).not.toHaveAttribute('inert');

  await hideStops(page).check();
  await expect(page.locator('article .collapse[data-open="false"][inert]')).toHaveCount(trips.length);

  await reloadAndSearch(page);
  await expect(hideStops(page)).toBeChecked();
  await expect(page.locator('article .collapse[data-open="false"][inert]')).toHaveCount(trips.length);

  await hideStops(page).uncheck();
  await expect(page.locator('article .collapse[data-open="true"]')).toHaveCount(trips.length);
});

test('«Avisos de Samar»: se pliegan, quedan fuera del foco y se recuerda', async ({ page }) => {
  await openResults(page);
  const panel = page.locator('#avisos');
  await expect(noticesToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.locator('p')).toHaveCount(notices.length);

  await noticesToggle(page).click();
  await expect(noticesToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveAttribute('inert', '');

  await reloadAndSearch(page);
  await expect(noticesToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await noticesToggle(page).click();
  await expect(panel).not.toHaveAttribute('inert');
});

test('localStorage bloqueado: la página funciona igual, aunque no recuerde nada', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqueado', 'SecurityError'); } });
  });
  await openResults(page);

  await chip(page, 'directo').uncheck();
  await expect(page.getByRole('article')).toHaveCount(trips.length - count('directo'));
  await hideStops(page).check();
  await expect(page.locator('article .collapse[data-open="false"]')).toHaveCount(trips.length - count('directo'));
  await noticesToggle(page).click();
  await expect(noticesToggle(page)).toHaveAttribute('aria-expanded', 'false');
});
