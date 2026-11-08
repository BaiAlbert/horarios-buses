// Plazas desde el motor de venta regular.autobusing.es. Recorre el flujo hasta el paso «Plazas» y nunca lo envía.
//
// QUÉ HACE ESTE ARCHIVO
// samar.es da los horarios, pero no cuántas plazas quedan. Eso solo se ve en la web de venta de billetes
// (regular.autobusing.es), que es un formulario de varios pasos: elegir trayecto → elegir bus → elegir asiento.
// Este archivo imita a una persona rellenando ese formulario, paso a paso, hasta llegar a la pantalla del
// mapa de asientos, y cuenta los libres y ocupados. NUNCA compra nada: se detiene antes de los datos del viajero.
//
// El problema difícil: samar.es y autobusing son sistemas distintos y no comparten un identificador del bus.
// Hay que encontrar "el mismo bus" en autobusing comparando horas de salida y llegada (ver pickRow más abajo).
import { TIMEOUT_MS, USER_AGENT, type Trip } from './samar.ts';

// Resultado de consultar las plazas de un bus. Es una "unión discriminada": un tipo que puede tener
// varias formas, y el campo `ok` / `kind` dice cuál es. El código que lo usa mira esos campos para saber qué hay.
// matchedArrival: solo coincidió la hora de salida; es la llegada que da autobusing (distinta de la de samar.es).
// (El `?` en `matchedArrival?` significa que ese campo es opcional: puede no estar.)
type Found = { ok: true; checkedAt: string; matchedArrival?: string };
export type SeatsResult =
  | (Found & { kind: 'count'; free: number; occupied: number; total: number }) // se pudieron contar los asientos
  | (Found & { kind: 'full' }) // autobusing marca la salida como «Completo»
  | (Found & { kind: 'available' }) // sin mapa de asientos, pero no está completo
  | { ok: false; reason: string }; // no se pudo averiguar; `reason` explica por qué (se muestra al usuario)

// Opciones de fetchSeats. Todas son opcionales (`?`): los tests las usan para simular internet y el reloj.
export type FetchSeatsOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  // llegadas de los otros buses de samar.es con la misma salida; sin ellas solo vale la coincidencia exacta
  siblingArrivals?: string[] | null;
  // tiempo máximo de todo el recorrido (hasta 5 peticiones): tiene que quedar por debajo del maxDuration de la ruta
  budgetMs?: number;
};

const BASE = 'https://regular.autobusing.es';
export const SEATS_BUDGET_MS = 18_000; // + hasta 10 s de samar.es en la ruta, dentro de los 30 s de maxDuration

// Las funciones parseXxx leen trozos concretos del HTML de autobusing con expresiones regulares.

// Paso 1: la primera página del formulario trae un campo oculto con el id interno del origen; se necesita para el paso 2.
export function parseOrigenId(html: string): string | null {
  return html.match(/<input[^>]*id="venta_origen_id"[^>]*value="([^"]*)"/)?.[1] ?? null;
}

// Una fila de la tabla de horarios de autobusing.
// nromov: número interno del bus en autobusing (hace falta para elegirlo); null si no se puede elegir.
// full: true si la fila pone «Completo».
export type ScheduleRow = { departure: string; arrival: string; nromov: string | null; full: boolean };

// Paso 3: lee la tabla de horarios (una fila por bus: salida, llegada y botón para elegirlo).
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

// Paso 5: lee el mapa de asientos. Cada asiento es un <span class="asiento libre"> u otra clase (ocupado...).
// `when` es la fecha y hora que muestra la página ("03/11/2026 08:30"); sirve para comprobar que es el bus correcto.
export function parseSeatMap(html: string): { when: string | null; free: number; occupied: number; total: number } {
  const when = html.match(/<p class="campo">Ida<\/p><p class="valor">([^<]+)<\/p>/)?.[1].trim() ?? null;
  // De cada asiento se queda con la última palabra de su clase CSS ("libre", "ocupado"...).
  const states = [...html.matchAll(/<span id="asiento_\d+" class="asiento ([^"]*)"/g)].map((m) => m[1].trim().split(/\s+/).pop());
  const free = states.filter((s) => s === 'libre').length;
  return { when, free, occupied: states.length - free, total: states.length };
}

