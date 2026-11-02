import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSession } from '../../../lib/auth.ts';
import { getSeats, getTrips } from '../../../lib/cache.ts';
import { isAllowedDate, isAmbiguous, parseDirection, passesThrough, sharesDeparture } from '../../../lib/rules.ts';

export const maxDuration = 30;

export async function GET(request: Request) {
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value, process.env.APP_PASSWORD))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const dir = parseDirection(params.get('dir'));
  const date = params.get('date') ?? '';
  const exp = params.get('exp') ?? '';
  if (!dir || !isAllowedDate(date) || !/^\d{1,10}$/.test(exp)) {
    return Response.json({ error: 'Parámetros no válidos' }, { status: 400 });
  }

  let trips;
  try {
    ({ trips } = await getTrips(dir, date));
  } catch (e) {
    console.error('samar.es', e);
    return Response.json({ error: 'No se pudo consultar Samar' }, { status: 502 });
  }
  // códigos y horas salen siempre de samar.es, nunca del cliente
  const trip = trips.find((t) => t.expedition === exp);
  if (!trip) return Response.json({ error: 'Bus no encontrado' }, { status: 404 });
  const passThrough = passesThrough(trip);
  if (isAmbiguous(trip, trips)) {
    return Response.json({ ok: false, reason: 'Varios buses salen y llegan a la misma hora', passThrough });
  }

  try {
    return Response.json({ ...(await getSeats(trip, date, !sharesDeparture(trip, trips))), passThrough });
  } catch (e) {
    console.error('autobusing', e);
    return Response.json({ error: 'No se pudo consultar autobusing' }, { status: 502 });
  }
}
