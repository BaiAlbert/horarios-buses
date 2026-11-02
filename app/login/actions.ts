'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, safeEqual, sessionToken } from '../../lib/auth.ts';

export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const password = process.env.APP_PASSWORD;
  if (!password) return { error: 'Falta configurar APP_PASSWORD' };
  const given = String(formData.get('password') ?? '');
  if (!safeEqual(given, password)) return { error: 'Contraseña incorrecta' };

  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  redirect('/');
}
