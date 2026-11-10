// Reglas puras: etiquetas de tipo, ambigüedad para plazas y fechas válidas. Se usan en servidor y cliente.
// ("Puras" = solo calculan un resultado a partir de sus datos; no van a internet ni cambian nada fuera.)
import type { Direction, Trip } from './samar.ts';

// Motor de venta de billetes de Samar. Aquí (y no en autobusing.ts) para que el navegador pueda usarla sin
// cargar el código que consulta las plazas.
export const AUTOBUSING_URL = 'https://regular.autobusing.es';

// Enlace para comprar el billete: el paso 1 de autobusing con el trayecto y la fecha, y SIN la hora.
// Con la hora (como hace samar.es), autobusing elige él el bus de esa hora y salta a las plazas, aunque a
// esa hora salgan varios (directo y de ruta). Sin ella, tras el paso 1 enseña la tabla Horarios y el
// usuario elige la fila exacta (salida y llegada). `Pick<Trip, ...>` = solo esos campos de Trip.
export function buyUrl(trip: Pick<Trip, 'originCode' | 'destinationCode'>, date: string): string {
  const qs = new URLSearchParams({ empresa: 'samar', origen_codigo: trip.originCode, destino_codigo: trip.destinationCode, fecha_ida: date });
  return `${AUTOBUSING_URL}/venta/inicio_info?${qs}`;
}

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

// MARCA DE ALCORCÓN: algunos buses de Talavera a Madrid «solo llegan hasta Alcorcón». Es la única nota que
// aparece en las dos webs: samar.es la pone como aviso de parada («ESTE SERVICIO SÓLO LLEGA HASTA ALCORCÓN…»)
// y autobusing debajo de la fila («Esta expedición solo llega hasta Alcorcón…»). Sirve para no confundir
// dos buses que salen a la misma hora (el 05:45 normal y el 05:45 de Alcorcón). La `i` final ignora mayúsculas.
export const ALCORCON = /s[oó]lo llega hasta alcorc[oó]n/i;

export function onlyToAlcorcon(t: Pick<Trip, 'alerts'>): boolean {
  return t.alerts.some((a) => ALCORCON.test(a));
}

// Otro bus que sale a la misma hora que `t` y tiene su misma marca de Alcorcón (los demás no se confunden con él).
const sameSlot = (t: Trip, o: Trip) =>
  o.expedition !== t.expedition && o.departure === t.departure && onlyToAlcorcon(o) === onlyToAlcorcon(t);

// ¿Hay OTRO bus que salga y llegue exactamente a la misma hora (y con la misma marca)? Entonces es imposible
// saber cuál de las filas de autobusing es la suya, y no se dan sus plazas. Dos excepciones, más abajo, que se
// pueden apagar por separado: `on` (REGLA DEL 909 DIRECTO: un 909 directo y otro bus, los dos a salida + 1:20) y
// `onRuta` (REGLA DEL 909 DE RUTA: un 909 de ruta y un 910). En esos casos sí se sabe qué fila es de cada uno.
export function isAmbiguous(t: Trip, all: Trip[], on = DIRECT_909_RULE, onRuta = RUTA_909_RULE): boolean {
  return all.some((o) => sameSlot(t, o) && o.arrival === t.arrival && !(on && splitBy909(t, o)) && !(onRuta && splitRuta909(t, o)));
}

// REGLA DEL 909 DIRECTO (añadida tras revisar a mano el sábado 28/11). Para quitarla: DIRECT_909_RULE = false.
// autobusing pone a los 909 directos (sin paradas) su llegada teórica, siempre salida + 1:20. Así que, a una hora
// en la que sale un 909 directo, las filas que llegan a salida + 1:20 son suyas, y las demás son de los otros buses.
// - Sábados 09:00: el 909 directo y el 905 llegan los dos a las 10:20 en samar.es (antes, «ambiguos»). En autobusing
//   hay 10:20 (el 909) y 10:50 (el 905: solo está los días en que samar.es tiene el 905 a esa hora).
// - Sábados 05:15 y 10:30: sobra una fila (07:15, 12:25) que no es del 909; va al único bus de esa hora que no es
//   909 directo (el 910), como un autobús más de su refuerzo. Antes se ignoraba.
// Con la regla apagada todo funciona exactamente como antes.
export const DIRECT_909_RULE = true;

