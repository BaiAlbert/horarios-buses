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
import { ALCORCON, AUTOBUSING_URL as BASE, onlyToAlcorcon, type Rule909 } from './rules.ts';

// Resultado de consultar las plazas de un bus. Es una "unión discriminada": un tipo que puede tener
// varias formas, y el campo `ok` / `kind` dice cuál es. El código que lo usa mira esos campos para saber qué hay.
// matchedArrival: solo coincidió la hora de salida; es la llegada que da autobusing (distinta de la de samar.es).
// (El `?` en `matchedArrival?` significa que ese campo es opcional: puede no estar.)
type Found = { ok: true; checkedAt: string; matchedArrival?: string };
// Plazas de UN autobús (una fila de la tabla de autobusing). Hay tres casos según `kind`.
export type BusSeats =
  | { kind: 'count'; free: number; occupied: number; total: number } // se pudieron contar los asientos
  | { kind: 'full' } // autobusing marca la salida como «Completo»
  | { kind: 'available' }; // sin mapa de asientos, pero no está completo
type Failure = { ok: false; reason: string }; // no se pudo averiguar; `reason` explica por qué (se muestra al usuario)
// Un autobús de un refuerzo: sus plazas y la hora de llegada que da autobusing para su fila. En un refuerzo por
// descarte las filas pueden llegar a horas distintas (05:15 → 07:10 y 07:15), y la tarjeta lo enseña.
export type SeveralBus = BusSeats & { arrival: string };
// `Found & BusSeats` = cada uno de los tres casos de BusSeats, con los campos de Found añadidos.
export type SeatsResult =
  | (Found & BusSeats) // lo normal: un autobús por horario
  | (Found & { kind: 'several'; buses: SeveralBus[] }) // refuerzo: un autobús por fila, en el orden de la tabla
  | Failure;

// Opciones de fetchSeats. Todas son opcionales (`?`): los tests las usan para simular internet y el reloj.
export type FetchSeatsOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  // llegadas de los otros buses de samar.es con la misma salida; sin ellas solo vale la coincidencia exacta
  siblingArrivals?: string[] | null;
  // ¿sale a la misma hora otro bus de samar.es que solo llega hasta Alcorcón? (alcorconTwin en rules.ts)
  alcorconTwin?: boolean;
  // REGLA DEL 909 (rule909 en rules.ts): qué filas no son de este bus y si se queda las sobrantes; sin ella, como antes
  rule909?: Rule909;
  // ¿otro bus de samar.es sale y llega a la misma hora (isAmbiguous en rules.ts)? Entonces no se dan plazas, aunque se
  // mira si a esa hora hay alguna fila que pueda ser suya: si no la hay, «No aparece en la venta online».
  ambiguous?: boolean;
  // REGLA DEL 909 DE RUTA (shares910Row en rules.ts): las filas que llegan a su hora de samar.es son del 910, no suyas
  shares910Row?: boolean;
  // tiempo máximo de todo el recorrido (hasta 5 peticiones): tiene que quedar por debajo del maxDuration de la ruta
  budgetMs?: number;
};

// Como mucho se consultan 3 filas (un refuerzo, con llegadas iguales o no); con más, algo raro pasa y no se lanzan sesiones.
const MAX_ROWS = 3;
const NO_SALE_DAY = 'autobusing no tiene venta para este día'; // TripCard (buyHint) compara este mismo texto
export const SEATS_BUDGET_MS = 18_000; // + hasta 10 s de samar.es en la ruta, dentro de los 30 s de maxDuration

// Las funciones parseXxx leen trozos concretos del HTML de autobusing con expresiones regulares.

// Una fila de la tabla de horarios de autobusing.
// nromov: número interno del bus en autobusing (hace falta para elegirlo); null si no se puede elegir.
// full: true si la fila pone «Completo».
// alcorcon: true si la nota de debajo de la fila dice que solo llega hasta Alcorcón (ver ALCORCON en rules.ts).
export type ScheduleRow = { departure: string; arrival: string; nromov: string | null; full: boolean; alcorcon: boolean };

