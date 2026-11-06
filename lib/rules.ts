// Reglas puras: etiquetas de tipo, ambigüedad para plazas y fechas válidas. Se usan en servidor y cliente.
import type { Direction, Trip } from './samar.ts';

// Quitar líneas de aquí para fiarse de que autobusing da las plazas solo del tramo buscado.
export const PASS_THROUGH_LINES: readonly string[] = ['901', '902', '903', '904', '905'];

export type TripKind = 'directo' | 'ruta-santa-olalla' | 'ruta';
export const KIND_LABEL: Record<TripKind, string> = {
  directo: 'Directo',
  'ruta-santa-olalla': 'Ruta · Santa Olalla',
  ruta: 'Ruta',
};

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function isDirect(t: Trip): boolean {
  return t.stops.length === 2;
}

export function stopsAtSantaOlalla(t: Trip): boolean {
  return t.stops.some((s) => normalize(s.name) === 'santa olalla');
}

export function tripKind(t: Trip): TripKind {
  if (isDirect(t)) return 'directo';
  return stopsAtSantaOlalla(t) ? 'ruta-santa-olalla' : 'ruta';
}

export function passesThrough(t: Trip): boolean {
  return PASS_THROUGH_LINES.includes(t.line);
}

export function isAmbiguous(t: Trip, all: Trip[]): boolean {
  return all.some((o) => o.expedition !== t.expedition && o.departure === t.departure && o.arrival === t.arrival);
}

export function siblingArrivals(t: Trip, all: Trip[]): string[] {
  return all.filter((o) => o.expedition !== t.expedition && o.departure === t.departure).map((o) => o.arrival);
}

const madridDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });

export function todayMadrid(now: Date = new Date()): string {
  return madridDay.format(now);
}

export const MAX_DAYS_AHEAD = 60;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isAllowedDate(date: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false; // rechaza 2026-11-31
  const today = todayMadrid(now);
  return date >= today && date <= addDays(today, MAX_DAYS_AHEAD);
}

// La fecha seleccionada puede haberse quedado en el pasado si la pestaña sigue abierta desde otro día.
export function searchDate(selected: string, now: Date = new Date()): string {
  const today = todayMadrid(now);
  return selected && selected >= today ? selected : today;
}

export function parseDirection(v: string | null): Direction | null {
  return v === 'ida' || v === 'vuelta' ? v : null;
}
