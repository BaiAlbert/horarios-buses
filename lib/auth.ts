// Sesión sin base de datos: la cookie es un HMAC derivado de APP_PASSWORD, así que cambiar la contraseña invalida todas.
export const SESSION_COOKIE = 'hb_session';
const MESSAGE = 'horarios-buses-session-v1';

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(MESSAGE)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookie: string | undefined, password: string | undefined): Promise<boolean> {
  if (!cookie || !password) return false; // sin APP_PASSWORD no entra nadie
  return safeEqual(cookie, await sessionToken(password));
}
