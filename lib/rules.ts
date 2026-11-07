// Reglas puras: etiquetas de tipo, ambigüedad para plazas y fechas válidas. Se usan en servidor y cliente.
// ("Puras" = solo calculan un resultado a partir de sus datos; no van a internet ni cambian nada fuera.)
import type { Direction, Trip } from './samar.ts';

// Líneas que siguen más allá de Talavera/Madrid: en ellas las plazas que da autobusing podrían ser
// las de todo el recorrido y no solo las de nuestro tramo. La tarjeta muestra un aviso para estos buses.
// Quitar líneas de aquí para fiarse de que autobusing da las plazas solo del tramo buscado.
export const PASS_THROUGH_LINES: readonly string[] = ['901', '902', '903', '904', '905'];

// Tipos de bus que distingue la web (y por los que se puede filtrar):
//   'directo'           → sin paradas intermedias
//   'ruta-santa-olalla' → con paradas, una de ellas Santa Olalla
//   'ruta'              → con paradas, pero sin pasar por Santa Olalla
export type TripKind = 'directo' | 'ruta-santa-olalla' | 'ruta';
// Texto que se muestra en pantalla para cada tipo.
export const KIND_LABEL: Record<TripKind, string> = {
  directo: 'Directo',
  'ruta-santa-olalla': 'Ruta · Santa Olalla',
  ruta: 'Ruta',
};

// Normaliza un texto para compararlo: quita tildes, pasa a minúsculas y quita espacios de los extremos
// ("Santa Olalla " y "santa olalla" quedan iguales).
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Directo = solo tiene 2 paradas: origen y destino.
export function isDirect(t: Trip): boolean {
  return t.stops.length === 2;
}

// `.some(fn)` devuelve true si AL MENOS UN elemento cumple la condición.
export function stopsAtSantaOlalla(t: Trip): boolean {
  return t.stops.some((s) => normalize(s.name) === 'santa olalla');
}

// Clasifica un bus en uno de los tres tipos.
export function tripKind(t: Trip): TripKind {
  if (isDirect(t)) return 'directo';
  return stopsAtSantaOlalla(t) ? 'ruta-santa-olalla' : 'ruta';
}

export function passesThrough(t: Trip): boolean {
  return PASS_THROUGH_LINES.includes(t.line);
}

// ¿Hay OTRO bus que salga y llegue exactamente a la misma hora? Entonces es imposible saber cuál de
// las filas de autobusing es la suya, y no se consultan sus plazas.
export function isAmbiguous(t: Trip, all: Trip[]): boolean {
  return all.some((o) => o.expedition !== t.expedition && o.departure === t.departure && o.arrival === t.arrival);
}

// Horas de llegada de los otros buses que salen a la misma hora que `t` (las usa pickRow en autobusing.ts).
export function siblingArrivals(t: Trip, all: Trip[]): string[] {
  return all.filter((o) => o.expedition !== t.expedition && o.departure === t.departure).map((o) => o.arrival);
}

// Formateador de fechas en hora de Madrid. Se usa el formato 'en-CA' (Canadá) porque escribe las fechas
// como "2026-11-03" (AAAA-MM-DD), que es el formato que usa toda la web.
const madridDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });

// Fecha de hoy en Madrid, aunque el servidor o el móvil estén en otra zona horaria.
export function todayMadrid(now: Date = new Date()): string {
  return madridDay.format(now);
}

// Hasta cuántos días en el futuro se puede buscar.
export const MAX_DAYS_AHEAD = 60;

// Suma (o resta, si es negativo) días a una fecha "AAAA-MM-DD". Se hace en UTC para evitar líos con
// los cambios de hora de verano/invierno.
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10); // toISOString da "2026-11-03T00:00:00.000Z"; nos quedamos con los 10 primeros caracteres
}

// Valida una fecha que llega del navegador (no hay que fiarse de lo que envía el cliente):
// formato correcto, fecha real y entre hoy y dentro de MAX_DAYS_AHEAD días.
// Las fechas "AAAA-MM-DD" se pueden comparar como texto (>=, <=) porque el orden alfabético coincide con el cronológico.
export function isAllowedDate(date: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false; // rechaza 2026-11-31
  const today = todayMadrid(now);
  return date >= today && date <= addDays(today, MAX_DAYS_AHEAD);
}

// La fecha seleccionada puede haberse quedado en el pasado si la pestaña sigue abierta desde otro día.
// En ese caso se busca hoy.
export function searchDate(selected: string, now: Date = new Date()): string {
  const today = todayMadrid(now);
  return selected && selected >= today ? selected : today;
}

// Convierte el parámetro `dir` de la URL en una Direction válida, o null si es cualquier otra cosa.
export function parseDirection(v: string | null): Direction | null {
  return v === 'ida' || v === 'vuelta' ? v : null;
}