/**
 * Elige la fila de autobusing de un bus de samar.es. Primero salida+llegada exactas; si no, por descarte:
 * quitando las filas que ya corresponden exactamente a otros buses de samar.es a esa hora, tiene que quedar
 * una sola fila y ningún otro bus de samar.es sin pareja. Ante la duda, null.
 *
 * Ejemplo: samar.es tiene dos buses a las 08:00 (llegan 09:15 y 10:00). autobusing tiene dos filas a las 08:00
 * (llegan 09:15 y 09:58). Para el bus de las 10:00 no hay coincidencia exacta; la fila de 09:15 ya es del otro
 * bus, así que solo queda la de 09:58 → se elige esa, con exact: false (y se avisa al usuario de la diferencia).
 * Es preferible no dar plazas que dar las de otro bus.
 *
 * REFUERZO: a veces autobusing tiene varias filas idénticas (misma salida y llegada) para un solo bus de
 * samar.es, porque ese horario lleva más de un autobús (el 09/11, 05:15→06:35: dos filas, 65 y 60 asientos).
 * Entonces se devuelven todas, en el orden de la tabla, y fetchSeats consulta las plazas de cada una.
 */
export function pickRow(
  trip: { departure: string; arrival: string },
  siblingArrivals: string[], // horas de llegada de los OTROS buses de samar.es que salen a la misma hora
  rows: ScheduleRow[],
): { rows: ScheduleRow[]; exact: boolean } | null {
  const sameDeparture = rows.filter((r) => r.departure === trip.departure);
  const exact = sameDeparture.filter((r) => r.arrival === trip.arrival);
  // caso normal: una única coincidencia exacta (o varias, si es un refuerzo)
  if (exact.length > 0) return { rows: exact, exact: true };
  // Filas a esa hora que no son de ningún otro bus de samar.es...
  const free = sameDeparture.filter((r) => !siblingArrivals.includes(r.arrival));
  // ...y otros buses de samar.es a esa hora que tampoco encontraron su fila (si los hay, la duda es real).
  const unmatchedSiblings = siblingArrivals.filter((a) => !sameDeparture.some((r) => r.arrival === a));
  // `cond ? a : b` es un "if" en una línea: si cond es verdad da a, si no, b.
  return free.length === 1 && unmatchedSiblings.length === 0 ? { rows: [free[0]], exact: false } : null;
}

const toSpanish = (date: string) => date.split('-').reverse().join('/'); // 2026-11-03 → 03/11/2026

