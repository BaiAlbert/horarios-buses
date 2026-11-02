// Plazas desde el motor de venta regular.autobusing.es. Recorre el flujo hasta el paso «Plazas» y nunca lo envía.
import { TIMEOUT_MS, USER_AGENT, type Trip } from './samar.ts';

export type Seats = { free: number; occupied: number; total: number; checkedAt: string };
// matchedArrival: solo coincidió la hora de salida; es la llegada que da autobusing (distinta de la de samar.es).
export type SeatsResult =
  | { ok: true; seats: Seats; matchedArrival?: string }
  | { ok: true; full: true; checkedAt: string; matchedArrival?: string } // autobusing marca la salida como «Completo»
  | { ok: true; available: true; checkedAt: string; matchedArrival?: string } // sin mapa de asientos, pero no está completo
  | { ok: false; reason: string };

export type FetchSeatsOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  // llegadas de los otros buses de samar.es con la misma salida; sin ellas solo vale la coincidencia exacta
  siblingArrivals?: string[] | null;
};

const BASE = 'https://regular.autobusing.es';

export function parseOrigenId(html: string): string | null {
  return html.match(/<input[^>]*id="venta_origen_id"[^>]*value="([^"]*)"/)?.[1] ?? null;
}

export type ScheduleRow = { departure: string; arrival: string; nromov: string | null; full: boolean };

// La celda «radio» tiene el botón de selección (con nromov) o un texto como «Completo».
export function parseSchedule(html: string): ScheduleRow[] {
  return [...html.matchAll(/<tr><td class="radio">([\s\S]*?)<\/td><td><strong>(\d\d:\d\d)<\/strong><\/td><td><strong>(\d\d:\d\d)<\/strong><\/td>/g)]
    .map((m) => ({
      departure: m[2],
      arrival: m[3],
      nromov: m[1].match(/<input[^>]*value="(\d+)"/)?.[1] ?? null,
      full: /complet/i.test(m[1]),
    }));
}

export function parseSeatMap(html: string): { when: string | null; free: number; occupied: number; total: number } {
  const when = html.match(/<p class="campo">Ida<\/p><p class="valor">([^<]+)<\/p>/)?.[1].trim() ?? null;
  const states = [...html.matchAll(/<span id="asiento_\d+" class="asiento ([^"]*)"/g)].map((m) => m[1].trim().split(/\s+/).pop());
  const free = states.filter((s) => s === 'libre').length;
  return { when, free, occupied: states.length - free, total: states.length };
}

/**
 * Elige la fila de autobusing de un bus de samar.es. Primero salida+llegada exactas; si no, por descarte:
 * quitando las filas que ya corresponden exactamente a otros buses de samar.es a esa hora, tiene que quedar
 * una sola fila y ningún otro bus de samar.es sin pareja. Ante la duda, null.
 */
export function pickRow(
  trip: { departure: string; arrival: string },
  siblingArrivals: string[],
  rows: ScheduleRow[],
): { row: ScheduleRow; exact: boolean } | null {
  const sameDeparture = rows.filter((r) => r.departure === trip.departure);
  const exact = sameDeparture.filter((r) => r.arrival === trip.arrival);
  if (exact.length === 1) return { row: exact[0], exact: true };
  if (exact.length > 1) return null;
  const free = sameDeparture.filter((r) => !siblingArrivals.includes(r.arrival));
  const unmatchedSiblings = siblingArrivals.filter((a) => !sameDeparture.some((r) => r.arrival === a));
  return free.length === 1 && unmatchedSiblings.length === 0 ? { row: free[0], exact: false } : null;
}

const toSpanish = (date: string) => date.split('-').reverse().join('/'); // 2026-11-03 → 03/11/2026

export async function fetchSeats(
  trip: Trip,
  date: string,
  { fetchImpl = fetch, now = () => new Date(), siblingArrivals = null }: FetchSeatsOptions = {},
): Promise<SeatsResult> {
  let cookie = '';
  let lastRedirect = '';
  const request = async (path: string, body?: URLSearchParams) => {
    const res = await fetchImpl(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      body,
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        ...(cookie && { Cookie: cookie }),
        ...(body && { 'Content-Type': 'application/x-www-form-urlencoded' }),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('rack.session='));
    if (set) cookie = set.split(';')[0];
    const okStatus = body ? res.status === 200 || res.status === 302 : res.status === 200;
    if (!okStatus) throw new Error(`autobusing respondió ${res.status} en ${path}`);
    lastRedirect = res.status === 302 ? (res.headers.get('location') ?? '') : '';
    return res.text();
  };

  const fecha = toSpanish(date);
  const qs = new URLSearchParams({
    empresa: 'samar', origen_codigo: trip.originCode, destino_codigo: trip.destinationCode, hora_ida: trip.departure, fecha_ida: date,
  });
  const origenId = parseOrigenId(await request(`/venta/inicio_info?${qs}`));
  if (!origenId) return { ok: false, reason: 'autobusing no reconoce el trayecto' };

  await request('/venta/inicio', new URLSearchParams({
    hora_ida: trip.departure,
    'venta[origen_id]': origenId,
    'venta[fecha_ida]': fecha,
    'venta[fecha_vta]': '',
    'venta[cantidad]': '1',
    'venta[tipo_iyv]': 'ida',
  }));

  const rows = parseSchedule(await request('/venta/horarios'));
  const picked = pickRow(trip, siblingArrivals ?? [], rows);
  if (!picked || (!picked.exact && !siblingArrivals)) return { ok: false, reason: 'No encontrado en autobusing' };
  const { row } = picked;
  const matchedArrival = row.arrival !== trip.arrival ? { matchedArrival: row.arrival } : {};
  if (row.full) return { ok: true, full: true, checkedAt: now().toISOString(), ...matchedArrival };
  if (!row.nromov) return { ok: false, reason: 'autobusing no permite seleccionar este bus' };

  await request('/venta/horarios', new URLSearchParams({ 'venta[elegir_plazas_ida]': 't', 'venta[nromov_ida]': row.nromov }));
  // si autobusing rechaza la selección, la sesión seguiría en el bus que eligió /venta/inicio (quizá otro a la misma hora)
  // sin elección de asiento autobusing salta a los datos del viajero (no muestra plazas; no se entra). Como la fila
  // no estaba «Completo», quedan plazas aunque no se sepa cuántas.
  if (lastRedirect.endsWith('/venta/viajeros')) return { ok: true, available: true, checkedAt: now().toISOString(), ...matchedArrival };
  if (!lastRedirect.endsWith('/venta/plazas')) return { ok: false, reason: 'autobusing no aceptó la selección del bus' };

  const map = parseSeatMap(await request('/venta/plazas'));
  if (map.when !== `${fecha} ${trip.departure}` || map.total === 0) {
    return { ok: false, reason: 'La respuesta no corresponde al bus' };
  }
  return { ok: true, seats: { free: map.free, occupied: map.occupied, total: map.total, checkedAt: now().toISOString() }, ...matchedArrival };
}
