// "PORTERO" DE LA WEB
// Next.js ejecuta este archivo (proxy.ts, antes llamado middleware) ANTES de cada petición, sea a una
// página o a la API. Si el navegador no trae una cookie de sesión válida, no le deja pasar:
//   - a las páginas → le manda a /login
//   - a la API (/api/...) → responde 401 "No autorizado" en JSON (el código del navegador lo detecta)
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isValidSession } from './lib/auth.ts';

export async function proxy(request: NextRequest) {
  // process.env.APP_PASSWORD lee la variable de entorno con la contraseña (ver lib/auth.ts).
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, process.env.APP_PASSWORD)) {
    return NextResponse.next(); // sesión válida: la petición sigue su camino normal
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

// A qué direcciones se aplica el proxy. Es una expresión regular que significa "todas, EXCEPTO":
// los archivos internos de Next (_next/...), los iconos, robots.txt, el manifest y la propia página de login
// (si no, ni siquiera se podría llegar al login).
export const config = {
  // cada exclusión debe ser el segmento entero: sin el `(?:/|$)`, «/login-x» o «/robots.txtx» se saltarían la sesión
  matcher: ['/((?!(?:_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon|robots\\.txt|manifest\\.webmanifest|login)(?:/|$)).*)'],
};