// FUNCIÓN PRINCIPAL: consulta las plazas de un bus recorriendo el formulario de venta de autobusing.
// Los parámetros entre { } con `=` son opciones con valor por defecto (en producción se usan los reales).
export async function fetchSeats(
  trip: Trip,
  date: string,
  { fetchImpl = fetch, now = () => new Date(), siblingArrivals = null, budgetMs = SEATS_BUDGET_MS }: FetchSeatsOptions = {},
): Promise<SeatsResult> {
  // Un único "cronómetro" para todo el recorrido: si se agota, se cancelan las peticiones pendientes.
  const budget = AbortSignal.timeout(budgetMs);
  // autobusing recuerda en qué paso del formulario vamos mediante una cookie de sesión ("rack.session").
  // Como aquí no hay navegador, la guardamos a mano y la reenviamos en cada petición.
  let cookie = '';
  // Al enviar un formulario, autobusing responde "302 = ve a esta otra página". Se guarda a dónde manda,
  // porque eso indica qué ha pasado (p. ej. si salta al mapa de asientos o directamente a los datos del viajero).
  let lastRedirect = '';
  // Función auxiliar para hacer cada petición: GET si no hay `body`, POST (enviar formulario) si lo hay.
  const request = async (path: string, body?: URLSearchParams) => {
    const res = await fetchImpl(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      body,
      redirect: 'manual', // no seguir las redirecciones solo: queremos ver a dónde mandan
      headers: {
        'User-Agent': USER_AGENT,
        // `...(cond && {...})`: añade la cabecera solo si la condición se cumple
        ...(cookie && { Cookie: cookie }),
        ...(body && { 'Content-Type': 'application/x-www-form-urlencoded' }),
      },
      // se cancela si se agota el tiempo total O el tiempo de esta petición concreta
      signal: AbortSignal.any([budget, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('rack.session='));
    if (set) cookie = set.split(';')[0]; // guarda solo "rack.session=valor", sin los atributos de la cookie
    const okStatus = body ? res.status === 200 || res.status === 302 : res.status === 200;
    if (!okStatus) throw new Error(`autobusing respondió ${res.status} en ${path}`);
    lastRedirect = res.status === 302 ? (res.headers.get('location') ?? '') : '';
    return res.text();
  };

  // PASO 1: abrir el formulario con el trayecto, la hora y la fecha (como el enlace "Comprar" de samar.es).
  const fecha = toSpanish(date);
  const qs = new URLSearchParams({
    empresa: 'samar', origen_codigo: trip.originCode, destino_codigo: trip.destinationCode, hora_ida: trip.departure, fecha_ida: date,
  });
  const origenId = parseOrigenId(await request(`/venta/inicio_info?${qs}`));
  if (!origenId) return { ok: false, reason: 'autobusing no reconoce el trayecto' };

  // PASO 2: enviar ese formulario (1 billete, solo ida).
  await request('/venta/inicio', new URLSearchParams({
    hora_ida: trip.departure,
    'venta[origen_id]': origenId,
    'venta[fecha_ida]': fecha,
    'venta[fecha_vta]': '',
    'venta[cantidad]': '1',
    'venta[tipo_iyv]': 'ida',
  }));

  // PASO 3: leer la tabla de horarios y encontrar en ella nuestro bus.
  const rows = parseSchedule(await request('/venta/horarios'));
  const picked = pickRow(trip, siblingArrivals ?? [], rows);
  // Sin la lista de hermanos (siblingArrivals) solo nos fiamos de una coincidencia exacta.
  if (!picked || (!picked.exact && !siblingArrivals)) {
    // Filas a esa hora que no son de otro bus de samar.es: si no queda ninguna, el bus no está en autobusing;
    // si queda alguna, está pero no se sabe cuál es (y no se arriesga a dar las plazas de otro).
    // (Sin la lista de hermanos, siblingArrivals = null, no se puede descartar nada: «no encontrado».)
    const candidates = rows.filter((r) => r.departure === trip.departure && !siblingArrivals?.includes(r.arrival));
    const reason = siblingArrivals && candidates.length > 0 ? 'Varias filas posibles en autobusing' : 'No encontrado en autobusing';
    return { ok: false, reason };
  }
  if (picked.rows.length > 1) return { ok: false, reason: 'Varias filas posibles en autobusing' }; // provisional (refuerzo)
  const row = picked.rows[0];
  const matchedArrival = row.arrival !== trip.arrival ? { matchedArrival: row.arrival } : {};
  if (row.full) return { ok: true, kind: 'full', checkedAt: now().toISOString(), ...matchedArrival };
  if (!row.nromov) return { ok: false, reason: 'autobusing no permite seleccionar este bus' };

  // PASO 4: elegir ese bus pidiendo "elegir plazas" (ir al mapa de asientos).
  await request('/venta/horarios', new URLSearchParams({ 'venta[elegir_plazas_ida]': 't', 'venta[nromov_ida]': row.nromov }));
  // si autobusing rechaza la selección, la sesión seguiría en el bus que eligió /venta/inicio (quizá otro a la misma hora)
  // sin elección de asiento autobusing salta a los datos del viajero (no muestra plazas; no se entra). Como la fila
  // no estaba «Completo», quedan plazas aunque no se sepa cuántas.
  if (lastRedirect.endsWith('/venta/viajeros')) return { ok: true, kind: 'available', checkedAt: now().toISOString(), ...matchedArrival };
  if (!lastRedirect.endsWith('/venta/plazas')) return { ok: false, reason: 'autobusing no aceptó la selección del bus' };

  // PASO 5: leer el mapa de asientos y comprobar que la fecha y hora que muestra son las de nuestro bus.
  const map = parseSeatMap(await request('/venta/plazas'));
  if (map.when !== `${fecha} ${trip.departure}` || map.total === 0) {
    return { ok: false, reason: 'La respuesta no corresponde al bus' };
  }
  return { ok: true, kind: 'count', free: map.free, occupied: map.occupied, total: map.total, checkedAt: now().toISOString(), ...matchedArrival };
}
