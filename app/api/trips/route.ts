import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSession } from '../../../lib/auth.ts';
import { getTrips } from '../../../lib/cache.ts';
import { isAllowedDate, parseDirection } from '../../../lib/rules.ts';

export const maxDuration = 30;

export async function GET(request: Request) {
  // el proxy ya lo filtra; se repite aquí por si un cambio en el matcher lo deja fuera
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value, process.env.APP_PASSWORD))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const dir = parseDirection(params.get('dir'));
  const date = params.get('date') ?? '';
  if (!dir || !isAllowedDate(date)) return Response.json({ error: 'Parámetros no válidos' }, { status: 400 });

  try {
    return Response.json(await getTrips(dir, date));
  } catch (e) {
    console.error('samar.es', e);
    return Response.json({ error: 'No se pudo consultar Samar' }, { status: 502 });
  }
}
