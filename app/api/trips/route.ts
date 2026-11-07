// API DE HORARIOS: GET /api/trips?dir=ida&date=2026-11-03
//
// En Next.js, un archivo `route.ts` dentro de `app/api/...` es un "endpoint": una dirección a la que el
// navegador pide datos (no una página). La carpeta define la URL: app/api/trips/route.ts → /api/trips.
// La función exportada con el nombre GET se ejecuta en el SERVIDOR cuando llega una petición GET.
//
// Flujo: SearchApp (navegador) → /api/trips → getTrips (caché) → fetchTrips (descarga samar.es) → JSON de vuelta.
// Responde con un TripsResponse (ver lib/samar.ts) o con { error } y un código HTTP:
//   401 sin sesión · 400 parámetros incorrectos · 502 samar.es falló
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSession } from '../../../lib/auth.ts';
import { getTrips } from '../../../lib/cache.ts';
import { isAllowedDate, parseDirection } from '../../../lib/rules.ts';

// Tiempo máximo (en segundos) que Vercel deja ejecutarse esta función antes de cortarla.
export const maxDuration = 30;

export async function GET(request: Request) {
  // el proxy ya lo filtra; se repite aquí por si un cambio en el matcher lo deja fuera
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value, process.env.APP_PASSWORD))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  // Lee los parámetros de la URL (lo que va tras el "?") y los valida: nunca hay que fiarse del navegador.
  const params = new URL(request.url).searchParams;
  const dir = parseDirection(params.get('dir'));
  const date = params.get('date') ?? '';
  if (!dir || !isAllowedDate(date)) return Response.json({ error: 'Parámetros no válidos' }, { status: 400 });

  // try/catch: si algo dentro de `try` lanza un error, en vez de romperse todo se ejecuta el `catch`.
  try {
    // private: solo el navegador de quien consulta lo guarda; evita repetir la petición al alternar trayecto y volver
    return Response.json(await getTrips(dir, date), { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    console.error('samar.es', e); // se apunta en los logs del servidor (Vercel) para poder investigar
    return Response.json({ error: 'No se pudo consultar Samar' }, { status: 502 });
  }
}