// Paso 3: lee la tabla de horarios (una fila por bus: salida, llegada, precio y botón para elegirlo).
// La celda «radio» tiene el botón de selección (con nromov) o un texto como «Completo».
// Tras el precio puede venir la nota de la fila: <tr><td colspan="4">Esta expedición solo llega hasta…</td></tr>
// (el `(?: … )?` del final la hace opcional: muchas filas no la traen).
export function parseSchedule(html: string): ScheduleRow[] {
  return [...html.matchAll(/<tr><td class="radio">([\s\S]*?)<\/td><td><strong>(\d\d:\d\d)<\/strong><\/td><td><strong>(\d\d:\d\d)<\/strong><\/td>(?:<td[^>]*>[^<]*<\/td>(?:<tr><td colspan="4">([^<]*)<\/td><\/tr>)?)?/g)]
    .map((m) => ({
      departure: m[2],
      arrival: m[3],
      nromov: m[1].match(/<input[^>]*value="(\d+)"/)?.[1] ?? null,
      full: /complet/i.test(m[1]),
      alcorcon: ALCORCON.test(m[4] ?? ''),
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
 * Elige la fila (o filas) de autobusing de un bus de samar.es. Solo se miran las filas con su misma salida y su
 * misma marca de Alcorcón (ver ALCORCON en rules.ts): así el 05:45 normal nunca recibe la fila del 05:45 que
 * solo llega hasta Alcorcón, aunque las dos digan 05:45 → 07:05. Entre esas filas:
 *
 * 1. Salida y llegada exactas → esas filas (exact: true). Si hay varias es un REFUERZO: ese horario lleva más de
 *    un autobús (el 09/11, 05:15→06:35: dos filas, 65 y 60 asientos), y fetchSeats consulta cada una.
 * 2. Si no, POR DESCARTE: se quitan las filas que ya corresponden exactamente a otros buses de samar.es a esa
 *    hora. Si después ningún otro bus de samar.es se ha quedado sin pareja, todas las filas que sobran son de
 *    este bus (exact: false), aunque lleguen a horas distintas. Ejemplo (16/11): samar.es tiene a las 05:15 un
 *    directo → 06:35 y uno de ruta → 07:05; autobusing tiene 06:35, 06:35, 07:10 y 07:15. Las dos 06:35 son del
 *    directo, así que el de ruta recibe 07:10 y 07:15 (dos autobuses), y la tarjeta avisa de las horas.
 * 3. Ante la duda, null: es preferible no dar plazas que dar las de otro bus.
 * REGLA DEL 909 (`rule`, ver rule909 en rules.ts): si a esa hora sale un 909 directo, sus filas (salida + 1:20) no
 * son de este bus; y si este es el único bus de su hora que no es 909 directo, también recibe las filas sobrantes.
 * REGLA DEL 909 DE RUTA (`shares910Row`, ver rules.ts): un 909 de ruta empatado con un 910 no recibe las filas que
 * llegan a su hora de samar.es (son del 910), así que va por descarte (07:00 → 08:45).
 */
export function pickRow(
  trip: Pick<Trip, 'departure' | 'arrival' | 'alerts'>,
  siblingArrivals: string[], // horas de llegada de los OTROS buses de samar.es que salen a la misma hora (y misma marca)
  rows: ScheduleRow[],
  rule?: Rule909,
  shares910Row = false, // REGLA DEL 909 DE RUTA: las filas que llegan a su hora de samar.es son del 910
): { rows: ScheduleRow[]; exact: boolean } | null {
  const slot = sameSlot(trip, rows);
  const sameDeparture = slot.filter((r) => !othersRow(trip, r, rule, shares910Row));
  const exact = sameDeparture.filter((r) => r.arrival === trip.arrival);
  // Filas a esa hora que no son de ningún otro bus de samar.es...
  const free = sameDeparture.filter((r) => !siblingArrivals.includes(r.arrival));
  if (exact.length > 0) {
    // REGLA DEL 909: las sobrantes, junto a las exactas y en el orden de la tabla (un refuerzo por descarte)
    const extra = rule?.leftovers ? free.filter((r) => r.arrival !== trip.arrival) : [];
    if (extra.length > 0) return { rows: sameDeparture.filter((r) => exact.includes(r) || extra.includes(r)), exact: false };
    // caso normal: una única coincidencia exacta (o varias, si es un refuerzo)
    return { rows: exact, exact: true };
  }
  // ...y otros buses de samar.es a esa hora que tampoco encontraron su fila (si los hay, la duda es real).
  // Se cuentan buses y filas, no solo las horas: si el 901 y el 902 llegan los dos a las 13:10 y solo hay UNA fila
  // 13:10, uno de los dos se ha quedado sin fila, y la que sobra (13:20) puede ser la suya y no la de este bus.
  const count = <T,>(list: T[], is: (x: T) => boolean) => list.filter(is).length;
  const unmatchedSiblings = siblingArrivals.filter(
    (a) => count(slot, (r) => r.arrival === a) < count(siblingArrivals, (x) => x === a),
  );
  // `cond ? a : b` es un "if" en una línea: si cond es verdad da a, si no, b.
  return free.length > 0 && unmatchedSiblings.length === 0 ? { rows: free, exact: false } : null;
}

// Filas de autobusing con la misma salida y la misma marca de Alcorcón que el bus.
const sameSlot = (trip: Pick<Trip, 'departure' | 'alerts'>, rows: ScheduleRow[]) =>
  rows.filter((r) => r.departure === trip.departure && r.alcorcon === onlyToAlcorcon(trip));

// Filas a la hora del bus que podrían ser suyas: las que no son de otro bus de samar.es con otra llegada.
// Una llegada repetida en los hermanos (901 y 902 de las 11:15, los dos → 13:10) no hace suya la fila: esos buses
// son ambiguos entre sí, y la fila podría ser de este (903 → 13:15). Tampoco la de un hermano con su misma llegada
// (el bus es ambiguo con él). REGLA DEL 909: las filas del 909 directo (salida + 1:20) no son de este bus.
// Sin la lista de hermanos (null) no se descarta ninguna.
function candidates(
  trip: Pick<Trip, 'departure' | 'arrival' | 'alerts'>, rows: ScheduleRow[], siblingArrivals: string[] | null, rule?: Rule909, shares910Row = false,
) {
  const owned = siblingArrivals?.filter((a, _, all) => a !== trip.arrival && all.indexOf(a) === all.lastIndexOf(a));
  return sameSlot(trip, rows).filter((r) => !owned?.includes(r.arrival) && !othersRow(trip, r, rule, shares910Row));
}

// ¿La fila es de otro bus por una de las dos reglas? REGLA DEL 909 DIRECTO: llega a salida + 1:20 y a esa hora sale un
// 909 directo. REGLA DEL 909 DE RUTA: este bus es un 909 de ruta empatado con un 910, y la fila llega a su hora de
// samar.es (09:00), así que es la del 910.
function othersRow(trip: Pick<Trip, 'arrival'>, r: ScheduleRow, rule: Rule909 | undefined, shares910Row: boolean): boolean {
  return (!!rule?.not909Rows && r.arrival === rule.theoretical) || (shares910Row && r.arrival === trip.arrival);
}

const toSpanish = (date: string) => date.split('-').reverse().join('/'); // 2026-11-03 → 03/11/2026

// Una sesión de autobusing: su cookie y una función para hacer peticiones con ella. Cada sesión es un
// "visitante" distinto para autobusing; el refuerzo usa una por fila (ver fetchSeats).
type Session = { request: (path: string, body?: URLSearchParams) => Promise<string>; lastRedirect: () => string };

function openSession(fetchImpl: typeof fetch, budget: AbortSignal): Session {
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
  return { request, lastRedirect: () => lastRedirect };
}

// PASOS 1 a 3: abrir el formulario, enviarlo y leer la tabla de horarios.
// SIN la hora (`hora_ida`), igual que el enlace de compra (buyUrl en rules.ts): con ella, autobusing elige por su
// cuenta un bus de esa hora y deja la sesión ya en sus plazas. Si después nuestra elección de fila (paso 4) fallara
// sin avisar, leeríamos el mapa de asientos de ESE bus, que sale a la misma hora y pasaría la comprobación del paso 5.
// Sin la hora, la sesión no tiene ningún bus hasta que lo elegimos nosotros (comprobado en vivo el 2026-11-10: la
// tabla es la misma con y sin hora).
// Devuelve null si autobusing dice que ese día no tiene venta (festivos como el 25/12 y fechas a más de unos 50 días).
async function readSchedule(session: Session, trip: Trip, date: string): Promise<ScheduleRow[] | null> {
  // PASO 1: abrir el formulario con el trayecto y la fecha. El trayecto se queda guardado en la sesión.
  const qs = new URLSearchParams({ empresa: 'samar', origen_codigo: trip.originCode, destino_codigo: trip.destinationCode, fecha_ida: date });
  await session.request(`/venta/inicio_info?${qs}`);

  // PASO 2: enviar ese formulario (1 billete, solo ida). Si todo va bien, manda a la tabla de horarios.
  const sent = await session.request('/venta/inicio', new URLSearchParams({
    'venta[fecha_ida]': toSpanish(date),
    'venta[fecha_vta]': '',
    'venta[cantidad]': '1',
    'venta[tipo_iyv]': 'ida',
  }));
  // Los errores de este archivo (`throw`) llegan al usuario como «No se pudo consultar», con «Reintentar», quedan
  // apuntados en los logs y NO se guardan en la caché. Son para lo que no debería pasar o puede ir bien a la siguiente.
  // En vez de mandar a la tabla, autobusing repite el formulario con «Ida: No hay servicios vigentes para esa fecha».
  if (/no hay servicios vigentes/i.test(sent)) return null;
  if (!session.lastRedirect().endsWith('/venta/horarios')) throw new Error('autobusing no abrió la tabla de horarios');

  // PASO 3: leer la tabla de horarios.
  const html = await session.request('/venta/horarios');
  const rows = parseSchedule(html);
  // Ninguna fila leída: o no es la página de horarios, o tiene filas que ya no sabemos leer (autobusing cambió su
  // HTML). Sin este aviso, todos los buses dirían «No aparece en la venta online» y nadie se enteraría.
  if (rows.length === 0 && (!html.includes('class="horarios"') || html.includes('class="radio"'))) {
    throw new Error('No se pudo leer la tabla de horarios de autobusing (¿ha cambiado su HTML?)');
  }
  return rows;
}

// PASOS 4 y 5: elegir una fila de la tabla y leer su mapa de asientos.
async function readRow(session: Session, row: ScheduleRow, trip: Trip, date: string): Promise<BusSeats | Failure> {
  if (row.full) return { kind: 'full' }; // «Completo»: no hace falta seleccionarla
  if (!row.nromov) return { ok: false, reason: 'autobusing no permite seleccionar este bus' };

  // PASO 4: elegir ese bus pidiendo "elegir plazas" (ir al mapa de asientos).
  await session.request('/venta/horarios', new URLSearchParams({ 'venta[elegir_plazas_ida]': 't', 'venta[nromov_ida]': row.nromov }));
  // sin elección de asiento autobusing salta a los datos del viajero (no muestra plazas; no se entra). Como la fila
  // no estaba «Completo», quedan plazas aunque no se sepa cuántas.
  if (session.lastRedirect().endsWith('/venta/viajeros')) return { kind: 'available' };
  // Fallo del momento: error (se puede reintentar y no se guarda 5 minutos en la caché), no un «no disponible».
  if (!session.lastRedirect().endsWith('/venta/plazas')) throw new Error('autobusing no aceptó la selección del bus');

  // PASO 5: leer el mapa de asientos y comprobar que la fecha y hora que muestra son las de nuestro bus.
  const map = parseSeatMap(await session.request('/venta/plazas'));
  if (map.when !== `${toSpanish(date)} ${trip.departure}` || map.total === 0) {
    throw new Error(`La página de plazas no corresponde al bus (dice «${map.when}», ${map.total} asientos)`);
  }
  return { kind: 'count', free: map.free, occupied: map.occupied, total: map.total };
}

// `r is Failure` es un "type guard": si devuelve true, TypeScript sabe que r es un Failure.
const failed = (r: BusSeats | Failure): r is Failure => 'reason' in r;

// FUNCIÓN PRINCIPAL: consulta las plazas de un bus recorriendo el formulario de venta de autobusing.
// Los parámetros entre { } con `=` son opciones con valor por defecto (en producción se usan los reales).
export async function fetchSeats(
  trip: Trip,
  date: string,
  { fetchImpl = fetch, now = () => new Date(), siblingArrivals = null, alcorconTwin = false, rule909, ambiguous = false, shares910Row = false, budgetMs = SEATS_BUDGET_MS }: FetchSeatsOptions = {},
): Promise<SeatsResult> {
  // Un único "cronómetro" para todo el recorrido (todas las sesiones): si se agota, se cancela lo pendiente.
  const budget = AbortSignal.timeout(budgetMs);
  const session = openSession(fetchImpl, budget);
  const rows = await readSchedule(session, trip, date);
  // No es un fallo del momento: se guarda en la caché como cualquier otro resultado.
  if (!rows) return { ok: false, reason: NO_SALE_DAY };
  // Si a esta hora samar.es tiene un bus de Alcorcón, alguna fila de la tabla tiene que llevar la nota. Si ninguna
  // la lleva, quizá autobusing cambió su HTML y ya no se lee: sin la nota se mezclarían el bus normal y el de
  // Alcorcón, así que mejor «no disponible». Basta con que la lleve una fila del día (13/11: solo la de las 05:00,
  // porque el 05:45 de Alcorcón no está a la venta; el 05:45 normal sí tiene su fila).
  if ((alcorconTwin || onlyToAlcorcon(trip)) && !rows.some((r) => r.alcorcon)) {
    return { ok: false, reason: 'No se distingue el bus de Alcorcón en autobusing' };
  }
  // Dos buses de samar.es con las mismas horas: imposible saber cuál es cuál. Pero si a esa hora no hay ninguna fila
  // que pueda ser suya (15/11, 18:15), es que ninguno está a la venta.
  if (ambiguous) {
    const any = candidates(trip, rows, siblingArrivals, rule909, shares910Row).length > 0;
    return { ok: false, reason: any ? 'Otro bus de Samar tiene las mismas horas' : 'No aparece en la venta online' };
  }

  // Encontrar nuestro bus en la tabla.
  const picked = pickRow(trip, siblingArrivals ?? [], rows, rule909, shares910Row);
  // Sin la lista de hermanos (siblingArrivals) solo nos fiamos de una coincidencia exacta.
  if (!picked || (!picked.exact && !siblingArrivals)) {
    // Filas a esa hora que no son de otro bus de samar.es: si no queda ninguna, el bus no está en autobusing;
    // si queda alguna, está pero no se sabe cuál es (y no se arriesga a dar las plazas de otro).
    // (Sin la lista de hermanos, siblingArrivals = null, no se puede descartar nada: «no encontrado».)
    // Que no aparezca no prueba que no se venda online: autobusing esconde los autobuses llenos.
    const reason = siblingArrivals && candidates(trip, rows, siblingArrivals, rule909, shares910Row).length > 0
      ? 'No se sabe qué fila de autobusing es la suya'
      : 'No aparece en la venta online';
    return { ok: false, reason };
  }
  if (picked.rows.length > MAX_ROWS) return { ok: false, reason: 'Demasiados autobuses a esa hora en autobusing' };

  // Lo normal: una sola fila, en la misma sesión.
  if (picked.rows.length === 1) {
    const row = picked.rows[0];
    const result = await readRow(session, row, trip, date);
    if (failed(result)) return result;
    const matchedArrival = row.arrival !== trip.arrival ? { matchedArrival: row.arrival } : {};
    return { ok: true, ...result, checkedAt: now().toISOString(), ...matchedArrival };
  }

  // REFUERZO: varias filas idénticas. Cada fila que hay que seleccionar va en su PROPIA sesión, porque la
  // página de plazas no dice qué fila se eligió: si una segunda selección en la misma sesión fallara sin
  // avisar, se darían las plazas del primer autobús dos veces. Las sesiones van a la vez (Promise.all).
  const buses = await Promise.all(picked.rows.map(async (row, i): Promise<SeveralBus | Failure> => {
    // cada autobús lleva la llegada de su fila (en un refuerzo por descarte pueden ser distintas)
    const withArrival = (r: BusSeats | Failure) => (failed(r) ? r : { ...r, arrival: row.arrival });
    if (i === 0 || row.full || !row.nromov) return withArrival(await readRow(session, row, trip, date)); // sin selección o la primera
    const own = openSession(fetchImpl, budget);
    // solo para dejar la sesión en la tabla; la fila ya está elegida
    if (!(await readSchedule(own, trip, date))) throw new Error('autobusing dejó de tener venta para ese día a mitad de la consulta');
    return withArrival(await readRow(own, row, trip, date));
  }));
  // Si alguna fila falla, falla todo: mejor «no disponible» que un resultado a medias.
  const failure = buses.find((b) => 'reason' in b);
  if (failure) return failure as Failure;
  // (`as`: aquí ya no hay ningún Failure, pero TypeScript no lo deduce del `find` de arriba)
  return { ok: true, kind: 'several', buses: buses as SeveralBus[], checkedAt: now().toISOString() };
}
