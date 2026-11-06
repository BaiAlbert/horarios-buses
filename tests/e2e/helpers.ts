import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { SESSION_COOKIE, sessionToken } from '../../lib/auth.ts';
import type { SeatsResult } from '../../lib/autobusing.ts';
import { parseResults, type TripsResponse } from '../../lib/samar.ts';

export const PASSWORD = 'test'; // igual que APP_PASSWORD en playwright.config.ts
export const ORIGIN = 'http://localhost:3100'; // igual que el puerto de playwright.config.ts
export const DAY = '2026-11-03'; // día de los fixtures; el reloj de los tests se fija en él

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

// Respuesta de /api/trips construida con el lector real sobre HTML real de samar.es
export const tripsFixture = (name = 'samar-ida-2026-11-03.html', fetchedAt = `${DAY}T08:59:30Z`): TripsResponse => ({
  ...parseResults(fixture(name)),
  fetchedAt,
});

export const sessionCookie = async (password = PASSWORD) =>
  ({ name: SESSION_COOKIE, value: await sessionToken(password), url: ORIGIN });

// Fija «ahora» a las 10:00 de Madrid del día de los fixtures y entra con sesión (la cookie es un HMAC de la contraseña)
export async function openLoggedIn(page: Page, path = '/') {
  await page.clock.setFixedTime(new Date(`${DAY}T10:00:00+01:00`));
  await page.context().addCookies([await sessionCookie()]);
  await page.goto(path);
}

export const mockTrips = (page: Page, body: TripsResponse = tripsFixture()) =>
  page.route('**/api/trips?*', (route) => route.fulfill({ json: body }));

export const mockTripsStatus = (page: Page, status: number, body: unknown = { error: 'x' }) =>
  page.route('**/api/trips?*', (route) => route.fulfill({ status, json: body }));

// /api/seats añade passThrough a lo que devuelve getSeats
export type SeatsBody = (SeatsResult | { ok: false; reason: string }) & { passThrough: boolean };
export const CHECKED_AT = `${DAY}T08:59:00Z`; // 09:59 en Madrid

export const mockSeats = (page: Page, body: SeatsBody) =>
  page.route('**/api/seats?*', (route) => route.fulfill({ json: body }));

export const searchButton = (page: Page) => page.getByRole('button', { name: 'Buscar buses' });

export async function search(page: Page) {
  await searchButton(page).click();
  await page.getByRole('heading', { level: 2 }).waitFor();
}
