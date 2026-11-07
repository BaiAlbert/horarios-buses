// 'use server' marca este archivo como "Server Actions": funciones que se ejecutan en el SERVIDOR aunque
// se llamen desde un formulario del navegador. Next.js se encarga de enviar los datos y traer la respuesta.
// Por eso aquí se puede leer APP_PASSWORD sin que llegue nunca al navegador.
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, safeEqual, sessionToken } from '../../lib/auth.ts';

// Espera de 1 segundo tras una contraseña incorrecta, para que probar contraseñas a lo bruto sea lento.
// shortcut: solo frena los intentos uno tras otro; los paralelos los limita la regla de rate limit del Firewall de Vercel
const FAIL_DELAY_MS = 1000;

// Se ejecuta al enviar el formulario de login (app/login/page.tsx).
// `_prev` es el resultado del intento anterior (lo pasa React; aquí no se usa).
// `formData` contiene los campos del formulario. Devuelve { error } si falla; si acierta, redirige a la portada.
export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const password = process.env.APP_PASSWORD;
  if (!password) return { error: 'Falta configurar APP_PASSWORD' };
  const given = String(formData.get('password') ?? ''); // lo que escribió el usuario
  // se comparan los HMAC (siempre 64 caracteres) para no revelar la longitud de la contraseña
  const token = await sessionToken(password);
  if (!given || !safeEqual(await sessionToken(given), token)) {
    // Una forma de "esperar X ms" con async/await.
    await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
    return { error: 'Contraseña incorrecta' };
  }

  // Contraseña correcta: se guarda la cookie de sesión en el navegador.
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // el JavaScript de la página no puede leerla (protege si alguien inyectara código)
    sameSite: 'lax', // otras webs no pueden hacer peticiones "en tu nombre" con ella
    secure: process.env.NODE_ENV === 'production', // en producción solo viaja por HTTPS
    maxAge: 60 * 60 * 24 * 30, // dura 30 días (en segundos)
    path: '/',
  });
  redirect('/');
}
