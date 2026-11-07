// Sesión sin base de datos: la cookie es un HMAC derivado de APP_PASSWORD, así que cambiar la contraseña invalida todas.
//
// CÓMO FUNCIONA EL LOGIN
// La web es privada y tiene una única contraseña, guardada en la variable de entorno APP_PASSWORD
// (configurada en Vercel o en el archivo .env.local, nunca en el código).
// Al acertar la contraseña, el servidor guarda en el navegador una "cookie" (un pequeño dato que el
// navegador envía automáticamente en cada petición). Esa cookie no es la contraseña, sino una "firma"
// (HMAC) calculada a partir de ella: el servidor puede recalcularla y compararla, pero quien la vea
// no puede deducir la contraseña.

// Nombre de la cookie de sesión.
export const SESSION_COOKIE = 'hb_session';
// Texto fijo que se firma con la contraseña. Si se cambiase (v2), todas las sesiones dejarían de valer.
const MESSAGE = 'horarios-buses-session-v1';

// Calcula el valor de la cookie de sesión para una contraseña: HMAC-SHA256 de MESSAGE usando la
// contraseña como clave, escrito como 64 caracteres hexadecimales. Misma contraseña → mismo resultado.
// `crypto.subtle` es la API de criptografía que traen los navegadores y Node.js.
export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder(); // convierte texto en bytes, que es lo que usa la criptografía
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(MESSAGE)));
  // Cada byte (0-255) → dos caracteres hexadecimales ("0a", "ff"...), todo junto en un texto.
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Compara dos textos tardando siempre lo mismo. Con un `a === b` normal, la comparación se detiene en
// el primer carácter distinto, y midiendo ese tiempo un atacante podría ir adivinando la cookie poco a poco.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  // `^` (XOR) da 0 si los dos caracteres son iguales; `|=` acumula cualquier diferencia sin parar el bucle.
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ¿Es válida la cookie que ha mandado el navegador? Se usa en proxy.ts y en las rutas de la API.
// `string | undefined` = puede ser un texto o no existir (si el navegador no envió la cookie).
export async function isValidSession(cookie: string | undefined, password: string | undefined): Promise<boolean> {
  if (!cookie || !password) return false; // sin APP_PASSWORD no entra nadie
  return safeEqual(cookie, await sessionToken(password));
}