export const isDirect909 = (t: Trip) => t.line === '909' && isDirect(t);

// "HH:MM" + 1:20, dando la vuelta a medianoche (23:00 → 00:20).
function plus80(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const min = (h * 60 + m + 80) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Dos buses con las mismas horas, uno 909 directo y el otro no, que llegan a salida + 1:20: la fila teórica es del 909.
const splitBy909 = (t: Trip, o: Trip) => isDirect909(t) !== isDirect909(o) && t.arrival === plus80(t.departure);

// Lo que la regla le dice a pickRow sobre un bus que NO es 909 directo (para un 909 directo, undefined: empareja
// como siempre). `theoretical`: salida + 1:20. `not909Rows`: a su hora sale un 909 directo, así que las filas
// teóricas no son de este bus. `leftovers`: es el único bus de su hora que no es 909 directo, así que las filas que
// no son de ningún otro bus de samar.es son suyas.
export type Rule909 = { theoretical: string; not909Rows: boolean; leftovers: boolean };

export function rule909(t: Trip, all: Trip[], on = DIRECT_909_RULE): Rule909 | undefined {
  if (!on || isDirect909(t)) return undefined;
  const others = all.filter((o) => sameSlot(t, o));
  // `others.length > 0`: un bus que sale SOLO a su hora no se queda las filas sobrantes (`every` da true con una lista
  // vacía). Visto en vivo el 2026-11-10: el 910 de las 21:30 (→ 23:20) salía como «2 autobuses» por una fila 21:30 → 22:50
  // (salida + 1:20) que es de otro autobús que samar.es no lista, con otros asientos ocupados, y seguramente directo.
  return { theoretical: plus80(t.departure), not909Rows: others.some(isDirect909), leftovers: others.length > 0 && others.every(isDirect909) };
}

// ¿`t` tiene las mismas horas que un 909 directo y no lo es? Entonces su fila en autobusing NO es la que llega a la
// hora que dice samar.es (esa es la del 909), y la pista de compra lo dice.
export function shares909Row(t: Trip, all: Trip[], on = DIRECT_909_RULE): boolean {
  return on && !isDirect909(t) && all.some((o) => sameSlot(t, o) && o.arrival === t.arrival && splitBy909(t, o));
}

// REGLA DEL 909 DE RUTA, o «de la fila de las 08:45» (añadida tras la revisión manual del 13/11). Para quitarla:
// RUTA_909_RULE = false.
// Entre semana, a las 07:00 salen en samar.es un 909 de ruta (Santa Olalla, Valmojado, Móstoles, Alcorcón) y un 910,
// los dos → 09:00. autobusing tiene a esa hora, además de las del 909 directo, una fila 09:00 y otra 08:45. La 08:45
// solo está los días en que sale el 909 de ruta (los laborables del 06/11 al 10/12); los sábados y domingos el 910
// sale solo y autobusing no la tiene. Así que la fila con la hora de samar.es (09:00) es la del 910, y el 909 de ruta
// va por descarte: recibe la fila que sobra (08:45). Es una deducción: autobusing no dice la línea.
// - El 910 se queda sus filas exactas (09:00), como siempre.
// - El 909 de ruta no puede recibir las filas que llegan a su hora de samar.es: son del 910. Si no le queda ninguna
//   (el 08:45 lleno u oculto), «No aparece en la venta online», en vez de darle las plazas del 910.
// Con la regla apagada, los dos vuelven a ser «ambiguos», como antes.
export const RUTA_909_RULE = true;

const isRuta909 = (t: Trip) => t.line === '909' && !isDirect(t);

// La regla solo vale donde se observó: la salida de las 07:00 desde Talavera ('0831' es su código de venta). A otra
// hora o en el otro sentido no hay ningún dato que diga qué fila es de quién, así que un 909 de ruta y un 910
// empatados siguen siendo «ambiguos» (sin esto, el 910 se quedaría las filas de los dos, como si fuera un refuerzo).
const RUTA_909_DEPARTURE = '07:00';
const RUTA_909_ORIGIN = '0831';
const inRuta909Slot = (t: Trip) => t.departure === RUTA_909_DEPARTURE && t.originCode === RUTA_909_ORIGIN;

// Un 909 de ruta y un 910 (en cualquier orden) a esa hora: no son ambiguos entre sí aunque tengan las mismas horas.
const splitRuta909 = (t: Trip, o: Trip) =>
  inRuta909Slot(t) && ((isRuta909(t) && o.line === '910') || (t.line === '910' && isRuta909(o)));

// ¿`t` es un 909 de ruta con las mismas horas que un 910? Entonces las filas que llegan a su hora de samar.es son del
// 910: pickRow no se las da, y la pista de compra lo dice.
export function shares910Row(t: Trip, all: Trip[], on = RUTA_909_RULE): boolean {
  return on && inRuta909Slot(t) && isRuta909(t) && all.some((o) => sameSlot(t, o) && o.arrival === t.arrival && o.line === '910');
}

// De qué bus es la fila de autobusing con las horas de samar.es de `t`, si no es de `t` (lo usa la pista de compra):
// del 909 directo (REGLA DEL 909 DIRECTO), del 910 (REGLA DEL 909 DE RUTA) o de nadie más (null).
export type RowOwner = 'directo 909' | '910' | null;
export function rowOwner(t: Trip, all: Trip[]): RowOwner {
  if (shares909Row(t, all)) return 'directo 909';
  return shares910Row(t, all) ? '910' : null;
}

// ¿`t` es un bus normal que sale a la misma hora que otro de Alcorcón? Entonces en autobusing hay a esa hora una
// fila con la nota de Alcorcón que NO es la suya (y puede tener sus mismas horas), y la pista de compra lo dice.
export function alcorconTwin(t: Trip, all: Trip[]): boolean {
  return !onlyToAlcorcon(t) && all.some((o) => o.expedition !== t.expedition && o.departure === t.departure && onlyToAlcorcon(o));
}

// Horas de llegada de los otros buses que salen a la misma hora que `t`, con su misma marca (las usa pickRow).
export function siblingArrivals(t: Trip, all: Trip[]): string[] {
  return all.filter((o) => sameSlot(t, o)).map((o) => o.arrival);
}

// Todo lo que /api/seats le pasa a fetchSeats sobre los demás buses de samar.es de ese día, junto en un objeto para
// que no se pueda olvidar nada (sin rule909, el 905 de las 09:00 de los sábados recibiría la fila del 909).
// `ambiguous`: no se sabe qué fila es la suya, pero fetchSeats aún mira si a esa hora hay alguna (si no, «No aparece»).
// `shares910Row`: REGLA DEL 909 DE RUTA (las filas a su hora de samar.es son del 910).
export function seatsContext(t: Trip, all: Trip[]) {
  return {
    siblingArrivals: siblingArrivals(t, all),
    alcorconTwin: alcorconTwin(t, all),
    rule909: rule909(t, all),
    ambiguous: isAmbiguous(t, all),
    shares910Row: shares910Row(t, all),
  };
}
export type SeatsContext = ReturnType<typeof seatsContext>;

// Formateador de fechas en hora de Madrid. Se usa el formato 'en-CA' (Canadá) porque escribe las fechas
// como "2026-11-03" (AAAA-MM-DD), que es el formato que usa toda la web.
const madridDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });

// Fecha de hoy en Madrid, aunque el servidor o el móvil estén en otra zona horaria.
export function todayMadrid(now: Date = new Date()): string {
  return madridDay.format(now);
}

// Hora de Madrid como "HH:MM" (de 00:00 a 23:59), para compararla como texto con las horas de salida.
const madridClock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid' });

// ¿El bus ya ha salido? Solo puede pasar buscando hoy. autobusing deja de listar las salidas pasadas (comprobado el
// 2026-11-10), así que sin esto la tarjeta diría «puede estar completo o no venderse online».
export function hasDeparted(t: Pick<Trip, 'departure'>, date: string, now: Date = new Date()): boolean {
  return date === todayMadrid(now) && t.departure < madridClock.format(now);
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
