// API DE PLAZAS: GET /api/seats?dir=ida&date=2026-11-03&exp=910047
// Se llama cuando el usuario pulsa «Ver plazas libres» en una tarjeta (TripCard).
//
// Flujo: TripCard (navegador) → /api/seats → busca el bus en los horarios de samar.es (getTrips) →
//        getSeats (caché) → fetchSeats (recorre autobusing) → JSON de vuelta.
// Responde con un SeatsResult (ver lib/autobusing.ts) + `passThrough`, o con { error } y un código HTTP:
//   401 sin sesión · 400 parámetros incorrectos · 404 bus inexistente · 502 samar.es o autobusing fallaron
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSession } from '../../../lib/auth.ts';
import { getSeats, getTrips } from '../../../lib/cache.ts';
import type { Trip } from '../../../lib/samar.ts';
import { isAllowedDate, isAmbiguous, parseDirection, passesThrough, siblingArrivals } from '../../../lib/rules.ts';

// Tiempo máximo (en segundos) que Vercel deja ejecutarse esta función. Ver SEATS_BUDGET_MS en autobusing.ts.
export const maxDuration = 30;

export async function GET(request: Request) {
  // Comprobación de sesión (el proxy ya lo hace; esto es una segunda barrera).
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value, process.env.APP_PASSWORD))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const dir = parseDirection(params.get('dir'));
  const date = params.get('date') ?? '';
  const exp = params.get('exp') ?? ''; // identificador del bus (expedición)
  // exp tiene que ser solo números (de 1 a 10 cifras).
  if (!dir || !isAllowedDate(date) || !/^\d{1,10}$/.test(exp)) {
    return Response.json({ error: 'Parámetros no válidos' }, { status: 400 });
  }

  // El navegador solo manda el identificador del bus; el resto de datos (horas, códigos de parada)
  // se sacan de los horarios de samar.es (normalmente ya están en la caché, así que es rápido).
  let trips: Trip[];
  try {
    // Paréntesis necesarios para "desestructurar" en una variable ya declarada: trips = (resultado).trips
    ({ trips } = await getTrips(dir, date));
  } catch (e) {
    console.error('samar.es', e);
    return Response.json({ error: 'No se pudo consultar Samar' }, { status: 502 });
  }
  // códigos y horas salen siempre de samar.es, nunca del cliente
  const trip = trips.find((t) => t.expedition === exp);
  if (!trip) return Response.json({ error: 'Bus no encontrado' }, { status: 404 });
  const passThrough = passesThrough(trip);
  // Dos buses con la misma salida y llegada: no hay forma de saber cuál es cuál en autobusing.
  if (isAmbiguous(trip, trips)) {
    return Response.json({ ok: false, reason: 'Varios buses salen y llegan a la misma hora', passThrough });
  }

  try {
    return Response.json({ ...(await getSeats(trip, date, siblingArrivals(trip, trips))), passThrough });
  } catch (e) {
    console.error('autobusing', e);
    return Response.json({ error: 'No se pudo consultar autobusing' }, { status: 502 });
  }
}
