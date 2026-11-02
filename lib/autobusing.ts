// Plazas desde el motor de venta regular.autobusing.es. Recorre el flujo hasta el paso «Plazas» y nunca lo envía.
import { TIMEOUT_MS, USER_AGENT, type Trip } from './samar.ts';

export type Seats = { free: number; occupied: number; total: number; checkedAt: string };
export type SeatsResult = { ok: true; seats: Seats } | { ok: false; reason: string };

const BASE = 'https://regular.autobusing.es';

export function parseOrigenId(html: string): string | null {
  return html.match(/<input[^>]*id="venta_origen_id"[^>]*value="([^"]*)"/)?.[1] ?? null;
}

export function parseSchedule(html: string): { departure: string; arrival: string; nromov: string }[] {
  return [...html.matchAll(/<tr><td class="radio"><input[^>]*value="(\d+)"[^>]*\/?><\/td><td><strong>(\d\d:\d\d)<\/strong><\/td><td><strong>(\d\d:\d\d)<\/strong><\/td>/g)]
    .map((m) => ({ departure: m[2], arrival: m[3], nromov: m[1] }));
}

export function parseSeatMap(html: string): { when: string | null; free: number; occupied: number; total: number } {
  const when = html.match(/<p class="campo">Ida<\/p><p class="valor">([^<]+)<\/p>/)?.[1].trim() ?? null;
  const states = [...html.matchAll(/<span id="asiento_\d+" class="asiento ([^"]*)"/g)].map((m) => m[1].trim().split(/\s+/).pop());
  const free = states.filter((s) => s === 'libre').length;
  return { when, free, occupied: states.length - free, total: states.length };
}

const toSpanish = (date: string) => date.split('-').reverse().join('/'); // 2026-11-03 → 03/11/2026

export async function fetchSeats(
  trip: Trip,
  date: string,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
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

  const matches = parseSchedule(await request('/venta/horarios'))
    .filter((r) => r.departure === trip.departure && r.arrival === trip.arrival);
  if (matches.length !== 1) return { ok: false, reason: 'No encontrado en autobusing' };

  await request('/venta/horarios', new URLSearchParams({ 'venta[elegir_plazas_ida]': 't', 'venta[nromov_ida]': matches[0].nromov }));
  // si autobusing rechaza la selección, la sesión seguiría en el bus que eligió /venta/inicio (quizá otro a la misma hora)
  if (!lastRedirect.endsWith('/venta/plazas')) return { ok: false, reason: 'autobusing no aceptó la selección del bus' };

  const map = parseSeatMap(await request('/venta/plazas'));
  if (map.when !== `${fecha} ${trip.departure}` || map.total === 0) {
    return { ok: false, reason: 'La respuesta no corresponde al bus' };
  }
  return { ok: true, seats: { free: map.free, occupied: map.occupied, total: map.total, checkedAt: now().toISOString() } };
}
